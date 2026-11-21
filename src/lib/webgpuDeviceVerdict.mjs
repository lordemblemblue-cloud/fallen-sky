/**
 * Is WebGPU at least as fast as the classic WebGL renderer on THIS device? WebGPU-ready scenes use it by default only
 * then (rendererBackendChoice.mjs). Pure: no DOM, no three.js; webgpuDeviceProbe.js measures and stores the verdict.
 *
 * Why per device: the same three.js node material can cost very different GPU time per browser + GPU. On the
 * development PC (Chrome, Windows, Radeon 780M) a lit material costs about twice the GPU time through WebGPU as the
 * classic GLSL version (and as the same node material through WebGL2), so the game is slower there; on other GPUs the
 * WebGPU path can be the faster one. A verdict is kept for this browser build (its user agent) for 30 days.
 */
export const DEVICE_VERDICT_KEY = 'fallen_sky_webgpu_verdict_v1';
export const VERDICT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// WebGPU counts as "at least as fast" up to 5% slower: below what one short measurement can tell apart.
export const VERDICT_TOLERANCE = 1.05;

/** { webgpuAtLeastAsFast, ratio, webglMs, webgpuMs } from the two renderers' mean frame times, or null. */
export function verdictFromTimings({ webglMs, webgpuMs, tolerance = VERDICT_TOLERANCE } = {}) {
  if (!(Number.isFinite(webglMs) && webglMs > 0) || !(Number.isFinite(webgpuMs) && webgpuMs > 0)) return null;
  const ratio = webgpuMs / webglMs;
  return {
    webgpuAtLeastAsFast: ratio <= tolerance,
    ratio: Math.round(ratio * 100) / 100,
    webglMs: Math.round(webglMs * 100) / 100,
    webgpuMs: Math.round(webgpuMs * 100) / 100,
  };
}

/** The stored verdict for this browser build, or null (none, unreadable, another browser build, or too old). */
export function readDeviceVerdict({ storage = null, fingerprint = '', now = Date.now() } = {}) {
  let parsed = null;
  try { parsed = JSON.parse(storage?.getItem?.(DEVICE_VERDICT_KEY) ?? 'null'); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.webgpuAtLeastAsFast !== 'boolean') return null;
  if (typeof fingerprint !== 'string' || parsed.fingerprint !== fingerprint) return null;
  const age = now - Number(parsed.measuredAt);
  if (!Number.isFinite(age) || age < -60_000 || age > VERDICT_MAX_AGE_MS) return null;
  return parsed;
}

/** Store a verdict (from verdictFromTimings) for this browser build; false when storage refuses. */
export function writeDeviceVerdict({ storage = null, fingerprint = '', verdict = null, now = Date.now() } = {}) {
  if (!verdict || typeof verdict.webgpuAtLeastAsFast !== 'boolean') return false;
  try {
    storage?.setItem?.(DEVICE_VERDICT_KEY, JSON.stringify({ ...verdict, fingerprint, measuredAt: now }));
    return !!storage?.setItem;
  } catch { return false; }
}
