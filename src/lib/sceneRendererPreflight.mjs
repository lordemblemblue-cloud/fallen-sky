import { selectRendererBackend } from './rendererSelection.mjs';

/**
 * Side-effect-free, scene-gated asynchronous preflight.
 * Probe only when the scene has passed its WebGPU shader and effect audit.
 * The injected probe must resolve to { available: boolean, reason?: string }.
 * Do not create a GPU renderer or mutate a canvas here.
 */
export async function preflightSceneRenderer({
  requested = 'auto',
  sceneWebGPUReady = false,
  probeAdapter,
} = {}) {
  const initial = selectRendererBackend({
    requested,
    sceneWebGPUReady,
    webgpuAvailable: true,
  });
  if (initial.backend !== 'webgpu') return initial;

  if (typeof probeAdapter !== 'function') {
    return { backend: 'webgl', reason: 'adapter-probe-missing' };
  }

  try {
    const result = await probeAdapter();
    if (!result || result.available !== true) {
      return { backend: 'webgl', reason: result?.reason || 'adapter-unavailable' };
    }
    return initial;
  } catch {
    return { backend: 'webgl', reason: 'adapter-probe-failed' };
  }
}
