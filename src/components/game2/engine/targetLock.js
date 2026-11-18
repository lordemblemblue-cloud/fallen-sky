// Game 2 camera lock-on: selection is based on the middle of the current
// camera view and on HOSTILE, visible fighters. CTF also allows teammates for
// passing the flag and casting supportive Force Shield. This does not change
// hostile attack targeting, network authority, or prop selection.
import { clamp } from './math.js';

export const LOCK_ACQUIRE_RANGE = 30;
export const LOCK_BREAK_RANGE = 40;
export const LOCK_CONE_DEG = 48;
export const LOCK_OCCLUSION_GRACE = 0.75;

export const wrapTargetAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function lockTargetAngles(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  return {
    yaw: Math.atan2(dx, dz),
    pitch: clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.5, 1.3),
  };
}

export function lockTargetDistance(g, foe) {
  const p = g.player?.pos, q = foe?.pos;
  if (!p || !q) return Infinity;
  return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
}

export function lockTargetIsValid(g, foe, maxRange = LOCK_BREAK_RANGE) {
  if (!g?.player || g.player.status === 'dead' || g.player.hp <= 0 ||
      !foe || foe === g.player || foe.status === 'dead' || foe.hp <= 0 ||
      lockTargetDistance(g, foe) > maxRange) return false;
  // In CTF any living ally may be support-locked, not just a flag carrier.
  // The offensive target set still uses foesOf() and ignores this support lock.
  return g.foesOf(g.player).includes(foe) ||
    !!g.teamMatch?.shieldTargets(g.player).includes(foe) ||
    !!g.net?.ctfPassTargets?.().includes(foe);
}

export function lockTargetVisible(g, foe) {
  const from = g.player.chest(), to = foe.chest();
  // Existing authored missions provide a world raycast. Original Raven BSP
  // arenas instead use their own collision wall grid for obstruction checks.
  if (g.world?.mapCollision?.rayBlocked?.(from, to)) return false;
  return g.world?.lineOfSight ? !!g.world.lineOfSight(from, to) : true;
}

export function chooseLockTarget(g) {
  if (!g?.cam || !g?.player || g.player.status === 'dead') return null;
  const { yaw, pitch } = g.cam, cp = Math.cos(pitch);
  const view = [Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp];
  const from = g.cam.pos || g.player.chest();
  const minDot = Math.cos(LOCK_CONE_DEG * Math.PI / 180);
  let chosen = null, score = Infinity;
  const targets = [...g.foesOf(g.player), ...(g.teamMatch?.shieldTargets(g.player) || []),
    ...(g.net?.ctfPassTargets?.() || [])];
  for (const foe of targets) {
    if (!lockTargetIsValid(g, foe, LOCK_ACQUIRE_RANGE) || !lockTargetVisible(g, foe)) continue;
    const to = foe.chest(), dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.1) continue;
    const dot = (dx * view[0] + dy * view[1] + dz * view[2]) / dist;
    if (dot < minDot) continue; // never snap to an enemy behind the player
    const rank = (1 - dot) * 30 + dist * 0.025; // crosshair alignment first, distance second
    if (rank < score) { score = rank; chosen = foe; }
  }
  return chosen;
}
