/**
 * Opt-in renderer bootstrap for migrated Fallen Sky and Duelist scenes.
 * WebGPU startup is asynchronous; callers must await the result before creating
 * GPU resources or starting a frame loop. Non-migrated scenes should use WebGL.
 *
 * If WebGPU initialization fails, its canvas may already have a WebGPU
 * context. The fallback therefore receives NO canvas, and callers must mount
 * the returned renderer.domElement (not assume their old canvas was reused).
 */
const defaultWebGPUFactory = async (options) => {
  const { WebGPURenderer } = await import('three/webgpu');
  return new WebGPURenderer(options);
};

const defaultWebGLFactory = async (options) => {
  const { WebGLRenderer } = await import('three');
  return new WebGLRenderer(options);
};

export async function createGameWebGPURenderer({
  canvas,
  antialias = true,
  powerPreference = 'high-performance',
  webgpuAvailable = typeof navigator !== 'undefined' && Boolean(navigator.gpu),
  makeWebGPURenderer = defaultWebGPUFactory,
} = {}) {
  if (!webgpuAvailable) return { renderer: null, reason: 'webgpu-unavailable' };

  let renderer;
  try {
    renderer = await makeWebGPURenderer({
      ...(canvas ? { canvas } : {}),
      antialias,
      powerPreference,
      forceWebGL: false,
    });
    await renderer.init();
    return { renderer, reason: null };
  } catch (error) {
    // Cleanup should never mask the original init error or prevent fallback.
    try { await renderer?.dispose(); } catch { /* the GPU may already be lost */ }
    return { renderer: null, reason: 'webgpu-init-failed', error };
  }
}

/**
 * Creates a renderer for scenes whose shaders and post-processing were audited.
 * The caller is responsible for mounting renderer.domElement, sizing, disposal,
 * and handling context/device loss. Canvas replacement is reported explicitly.
 */
export async function createGameRendererWithFallback({
  canvas,
  antialias = true,
  powerPreference = 'high-performance',
  preferWebGPU = true,
  webgpuAvailable,
  makeWebGPURenderer = defaultWebGPUFactory,
  makeWebGLRenderer = defaultWebGLFactory,
} = {}) {
  if (preferWebGPU) {
    const attempt = await createGameWebGPURenderer({
      canvas, antialias, powerPreference, webgpuAvailable, makeWebGPURenderer,
    });
    if (attempt.renderer) {
      return { renderer: attempt.renderer, backend: 'webgpu', fallbackReason: null, canvasReplaced: false };
    }

    const canReuseCanvas = attempt.reason !== 'webgpu-init-failed';
    const renderer = await makeWebGLRenderer({
      ...(canReuseCanvas && canvas ? { canvas } : {}),
      antialias,
      powerPreference,
    });
    return {
      renderer,
      backend: 'webgl',
      fallbackReason: attempt.reason,
      canvasReplaced: Boolean(canvas && renderer.domElement !== canvas),
    };
  }

  const renderer = await makeWebGLRenderer({
    ...(canvas ? { canvas } : {}),
    antialias,
    powerPreference,
  });
  return {
    renderer,
    backend: 'webgl',
    fallbackReason: 'webgpu-not-requested',
    canvasReplaced: Boolean(canvas && renderer.domElement !== canvas),
  };
}
