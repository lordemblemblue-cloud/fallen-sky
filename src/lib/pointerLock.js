// Pointer lock has two browser rules that this module absorbs:
//  1. Chrome rejects requestPointerLock() with a SecurityError while the page
//     is still inside its short cooldown after exitPointerLock() (Esc, menu
//     close, overlay open). That rejection surfaces as an uncaught app error.
//  2. Embedded previews / iframes can refuse pointer lock entirely.
// Every gameplay surface asks through here so mouse capture stays silent and
// the existing right-drag / hover look fallbacks keep working.
const EXIT_COOLDOWN_MS = 1400;

let lastExitAt = 0;

if (typeof document !== 'undefined') {
  // Covers Esc releases, programmatic exits and refusals alike.
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement) lastExitAt = Date.now();
  }, true);
  document.addEventListener('pointerlockerror', () => {
    lastExitAt = Date.now();
  }, true);
}

export const isPointerLockCoolingDown = () => Date.now() - lastExitAt < EXIT_COOLDOWN_MS;

export function requestPointerLockSafe(element) {
  if (!element || typeof element.requestPointerLock !== 'function') return null;
  if (typeof document === 'undefined') return null;
  if (document.pointerLockElement === element) return null;
  // Asking again inside the post-exit cooldown always throws; skip quietly so
  // the next click (after the cooldown) captures normally.
  if (isPointerLockCoolingDown()) return null;
  try {
    const pending = element.requestPointerLock();
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    return pending || null;
  } catch {
    return null;
  }
}

export function exitPointerLockSafe() {
  try {
    if (typeof document !== 'undefined' && document.pointerLockElement) {
      lastExitAt = Date.now();
      document.exitPointerLock?.();
    }
  } catch {
    /* Browser or embedded preview refused the release. */
  }
}