// Level-up notification presentation rules. Other in-game notices keep their
// existing durations and keyboard behavior.
export const LEVEL_UP_NOTICE_AUTO_CLOSE_MS = 1500;
export const LEVEL_UP_NOTICE_ATTRIBUTES_SERVICE = 'character';

export function shouldDismissLevelUpOnEscape(kind, event) {
  return kind === 'level' && event?.key === 'Escape' && event.repeat !== true;
}
