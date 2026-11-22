/**
 * Conservative renderer selection for incremental WebGPU migration.
 * WebGPU must be explicitly enabled per scene after shader/postprocessing audits.
 * This module never touches DOM globals during SSR.
 */
export function selectRendererBackend({
  webgpuAvailable = false,
  sceneWebGPUReady = false,
  requested = 'auto',
} = {}) {
  // Reject malformed/unknown preferences rather than enabling a GPU backend implicitly.
  if (!['auto', 'webgl', 'webgpu'].includes(requested)) {
    return { backend: 'webgl', reason: 'invalid-renderer-request' };
  }
  if (requested === 'webgl') return { backend: 'webgl', reason: 'user-selected-webgl' };
  if (sceneWebGPUReady !== true) return { backend: 'webgl', reason: 'scene-not-migrated' };
  if (webgpuAvailable !== true) return { backend: 'webgl', reason: 'webgpu-unavailable' };
  return { backend: 'webgpu', reason: requested === 'webgpu' ? 'user-selected-webgpu' : 'auto-webgpu' };
}

export function detectWebGPUAvailability(host = typeof navigator === 'undefined' ? undefined : navigator) {
  // Browser extensions and test hosts may expose throwing navigator.gpu getters.
  // Treat an unreadable adapter surface as unavailable rather than crashing SSR/boot.
  try {
    return Boolean(host?.gpu);
  } catch {
    return false;
  }
}
