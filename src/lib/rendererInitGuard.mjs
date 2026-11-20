/**
 * Guard asynchronous renderer initialization against React unmounts and
 * overlapping scene restarts. Works with WebGL and WebGPU renderer factories.
 *
 * The caller owns its canvas and must stop any animation loop before dispose().
 * This helper intentionally does not retry failed WebGPU initialization.
 */
export function createRendererInitGuard() {
  let generation = 0;
  let current = null;

  function safelyDispose(renderer) {
    if (!renderer || typeof renderer.dispose !== 'function') return;
    try {
      // A lost GPU context may throw synchronously or reject during teardown.
      // Observe the rejection so stale initialization never leaks an unhandled
      // promise or prevents a newer scene from starting.
      const pending = renderer.dispose();
      if (pending && typeof pending.then === 'function') {
        Promise.resolve(pending).catch(() => {});
      }
    } catch {
      // Teardown is best effort: the renderer has already been invalidated.
    }
  }

  return {
    async initialize(factory) {
      if (typeof factory !== 'function') throw new TypeError('renderer factory must be a function');
      const request = ++generation;
      const previous = current;
      current = null;
      safelyDispose(previous);
      let renderer;
      try {
        renderer = await factory();
      } catch (error) {
        if (request !== generation) return { renderer: null, stale: true };
        throw error;
      }
      if (request !== generation) {
        safelyDispose(renderer);
        return { renderer: null, stale: true };
      }
      current = renderer ?? null;
      return { renderer: current, stale: false };
    },
    get renderer() {
      return current;
    },
    dispose() {
      generation += 1;
      const previous = current;
      current = null;
      safelyDispose(previous);
    },
  };
}
