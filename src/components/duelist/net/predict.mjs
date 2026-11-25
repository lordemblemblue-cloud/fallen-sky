// The player's own fighter, played a step ahead of the server.
//
// Online, everyone is drawn from the server's snapshots a tenth of a second late. Your own fighter would be
// too, plus the trip to the server and back: a press would show well after it was made. So the browser plays
// your own fighter itself, by the same rules the server uses (sim/world.mjs): every input goes to the server
// and is stepped here at once. The server answers with your fighter in full and the number of the last input
// it has used (net/protocol.mjs encodeOwn); the browser goes back to that state, replays the inputs the
// server has not reached yet, and carries on from there.
//
// When both agree (nearly always: your own moving, strikes, powers and rolls) nothing shows. When the server
// knows something the browser did not (you were hit, parried, pushed) the difference is eased out of the
// picture over a tenth of a second rather than snapped. The server still decides everything: this only
// shows sooner what it is about to decide.
import { createWorld, addFighter, step, BODY_RADIUS } from '../sim/world.mjs';
import { resolveCircle } from '../sim/level.mjs';
import { moveArenaBody, ARENA_BODY_HEIGHT } from '../sim/modeArenaLayout.mjs';
import { TICK_HZ, applyOwn } from './protocol.mjs';

const STEP = 1 / TICK_HZ;
export const PREDICTION = Object.freeze({
  easeSeconds: 0.1, // a correction leaves the picture this fast
  cutMetres: 2.5, // a correction this large is a cut (a respawn, a throw), not eased
  maxPending: 120, // inputs kept for replay: two seconds
  sameActionSeconds: 0.12, // a shown action is the same action while its start has moved less than this
});

/**
 * id: the player's fighter; level: a mission's rooms (or null: the round arena of arenaRadius).
 * others: [{ x, z }] where the other standing fighters were last seen (bodies keep apart).
 */
export function createPredictor({ id, level = null, arenaRadius = 22 } = {}) {
  const world = createWorld({ arenaRadius, level });
  const fighter = addFighter(world, { id, team: 'self' });
  const body = world.bodies.get(id);
  const pending = []; // inputs the server has not used yet: { seq, input }
  let active = false;
  // what is shown minus what is predicted (eased to nothing)
  let ex = 0;
  let ey = 0;
  let ez = 0;
  let lastCorrection = 0;

  // the server moves two overlapping bodies half the overlap each; the others stand where they were last seen
  function keepApart(others) {
    const min = BODY_RADIUS * 2;
    for (const o of others) {
      if(world.arenaLayout && Number.isFinite(o.y) && Math.abs(body.y-o.y)>=ARENA_BODY_HEIGHT)continue;
      const dx = body.x - o.x;
      const dz = body.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d >= min) continue;
      const push = (min - d) / 2;
      if (d > 1e-6) { body.x += (dx / d) * push; body.z += (dz / d) * push; } else body.x -= push;
    }
  }
  function keepInside() {
    if (world.level) { resolveCircle(world.level, body, BODY_RADIUS); return; }
    if(world.arenaLayout?.imported)return;
    const r = Math.hypot(body.x, body.z);
    const limit = world.arenaRadius - BODY_RADIUS;
    if (r > limit) { body.x *= limit / r; body.z *= limit / r; }
  }
  function stepOnce(input, others) {
    step(world, STEP, { [id]: input });
    const before={x:body.x,z:body.z};
    if (!fighter.vitals.dead) keepApart(others);
    if(world.arenaLayout){const dx=body.x-before.x,dz=body.z-before.z;Object.assign(body,before);moveArenaBody(world.arenaLayout,body,dx,dz,0,BODY_RADIUS,false);}
    keepInside();
  }

  return {
    world, fighter, body,
    get active() { return active; },
    /** One input, already sent to the server as number `seq`: remembered, and played here at once. */
    advance(seq, input, others = []) {
      pending.push({ seq, input });
      if (pending.length > PREDICTION.maxPending) pending.shift();
      if (active) stepOnce(input, others);
    },
    /**
     * The server's word: the fighter in full (encodeOwn) after it used inputs up to number `ack`. Back to
     * that state, the inputs it has not reached replayed on top. shownAt: where the fighter is drawn right
     * now ({ x, y, z }), so that taking over from the server's picture is eased like any other correction.
     */
    reconcile(own, ack, others = [], shownAt = null) {
      while (pending.length && pending[0].seq <= ack) pending.shift();
      // held in someone's grip: the holder moves this body, so it is drawn from the server's picture
      if (own.hb) { active = false; return; }
      const was = active ? [body.x, body.y, body.z] : shownAt ? [shownAt.x, shownAt.y, shownAt.z] : null;
      if (!active) { ex = 0; ey = 0; ez = 0; }
      applyOwn(fighter, body, own);
      world.time = own.at;
      for (const p of pending) stepOnce(p.input, others);
      if (was) {
        const dx = was[0] - body.x;
        const dz = was[2] - body.z;
        lastCorrection = Math.hypot(dx, dz);
        ex += dx;
        ey += was[1] - body.y;
        ez += dz;
        if (Math.hypot(ex, ez) > PREDICTION.cutMetres) { ex = 0; ey = 0; ez = 0; }
      } else { ex = 0; ey = 0; ez = 0; lastCorrection = 0; }
      active = true;
    },
    /** The server is not acting on this player's inputs (fallen, a countdown): nothing to predict. */
    drop() { active = false; },
    /** A new connection or a new match: nothing to replay, nothing predicted until the server's next word. */
    reset() { pending.length = 0; active = false; ex = 0; ey = 0; ez = 0; lastCorrection = 0; },
    /**
     * Write the predicted fighter into the fighter and body the game view draws (the mirror world's), whose
     * clock reads `time`: moments (cooldowns, a stagger's end) are moved onto that clock, and an action keeps
     * its object while it is the same action (the animator and the effects tell a new action by it).
     */
    present(shown, shownBody, time, dt) {
      const k = Math.exp(-Math.max(0, dt) / PREDICTION.easeSeconds);
      ex *= k; ey *= k; ez *= k;
      const shift = time - world.time;
      Object.assign(shown.vitals, fighter.vitals);
      shown.weapon = fighter.weapon;
      shown.level = fighter.level;
      shown.matchBoost = fighter.matchBoost;
      shown.items = fighter.items;
      shown.shopStats = fighter.shopStats;
      shown.activeRelicUntil = fighter.activeRelicUntil + shift;
      shown.activeRelicCooldownUntil = fighter.activeRelicCooldownUntil + shift;
      shown.activeAnchorAt = fighter.activeAnchorAt ? { ...fighter.activeAnchorAt, until: fighter.activeAnchorAt.until + shift } : null;
      shown.cooldowns = Object.fromEntries(Object.entries(fighter.cooldowns).map(([move, until]) => [move, until + shift]));
      shown.guard = fighter.guard ? { since: fighter.guard.since + shift } : null;
      shown.stunnedUntil = fighter.stunnedUntil + shift;
      shown.protectedUntil = fighter.protectedUntil + shift;
      shown.downUntil = fighter.downUntil + shift;
      shown.riseUntil = fighter.riseUntil + shift;
      shown.heldBy = null;
      shown.breaches = fighter.breaches;
      const a = fighter.action;
      if (!a) shown.action = null;
      else {
        const startedAt = world.time - a.t;
        const cur = shown.action;
        if (cur && cur.id === a.id && cur.startedAt !== undefined && Math.abs(cur.startedAt - startedAt) < PREDICTION.sameActionSeconds) {
          cur.t = a.t; cur.nextHit = a.nextHit; cur.held = a.held; cur.startedAt = startedAt;
        } else shown.action = { id: a.id, move: a.move, t: a.t, nextHit: a.nextHit, held: a.held, chainedFrom: a.chainedFrom, link: a.link, startedAt };
      }
      shownBody.x = body.x + ex;
      shownBody.y = world.arenaLayout?.imported ? body.y + ey : Math.max(0, body.y + ey);
      shownBody.z = body.z + ez;
      shownBody.yaw = body.yaw;
      shownBody.vy = body.vy;
      shownBody.jumped = body.jumped;
      shownBody.airJumpAt = body.airJumpAt;
      shownBody.speed = body.speed;
      shownBody.moving = body.moving;
      shownBody.motion = body.motion;
      shownBody.strafe = body.strafe;
    },
    /** How it is going: inputs the server has not used yet, the last correction and what is still being eased (metres). */
    stats: () => ({ predicting: active, pending: pending.length, correction: lastCorrection, easing: Math.hypot(ex, ez) }),
  };
}
