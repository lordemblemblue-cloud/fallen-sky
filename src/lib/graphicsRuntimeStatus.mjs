import { getWebGPURuntimeEvidence } from './webgpuRuntimeDiagnostics.mjs';

/** Read only the renderer that actually belongs to this game's live world/match.
 * A browser's supported GPU, a menu preview, or a saved preference is NOT proof
 * that an active game scene is rendering through WebGPU.
 */
export function readGraphicsRuntimeStatus(sceneId, host = typeof window === 'undefined' ? null : window) {
  const renderer = sceneId === 'fallen-sky' ? host?.__gw3dRenderer
    : sceneId === 'duelist-adventure' ? host?.__duelistGameRenderer
      : null;
  const evidence = getWebGPURuntimeEvidence(renderer, { sceneId });
  const choice = sceneId === 'fallen-sky' ? host?.__gw3dRendererChoice
    : sceneId === 'duelist-adventure' ? host?.__duelistGameRendererChoice : null;
  const info = evidence.backend === 'webgpu'
    ? renderer?.backend?.device?.adapterInfo
    : null;
  // Adapter info is provided at the browser's discretion; never infer it from
  // powerPreference, navigator.gpu, or the machine's other detected adapters.
  const adapterParts = info && [info.vendor, info.architecture, info.device, info.description]
    .filter(part => typeof part === 'string' && part.trim()).map(part => part.trim());
  const adapterName = adapterParts?.length ? [...new Set(adapterParts)].join(' ') : null;
  const webglName = evidence.backend === 'classic-webgl' && sceneId === 'fallen-sky'
    ? host?.__gw3dGpuInfo?.renderer : null;
  return {
    ...evidence,
    rendererPresent: Boolean(renderer),
    selectionReason: typeof choice?.reason === 'string' ? choice.reason : null,
    adapterName,
    webglRendererName: typeof webglName === 'string' && webglName.trim() ? webglName : null,
  };
}

export function humanGraphicsStatus(status) {
  if (!status?.rendererPresent) return 'No live gameplay renderer is running on this page.';
  if (status.deviceLost) return 'Graphics device lost. Reload the game to recover.';
  if (status.backend === 'classic-webgl') return 'Classic WebGL is active (not WebGPU).';
  if (status.backend === 'webgl2-fallback') return 'WebGL2 compatibility backend is active (not WebGPU).';
  if (status.backend === 'initializing') return 'Renderer is initializing; WebGPU has not been verified.';
  if (status.status === 'waiting-for-world-draws') return 'WebGPU initialized. Waiting for the game world to draw.';
  if (status.webgpuActive) return 'WebGPU is active. The live game world has issued draw calls.';
  return 'WebGPU has not yet been verified for this gameplay session.';
}
