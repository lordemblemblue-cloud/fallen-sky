import { selectRendererBackend } from './rendererSelection.mjs';
import { getSceneWebGPUBlocker, isSceneWebGPUReady } from './webgpuSceneReadiness.mjs';

/**
 * Resolve a scene ID against the audited inventory before selecting a renderer.
 * Never accept caller-provided readiness flags: only the inventory can opt in.
 * An automatic choice ('auto') runs a ready scene on WebGPU wherever WebGPU is available, as in
 * rendererBackendChoice.mjs (no speed test since 2026-11-21).
 * This is a pure decision helper, not a live renderer switch.
 */
export function selectSceneRendererBackend({
  sceneId,
  webgpuAvailable = false,
  requested = 'auto',
} = {}) {
  const sceneWebGPUReady = isSceneWebGPUReady(sceneId);
  const decision = selectRendererBackend({
    webgpuAvailable: webgpuAvailable === true,
    sceneWebGPUReady,
    requested,
  });
  return {
    ...decision,
    sceneId: typeof sceneId === 'string' ? sceneId : null,
    blocker: sceneWebGPUReady ? null : getSceneWebGPUBlocker(sceneId),
  };
}
