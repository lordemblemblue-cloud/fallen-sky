/** Pure policy for deciding whether a lost WebGPU device may be retried. No renderer side effects. */
export function classifyWebGPUDeviceLoss(info) {
  const reason = info && typeof info === 'object' && typeof info.reason === 'string' ? info.reason : 'unknown';
  // Explicit destruction is expected during teardown and must not trigger a restart.
  if (reason === 'destroyed') return Object.freeze({ reason, retry: false, action: 'ignore' });
  // A device can be lost for transient reasons; require a new adapter/device and
  // an independently validated scene gate before attempting any WebGPU recovery.
  return Object.freeze({ reason, retry: false, action: 'fallback-webgl' });
}
