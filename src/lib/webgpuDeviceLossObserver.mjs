/**
 * Observe GPUDevice.lost without tying scene cleanup to a particular renderer.
 * This is advisory infrastructure: it does not recreate a device or enable WebGPU.
 * Stop the observer when a scene unmounts so stale device loss cannot affect it.
 */
export function observeWebGPUDeviceLoss(device, onLost) {
  if (typeof onLost !== 'function') {
    throw new TypeError('onLost must be a function');
  }

  let active = true;
  let notified = false;
  const stop = () => { active = false; };

  // Accessing a host object property may throw; treat that as a failed probe.
  let lost;
  try {
    lost = device?.lost;
  } catch {
    return { attached: false, stop };
  }
  if (!lost || typeof lost.then !== 'function') {
    return { attached: false, stop };
  }

  // Promise.resolve assimilates foreign thenables and handles rejection.
  Promise.resolve(lost).then(
    (info) => {
      if (!active || notified) return;
      notified = true;
      try {
        onLost({ reason: 'device-lost', info });
      } catch {
        // A consumer exception must not become an unhandled rejection.
      }
    },
    () => {
      if (!active || notified) return;
      notified = true;
      try {
        onLost({ reason: 'device-loss-monitor-failed', info: null });
      } catch {
        // A consumer exception must not become an unhandled rejection.
      }
    },
  );
  return { attached: true, stop };
}
