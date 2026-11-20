/**
 * Renderer-neutral frame-time summaries for comparing WebGL and WebGPU.
 * Callers provide timestamps or durations from identical scenes and devices.
 * No browser globals, telemetry, or renderer-specific APIs are used.
 */
export function summarizeFrameTimes(frameTimesMs, { warmupFrames = 0 } = {}) {
  if (!Array.isArray(frameTimesMs)) throw new TypeError('frameTimesMs must be an array');
  if (!Number.isInteger(warmupFrames) || warmupFrames < 0) {
    throw new RangeError('warmupFrames must be a nonnegative integer');
  }
  const samples = frameTimesMs.slice(warmupFrames);
  if (samples.some((ms) => typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0)) {
    throw new RangeError('frame times must be finite positive milliseconds');
  }
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((total, ms) => total + ms, 0);
  const meanFrameMs = sum / samples.length;
  const percentile = (p) => sorted[Math.ceil(p * sorted.length) - 1];
  // Slowest 1% frames, averaged as frame rates. This is an explicit
  // time-weighted low-FPS metric, not an average of instantaneous FPS.
  const slowCount = Math.max(1, Math.ceil(samples.length * 0.01));
  const slowest = sorted.slice(-slowCount);
  const slowMeanMs = slowest.reduce((total, ms) => total + ms, 0) / slowCount;
  return {
    sampleCount: samples.length,
    meanFrameMs,
    averageFps: 1000 / meanFrameMs,
    onePercentLowFps: 1000 / slowMeanMs,
    p95FrameMs: percentile(0.95),
    p99FrameMs: percentile(0.99),
    maxFrameMs: sorted[sorted.length - 1],
  };
}

/** Convert consecutive animation-frame timestamps to frame durations. */
export function frameTimesFromTimestamps(timestampsMs) {
  if (!Array.isArray(timestampsMs)) throw new TypeError('timestampsMs must be an array');
  const durations = [];
  for (let i = 1; i < timestampsMs.length; i += 1) {
    const before = timestampsMs[i - 1];
    const after = timestampsMs[i];
    if (!Number.isFinite(before) || !Number.isFinite(after) || after <= before) {
      throw new RangeError('timestamps must be finite and strictly increasing');
    }
    durations.push(after - before);
  }
  if (timestampsMs.length === 1 && !Number.isFinite(timestampsMs[0])) {
    throw new RangeError('timestamps must be finite');
  }
  return durations;
}
