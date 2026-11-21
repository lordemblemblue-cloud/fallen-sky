/**
 * Coordinates a single loss notification with a future renderer host.
 * Does not import draft observer/policy modules, touch a canvas, or enable WebGPU.
 * The host must inject its validated observer and classification policy.
 */
export function coordinateWebGPUDeviceLoss({ device, observe, classify, fallback }) {
  if (typeof observe !== 'function' || typeof classify !== 'function' || typeof fallback !== 'function') {
    throw new TypeError('observe, classify and fallback must be functions');
  }
  let active = true;
  let handled = false;
  const onLost = (event) => {
    if (!active || handled) return;
    handled = true;
    let decision;
    try {
      // The observer's event is { reason: 'device-lost', info: GPUDeviceLostInfo }.
      // Never classify the wrapper reason instead of the actual GPU loss reason.
      decision = classify(event?.info ?? null);
    } catch {
      decision = { action: 'fallback-webgl' };
    }
    if (decision?.action !== 'ignore') {
      try { fallback({ reason: 'device-loss', decision }); } catch {
        // A host callback must not create an unhandled promise rejection.
      }
    }
  };
  let subscription;
  try { subscription = observe(device, onLost); } catch {
    onLost({ info: null });
  }
  return Object.freeze({
    get attached() { return subscription?.attached === true; },
    stop() {
      active = false;
      try { subscription?.stop?.(); } catch { /* teardown is best effort */ }
    },
  });
}
