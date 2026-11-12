// Combat Foundation 2.0 — a small, deterministic input-to-strike adapter.
//
// The skill executor already emits ONE playerSkillStrike event per hit and
// schedules combo timing itself. World combat used to collapse those events
// into a single attackPressed boolean, accidentally dropping quick follow-ups.
// This queue preserves each hit and its multiplier until the shared AXE strike
// resolver processes it. It does not compute damage, grant loot or alter XP.

export const MAX_PENDING_SKILL_STRIKES = 48;
export const BASIC_ATTACK_COOLDOWN_SECONDS = 0.2;
export const MIN_BASIC_ATTACK_COOLDOWN_SECONDS = 0.06;

const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0;

export function createCombatActionQueue() {
  const strikes = [];
  return {
    enqueueSkillStrike(detail = {}) {
      const multiplier = Number(detail.multiplier ?? 1);
      if (!finitePositive(multiplier) || strikes.length >= MAX_PENDING_SKILL_STRIKES) return false;
      strikes.push(Object.freeze({
        source: 'ability',
        // This event is local presentation, not a server-authoritative hit.
        multiplier: Math.min(20, multiplier),
        skillId: typeof detail.skillId === 'string' ? detail.skillId.slice(0, 100) : null,
        castId: typeof detail.castId === 'string' ? detail.castId.slice(0, 72) : null,
        hitIndex: Number.isInteger(detail.hitIndex) ? detail.hitIndex : 0,
        weaponType: typeof detail.weaponType === 'string' ? detail.weaponType : null,
        castType: typeof detail.castType === 'string' ? detail.castType : null,
        aoeRadius: Math.max(0, Math.min(12, Number(detail.aoeRadius) || 0)),
        targetId: typeof detail.targetId === 'string' ? detail.targetId.slice(0, 100) : null,
        charged: detail.charged === true,
        criticalAllowed: detail.criticalAllowed !== false,
        chargedCritBonusPct: Math.max(0, Math.min(10, Number(detail.chargedCritBonusPct) || 0)),
        chargedFatalBonusPct: Math.max(0, Math.min(10, Number(detail.chargedFatalBonusPct) || 0)),
        defensePiercePct: Math.max(0, Math.min(0.35, Number(detail.defensePiercePct) || 0)),
        chainFrom: typeof detail.chainFrom === 'string' ? detail.chainFrom.slice(0, 100) : null,
        soulEcho: !!detail.soulEcho,
      }));
      return true;
    },
    nextSkillStrike() { return strikes.shift() || null; },
    size() { return strikes.length; },
    clear() { strikes.length = 0; },
  };
}

export function basicAttackCooldown(attackSpeedMultiplier = 1) {
  const speed = finitePositive(attackSpeedMultiplier) ? Number(attackSpeedMultiplier) : 1;
  return Math.max(MIN_BASIC_ATTACK_COOLDOWN_SECONDS, BASIC_ATTACK_COOLDOWN_SECONDS / speed);
}

// Choose a living enemy in actual attack range. An existing enemy lock takes
// priority over a closer unrelated creature; otherwise the closest valid enemy
// wins. Never select a remote player here — PvP uses its own duel validation.
export function selectWorldCombatTarget({
  enemies = [], bosses = [], attackerPosition, maxRange, lockedEnemyId = null,
} = {}) {
  if (!attackerPosition || !finitePositive(maxRange)) return null;
  const candidates = [...enemies, ...bosses];
  let nearest = null;
  let nearestDistance = Number(maxRange);
  let locked = null;

  for (const enemy of candidates) {
    if (!enemy?.alive || enemy.dying || enemy.defeated || !enemy.group?.position) continue;
    const dx = enemy.group.position.x - attackerPosition.x;
    const dz = enemy.group.position.z - attackerPosition.z;
    const distance = Math.hypot(dx, dz);
    if (!Number.isFinite(distance) || distance >= maxRange) continue;
    if (lockedEnemyId && enemy.id === lockedEnemyId) {
      locked = { target: enemy, distance };
      break;
    }
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = { target: enemy, distance };
    }
  }
  return locked || nearest;
}
