// Count visible, unpaused rendering time. Startup, background tabs and shader warmup
// can legitimately produce no geometry. Only consecutive empty world attempts count.
export function createWorldDrawWatchdog() {
  let last = null;
  let emptySeconds = 0;
  return function check(now, eligible, worldDraws) {
    if (!eligible || worldDraws > 0) {
      last = null;
      emptySeconds = 0;
      return false;
    }
    if (last !== null) emptySeconds += Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    return emptySeconds >= 8;
  };
}
