/**
 * Probe actual WebGPU adapter availability without constructing a renderer.
 * navigator.gpu existing does not guarantee a usable adapter (for example,
 * browser blocklists or unavailable GPU devices).
 *
 * This check is advisory: renderer initialization can still fail afterward.
 * Call only in the browser; injecting gpu allows deterministic Node tests.
 */
export async function probeWebGPUAdapter({
  gpu = typeof navigator === 'undefined' ? undefined : navigator.gpu,
  powerPreference = 'high-performance',
} = {}) {
  if (!gpu || typeof gpu.requestAdapter !== 'function') {
    return { available: false, reason: 'webgpu-unavailable' };
  }

  try {
    const adapter = await gpu.requestAdapter({ powerPreference });
    if (!adapter) return { available: false, reason: 'webgpu-no-adapter' };
    return { available: true, reason: null };
  } catch {
    return { available: false, reason: 'webgpu-adapter-failed' };
  }
}
