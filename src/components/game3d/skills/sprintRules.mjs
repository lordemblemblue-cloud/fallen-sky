// Game 3D Sprint: one canonical progression rule for UI and locomotion.
// Levels 1..40 add exactly 2% speed per level while Sprint is held.
export const SPRINT_SKILL_ID = 'movement_sprint';
export const SPRINT_MAX_LEVEL = 40;
export const SPRINT_BONUS_PER_LEVEL = 0.02;
export function sprintBonusPct(level = 1) {
  const value = Number(level);
  const safeLevel = Number.isFinite(value)
    ? Math.max(1, Math.min(SPRINT_MAX_LEVEL, Math.floor(value))) : 1;
  return safeLevel * SPRINT_BONUS_PER_LEVEL;
}
export function sprintMoveMultiplier(level = 1) {
  return 1 + sprintBonusPct(level);
}
