/**
 * Pure, diagnostic-only zero-draw streak tracker. It does not infer visible pixels
 * or choose a renderer. Call only with consecutive post-render samples from the
 * same scene and renderer instance; reset on scene switch or renderer replacement.
 */
export function advanceZeroDrawStreak(previousState, previousSample, currentSample, { sceneId, rendererId, threshold = 3 } = {}) {
  const empty = Object.freeze({ sceneId: sceneId ?? null, rendererId: rendererId ?? null, consecutive: 0, alert: false });
  const valid = (n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (typeof sceneId !== 'string' || !sceneId || typeof rendererId !== 'string' || !rendererId ||
      !Number.isSafeInteger(threshold) || threshold < 2) return empty;
  try {
    const same = previousState?.sceneId === sceneId && previousState?.rendererId === rendererId;
    if (!same || !valid(previousSample?.frame) || !valid(currentSample?.frame) ||
        !valid(previousSample?.calls) || !valid(currentSample?.calls) ||
        currentSample.frame <= previousSample.frame || previousSample.calls !== 0 || currentSample.calls !== 0) {
      return empty;
    }
    const prior = valid(previousState.consecutive) ? previousState.consecutive : 0;
    const consecutive = Math.min(Number.MAX_SAFE_INTEGER, prior + 1);
    return Object.freeze({ sceneId, rendererId, consecutive, alert: consecutive >= threshold });
  } catch {
    return empty;
  }
}
