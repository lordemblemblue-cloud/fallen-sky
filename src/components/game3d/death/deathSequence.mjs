// Shared presentation timeline. The fall must be visible before the actor
// disperses; the respawn UI only opens after the ash completes.
export const DEATH_FALL_MS = 1350;
export const DEATH_ASH_MS = 1450;
export const DEATH_UI_DELAY_MS = DEATH_FALL_MS + DEATH_ASH_MS + 200;

export function deathAshProgress(elapsedMs) {
  if (!Number.isFinite(elapsedMs)) return 0;
  return Math.min(1, Math.max(0, (elapsedMs - DEATH_FALL_MS) / DEATH_ASH_MS));
}
