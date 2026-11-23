// Three-Point Control rules, independent of map art and character models.
// All coordinates are in arena metres; a future map can supply three point
// positions when it creates a match without changing the scoring logic.
import { bodyOf } from './world.mjs';
import { isDown } from '../core/index.mjs';

export const CONTROL = Object.freeze({
  pointIds: Object.freeze(['A', 'B', 'C']),
  radius: 4,
  captureSeconds: 4,
  decayPerSecond: 0.5,
  pointsToScore: 2,
  twoPointRate: 1, // percentage points per second, if exactly two are owned
  threePointRate: 2, // percentage points per second, if all three are owned
  targetScore: 100,
});

const round = value => Math.round(value * 1000) / 1000;
const safePosition = (point, fallback, arena) => {
  const x = Number(point?.x);
  const z = Number(point?.z);
  return Number.isFinite(x) && Number.isFinite(z) && Math.hypot(x, z) < arena - CONTROL.radius
    ? { x, z } : fallback;
};

/** Supports future authored maps: override the three positions with [{x,z}, ...]. */
export function makeControlPoints(arena = 25, layout = null) {
  const distance = Math.max(6, Math.min(arena - CONTROL.radius - 2, arena * 0.48));
  const defaults = [
    { x: -distance * 0.70, z: -distance * 0.87 },
    { x: distance, z: 0 },
    { x: -distance * 0.70, z: distance * 0.87 },
  ];
  const positions = Array.isArray(layout) && layout.length === 3
    ? layout.map((point, i) => safePosition(point, defaults[i], arena))
    : defaults;
  return positions.map((position, index) => ({
    id: CONTROL.pointIds[index], ...position,
    owner: null, capturing: null, progress: 0, contested: false,
  }));
}

/**
 * Capture rules:
 * - Standing inside a radius with no enemies captures the point in 4 s.
 * - Enemies from both teams present: contested; capture timer freezes.
 * - An owner holds a point until enemies complete a takeover. Empty points
 *   retain ownership, while incomplete capture progress slowly decays.
 * - Only controlling >=2 points scores: 1%/s for two, 2%/s for three.
 * - Team scores are percentages, capped at exactly 100.
 * Caller runs this ONLY when match.phase === 'live' on the authority.
 */
export function stepControlPoints(match, dt) {
  if (!match.controlPoints || match.phase !== 'live' || !Number.isFinite(dt) || dt <= 0) return;
  const { world } = match;
  for (const point of match.controlPoints) {
    const inside = { red: 0, blue: 0 };
    for (const seat of match.seats.values()) {
      if (seat.team !== 'red' && seat.team !== 'blue') continue;
      const fighter = world.fighters.get(seat.id);
      if (!fighter || fighter.vitals.dead || isDown(fighter, world.time) || fighter.heldBy || world.time < (fighter.activeRelicUntil ?? -Infinity)) continue;
      const body = bodyOf(world, seat.id);
      if (!body || Math.hypot(body.x - point.x, body.z - point.z) > CONTROL.radius) continue;
      inside[seat.team]++;
    }
    point.contested = inside.red > 0 && inside.blue > 0;
    if (point.contested) continue;
    const team = inside.red ? 'red' : inside.blue ? 'blue' : null;
    if (!team) {
      point.progress = Math.max(0, point.progress - dt * CONTROL.decayPerSecond);
      if (point.progress === 0) point.capturing = null;
      continue;
    }
    if (team === point.owner) {
      // The owner may defend the point; progress from an interrupted attack
      // is cleared rather than continuing to accumulate in the background.
      point.progress = 0;
      point.capturing = null;
      continue;
    }
    if (point.capturing !== team) { point.capturing = team; point.progress = 0; }
    point.progress = Math.min(CONTROL.captureSeconds, point.progress + dt);
    if (point.progress >= CONTROL.captureSeconds - 1e-8) {
      point.owner = team;
      point.capturing = null;
      point.progress = 0;
      const event = { type: 'pointCaptured', point: point.id, team, at: world.time };
      match.events.push(event);
      match.feed.push(event);
      if (match.feed.length > 12) match.feed.shift();
    }
  }
  for (const team of ['red', 'blue']) {
    const held = match.controlPoints.filter(point => point.owner === team).length;
    const rate = held === 3 ? CONTROL.threePointRate
      : held >= CONTROL.pointsToScore ? CONTROL.twoPointRate : 0;
    match.teamScores[team] = Math.min(CONTROL.targetScore, match.teamScores[team] + dt * rate);
  }
}

/** No private or player identity data: safe for HUD and match replay. */
export function controlPointView(points) {
  return points?.map(point => ({
    id: point.id, x: round(point.x), z: round(point.z), owner: point.owner,
    capturing: point.capturing, progress: round(point.progress / CONTROL.captureSeconds),
    contested: point.contested,
  })) || null;
}
