// Targeting and player movement are separate. No position snapping/teleports.
// The ~150° frontal area is forgiving; explicit lock-on is optional in PvE.
export const DEFAULT_FRONTAL_ARC_DEGREES = 150;
export const TARGET_EDGE_GRACE_METERS = 0.65;
export function targetDistance(a, b) {
  if (!a || !b) return Infinity;
  const dx = Number(b.x) - Number(a.x), dz = Number(b.z) - Number(a.z);
  return Number.isFinite(dx) && Number.isFinite(dz) ? Math.hypot(dx, dz) : Infinity;
}
export function isInFacingArc(origin, yaw, target, arcDegrees = DEFAULT_FRONTAL_ARC_DEGREES) {
  const dist = targetDistance(origin, target);
  if (!Number.isFinite(dist)) return false;
  if (dist < 0.05) return true;
  const dx = (target.x - origin.x) / dist, dz = (target.z - origin.z) / dist;
  return dx * Math.sin(yaw || 0) + dz * Math.cos(yaw || 0) >=
    Math.cos((Math.min(180, Math.max(1, arcDegrees)) * Math.PI) / 360);
}
export function pickForwardCombatTargets({
  enemies = [], bosses = [], origin, yaw = 0, maxRange = 3,
  radius = 0, lockedEnemyId = null, allowEdgeGrace = false, arcDegrees = DEFAULT_FRONTAL_ARC_DEGREES,
} = {}) {
  if (!origin || !(maxRange > 0)) return [];
  const cap = Math.max(maxRange, Number(radius) || 0);
  const result = [];
  for (const target of [...enemies, ...bosses]) {
    if (!target?.alive || target.dying || target.defeated ||
        target.group?.visible === false || !target.group?.position) continue;
    const distance = targetDistance(origin, target.group.position);
    const locked = target.id === lockedEnemyId;
    const limit = cap + (allowEdgeGrace && locked ? TARGET_EDGE_GRACE_METERS : 0);
    if (distance > limit) continue;
    // An explicit live lock helps acquire a sidestepping opponent inside range,
    // but never targets someone behind the hero, nor teleports the player.
    if (!locked && !isInFacingArc(origin, yaw, target.group.position, arcDegrees)) continue;
    if (locked && !isInFacingArc(origin, yaw, target.group.position, 180)) continue;
    result.push({ target, distance, locked });
  }
  result.sort((a, b) => Number(b.locked) - Number(a.locked) || a.distance - b.distance);
  // AoE hits all eligible PvE enemies in a bounded area; ordinary skill hits
  // consume only the foremost target. PvP targeting stays exclusively in duel logic.
  return radius > 0 ? result.slice(0, 12) : result.slice(0, 1);
}
