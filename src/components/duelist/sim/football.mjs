// Football's server-authoritative ball and goals. This is an original, simple
// goal-scoring mode: move to dribble, hold interact (F) for a stronger kick.
// No combat damage or client-authored goals. The simulation is shared by
// solo bot matches and the WebSocket server.
import { bodyOf } from './world.mjs';

export const FOOTBALL = Object.freeze({
  radius: 0.7,
  touch: 1.55,
  goalHalfWidth: 5,
  goalInset: 1.5,
  kickCooldown: 0.32,
  kickSpeed: 9,
  poweredKickSpeed: 18,
  damping: 0.985,
  maxSpeed: 23,
});

export function makeBall() {
  return { x: 0, z: 0, vx: 0, vz: 0, lastTouch: -Infinity, lastBy: null };
}

export function resetBall(match) {
  match.ball = makeBall();
}

/** One deterministic tick; only player/bot movement and interact affect the ball. */
export function stepFootball(match, dt, inputs = {}) {
  if (!match.ball || match.phase !== 'live') return null;
  const ball = match.ball;
  const { world, def } = match;
  const now = world.time;
  let closest = null;
  for (const seat of match.seats.values()) {
    const fighter = world.fighters.get(seat.id);
    if (!fighter || fighter.vitals.dead) continue;
    const body = bodyOf(world, seat.id);
    if (!body) continue;
    const distance = Math.hypot(body.x - ball.x, body.z - ball.z);
    if (distance >= FOOTBALL.touch || (closest && distance >= closest.distance)) continue;
    const input = inputs[seat.id] || {};
    const moving = Math.hypot(input.move?.x || 0, input.move?.z || 0) > 0.15;
    if (!moving && !input.interact) continue;
    closest = { seat, body, input, distance };
  }
  if (closest && now - ball.lastTouch >= FOOTBALL.kickCooldown) {
    const { seat, body, input } = closest;
    // Follow the player's movement; when pressing F without moving, shoot
    // toward the other team's goal. Bots use the same movement input.
    let dx = input.move?.x || 0;
    let dz = input.move?.z || 0;
    if (Math.hypot(dx, dz) < 0.15) {
      dx = ball.x - body.x;
      dz = ball.z - body.z;
    }
    if (Math.hypot(dx, dz) < 0.15) { dx = 0; dz = seat.team === 'red' ? 1 : -1; }
    const size = Math.hypot(dx, dz) || 1;
    const speed = input.interact ? FOOTBALL.poweredKickSpeed : FOOTBALL.kickSpeed;
    ball.vx = dx / size * speed;
    ball.vz = dz / size * speed;
    ball.lastTouch = now;
    ball.lastBy = seat.id;
  }
  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;
  const damping = FOOTBALL.damping ** (dt * 60);
  ball.vx *= damping;
  ball.vz *= damping;

  const limit = def.arena - FOOTBALL.goalInset;
  if (Math.abs(ball.z) >= limit && Math.abs(ball.x) <= FOOTBALL.goalHalfWidth) {
    const scorer = ball.z > 0 ? 'red' : 'blue';
    match.teamScores[scorer] += 1;
    const event = { type: 'goal', team: scorer, by: ball.lastBy, at: world.time };
    match.events.push(event);
    match.feed.push(event);
    if (match.feed.length > 12) match.feed.shift();
    resetBall(match);
    return event;
  }
  if (Math.abs(ball.z) >= limit) {
    ball.z = Math.sign(ball.z) * limit;
    ball.vz *= -0.55;
  }
  const sideLimit = def.arena * 0.68;
  if (Math.abs(ball.x) >= sideLimit) {
    ball.x = Math.sign(ball.x) * sideLimit;
    ball.vx *= -0.55;
  }
  const velocity = Math.hypot(ball.vx, ball.vz);
  if (velocity > FOOTBALL.maxSpeed) {
    ball.vx *= FOOTBALL.maxSpeed / velocity;
    ball.vz *= FOOTBALL.maxSpeed / velocity;
  }
  return null;
}
