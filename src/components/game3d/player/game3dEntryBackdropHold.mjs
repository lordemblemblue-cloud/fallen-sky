// While the character creator studio is open, the live world behind it is only a backdrop under the creator's tint
// and its full-screen character stage. Redrawing that whole world every frame cost 25-260 ms of main-thread time per
// frame behind the creator (docs/GAME3D_CHARACTER_SCREEN_PERF_20261122.md), which made dragging the character,
// sliders and hair changes stutter. The world now draws for a short settle time after the creator opens (the menu
// camera eases into its creator framing), then holds its last frame: the canvas keeps showing it until the next draw.
// Start, faction and select keep drawing the world at full rate; a resize redraws the held frame (GameWorld3D's
// redrawAfterResize).

/** How long the world keeps drawing after the creator opens, so the menu camera's ease into the creator framing finishes. */
export const CREATOR_BACKDROP_SETTLE_MS = 1600;

/** Entry steps (GameView entryPreviewMode) whose world backdrop is held still once settled. */
export const HELD_BACKDROP_MODES = Object.freeze(['creator']);

/**
 * @param {{settleMs?: number}} [options]
 * @returns {{shouldHold(previewMode: string, now: number): boolean, reset(): void}}
 */
export function createEntryBackdropHold({ settleMs = CREATOR_BACKDROP_SETTLE_MS } = {}) {
  let mode = null;
  let since = 0;
  return {
    /** True when the world should neither update nor draw this frame (its canvas keeps the last frame). */
    shouldHold(previewMode, now) {
      if (previewMode !== mode) {
        mode = previewMode;
        since = now;
      }
      return HELD_BACKDROP_MODES.includes(previewMode) && now - since >= settleMs;
    },
    /** Forget the current step, e.g. when gameplay starts: the next creator visit settles again. */
    reset() {
      mode = null;
      since = 0;
    },
  };
}
