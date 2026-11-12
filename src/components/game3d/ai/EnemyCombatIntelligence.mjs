// Combat Foundation 2.4: deterministic, inspectable non-boss PvE decisions.
// This module has NO timers, scene access, damage side effects or extra combat loop.
const STANDARD = Object.freeze({
  aggroRange: 8, disengageRange: 12, leashRange: 15, speed: 2.2,
  windup: 0.72, cooldown: 2.2, range: 2.2, arc: 92, flankSeconds: 0.55,
});
const AGGRESSIVE = Object.freeze({
  ...STANDARD, aggroRange: 10, disengageRange: 14, leashRange: 18,
  speed: 2.7, windup: 0.56, cooldown: 1.85, arc: 102, flankSeconds: 0.7,
});
const QUEST = Object.freeze({
  ...STANDARD, aggroRange: 10, disengageRange: 14, leashRange: 17,
});
const BRUISER = Object.freeze({
  ...STANDARD, aggroRange: 9, disengageRange: 13, leashRange: 18,
  speed: 1.9, windup: 0.95, cooldown: 2.65, arc: 118,
  flankSeconds: 0.4,
});
export const ENEMY_INTELLIGENCE_PROFILES = Object.freeze({
  standard: STANDARD, aggressive: AGGRESSIVE, quest: QUEST, bruiser: BRUISER,
});
export function combatEnemyProfile(enemy) {
  return enemy?.isQuestSpawn ? QUEST
    : enemy?.aiProfile === 'boss' || enemy?.tier === 'miniBoss' ? BRUISER
      : enemy?.aiProfile === 'aggressive' || ['elite', 'champion'].includes(enemy?.tier)
        ? AGGRESSIVE : STANDARD;
}
export function horizontalDistance(a, b) {
  if (!a || !b) return Infinity;
  const dx = Number(a.x) - Number(b.x);
  const dz = Number(a.z) - Number(b.z);
  return Number.isFinite(dx) && Number.isFinite(dz) ? Math.hypot(dx, dz) : Infinity;
}
export function enemyHomeDistance(enemy) {
  const home = enemy?.home;
  return home && enemy?.group?.position
    ? horizontalDistance(enemy.group.position, { x: home[0], z: home[2] }) : Infinity;
}
export function shouldEnemyEngage({ playerDistance, homeDistance, alerted = false, engaged = false, profile = STANDARD }) {
  if (!Number.isFinite(playerDistance) || !Number.isFinite(homeDistance)) return false;
  if (homeDistance >= profile.leashRange) return false;
  if (engaged) return playerDistance <= profile.disengageRange;
  return alerted || playerDistance <= profile.aggroRange;
}

// Each attack fixes its center direction and width at its windup start.
// Hit resolution checks exactly that region, not the player's later location
// at the beginning of the windup. A dodge can therefore actually evade it.
export function planEnemyStrike(enemy, target, profile = combatEnemyProfile(enemy)) {
  const serial = Math.max(0, Number(enemy?.combatStrikeSerial) || 0);
  const aggressive = profile === AGGRESSIVE;
  // Fixed rotation: focused / sweeping / focused. No extra damage roll.
  const sweep = serial % 3 === 1;
  const arc = sweep ? Math.min(145, profile.arc + (aggressive ? 28 : 20))
    : Math.max(55, profile.arc - (serial % 3 === 2 ? 20 : 0));
  const windup = profile.windup * (sweep ? 1.2 : serial % 3 === 2 ? 0.88 : 1);
  const origin = enemy?.group?.position;
  return {
    // The y-axis yaw used by GameWorld3D is atan2(dx,dz).
    facingYaw: Math.atan2((target?.x || 0) - (origin?.x || 0), (target?.z || 0) - (origin?.z || 0)),
    arcDegrees: arc, range: profile.range, windup,
    cooldown: profile.cooldown * (sweep ? 1.12 : 1),
    variant: sweep ? 'sweep' : 'focused',
  };
}
export function isWithinEnemyStrike({ origin, target, facingYaw, range, arcDegrees }) {
  const distance = horizontalDistance(origin, target);
  if (!Number.isFinite(distance) || distance > range || distance < 0) return false;
  if (distance < 0.0001) return true;
  const dx = (target.x - origin.x) / distance;
  const dz = (target.z - origin.z) / distance;
  const dot = dx * Math.sin(facingYaw) + dz * Math.cos(facingYaw);
  return dot >= Math.cos((Math.max(1, Math.min(180, arcDegrees)) / 2) * Math.PI / 180);
}
// Approach on the XZ plane. After a player dodge, lightly sidestep rather than
// instantly snapping to the player or teleporting. The world clamps to terrain.
export function enemyPursuitVector(enemyPos, targetPos, { flankSide = 0, flankFactor = 0 } = {}) {
  const dist = horizontalDistance(enemyPos, targetPos);
  if (!Number.isFinite(dist) || dist <= 0.0001) return { x: 0, z: 0 };
  const forwardX = (targetPos.x - enemyPos.x) / dist;
  const forwardZ = (targetPos.z - enemyPos.z) / dist;
  const side = flankSide > 0 ? 1 : flankSide < 0 ? -1 : 0;
  const amount = side * Math.max(0, Math.min(0.9, flankFactor));
  const x = forwardX - forwardZ * amount;
  const z = forwardZ + forwardX * amount;
  const size = Math.hypot(x, z) || 1;
  return { x: x / size, z: z / size };
}
