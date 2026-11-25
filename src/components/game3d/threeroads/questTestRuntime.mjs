// In-memory admin Quest Test controls. Never persisted in a URL, localStorage
// or a character save. The previous normal-mode flag preferences remain intact.
let preview = null;
let checkpointHold = false;

function changed() {
  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(new globalThis.Event('game3dQuestTestSessionChanged'));
  }
}

export function setQuestTestRuntimePreview(value = null) {
  preview = typeof value === 'boolean' ? value : null;
  changed();
}
export const questTestRuntimePreview = () => preview;

export function setQuestTestCheckpointHold(value) {
  checkpointHold = value === true;
  changed();
}
export const questTestCheckpointSuppressed = () => checkpointHold || preview !== null;
export const questTestRuntimeActive = () => questTestCheckpointSuppressed();

export function endQuestTestRuntime() {
  preview = null;
  checkpointHold = false;
  changed();
}
