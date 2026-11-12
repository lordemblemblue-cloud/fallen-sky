// Server-awarded Duel Mastery, not user-uploaded PvE mastery.
export const DUEL_MASTERY_XP_TO_MAX = 72000;
export const DUEL_MASTERY_CURVE = 2.2;
export const DUEL_MASTERY_MAX_SKILLS = 60;

export function duelMasteryMaxLevel(skillId) {
  return /^(sword_|guardian_|ranged_)/.test(String(skillId)) ? 10 : 30;
}
export function duelMasteryLevel(xp, maxLevel = 30) {
  const amount = Math.max(0, Math.min(DUEL_MASTERY_XP_TO_MAX, Number(xp) || 0));
  const max = Math.max(2, Math.min(30, Math.floor(maxLevel) || 30));
  let level = 1;
  while (level < max && amount >= Math.ceil(DUEL_MASTERY_XP_TO_MAX * ((level) / (max - 1)) ** DUEL_MASTERY_CURVE)) level++;
  return level;
}
export function hasVerifiedDuelMastery(xpRecord, skillId) {
  const xp = Number(xpRecord?.[skillId] || 0);
  return Number.isFinite(xp) && duelMasteryLevel(xp, duelMasteryMaxLevel(skillId)) >=
    duelMasteryMaxLevel(skillId);
}
export function duelMasteryHitXp(profile, landed) {
  if (!landed || !profile?.skillId || !Array.isArray(profile.offsets)) return 0;
  // One use earns roughly the skill cooldown in XP, shared across its
  // separate verified hits; a miss cannot be farmed for mastery.
  return Math.max(1, Math.ceil(Math.max(1000, Number(profile.cooldownMs) || 1000) /
    1000 / Math.max(1, profile.offsets.length)));
}
export function grantDuelMasteryXp(current, skillId, earned) {
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(String(skillId)) ||
      !Number.isFinite(earned) || earned <= 0) return current;
  const xp = { ...(current || {}) };
  if (!Object.prototype.hasOwnProperty.call(xp, skillId) &&
      Object.keys(xp).length >= DUEL_MASTERY_MAX_SKILLS) return current;
  xp[skillId] = Math.min(DUEL_MASTERY_XP_TO_MAX,
    Math.max(0, Number(xp[skillId]) || 0) + Math.min(earned, 100));
  return xp;
}
