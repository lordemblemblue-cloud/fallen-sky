// Count visible, unpaused rendering time. Startup, background tabs and shader warmup
// can legitimately produce no geometry. Only consecutive, trustworthy empty-world
// observations count: missing or malformed GPU diagnostics are not proof of zero draws.
export function createWorldDrawWatchdog() {
  let last = null;
  let emptySeconds = 0;
  const reset = () => {
    last = null;
    emptySeconds = 0;
  };
  return function check(now, eligible, worldDraws) {
    // An unavailable/invalid counter (for example NaN during device loss)
    // must not trigger a false WebGL fallback or poison the elapsed-time clock.
    if (eligible !== true || !Number.isFinite(now) || now < 0
      || !Number.isSafeInteger(worldDraws) || worldDraws < 0 || worldDraws > 0) {
      reset();
      return false;
    }
    // Monotonic browser time may reset when a document or device restarts.
    if (last !== null && now < last) reset();
    if (last !== null) emptySeconds += Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    return emptySeconds >= 8;
  };
}

// After a lost WebGPU device the world remounts on the classic WebGL renderer (GameWorld3D's recoveryReason), and
// WebGL can fail to start in that tab while the browser's GPU process is still restarting: a hung or removed GPU
// (DXGI_ERROR_DEVICE_HUNG), or "A valid external Instance reference no longer exists". A failed start is tried again
// after a growing wait; then the page is reloaded once (the WebGL choice is kept for the tab, and the world flushed its
// checkpoint when it unmounted); then the world reports it is unavailable. The reload is allowed once per
// WEBGL_RECOVERY_RELOAD_GUARD_MS in a tab, and never when session storage is blocked, so it cannot loop.
export const WEBGL_RECOVERY_RETRY_MS = Object.freeze([600, 1200, 2500, 5000]);
export const WEBGL_RECOVERY_RELOAD_KEY = 'fallen_sky_gpu_recovery_reload_v1';
export const WEBGL_RECOVERY_RELOAD_GUARD_MS = 5 * 60 * 1000;

/** What to do after WebGL failed to start for the `attempt`-th time (0: the first try) while recovering. */
export function nextWebGLRecoveryStep({ attempt = 0, storage = null, now = Date.now(),
  retryMs = WEBGL_RECOVERY_RETRY_MS } = {}) {
  const tried = Number.isSafeInteger(attempt) && attempt >= 0 ? attempt : 0;
  if (tried < retryMs.length) return { action: 'retry', delayMs: retryMs[tried], attempt: tried + 1 };
  let last = 0;
  try { last = Number(storage?.getItem?.(WEBGL_RECOVERY_RELOAD_KEY)) || 0; } catch { return { action: 'give-up' }; }
  if (last > 0 && now >= last && now - last < WEBGL_RECOVERY_RELOAD_GUARD_MS) return { action: 'give-up' };
  try { storage.setItem(WEBGL_RECOVERY_RELOAD_KEY, String(now)); } catch { return { action: 'give-up' }; }
  return { action: 'reload' };
}

/** The recovery reason carries the attempt: 'webgpu-device-lost', then 'webgpu-device-lost#1', '#2' ... */
export function recoveryAttemptOf(reason) {
  const match = /#(\d+)$/.exec(String(reason || ''));
  return match ? Number(match[1]) : 0;
}
export function withRecoveryAttempt(reason, attempt) {
  return `${String(reason || 'webgl-recovery').replace(/#\d+$/, '')}#${attempt}`;
}
