import { selectRendererBackend } from './rendererSelection.mjs';
import { getSceneWebGPUBlocker, isSceneWebGPUReady } from './webgpuSceneReadiness.mjs';

/**
 * Resolve a scene ID against the audited inventory before selecting a renderer.
 * Never accept caller-provided readiness flags: only the inventory can opt in.
 * An automatic choice ('auto') also needs this device's verdict that WebGPU is at least as fast
 * (webgpuDeviceVerdict.mjs), as in rendererBackendChoice.mjs; an explicit 'webgpu' request does not.
 * This is a pure decision helper, not a live renderer switch.
 */
export function selectSceneRendererBackend({
  sceneId,
  webgpuAvailable = false,
  requested = 'auto',
  deviceVerdict = null,
} = {}) {
  const sceneWebGPUReady = isSceneWebGPUReady(sceneId);
  const decision = selectRendererBackend({
    webgpuAvailable: webgpuAvailable === true,
    sceneWebGPUReady,
    requested,
  });
  const result = {
    ...decision,
    sceneId: typeof sceneId === 'string' ? sceneId : null,
    blocker: sceneWebGPUReady ? null : getSceneWebGPUBlocker(sceneId),
  };
  if (decision.backend === 'webgpu' && requested === 'auto' && deviceVerdict?.webgpuAtLeastAsFast !== true) {
    return { ...result, backend: 'webgl', reason: deviceVerdict ? 'webgpu-slower-on-this-device' : 'device-not-measured' };
  }
  return result;
}
