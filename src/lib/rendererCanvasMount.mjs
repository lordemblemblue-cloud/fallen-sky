/**
 * Mount a renderer's *actual* canvas into a game viewport.
 *
 * A failed WebGPU initialization can claim the original canvas permanently.
 * When WebGL fallback creates a fresh canvas, replace the old element rather
 * than append a second canvas or try to reuse the claimed context.
 *
 * This is DOM-adapter logic only: no renderer initialization, no browser
 * globals at module import, and no change to either live game's frame loop.
 * Callers must still stop their old loop, dispose their old renderer and
 * resize the replacement renderer before drawing.
 */
export function mountRendererCanvas(container, renderer, { previousCanvas = null } = {}) {
  if (!container || typeof container.appendChild !== 'function' ||
      typeof container.replaceChild !== 'function') {
    throw new TypeError('A DOM-compatible viewport container is required');
  }

  const canvas = renderer?.domElement;
  if (!canvas || typeof canvas !== 'object') {
    throw new TypeError('Renderer must expose a domElement canvas');
  }

  // Avoid unnecessary detach/reattach: that can reset a GPU drawing surface.
  if (canvas === previousCanvas && canvas.parentNode === container) {
    return { canvas, replaced: false };
  }

  if (previousCanvas && previousCanvas !== canvas && previousCanvas.parentNode === container) {
    container.replaceChild(canvas, previousCanvas);
    return { canvas, replaced: true };
  }

  // A previously mounted canvas may already have been removed by teardown.
  // appendChild moves the new canvas from any other parent if necessary.
  if (canvas.parentNode !== container) container.appendChild(canvas);
  return { canvas, replaced: false };
}

/** Remove only the canvas owned by this renderer, not other scene content. */
export function unmountRendererCanvas(container, renderer) {
  const canvas = renderer?.domElement;
  if (!container || !canvas || canvas.parentNode !== container) return false;
  container.removeChild(canvas);
  return true;
}
