// How the cast walks, follows and turns. Pure maths on numbers and caller-owned
// objects (no allocation in the per-frame functions), so node can test it.
// Angles are three.js rotation.y: 0 looks along +z (north), pi/2 along +x (east).

export const CAST_WALK_SPEED = 1.4;
export const CAST_RUN_SPEED = 4.2;
export const CAST_TURN_RATE = 4; // radians per second
export const CAST_ARRIVE_RADIUS = 0.15;
export const CAST_FOLLOW_DISTANCE = 2.5;
export const CAST_FOLLOW_DEADBAND = 0.4;
export const CAST_GREET_RADIUS = 4;

export const wrapAngle = a => {
  let v = (a + Math.PI) % (Math.PI * 2);
  if (v < 0) v += Math.PI * 2;
  return v - Math.PI;
};

/** The rotation.y that looks from (fx, fz) toward (tx, tz). */
export const headingTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);

/** Turns `current` toward `desired` by at most maxStep radians, the short way round. */
export function turnToward(current, desired, maxStep) {
  const diff = wrapAngle(desired - current);
  if (Math.abs(diff) <= maxStep) return wrapAngle(desired);
  return wrapAngle(current + Math.sign(diff) * maxStep);
}

/**
 * One step of a walk toward (tx, tz) at `speed` m/s. Writes { x, z, heading,
 * remaining, arrived } into `out` and returns it. A step never overshoots.
 */
export function stepToward(out, x, z, tx, tz, speed, dt, arriveRadius = CAST_ARRIVE_RADIUS) {
  const dx = tx - x, dz = tz - z;
  const dist = Math.hypot(dx, dz);
  if (dist <= arriveRadius || !(speed > 0) || !(dt > 0)) {
    out.x = dist <= arriveRadius ? tx : x;
    out.z = dist <= arriveRadius ? tz : z;
    out.heading = dist > 1e-6 ? Math.atan2(dx, dz) : (out.heading ?? 0);
    out.remaining = dist <= arriveRadius ? 0 : dist;
    out.arrived = dist <= arriveRadius;
    return out;
  }
  const move = Math.min(dist, speed * dt);
  out.x = x + (dx / dist) * move;
  out.z = z + (dz / dist) * move;
  out.heading = Math.atan2(dx, dz);
  out.remaining = dist - move;
  out.arrived = out.remaining <= arriveRadius;
  if (out.arrived) { out.x = tx; out.z = tz; out.remaining = 0; }
  return out;
}

const STEER_TRIES = Object.freeze([0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]);

/**
 * Local avoidance: the first heading near `heading` (straight, then +-30, +-60,
 * +-90 degrees) whose step of `stepLength` is not blocked. Writes { x, z, heading,
 * blocked } into `out`. When every try is blocked the person stays put.
 */
export function steerAround(out, x, z, heading, stepLength, isBlocked) {
  for (const turn of STEER_TRIES) {
    const h = heading + turn;
    const nx = x + Math.sin(h) * stepLength;
    const nz = z + Math.cos(h) * stepLength;
    if (!isBlocked(nx, nz)) {
      out.x = nx; out.z = nz; out.heading = wrapAngle(h); out.blocked = false;
      return out;
    }
  }
  out.x = x; out.z = z; out.heading = heading; out.blocked = true;
  return out;
}

/**
 * Where a follower wants to be: `distance` metres from the target, on the line
 * from the target back toward the follower (so they trail behind and never cut in
 * front). Writes { x, z, gap } into `out`; gap > 0 means they are too far away.
 */
export function followGoal(out, selfX, selfZ, targetX, targetZ, distance = CAST_FOLLOW_DISTANCE) {
  const dx = selfX - targetX, dz = selfZ - targetZ;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) { out.x = selfX; out.z = selfZ; out.gap = -distance; return out; }
  out.x = targetX + (dx / d) * distance;
  out.z = targetZ + (dz / d) * distance;
  out.gap = d - distance;
  return out;
}

/** How fast a follower moves for a gap: still inside the dead band, walking near, running far. */
export function followSpeed(gap, walk = CAST_WALK_SPEED, run = CAST_RUN_SPEED) {
  if (!(gap > CAST_FOLLOW_DEADBAND)) return 0;
  if (gap <= 2) return walk;
  if (gap >= 6) return run;
  return walk + (run - walk) * ((gap - 2) / 4);
}

/** An idle person turns toward a visitor closer than CAST_GREET_RADIUS. */
export const shouldGreet = (dist, radius = CAST_GREET_RADIUS) => Number.isFinite(dist) && dist < radius;

/** Playback rate of the walk clip for a ground speed (clip authored at `clipSpeed` m/s). */
export const walkTimeScale = (speed, clipSpeed = 3.6) => Math.max(0.45, Math.min(1.35, speed / clipSpeed));
