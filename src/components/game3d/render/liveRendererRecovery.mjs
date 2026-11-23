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
