/**
 * Runtime evidence for a game scene's graphics backend.
 *
 * This is deliberately separate from scene readiness, browser API support and
 * user preference. Only a successfully initialized Three.js WebGPU backend
 * with a live GPUDevice and actual submitted frames can be called active.
 * Browser privacy rules do not guarantee a physical GPU model name.
 */
export function getWebGPURuntimeEvidence(renderer, { sceneId = null } = {}) {
  const state = renderer?.__sceneState;
  const webgpuRenderer = renderer?.isWebGPURenderer === true;
  const initialized = webgpuRenderer ? state?.ready === true : Boolean(renderer);
  const backend = webgpuRenderer
    ? (!initialized ? 'initializing' : renderer?.backend?.isWebGPUBackend === true ? 'webgpu' : 'webgl2-fallback')
    : renderer ? 'classic-webgl' : 'none';
  const device = backend === 'webgpu' ? renderer?.backend?.device : null;
  const deviceConfirmed = Boolean(device && typeof device.createCommandEncoder === 'function' && device.queue &&
    typeof device.queue.submit === 'function');
  // The render frame counter must be a trustworthy non-negative integer. Do not
  // coerce strings, booleans or fractional values into apparent GPU frame proof.
  const reportedFrames = renderer?.info?.render?.frame;
  const frameCount = Number.isSafeInteger(reportedFrames) && reportedFrames >= 0 ? reportedFrames : 0;
  const deviceLost = Boolean(state?.lost);
  // Only completed, counted gameplay draws can verify native WebGPU. A corrupt
  // counter (negative, fractional, infinite, string or accessor result) must not
  // turn an otherwise initialized renderer into a false positive.
  const reportedGameplayFrames = state?.gameplayFrames;
  const gameplayFrames = Number.isSafeInteger(reportedGameplayFrames) && reportedGameplayFrames > 0
    ? reportedGameplayFrames : 0;
  const active = backend === 'webgpu' && deviceConfirmed && !deviceLost && frameCount > 0 && gameplayFrames > 0;
  return Object.freeze({
    sceneId,
    backend,
    initialized,
    deviceConfirmed,
    frameCount,
    gameplayFrames,
    deviceLost,
    webgpuActive: active,
    status: deviceLost ? 'device-lost'
      : !initialized ? 'initializing'
      : backend !== 'webgpu' ? 'fallback'
      : !deviceConfirmed ? 'device-unconfirmed'
      : frameCount === 0 ? 'waiting-for-first-frame'
      : gameplayFrames === 0 ? 'waiting-for-world-draws'
      : 'verified',
  });
}

/** No truthful WebGPU claim can be based on navigator.gpu alone. */
export function formatWebGPURuntimeEvidence(evidence) {
  if (!evidence || evidence.status !== 'verified') {
    return 'WebGPU not verified (' + (evidence?.status || 'unknown') + '; ' +
      (evidence?.backend || 'none') + ')';
  }
  return 'WebGPU active: initialized GPUDevice and ' + evidence.gameplayFrames + ' world render(s) with draws';
}
