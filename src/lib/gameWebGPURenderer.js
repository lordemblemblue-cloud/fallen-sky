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
    const { default: WebGPURenderer } = await import('three/webgpu');
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
