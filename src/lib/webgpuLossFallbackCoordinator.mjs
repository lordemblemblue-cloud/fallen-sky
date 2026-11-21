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
      try {
        const result = fallback({ reason: 'device-loss', decision });
        // Hosts may restart their renderer asynchronously. Consume failures so
        // GPU loss cannot cause an unhandled rejection during teardown.
        Promise.resolve(result).catch(() => {});
      } catch {
        // Synchronous host failures are also contained.
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
