// One fighter's animation, driven by the simulation every frame:
// - locomotion blends idle / walk / run / sprint by the body's real speed, each clip's playback speed
//   matched to it so the feet do not slide;
// - an action (strike, power, roll, guard, stagger, held) plays on top, its clip time taken straight from the
//   rules core's action time, so what you see is exactly what the rules decide;
// - changes cross-fade in a few hundredths of a second: quick to start, smooth to settle.
import * as THREE from 'three';
import { MOVES, isStunned } from '../core/index.mjs';
import { LOOPED } from './duelMoves.mjs';

export const FADE = Object.freeze({ in: 0.06, out: 0.14, loco: 0.18 });
// The bodies' own clips cover about this much ground per second at timeScale 1.
const NATURAL_SPEED = Object.freeze({ walk: 1.5, run: 4.3 });
const SPEEDS = Object.freeze({ walk: 2.2, run: 4.6, sprint: 7.2 });

export function createFighterAnimator({ model, clips, moveClips }) {
  const mixer = new THREE.AnimationMixer(model);
  const make = (clip, loop) => {
    if (!clip) return null;
    const action = mixer.clipAction(clip);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.enabled = true;
    action.setEffectiveWeight(0);
    action.play();
    return action;
  };
  const loco = {
    idle: make(moveClips.ready || clips.idle, true),
    walk: make(clips.walk, true),
    run: make(clips.run, true),
  };
  const overlay = {};
  for (const [name, clip] of Object.entries(moveClips)) if (name !== 'ready') overlay[name] = make(clip, LOOPED.has(name));
  // evasions: a forward roll, or (locked on, still facing the target) a back flip or a side flip
  if (clips.roll) overlay.roll = make(clips.roll, false);
  if (clips.backFlip) overlay.rollBack = make(clips.backFlip, false);
  if (clips.flipLeft) overlay.rollLeft = make(clips.flipLeft, false);
  if (clips.flipRight) overlay.rollRight = make(clips.flipRight, false);
  let evasion = { action: null, key: 'roll' };
  // which evasion clip: the roll's travel direction against the way the body faces
  const evasionKey = (body) => {
    const dir = body.motion?.dir;
    if (!dir) return 'roll';
    const fx = Math.sin(body.yaw), fz = Math.cos(body.yaw);
    const ahead = dir.x * fx + dir.z * fz;
    const right = dir.x * -fz + dir.z * fx; // the body's right is (-cos yaw, sin yaw)
    const key = Math.abs(ahead) >= Math.abs(right) ? (ahead >= 0 ? 'roll' : 'rollBack') : (right > 0 ? 'rollRight' : 'rollLeft');
    return overlay[key] ? key : 'roll';
  };
  // synced overlays do not advance on their own: their time is set from the rules core
  for (const action of Object.values(overlay)) if (action) action.timeScale = 0;
  const weights = new Map([...Object.values(loco), ...Object.values(overlay)].filter(Boolean).map((a) => [a, 0]));
  weights.set(loco.idle, 1);
  let current = null; // overlay key
  let currentSince = 0;
  let lastAction = null;
  let staggerStart = -Infinity;
  let elapsed = 0;

  // Which overlay shows now, and at what time inside its clip.
  function choose(fighter, body, now) {
    const a = fighter.action;
    if (fighter.heldBy && overlay.held) return { key: 'held', time: elapsed % overlay.held.getClip().duration };
    if (isStunned(fighter, now) && overlay.stagger) {
      if (lastAction !== 'stagger') staggerStart = now;
      return { key: 'stagger', time: Math.min(overlay.stagger.getClip().duration - 1e-3, now - staggerStart) };
    }
    if (a) {
      const move = MOVES[a.id];
      if (a.id === 'roll' && overlay.roll) {
        if (evasion.action !== a) evasion = { action: a, key: evasionKey(body) };
        const clip = overlay[evasion.key].getClip();
        return { key: evasion.key, time: Math.min(clip.duration - 1e-3, (a.t / move.duration) * clip.duration) };
      }
      const action = overlay[a.id];
      if (action) {
        const clip = action.getClip();
        return { key: a.id, time: Math.min(clip.duration - 1e-3, a.t) };
      }
    }
    if (fighter.guard && overlay.guard) return { key: 'guard', time: elapsed % overlay.guard.getClip().duration };
    return null;
  }

  function update(dt, { fighter, body, now }) {
    elapsed += dt;
    const pick = choose(fighter, body, now);
    const key = pick?.key || null;
    if (key !== current) { current = key; currentSince = elapsed; }
    lastAction = key === 'stagger' ? 'stagger' : key;
    // overlay weights
    for (const [name, action] of Object.entries(overlay)) {
      if (!action) continue;
      const target = name === key ? 1 : 0;
      const rate = target ? 1 / FADE.in : 1 / FADE.out;
      const w = weights.get(action);
      weights.set(action, w + (target - w) * Math.min(1, dt * rate));
      if (name === key) action.time = pick.time;
    }
    const overlayTotal = Math.min(1, Object.values(overlay).reduce((s, a) => s + (a ? weights.get(a) : 0), 0));
    // locomotion by speed
    const speed = body.speed || 0;
    const want = { idle: 0, walk: 0, run: 0 };
    if (speed < 0.05) want.idle = 1;
    else if (speed <= SPEEDS.walk) { const k = speed / SPEEDS.walk; want.idle = 1 - k; want.walk = k; }
    else if (speed <= SPEEDS.run) { const k = (speed - SPEEDS.walk) / (SPEEDS.run - SPEEDS.walk); want.walk = 1 - k; want.run = k; }
    else want.run = 1;
    if (loco.walk) loco.walk.timeScale = THREE.MathUtils.clamp(Math.max(speed, 0.6) / NATURAL_SPEED.walk, 0.6, 1.7);
    if (loco.run) loco.run.timeScale = THREE.MathUtils.clamp(speed / NATURAL_SPEED.run, 0.75, 1.8);
    let locoTotal = 0;
    for (const [name, action] of Object.entries(loco)) {
      if (!action) continue;
      const w = weights.get(action);
      const next = w + (want[name] - w) * Math.min(1, dt / FADE.loco);
      weights.set(action, next);
      locoTotal += next;
    }
    // normalise: the overlay takes its share, locomotion fills the rest, never the bind pose
    const locoShare = Math.max(0, 1 - overlayTotal);
    for (const action of Object.values(loco)) if (action) action.setEffectiveWeight(locoTotal > 1e-6 ? (weights.get(action) / locoTotal) * locoShare : 0);
    if (locoTotal <= 1e-6 && loco.idle) loco.idle.setEffectiveWeight(locoShare);
    const overlaySum = Object.values(overlay).reduce((s, a) => s + (a ? weights.get(a) : 0), 0);
    for (const action of Object.values(overlay)) if (action) action.setEffectiveWeight(overlaySum > 1e-6 ? (weights.get(action) / overlaySum) * overlayTotal : 0);
    mixer.update(dt);
  }

  return { update, mixer, current: () => current, since: () => elapsed - currentSince, dispose: () => mixer.stopAllAction() };
}
