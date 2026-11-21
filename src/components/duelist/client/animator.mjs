// One fighter's animation, driven by the simulation every frame.
//
// Base: idle, walk, jog and sprint blended by the body's real speed, each playing at the speed that keeps its
// feet planted. Over it, one state at a time, cross-faded:
//   a move: its clip at the time the rules say (core/moveMotion.mjs), so what you see is what the rules decide;
//   the move's settle: the rest of the motion after it ends, until you walk or act (an anime cut, not a snap);
//   a roll: forward roll, or (locked on) back or side flip;
//   guard, a flinch or a guard break, knocked down and getting up, held in Telekinesis, defeat.
// The sword hand always grips (its fingers come from the sword stance, whatever the base clip does).
import * as THREE from 'three';
import { KNOCKDOWN, clipAt, settleOf, isStunned } from '../core/index.mjs';
import { secondHandAt } from './secondHand.mjs';

export const FADE = Object.freeze({ in: 0.07, out: 0.12, base: 0.2, settleOut: 0.18 });
// metres per second each base clip covers at normal speed (the pack's are measured by its builder)
const NATURAL = Object.freeze({ walk: 1.5, packWalk: 0.9, jog: 4.95, sprint: 7.63 });
const SPEED = Object.freeze({ walk: 2.2, run: 4.6, sprint: 7.2 });
// each stance: the idle everything blends over, the guard, and whose fingers keep hold of a weapon
const RIGHT_FINGERS = /RightHand(Thumb|Index|Middle|Ring|Pinky)\d\.quaternion$/;
const BOTH_FINGERS = /(Right|Left)Hand(Thumb|Index|Middle|Ring|Pinky)\d\.quaternion$/;
export const STANCES = Object.freeze({
  sword: { idle: 'swordIdle', guard: 'swordBlock', grip: RIGHT_FINGERS },
  sidearm: { idle: 'pistolIdle', guard: 'swordBlock', grip: RIGHT_FINGERS },
  dualBlades: { idle: 'bladesIdle', guard: 'bladesGuard', grip: BOTH_FINGERS },
  staff: { idle: 'staffIdle', guard: 'staffGuard', grip: BOTH_FINGERS }, // both hands hold it in the stance
});

/**
 * clips: { pack: {name: clip} (motion pack, retargeted), walk: the body's own walk, dodges: {Front_Roll, ...},
 *          baked: {held, ...} (posed fallbacks) }
 */
// stance: 'sword', 'dualBlades' or 'staff' (a duelist's crystal form) or 'sidearm' (a smuggler: the pistol stance
// is the idle, and the hand's grip)
// secondHand: the staff's (client/secondHand.mjs), kept on the shaft after the clips have posed the body
// A cut by direction plays on the trunk and the arms while the legs keep walking (the rules do not root the
// fighter during one: core/cuts.mjs). Such a clip, and each walking loop, is two actions: the legs (hips and down)
// and the rest. Standing still, the cut's own legs show; moving, the walk's.
const LEGS = /mixamorig(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe_End))./;
export const LAYERED = /^(sword(Cut|Backhand)|bladesCut|staffCut)/;
const part = (clip, legs) => new THREE.AnimationClip(`${clip.name}:${legs ? 'legs' : 'body'}`, clip.duration, clip.tracks.filter((t) => LEGS.test(t.name) === legs));
const WALKING = 1.2; // metres a second at which the legs are wholly the walk's

export function createFighterAnimator({ model, clips, stance = 'sword', secondHand = null }) {
  const mixer = new THREE.AnimationMixer(model);
  const pack = clips.pack || {};
  const form = STANCES[stance] || STANCES.sword;
  const idleName = pack[form.idle] ? form.idle : 'swordIdle'; // a pack built without the class clips still stands
  const guardName = pack[form.guard] ? form.guard : 'swordBlock';
  const library = {
    ...(clips.baked || {}), ...(clips.dodges || {}), ...pack,
    walkBase: clips.walk || pack.walk,
  };
  // bodies without a walk of their own take the pack's (a slower stride)
  const naturalWalk = clips.walk ? NATURAL.walk : NATURAL.packWalk;
  const loops = new Set(['swordIdle', 'bladesIdle', 'staffIdle', 'pistolIdle', 'walkBase', 'jog', 'sprint', 'castHold', 'held', 'shieldIdle']);
  const actions = new Map(); // clip name -> { action, weight, name }
  const make = (clip, name) => {
    const action = mixer.clipAction(clip);
    action.setLoop(loops.has(name) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(0);
    action.play();
    action.paused = true; // times are set by hand
    return action;
  };
  // split: the clip as two actions, `action` for the trunk and arms and `legs` for the hips down
  const actionFor = (name, split = LAYERED.test(name)) => {
    if (actions.has(name)) return actions.get(name);
    const clip = library[name];
    if (!clip) return null;
    const entry = split ? { action: make(part(clip, false), name), legs: make(part(clip, true), name), weight: 0, name }
      : { action: make(clip, name), legs: null, weight: 0, name };
    actions.set(name, entry);
    return entry;
  };
  // the sword hand's grip, always on
  if (pack[idleName]) {
    const fingers = pack[idleName].tracks.filter((t) => form.grip.test(t.name));
    if (fingers.length) {
      const grip = mixer.clipAction(new THREE.AnimationClip('weaponGrip', pack[idleName].duration, fingers));
      grip.play();
      grip.setEffectiveWeight(1);
    }
  }
  const base = { idle: actionFor(idleName, true) || actionFor('swordIdle', true), walk: actionFor('walkBase', true), jog: actionFor('jog', true), sprint: actionFor('sprint', true) };
  const baseEntries = new Set(Object.values(base).filter(Boolean));
  const baseWeights = { idle: 1, walk: 0, jog: 0, sprint: 0 };
  const baseTime = { idle: 0, walk: 0, jog: 0, sprint: 0 };
  let elapsed = 0;
  let settle = null; // { clip, time }
  let lastAction = null; // the fighter.action object seen last frame
  let evasion = { action: null, clip: 'Front_Roll' };
  let reaction = { until: -Infinity, clip: null, start: 0, length: 0 };
  let flinchToggle = false;
  let deathStart = null;
  let wasAirborne = false;
  let landedAt = -Infinity;

  const evasionClip = (body) => {
    const dir = body.motion?.dir;
    if (!dir) return 'Front_Roll';
    const fx = Math.sin(body.yaw), fz = Math.cos(body.yaw);
    const ahead = dir.x * fx + dir.z * fz;
    const right = dir.x * -fz + dir.z * fx;
    const name = Math.abs(ahead) >= Math.abs(right) ? (ahead >= 0 ? 'Front_Roll' : 'Back_Flip') : (right > 0 ? 'Flip_Right' : 'Flip_Left');
    return library[name] ? name : 'Front_Roll';
  };

  // What shows over the base now: { clip, time, fade, out } or null.
  function choose(fighter, body, now, dt, working) {
    const a = fighter.action;
    if (fighter.vitals.dead) {
      if (deathStart === null) deathStart = elapsed;
      settle = null;
      return library.death ? { clip: 'death', time: Math.min(library.death.duration - 1e-3, elapsed - deathStart), fade: 0.08 } : null;
    }
    deathStart = null;
    // Class leaps keep their own authored clips. A regular jump followed by airDash
    // uses its airborne loop until the feet actually land, not just until dash recovery.
    const airborne = body.y > 0.08 && !fighter.effects?.levitate;
    if (airborne) wasAirborne = true;
    else if (wasAirborne) { wasAirborne = false; landedAt = elapsed; }
    // knocked down: thrown back and lying, then getting up
    if (now < fighter.riseUntil) {
      settle = null;
      if (now < fighter.downUntil) {
        const u = 1 - (fighter.downUntil - now) / KNOCKDOWN.lie;
        if (library.knockback) return { clip: 'knockback', time: Math.min(library.knockback.duration - 1e-3, u * library.knockback.duration), fade: 0.05 };
      } else if (library.getUp) {
        const u = 1 - (fighter.riseUntil - now) / KNOCKDOWN.rise;
        return { clip: 'getUp', time: Math.min(library.getUp.duration - 1e-3, u * library.getUp.duration), fade: 0.1 };
      }
    }
    if (fighter.heldBy && library.held) { settle = null; return { clip: 'held', time: elapsed % library.held.duration }; }
    if (isStunned(fighter, now)) {
      settle = null;
      // a new stagger: a flinch for a short one, a guard break for a long one (guard broken, parried)
      if (reaction.until !== fighter.stunnedUntil) {
        const length = fighter.stunnedUntil - now;
        flinchToggle = !flinchToggle;
        const clip = length >= 0.6 && library.guardBreak ? 'guardBreak' : flinchToggle ? 'hitChest' : 'hitHead';
        reaction = { until: fighter.stunnedUntil, clip, start: now, length };
      }
      const clip = library[reaction.clip];
      if (clip) {
        const u = Math.min(1, (now - reaction.start) / Math.max(0.05, reaction.length));
        const span = reaction.clip === 'guardBreak' ? clip.duration : Math.min(clip.duration, reaction.length * 1.2);
        return { clip: reaction.clip, time: Math.min(clip.duration - 1e-3, u * span), fade: 0.04 };
      }
    }
    // using something (a crate's lid, a console, a ledger core): the clip follows the work
    if (working && !a && library[working.clip]) {
      settle = null;
      const clip = library[working.clip];
      const time = working.loop ? elapsed % clip.duration : Math.min(clip.duration - 1e-3, working.progress * clip.duration);
      return { clip: working.clip, time, fade: 0.12 };
    }
    if (a) {
      settle = null;
      if (a.id === 'roll') {
        if (evasion.action !== a) evasion = { action: a, clip: evasionClip(body) };
        const clip = library[evasion.clip];
        if (clip) return { clip: evasion.clip, time: Math.min(clip.duration - 1e-3, (a.t / a.move.duration) * clip.duration), fade: 0.05 };
      }
      const at = clipAt(a.id, a.t);
      if (at && library[at.clip]) return { clip: at.clip, time: at.time, fade: a.chainedFrom ? 0.06 : FADE.in };
      if (library[a.id]) return { clip: a.id, time: Math.min(library[a.id].duration - 1e-3, a.t) };
    }
    if (!a && airborne && library.jumpLoop) {
      settle = null;
      return { clip: 'jumpLoop', time: elapsed % library.jumpLoop.duration, fade: 0.09 };
    }
    if (!a && !airborne && elapsed - landedAt < 0.22 && library.jumpLand) {
      settle = null;
      return { clip: 'jumpLand', time: Math.min(library.jumpLand.duration - 1e-3,
        Math.max(0, (elapsed - landedAt) / 0.22) * library.jumpLand.duration), fade: 0.08 };
    }
    // the move just ended: its motion settles unless the fighter moves on
    if (!a && lastAction && !fighter.guard) {
      const s = settleOf(lastAction.id);
      if (s && library[s.clip]) settle = { clip: s.clip, time: s.from };
    }
    if (settle) {
      const clip = library[settle.clip];
      settle.time += dt;
      if (fighter.guard || (body.speed || 0) > 0.6 || !clip || settle.time >= clip.duration - 1e-3) settle = null;
      else return { clip: settle.clip, time: settle.time, fade: FADE.in, out: FADE.settleOut };
    }
    if (fighter.guard && library[guardName]) {
      // hold the block, breathing a little
      return { clip: guardName, time: 0.36 + 0.1 * (0.5 - 0.5 * Math.cos(elapsed * 2.4)), fade: 0.06 };
    }
    return null;
  }

  // working: { clip, progress (0..1), loop } while the fighter is using something, else null
  function update(dt, { fighter, body, now, working = null }) {
    elapsed += dt;
    const want = choose(fighter, body, now, dt, working);
    lastAction = fighter.action;
    let outRate = 1 / FADE.out;
    if (want) {
      const entry = actionFor(want.clip);
      if (entry) { entry.action.time = want.time; if (entry.legs) entry.legs.time = want.time; }
      if (want.out) outRate = 1 / want.out;
    }
    // the shown state fades in, the rest fade out
    let overlay = 0;
    for (const entry of actions.values()) {
      if (baseEntries.has(entry)) continue;
      const on = !!want && entry.name === want.clip;
      const rate = on ? 1 / (want.fade || FADE.in) : outRate;
      entry.weight += ((on ? 1 : 0) - entry.weight) * Math.min(1, dt * rate);
      if (!on && entry.weight < 1e-3) entry.weight = 0;
      overlay += entry.weight;
    }
    // base by speed
    const speed = body.speed || 0;
    const target = { idle: 0, walk: 0, jog: 0, sprint: 0 };
    if (speed < 0.05) target.idle = 1;
    else if (speed <= SPEED.walk) { const k = speed / SPEED.walk; target.idle = 1 - k; target.walk = k; }
    else if (speed <= SPEED.run) { const k = (speed - SPEED.walk) / (SPEED.run - SPEED.walk); target.walk = 1 - k; target.jog = k; }
    else { const k = Math.min(1, (speed - SPEED.run) / (SPEED.sprint - SPEED.run)); target.jog = 1 - k; target.sprint = k; }
    let baseSum = 0;
    for (const key of Object.keys(baseWeights)) {
      baseWeights[key] += (target[key] - baseWeights[key]) * Math.min(1, dt / FADE.base);
      baseSum += baseWeights[key];
    }
    const pace = {
      idle: 1,
      walk: THREE.MathUtils.clamp(Math.max(speed, 0.8) / naturalWalk, 0.6, 2.4),
      jog: THREE.MathUtils.clamp(speed / NATURAL.jog, 0.7, 1.4),
      sprint: THREE.MathUtils.clamp(speed / NATURAL.sprint, 0.7, 1.4),
    };
    const overlayShare = Math.min(1, overlay);
    const baseShare = 1 - overlayShare;
    // what shows over the base: wholly for the trunk and arms; for the legs, a layered clip gives way to the walk
    // as the body moves, a whole-body clip does not
    const walking = Math.min(1, speed / WALKING);
    let legsTaken = 0;
    for (const entry of actions.values()) {
      if (baseEntries.has(entry)) continue;
      const w = overlay > 1e-6 ? (entry.weight / overlay) * overlayShare : 0;
      entry.action.setEffectiveWeight(w);
      if (entry.legs) {
        entry.legs.setEffectiveWeight(w * (1 - walking));
        legsTaken += w * (1 - walking);
      } else legsTaken += w;
    }
    const legsShare = Math.max(0, 1 - legsTaken);
    for (const [key, entry] of Object.entries(base)) {
      if (!entry) continue;
      baseTime[key] = (baseTime[key] + dt * pace[key]) % entry.action.getClip().duration;
      entry.action.time = baseTime[key];
      entry.legs.time = baseTime[key];
      const share = baseSum > 1e-6 ? baseWeights[key] / baseSum : (key === 'idle' ? 1 : 0);
      entry.action.setEffectiveWeight(share * baseShare);
      entry.legs.setEffectiveWeight(share * legsShare);
    }
    mixer.update(0);
    if (secondHand) {
      // on the shaft as much as the clips now showing say (the stance and the guard: wholly; a sweep: not at all)
      let on = 0;
      for (const entry of actions.values()) {
        const w = entry.action.getEffectiveWeight();
        if (w > 0.001) on += w * secondHandAt(entry.name, entry.action.time);
      }
      secondHand.apply(Math.min(1, on));
    }
  }

  return {
    update,
    mixer,
    current: () => [...actions.values()].filter((e) => e.weight > 0.5 && !baseEntries.has(e)).map((e) => e.name)[0] || null,
    dispose: () => mixer.stopAllAction(),
  };
}
