// Game 3D weapon Skill Points: shared by the browser and the Character Vault validator.
// Attribute points and skill-use XP are different currencies and are never spent here.
// Five consecutive paid stages per weapon; reaching a stage makes its registered
// abilities and its paired passive available without a second unlock fee.
export const WEAPON_SKILL_POINTS_KEY = 'axe_weapon_skill_points_v1';
export const WEAPON_SKILL_TIERS = Object.freeze([20, 30, 40, 50, 60]);
export const WEAPON_SKILL_PATHS = Object.freeze([
  Object.freeze({ id: 'damage', label: 'Sword', role: 'offensive', weapon: 'sword' }),
  Object.freeze({ id: 'range', label: 'Bow', role: 'ranged', weapon: 'ranged' }),
  Object.freeze({ id: 'defense', label: 'Guardian', role: 'defensive', weapon: 'guardian' }),
]);
export const WEAPON_SKILL_CAP = 100;
export const WEAPON_SKILL_PATH_COST = WEAPON_SKILL_TIERS.reduce((a, b) => a + b, 0);
const PATH_IDS = WEAPON_SKILL_PATHS.map(p => p.id);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const levelOf = level => Number.isInteger(level) ? Math.max(1, Math.min(WEAPON_SKILL_CAP, level)) : 1;

// +1 guaranteed skill point per 20 character levels, on top of 3 guaranteed.
// Level 100 yields 502 across all 99 earned levels: 2.51 of three 200-point paths.
// This intentionally supersedes the earlier illustrative +0.2% proposal; that
// percentage would not fund the owner's requested two-and-a-half weapon paths.
export function weaponSkillPointsAtLevel(level) {
  const lv = levelOf(level);
  return lv === 1 ? 0 : 3 + Math.floor(lv / 20);
}
export function weaponSkillPointsEarned(level) {
  let points = 0;
  for (let lv = 2; lv <= levelOf(level); lv++) points += weaponSkillPointsAtLevel(lv);
  return points;
}
export function blankWeaponSkillPoints() {
  return { v: 1, nodes: Object.fromEntries(PATH_IDS.map(id => [id, WEAPON_SKILL_TIERS.map(() => 0)])) };
}
export function weaponSkillPointsSpent(save) {
  return PATH_IDS.reduce((total, id) => total +
    (Array.isArray(save?.nodes?.[id]) ? save.nodes[id].reduce((a, n) => a + (Number.isInteger(n) && n >= 0 ? n : 0), 0) : 0), 0);
}
export function checkWeaponSkillPoints(save, level, previous = null) {
  const errors = [];
  if (!save || typeof save !== 'object' || Array.isArray(save) || save.v !== 1 ||
      !save.nodes || typeof save.nodes !== 'object' || Array.isArray(save.nodes)) {
    return ['weapon skill points must be { v: 1, nodes: { damage: [...], range: [...], defense: [...] } }'];
  }
  if (Object.keys(save.nodes).some(id => !PATH_IDS.includes(id))) errors.push('unknown weapon skill path');
  for (const id of PATH_IDS) {
    const entries = save.nodes[id];
    if (!Array.isArray(entries) || entries.length !== WEAPON_SKILL_TIERS.length) {
      errors.push(id + ' must have five skill tier allocations');
      continue;
    }
    for (let i = 0; i < entries.length; i++) {
      if (!Number.isInteger(entries[i]) || entries[i] < 0 || entries[i] > WEAPON_SKILL_TIERS[i]) {
        errors.push(id + ' tier ' + (i + 1) + ' outside 0–' + WEAPON_SKILL_TIERS[i]);
      }
      if (i > 0 && entries[i] > 0 && entries[i - 1] !== WEAPON_SKILL_TIERS[i - 1]) {
        errors.push(id + ' tier ' + (i + 1) + ' requires previous tier completed');
      }
      const before = previous?.nodes?.[id]?.[i];
      if (Number.isInteger(before) && Number.isInteger(entries[i]) && entries[i] < before) {
        errors.push(id + ' tier ' + (i + 1) + ' cannot lose spent points');
      }
    }
  }
  if (weaponSkillPointsSpent(save) > weaponSkillPointsEarned(level)) {
    errors.push('weapon skill points spent exceed level ' + level + ' entitlement');
  }
  return errors;
}
export function weaponSkillState(save, level) {
  const earned = weaponSkillPointsEarned(level);
  const spent = weaponSkillPointsSpent(save);
  return { earned, spent, available: Math.max(0, earned - spent), nextLevelReward: weaponSkillPointsAtLevel(levelOf(level) + 1) };
}
export function investWeaponSkillPoints(save, level, pathId, tierIndex, amount = 1) {
  if (checkWeaponSkillPoints(save, level).length) return { ok: false, reason: 'INVALID_SAVE' };
  if (!PATH_IDS.includes(pathId) || !Number.isInteger(tierIndex) || tierIndex < 0 || tierIndex >= WEAPON_SKILL_TIERS.length)
    return { ok: false, reason: 'UNKNOWN_TIER' };
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: 'INVALID_AMOUNT' };
  const entries = save.nodes[pathId];
  if (tierIndex > 0 && entries[tierIndex - 1] !== WEAPON_SKILL_TIERS[tierIndex - 1])
    return { ok: false, reason: 'PREVIOUS_TIER_LOCKED' };
  if (entries[tierIndex] + amount > WEAPON_SKILL_TIERS[tierIndex])
    return { ok: false, reason: 'TIER_CAPPED' };
  if (weaponSkillState(save, level).available < amount)
    return { ok: false, reason: 'NOT_ENOUGH_SKILL_POINTS' };
  const nodes = { ...save.nodes, [pathId]: entries.map((n, i) => i === tierIndex ? n + amount : n) };
  return { ok: true, save: { v: 1, nodes }, spent: amount };
}
export function weaponTierUnlocked(save, pathId, tierIndex) {
  const entries = save?.nodes?.[pathId];
  return Array.isArray(entries) && (tierIndex === 0 ||
    (tierIndex > 0 && tierIndex < WEAPON_SKILL_TIERS.length &&
      entries[tierIndex - 1] === WEAPON_SKILL_TIERS[tierIndex - 1]));
}
// Each numbered core skill belongs to a real registry pair: 1/2, 3/4, ..., 9/10.
// The skill and passive for the NEXT stage become available when the previous
// node fills. Completing the very last stage grants no extra capstone bonus.
export function weaponSkillTierForId(skillId) {
  const match = /^axe_(offensive|ranged|defensive)_skill_(10|[1-9])$/.exec(String(skillId || ''));
  if (!match) return null;
  const path = WEAPON_SKILL_PATHS.find(p => p.role === match[1]);
  return path ? { pathId: path.id, tierIndex: Math.floor((Number(match[2]) - 1) / 2) } : null;
}
export function chargedWeaponSkillBonusPct(save, skillId) {
  const tier = weaponSkillTierForId(skillId);
  if (!tier || !weaponTierUnlocked(save, tier.pathId, tier.tierIndex)) return 0;
  const invested = Number(save?.nodes?.[tier.pathId]?.[tier.tierIndex]) || 0;
  // Investment percentage converts to damage percentage at 1:1, not 1% per
  // raw point. The five stages have unequal costs (20/30/40/50/60).
  return Math.min(100, 100 * invested / WEAPON_SKILL_TIERS[tier.tierIndex]);
}
