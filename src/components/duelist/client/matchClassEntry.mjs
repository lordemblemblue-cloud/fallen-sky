/**
 * Match-entry selection policy. The initial class menu is required and never
 * disappears merely because the match/round countdown ends or five seconds pass.
 * After confirmation, only an explicit Class button reopens it.
 */
export const CLASS_CHOICE_PROMPT_SECONDS = 5;

export function shouldShowMatchClassPicker({
  match = null, mission = false, confirmed = false, manuallyOpened = false,
} = {}) {
  return !mission && Boolean(match) && match.phase !== 'over'
    && (!confirmed || manuallyOpened);
}

/** The five seconds are an advisory decision prompt, not automatic class selection. */
export function classChoiceSecondsLeft(startedAt, now) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) return CLASS_CHOICE_PROMPT_SECONDS;
  return Math.max(0, Math.ceil((CLASS_CHOICE_PROMPT_SECONDS * 1000 - (now - startedAt)) / 1000));
}
