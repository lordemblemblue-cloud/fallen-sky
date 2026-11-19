// The duel's director: watches the simulation step by step and turns what happens into pictures, sound and
// feel. A power's wind-up gathers light in the hand, its release sends the wave (vfx.release); every landed
// move's effect is shown and heard; knocked-down bodies slam into the floor a moment after the blow; a held
// grip hums. It also says how hard the camera should shake and how long the action should hang on a heavy
// hit (hit-stop: the picture only, the rules never pause).
import { bodyOf, forwardOf } from '../sim/world.mjs';

const CHARGED = new Set(['push', 'pull', 'grip', 'breach']);
const RELEASE_SOUND = { push: 'push', pull: 'pull', grip: 'gripStart', throw: 'throw', resist: 'resist', dash: 'dash' };
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
            audio.play('swing', actor.chest(), { heavy: a.id === 'swordHeavy' || a.id === 'swordLight3' });
          } else {
            const kind = a.id === 'gripThrow' ? 'throw' : a.id;
            const held = kind === 'throw' ? heldBy(id) : null;
            if (kind !== 'breach') vfx.release(kind, actor, dir, { target: held ? actors[held.id] : null });
            if (RELEASE_SOUND[kind]) audio.play(RELEASE_SOUND[kind], actor.chest());
          }
        }
      }
      for (const e of effects) {
        const feel = vfx.effect(e, actors);
        const weight = involvesPlayer(e) ? 1 : 0.55;
        shake = Math.max(shake, feel.shake * weight);
        stop = Math.max(stop, feel.stop * weight);
        const target = actors[e.defender];
        const at = target ? target.chest() : null;
        if (e.type === 'projectile') audio.play('shot', actors[e.owner]?.chest() || null);
        if (e.type === 'impact' && at) impactSound(e, at);
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
      }
      shake =Math.max(0, shake - dt * 1.7);
      const stopped = stop > 0;
      stop = Math.max(0, stop - dt);
      return { shake, stopped };
    },
    reset() { seen.clear(); later.length = 0; shake = 0; stop = 0; for (const id of world.fighters.keys()) audio.stopHum(id); },
  };
}
