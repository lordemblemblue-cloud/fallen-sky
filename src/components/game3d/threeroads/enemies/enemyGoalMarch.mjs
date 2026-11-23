// A wave that walks to a goal (a defend step's guarded point) and then fights.
//
// GameWorld3D's AI loop has no notion of a destination other than home: an
// entry with `aiReturning` walks to `home` at its profile's speed, on the
// ground, through the same collision as any chase, and with no leash. So the
// march sets `home` to the monster's place at the goal and `aiReturning`, and
// the game moves it. This module only decides, each frame, which of four
// states each monster is in and points `home` accordingly:
//
//   march  walking to the goal. Ends on arrival (within the goal's radius,
//          or the loop says it reached its point) -> hold, or when it notices
//          the player -> fight.
//   hold   at the goal. The player within SEEK_RANGE -> seek; the loop
//          engaging on its own -> fight.
//   seek   walking toward the player. Noticing them -> fight; the player
//          beyond SEEK_RELEASE -> march back to the goal.
//   fight  ordinary combat: `home` is where it noticed the player, so the
//          loop's leash is measured from there. When the loop gives up the
//          chase, the player within SEEK_RANGE -> seek, else march back.
//
// "Notices the player" is what the game itself would count, measured from
// where the monster stands rather than from a home far behind it: the player
// within the profile's aggro range, the monster hurt or alerted (hitCooldown),
// or the loop already engaged. While it marches or seeks, the run clip is
// played (the loop would otherwise play the slow walk clip at full speed).
// Pure: no scene, no allocation per frame.
import { combatEnemyProfile } from '../../ai/EnemyCombatIntelligence.mjs';

export const GOAL_DEFAULT_RADIUS = 3;
export const GOAL_MAX_RADIUS = 30;
export const SEEK_RANGE = 25;
export const SEEK_RELEASE = 30;

const finite = v => typeof v === 'number' && Number.isFinite(v);

// The goal of a spawn request, or null when it has none (or a bad one).
export function readGoal(goal) {
  if (!goal || typeof goal !== 'object') return null;
  const x = Number(goal.x), z = Number(goal.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const r = Number(goal.radius);
  const radius = Number.isFinite(r) && r > 0 ? Math.min(GOAL_MAX_RADIUS, r) : GOAL_DEFAULT_RADIUS;
  return { x, z, radius };
}

// Each monster keeps its place in the formation, squeezed inside the goal.
export function goalPointsFor(spots, centre, goal) {
  let far = 0;
  for (const s of spots) far = Math.max(far, Math.hypot(s.x - centre.x, s.z - centre.z));
  const room = Math.max(0, goal.radius * 0.8);
  const k = far > room && far > 0 ? room / far : 1;
  return spots.map(s => ({ x: goal.x + (s.x - centre.x) * k, z: goal.z + (s.z - centre.z) * k }));
}

const distance = (pos, x, z) => Math.hypot(pos.x - x, pos.z - z);

function useRun(entry, march) {
  if (march.walkSaved === undefined) {
    march.walkSaved = entry.walkAction;
    if (entry.runAction) {
      if (entry.walkAction && entry.walkAction !== entry.runAction) entry.walkAction.fadeOut?.(0.2);
      entry.walkAction = entry.runAction;
    }
  }
}
function useWalk(entry, march) {
  if (march.walkSaved !== undefined) {
    if (entry.walkAction !== march.walkSaved) entry.walkAction?.fadeOut?.(0.2);
    entry.walkAction = march.walkSaved;
    march.walkSaved = undefined;
  }
}
function headFor(entry, march, x, z) {
  entry.home[0] = x;
  entry.home[2] = z;
  entry.aiReturning = true;
  entry.aiEngaged = false;
  useRun(entry, march);
}
function stopHere(entry, march) {
  const p = entry.group.position;
  entry.home[0] = p.x;
  entry.home[1] = p.y;
  entry.home[2] = p.z;
  entry.aiReturning = false;
  useWalk(entry, march);
}

// Start a monster marching. `point` is its own place at the goal.
export function startGoalMarch(entry, goal, point) {
  if (!entry?.group?.position || !Array.isArray(entry.home)) return null;
  const march = {
    state: 'march', goal, point, lastHp: entry.hp, walkSaved: undefined, arrivedAt: null,
    // Getting round things (see advance()).
    waypoint: null, waypointAt: 0, best: Infinity, bestAt: 0, detours: 0, blockedUntil: 0,
    anchor: null,
  };
  entry.threeRoads = entry.threeRoads || {};
  entry.threeRoads.march = march;
  // While it walks, the wander zone is the goal: when it gets there and has
  // nothing to do, the game's idle wander keeps it at the goal.
  entry.zoneCenter = [goal.x, 0, goal.z];
  entry.zoneRadius = Math.max(goal.radius, 4);
  headFor(entry, march, point.x, point.z);
  return march;
}

function noticed(entry, march, player, profile) {
  if (entry.aiEngaged) return true;
  if ((Number(entry.hitCooldown) || 0) > 0) return true;
  if (finite(entry.hp) && finite(march.lastHp) && entry.hp < march.lastHp) return true;
  return !!player && distance(entry.group.position, player.x, player.z) <= profile.aggroRange;
}

// Something solid the game's collision knows about (a building footprint, a
// fence, a tree) can stop a walker dead while it still "returns" toward its
// home. If the distance to the target has not shrunk by PROGRESS_STEP in
// STUCK_SECONDS, step round it: a waypoint out to one side,
// alternating sides and wider each time. After MAX_DETOURS it gives up.
export const STUCK_SECONDS = 1.2;
export const PROGRESS_STEP = 0.3;
export const MAX_DETOURS = 8;
const WAYPOINT_SECONDS = 3;

function resetProgress(march, now) {
  march.waypoint = null;
  march.anchor = null;
  march.best = Infinity;
  march.bestAt = now;
}
function changeState(march, state, now) {
  march.state = state;
  resetProgress(march, now);
}

// Walk toward (tx, tz), round anything in the way. Returns false once it has
// given up on this target.
function advance(entry, march, tx, tz, now) {
  const pos = entry.group.position;
  const d = distance(pos, tx, tz);
  if (march.waypoint && (distance(pos, march.waypoint.x, march.waypoint.z) < 0.8
      || !entry.aiReturning || now - march.waypointAt > WAYPOINT_SECONDS)) {
    march.waypoint = null;
    march.best = d;
    march.bestAt = now;
  }
  if (d < march.best - PROGRESS_STEP) {
    march.best = d;
    march.bestAt = now;
    // Well past the place it got stuck: the next obstacle gets a fresh start.
    if (march.anchor && d < march.anchor.d - 2) march.anchor = null;
  } else if (!march.waypoint && now - march.bestAt > STUCK_SECONDS) {
    if (march.detours >= MAX_DETOURS) return false;
    // Every detour round one obstacle is measured from where it first got
    // stuck, so the sides alternate +2.5, -2.5, +5, -5 ... instead of drifting.
    if (!march.anchor) {
      const ux = d > 1e-6 ? (tx - pos.x) / d : 1, uz = d > 1e-6 ? (tz - pos.z) / d : 0;
      march.anchor = { x: pos.x, z: pos.z, d, ux, uz, tries: 0 };
    }
    const a = march.anchor;
    march.detours += 1;
    a.tries += 1;
    const side = a.tries % 2 ? 1 : -1;
    const width = 2.5 * Math.ceil(a.tries / 2);
    // Straight out to the side and half a metre back: a point "ahead" would
    // put the wall back on the line to it.
    march.waypoint = { x: a.x - a.uz * width * side - a.ux * 0.5, z: a.z + a.ux * width * side - a.uz * 0.5 };
    march.waypointAt = now;
    march.bestAt = now;
  }
  if (march.waypoint) headFor(entry, march, march.waypoint.x, march.waypoint.z);
  else headFor(entry, march, tx, tz);
  return true;
}

// One frame for one monster. `player` is the player's position or null;
// `now` is a clock in seconds (any origin) for the arrival time and for
// noticing that it is stuck.
export function stepGoalMarch(entry, player, now = 0) {
  const march = entry?.threeRoads?.march;
  if (!march || entry.dying || entry.alive === false || !entry.group?.position) return null;
  if (entry.attacking) { march.lastHp = entry.hp; return march.state; }
  const profile = combatEnemyProfile(entry);
  const pos = entry.group.position;
  const toPlayer = player ? distance(pos, player.x, player.z) : Infinity;
  switch (march.state) {
    case 'march': {
      if (noticed(entry, march, player, profile)) {
        stopHere(entry, march);
        changeState(march, 'fight', now);
        break;
      }
      // Arrived: inside the goal, or the loop says it reached its own point
      // (not a detour waypoint).
      const atGoal = distance(pos, march.goal.x, march.goal.z) <= march.goal.radius;
      if (atGoal || (!entry.aiReturning && !march.waypoint)) {
        stopHere(entry, march);
        changeState(march, 'hold', now);
        if (march.arrivedAt === null) march.arrivedAt = now;
        break;
      }
      if (!advance(entry, march, march.point.x, march.point.z, now)) {
        // Walled off: hold here. It still goes for a player within range.
        stopHere(entry, march);
        changeState(march, 'hold', now);
        march.gaveUp = true;
      }
      break;
    }
    case 'hold': {
      if (entry.aiEngaged) { changeState(march, 'fight', now); break; }
      if (toPlayer <= SEEK_RANGE && now >= march.blockedUntil) {
        changeState(march, 'seek', now);
        advance(entry, march, player.x, player.z, now);
      }
      break;
    }
    case 'seek': {
      if (noticed(entry, march, player, profile)) {
        stopHere(entry, march);
        changeState(march, 'fight', now);
      } else if (toPlayer > SEEK_RELEASE) {
        changeState(march, 'march', now);
        if (!march.gaveUp) advance(entry, march, march.point.x, march.point.z, now);
        else { stopHere(entry, march); changeState(march, 'hold', now); }
      } else if (!advance(entry, march, player.x, player.z, now)) {
        // Cannot get to the player from here: wait a while before trying again.
        stopHere(entry, march);
        changeState(march, 'hold', now);
        march.blockedUntil = now + 5;
        march.detours = 0;
      }
      break;
    }
    case 'fight': {
      if (entry.aiEngaged) break;
      // The loop gave up the chase (the player outran its leash).
      march.detours = 0;
      if (toPlayer <= SEEK_RANGE) {
        changeState(march, 'seek', now);
        advance(entry, march, player.x, player.z, now);
      } else if (march.gaveUp) {
        stopHere(entry, march);
        changeState(march, 'hold', now);
      } else {
        changeState(march, 'march', now);
        advance(entry, march, march.point.x, march.point.z, now);
      }
      break;
    }
    default: break;
  }
  march.lastHp = entry.hp;
  return march.state;
}
