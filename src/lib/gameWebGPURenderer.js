/**
 * WebGPU renderer bootstrap for the Fallen Sky / Duelist migration.
 *
 * Keep renderer selection asynchronous: WebGPURenderer.init() must complete
 * before the caller creates render targets or starts its animation loop.
 * Do not pass a pre-created WebGL context to the WebGPU renderer.
 *
 * This helper is deliberately opt-in until each game's shader, post-processing,
 * context-loss, and GPU diagnostics paths have been audited.
 */
export async function createGameWebGPURenderer({
  canvas,
  antialias = true,
  powerPreference = 'high-performance',
} = {}) {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return { renderer: null, reason: 'webgpu-unavailable' };
  }

  let renderer;
  try {
    const { WebGPURenderer } = await import('three/webgpu');
    renderer = new WebGPURenderer({
      ...(canvas ? { canvas } : {}),
      antialias,
      powerPreference,
      forceWebGL: false,
    });
    await renderer.init();
    return { renderer, reason: null };
  } catch (error) {
    renderer?.dispose();
    return { renderer: null, reason: 'webgpu-init-failed', error };
  }
}

/**
 * Opt-in renderer selection for migrated scenes.
 * Never use this until a scene's materials and post-processing support WebGPU.
 * A fresh canvas is recommended when retrying after a failed GPU initialization.
 */
export async function createGameRendererWithFallback({
  canvas,
  antialias = true,
  powerPreference = 'high-performance',
  preferWebGPU = true,
} = {}) {
  if (preferWebGPU) {
    const attempt = await createGameWebGPURenderer({ canvas, antialias, powerPreference });
    if (attempt.renderer) return { renderer: attempt.renderer, backend: 'webgpu', fallbackReason: null };
    // A failed WebGPU initialization may have configured the supplied canvas;
    // allow WebGL to allocate its own clean canvas in that case.
    if (attempt.reason === 'webgpu-init-failed') canvas = undefined;
    const { WebGLRenderer } = await import('three');
    return {
      renderer: new WebGLRenderer({ ...(canvas ? { canvas } : {}), antialias, powerPreference }),
      backend: 'webgl',
      fallbackReason: attempt.reason,
    };
  }
  const { WebGLRenderer } = await import('three');
  return {
    renderer: new WebGLRenderer({ ...(canvas ? { canvas } : {}), antialias, powerPreference }),
    backend: 'webgl',
    fallbackReason: 'webgpu-not-requested',
  };
}
