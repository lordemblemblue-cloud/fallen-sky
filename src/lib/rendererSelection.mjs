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
  if (requested === 'webgl') return { backend: 'webgl', reason: 'user-selected-webgl' };
  if (!sceneWebGPUReady) return { backend: 'webgl', reason: 'scene-not-migrated' };
  if (!webgpuAvailable) return { backend: 'webgl', reason: 'webgpu-unavailable' };
  return { backend: 'webgpu', reason: requested === 'webgpu' ? 'user-selected-webgpu' : 'auto-webgpu' };
}

export function detectWebGPUAvailability(host = typeof navigator === 'undefined' ? undefined : navigator) {
  return Boolean(host?.gpu);
}
