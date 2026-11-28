// The duel's director: watches the simulation step by step and turns what happens into pictures, sound and
// feel. A power's wind-up gathers light in the hand, its release sends the wave (vfx.release); every landed
// move's effect is shown and heard; knocked-down bodies slam into the floor a moment after the blow; a held
// grip hums. It also says how hard the camera should shake and how long the action should hang on a heavy
// hit (hit-stop: the picture only, the rules never pause).
import { bodyOf, forwardOf } from '../sim/world.mjs';

const CHARGED = new Set(['push', 'pull', 'grip', 'breach']);
const RELEASE_SOUND = { push: 'push', pull: 'pull', grip: 'gripStart', throw: 'throw', resist: 'resist', dash: 'dash',
  repulse: 'repulseSlam', leapStrike: 'leapWhoosh', counter: null };
// the class abilities' lasting effects as they take hold (the Rage's roar plays at the special, Mend's chime at the heal)
const EFFECT_SOUND = { quick: 'quickstep', cloak: 'cloak', empower: 'empower', levitate: 'levitate', dominated: 'dominate' };
const LEAP_LANDS = 0.4; // seconds from the Leap Strike's take-off to its slam (core/moves.mjs hitAt)
// a body's voice: the recordings come in a man's and a woman's (actor.voice 'm' | 'f')
const voiced = (audio, name, actor) => (audio.has?.(`${name}_${actor?.voice || 'm'}`) ? `${name}_${actor?.voice || 'm'}` : `${name}_m`);
const SLAM_DELAY = 0.28; // seconds from the knockdown blow to the body landing (the knockback clip)

// playerId: the player's fighter id, or a function giving it (online, it is known once signed in)
export function createDirector({ world, vfx, audio, actors, playerId = 'you' }) {
  const seen = new Map(); // fighter id -> { action, released }
  const later = []; // { at: world time, run }
  let shake = 0;
  let stop = 0;

  const heldBy = (holderId) => [...world.fighters.values()].find((f) => f.heldBy === holderId) || null;
  const me = () => (typeof playerId === 'function' ? playerId() : playerId);
  const involvesPlayer = (e) => [e.defender, e.attacker, e.from, e.by].includes(me());

  function impactSound(e, at) {
    if (e.outcome === 'blocked') { audio.play('block', at); return; }
    if (e.outcome === 'guardBreak') audio.play('block', at, { gain: 1.2 });
    if (e.shield > 0.01) audio.play('hitShield', at);
    if (e.will > 0.01) audio.play('hitVeil', at, { strength: Math.min(1.3, 0.6 + e.will / 20) });
    if (e.hp > 0.01) audio.play('hitBody', at, { strength: Math.min(1.3, 0.6 + e.hp / 15) });
  }

  return {
    /** After every simulation step, with the step's effects. */
    step(effects) {
      const now = world.time;
      for (const [id, fighter] of world.fighters) {
        const actor = actors[id];
        if (!actor) continue;
        const a = fighter.action;
        let s = seen.get(id);
        if (!s || s.action !== a) {
          s = { action: a, released: false };
          seen.set(id, s);
          if (a && CHARGED.has(a.id)) vfx.charge(a.id, actor, a.move.startup);
          if (a?.id === 'roll') { vfx.release('roll', actor, forwardOf(bodyOf(world, id).yaw)); audio.play('roll', actor.chest()); s.released = true; }
        }
        if (a && !s.released && a.t >= a.move.startup) {
          s.released = true;
          const dir = forwardOf(bodyOf(world, id).yaw);
          if (a.move.damageKind === 'projectile') {
            // a shot is heard as each round leaves (the 'projectile' effect, below)
          } else if (a.move.kind === 'attack') {
            audio.play('swing', actor.chest(), { heavy: a.id === 'swordHeavy' || a.id === 'swordLight3' || a.move?.cut?.mode === 'heavy' });
          } else {
            const kind = a.id === 'gripThrow' ? 'throw' : a.move.kind === 'emote' ? 'taunt' : a.id; // every class's taunt
            const held = kind === 'throw' ? heldBy(id) : null;
            if (kind !== 'breach') vfx.release(kind, actor, dir, { target: held ? actors[held.id] : null });
            if (RELEASE_SOUND[kind]) audio.play(RELEASE_SOUND[kind], actor.chest());
            if (kind === 'leapStrike') later.push({ at: now + LEAP_LANDS, run: () => audio.play('groundSlam', actor.chest()) });
            if (kind === 'taunt' && fighter.classId) audio.play(voiced(audio, `taunt_${fighter.classId}`, actor), actor.chest(), { rate: 1 });
          }
        }
      }
      for (const e of effects) {
        // a cut parried: the blades met, and the one who cut is thrown back (its animator shows the recoil)
        if (e.type === 'parry' && actors[e.attacker]) actors[e.attacker].clashAt = world.time;
        const feel = vfx.effect(e, actors);
        // a class ability lands: its own sound (recorded with ElevenLabs where there is one)
        const chestOf = (id) => actors[id]?.chest() || null;
        if (e.type === 'effect' && EFFECT_SOUND[e.effect]) audio.play(EFFECT_SOUND[e.effect], chestOf(e.target));
        else if (e.type === 'zone') audio.play(audio.has?.('sanctuary') ? 'sanctuary' : 'breach', chestOf(e.owner));
        else if (e.type === 'special' && e.special === 'rage') {
          // he roars (not the whole Rage: then he breathes hard, below in frame())
          audio.play(voiced(audio, 'rageRoar', actors[e.by]), chestOf(e.by), { rate: 1 });
          audio.play(audio.has?.('fireIgnite') ? 'fireIgnite' : 'breach', chestOf(e.by));
        }
        else if (e.type === 'heal') audio.play(audio.has?.('mend') ? 'mend' : 'resist', chestOf(e.target));
        else if (e.type === 'execution') audio.play(audio.has?.('executionStab') ? 'executionStab' : 'collapse', chestOf(e.defender));
        else if (e.type === 'slide') audio.play('pushSlide', chestOf(e.target)); // a pushed body skids along the floor
        else if (e.type === 'seized') audio.play('executionPull', chestOf(e.target));
        else if (e.type === 'shove') audio.play('shove', chestOf(e.target));
        else if (e.type === 'blink') audio.play('blink', chestOf(e.by));
        else if (e.type === 'dominanceBroken') audio.play('dominanceBreak', chestOf(e.target));
        else if (e.type === 'airDash') audio.play(audio.has?.('airDash') ? 'airDash' : 'dash', chestOf(e.by));
        else if (e.type === 'airJump') audio.play('airJump', chestOf(e.by));
        else if (e.type === 'counter') audio.play(audio.has?.('counter') ? 'counter' : 'parry', actors[e.defender]?.hand() || null);
        const weight = involvesPlayer(e) ? 1 : 0.55;
        shake = Math.max(shake, feel.shake * weight);
        stop = Math.max(stop, feel.stop * weight);
        const target = actors[e.defender];
        const at = target ? target.chest() : null;
        if (e.type === 'projectile') audio.play(e.move === 'bladeThrow' && audio.has?.('bladeThrow') ? 'bladeThrow' : 'shot', actors[e.owner]?.chest() || null);
        if (e.type === 'impact' && at) {
          impactSound(e, at);
          const attacker = bodyOf(world, e.attacker);
          const defender = bodyOf(world, e.defender);
          if (attacker && defender && e.outcome === 'hit' && e.hp + e.will + e.shield > 0) {
            const dx = defender.x - attacker.x, dz = defender.z - attacker.z;
            const distance = Math.max(0.001, Math.hypot(dx, dz));
            const forward = forwardOf(defender.yaw);
            target.impactPose = {
              at: now,
              pitch: (dx * forward.x + dz * forward.z) / distance,
              roll: (dx * forward.z - dz * forward.x) / distance,
              strength: Math.min(0.26, 0.10 + (e.hp + e.shield + e.will) * 0.003),
            };
          }
        }
        else if (e.type === 'parry' && target) audio.play('parry', target.hand());
        else if (e.type === 'veilCollapse' && at) audio.play('collapse', at);
        else if (e.type === 'breach' && at) audio.play('breach', at);
        else if (e.type === 'defeat' && at) audio.play('defeat', at);
        else if (e.type === 'knockdown' && target) {
          later.push({ at: now + SLAM_DELAY, run: () => { vfx.slam(target); audio.play('knockdown', target.chest()); if (involvesPlayer(e)) shake = Math.max(shake, 0.3); } });
        }
      }
      for (let i = later.length - 1; i >= 0; i--) {
        if (later[i].at <= now) { later[i].run(); later.splice(i, 1); }
      }
    },
    /**
     * Every rendered frame (real seconds). Returns { shake: 0..1 trauma, stopped: true while the hit-stop
     * holds the picture }.
     */
    frame(dt) {
      // a held grip hums at the held body
      for (const [id, fighter] of world.fighters) {
        const a = fighter.action;
        const holding = a?.id === 'grip' && a.held && a.t >= a.move.startup && heldBy(id);
        if (holding && actors[id]) audio.hum(id, actors[holding.id]?.chest() || actors[id].chest());
        else audio.stopHum(id);
        // Rage: after the roar, hard breathing and the crackle of the fire for as long as it burns
        const raging = actors[id] && !fighter.vitals.dead && fighter.effects?.rage && fighter.effects.rage.until > world.time
          && (!fighter.action || fighter.action.id !== 'rage');
        if (raging && audio.loop) {
          const chest = actors[id].chest();
          audio.loop(`breath:${id}`, voiced(audio, 'rageBreath', actors[id]), chest);
          audio.loop(`fire:${id}`, 'fireLoop', chest);
        } else if (audio.stopLoop) { audio.stopLoop(`breath:${id}`); audio.stopLoop(`fire:${id}`); }
      }
      shake =Math.max(0, shake - dt * 1.7);
      const stopped = stop > 0;
      stop = Math.max(0, stop - dt);
      return { shake, stopped };
    },
    reset() {
      seen.clear(); later.length = 0; shake = 0; stop = 0;
      for (const id of world.fighters.keys()) { audio.stopHum(id); audio.stopLoop?.(`breath:${id}`); audio.stopLoop?.(`fire:${id}`); }
    },
  };
}
