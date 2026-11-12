// Combat Foundation 2.5 — deliberately small combat vocabulary.
// Max mastery unlocks an OPTIONAL one-second hold for singles and 3-hit skills.
// The bonus is a real damage multiplier (not a guaranteed critical/lethal hit).
export const CHARGE_HOLD_MS = 1000;
export const CHARGE_DAMAGE_MULTIPLIER = 1.20;
export const FINISHER_CHAIN_LEAD_MS = 340;
export const FINISHER_CHAIN_GRACE_MS = 180;
export const CHAIN_SINGLE_DELAY_MS = 80;

// Archetypes require an EXPLICIT configured specialization; the current
// numbered factions do not encode geography or assassin/samurai classes.
export const CHARGE_SPECIALIZATIONS = Object.freeze({
  standard: Object.freeze({ powerMultiplier: 1.20, critBonusPct: 0, fatalBonusPct: 0 }),
  desert: Object.freeze({ powerMultiplier: 1.20, critBonusPct: 0, fatalBonusPct: 0 }),
  assassin: Object.freeze({ powerMultiplier: 1.00, critBonusPct: 10, fatalBonusPct: 0 }),
  samurai: Object.freeze({ powerMultiplier: 1.00, critBonusPct: 0, fatalBonusPct: 10 }),
});
export function getChargeSpecialization(id) {
  return CHARGE_SPECIALIZATIONS[id] || CHARGE_SPECIALIZATIONS.standard;
}
export function skillCombatFamily(skill) {
  if (!skill || skill.skill_type !== 'ACTIVE_ATTACK') return null;
  if (Number(skill.aoe_radius || 0) > 0 ||
      ['aoe', 'strong_aoe'].includes(skill.axe_pattern)) return 'aoe';
  if (Number(skill.hit_count) === 1 && skill.cast_type === 'single_hit') return 'single';
  if (Number(skill.hit_count) === 3 &&
      ['multi_hit_sequential', 'multi_hit_burst'].includes(skill.cast_type)) return 'three_hit';
  return 'other_multi';
}
export function isMaxMasteryChargeUnlocked(skill, level) {
  return ['single', 'three_hit'].includes(skillCombatFamily(skill)) &&
    Number.isFinite(Number(level)) &&
    Number(level) >= Math.max(1, Number(skill.max_level) || 30);
}
export function qualifyChargedCast(skill, masteryLevel, heldMs, specializationId = 'standard') {
  const charged = isMaxMasteryChargeUnlocked(skill, masteryLevel) &&
    Number.isFinite(Number(heldMs)) && Number(heldMs) >= CHARGE_HOLD_MS;
  const family = skillCombatFamily(skill);
  const spec = getChargeSpecialization(specializationId);
  return {
    charged,
    family,
    powerMultiplier: charged ? spec.powerMultiplier : 1,
    critBonusPct: charged ? spec.critBonusPct : 0,
    fatalBonusPct: charged ? spec.fatalBonusPct : 0,
    specializationId: CHARGE_SPECIALIZATIONS[specializationId] ? specializationId : 'standard',
  };
}
export function chargedStrikeModifiers(qualification, hitIndex = 0, totalHits = 1, soulEcho = false) {
  // Kill Flow's earned instant counter empowers all three successive strikes;
  // normal held charges still only empower the final hit.
  const finalHit = qualification?.counterInstant ||
    qualification?.family !== 'three_hit' ||
    hitIndex === Math.max(0, totalHits - 1);
  const apply = !!qualification?.charged && finalHit && !soulEcho;
  return {
    multiplier: apply ? Math.max(1, qualification.powerMultiplier || 1) : 1,
    critBonusPct: apply ? Math.max(0, qualification.critBonusPct || 0) : 0,
    fatalBonusPct: apply ? Math.max(0, qualification.fatalBonusPct || 0) : 0,
    chargedFinisher: apply && qualification.family === 'three_hit' &&
      hitIndex === Math.max(0, totalHits - 1),
  };
}
export function canAcceptFinisherChain(window, nowMs, nextSkill, activeTargetId) {
  if (!window || !window.charged || skillCombatFamily(nextSkill) !== 'single') return false;
  if (!Number.isFinite(nowMs) || nowMs < window.opensAt || nowMs > window.expiresAt) return false;
  if (window.targetId && window.targetId !== activeTargetId) return false;
  return true;
}
export function chainedSingleDelay(nowMs, finalHitAtMs) {
  return Math.max(120, Math.min(1500, (Number(finalHitAtMs) || 0) - nowMs + CHAIN_SINGLE_DELAY_MS));
}
