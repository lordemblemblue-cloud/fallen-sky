/**
 * Observe a GPUDevice's one-shot loss promise without assuming any Three.js
 * renderer internals. Call this after obtaining a real GPUDevice.
 *
 * Device loss is terminal for that device; the scene owner must stop its
 * animation loop, release resources, and create a fresh renderer/canvas.
 * This helper does not attempt to restart rendering on its own.
 */
export function observeGPUDeviceLoss(device, onLost, onError = () => {}) {
  if (!device || !device.lost || typeof device.lost.then !== 'function') {
    throw new TypeError('Expected a GPUDevice with a lost promise');
  }
  if (typeof onLost !== 'function' || typeof onError !== 'function') {
    throw new TypeError('Device loss callbacks must be functions');
  }

  let active = true;
  // The GPUDevice.lost promise cannot be cancelled; suppress stale callbacks
  // after scene teardown or replacement.
  Promise.resolve(device.lost).then(
    (info) => {
      if (active) onLost({
        reason: typeof info?.reason === 'string' ? info.reason : 'unknown',
        message: typeof info?.message === 'string' ? info.message : '',
      });
    },
    (error) => {
      if (active) onError(error);
    },
  ).catch((error) => {
    // Prevent an unhandled rejection when a consumer callback throws.
    // Route callback failures to the supplied error handler.
    if (active) {
      try { onError(error); } catch { /* callback owner handles its own errors */ }
    }
  });

  return () => { active = false; };
}
