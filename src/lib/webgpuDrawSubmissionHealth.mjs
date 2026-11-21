/**
 * Diagnostic-only draw submission health for the black-world regression.
 * Three.js render.info counters are not proof that pixels reached the screen.
 * Capture immediately after a render call, before any info.reset().
 */
export function sampleDrawSubmission(renderer) {
  // A renderer may be disposed or wrapped by a browser/diagnostics Proxy.
  // Diagnostics must never turn a recoverable renderer failure into a crash.
  const read = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  try {
    const render = renderer?.info?.render;
    return Object.freeze({
      frame: read(render?.frame),
      calls: read(render?.calls),
      triangles: read(render?.triangles),
    });
  } catch {
    return Object.freeze({ frame: null, calls: null, triangles: null });
  }
}

/**
 * Compare post-render samples from the same renderer. A non-increasing frame
 * counter indicates a stalled loop; zero draw calls across two progressing
 * frames indicates an empty submission, not necessarily a black screen.
 */
export function assessDrawSubmission(previous, current) {
  // Reject fabricated or corrupt counters rather than reporting GPU activity.
  const valid = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  try {
    if (!previous || !current || !valid(previous.frame) || !valid(current.frame) ||
        current.frame < previous.frame) {
      return Object.freeze({ status: 'insufficient-evidence', suspicious: false });
    }
    if (current.frame === previous.frame) {
      return Object.freeze({ status: 'frame-not-advancing', suspicious: true });
    }
    if (!valid(previous.calls) || !valid(current.calls)) {
      return Object.freeze({ status: 'insufficient-evidence', suspicious: false });
    }
    if (previous.calls === 0 && current.calls === 0) {
      return Object.freeze({ status: 'zero-draw-submissions', suspicious: true });
    }
    return Object.freeze({ status: 'draws-observed', suspicious: false });
  } catch {
    return Object.freeze({ status: 'insufficient-evidence', suspicious: false });
  }
}
