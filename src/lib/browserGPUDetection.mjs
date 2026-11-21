/**
 * Browser-side, automatic GPU detection for both games.
 *
 * A remote application server cannot inspect the player's graphics hardware.
 * The browser is the authority for available WebGPU adapters, while the live
 * renderer diagnostics independently verify which backend the game is using.
 *
 * Detection is cached in memory for this tab; Recheck bypasses the cache.
 * No GPU data is uploaded or persisted.
 */
export function describeBrowserGPUAdapter(info) {
  if (!info || typeof info !== 'object') {
    return { name: null, vendor: null, device: null, architecture: null, description: null };
  }
  const clean = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
  const vendor = clean(info.vendor);
  const device = clean(info.device);
  const architecture = clean(info.architecture);
  const description = clean(info.description);
  const parts = [vendor, device, architecture, description].filter(Boolean);
  const name = parts.length ? [...new Set(parts)].join(' ') : null;
  return { name, vendor, device, architecture, description };
}

export function createBrowserGPUDetector() {
  let cached = null;
  let pending = null;
  return async function probeBrowserGPU(host = typeof window === 'undefined' ? null : window,
    { refresh = false } = {}) {
    if (!refresh && cached) return cached;
    if (!refresh && pending) return pending;

    const work = (async () => {
      const unknown = describeBrowserGPUAdapter(null);
      if (host?.isSecureContext === false) {
        return { status: 'insecure-context', ...unknown, software: false };
      }
      const gpu = host?.navigator?.gpu;
      if (!gpu || typeof gpu.requestAdapter !== 'function') {
        return { status: 'unsupported', ...unknown, software: false };
      }
      try {
        const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) return { status: 'unavailable', ...unknown, software: false };
        // Some browsers restrict adapter.info; it is advisory identity, not a
        // guarantee that this is the adapter driving the active game renderer.
        let details = unknown;
        try { details = describeBrowserGPUAdapter(adapter.info); } catch { /* privacy */ }
        const software = adapter.isFallbackAdapter === true;
        return { status: software ? 'software-fallback' : 'available', ...details, software };
      } catch {
        return { status: 'blocked', ...unknown, software: false };
      }
    })();

    pending = work;
    try {
      const result = await work;
      cached = result;
      return result;
    } finally {
      if (pending === work) pending = null;
    }
  };
}

/** One shared probe per browser tab; both game settings use its cached result. */
export const probeBrowserGPU = createBrowserGPUDetector();

export function browserGPUStatusMessage(info) {
  switch (info?.status) {
    case 'available':
      return info.name
        ? 'WebGPU adapter detected by this browser.'
        : 'WebGPU adapter detected, but your browser does not reveal its graphics card name.';
    case 'software-fallback':
      return 'The browser offered a software or fallback adapter; hardware WebGPU is not confirmed.';
    case 'insecure-context':
      return 'WebGPU requires a secure page (HTTPS or localhost).';
    case 'unsupported':
      return 'WebGPU is not exposed by this browser. Check graphics acceleration and browser support.';
    case 'unavailable':
      return 'This browser did not provide a WebGPU adapter. Check drivers, graphics acceleration and edge://gpu.';
    case 'blocked':
      return 'The browser could not complete GPU detection. Check edge://gpu and browser restrictions.';
    default:
      return 'Checking this browser for a WebGPU adapter…';
  }
}
