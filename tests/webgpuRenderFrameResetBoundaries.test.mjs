import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleDrawSubmission, assessDrawSubmission } from '../src/lib/webgpuDrawSubmissionHealth.mjs';

// Three.js render.info counters are sampled after render and may reset on
// renderer recreation or explicit info.reset(). Never infer screen visibility.
const renderer = (frame, calls, triangles = 0) => ({
  info: { render: { frame, calls, triangles } },
});

for (const scene of ['fallen-sky', 'duelist-adventure']) {
  test(`${scene}: a counter reset is not evidence of a zero-draw black world`, () => {
    const beforeReset = sampleDrawSubmission(renderer(250, 0));
    const afterReset = sampleDrawSubmission(renderer(0, 0));
    assert.deepEqual(assessDrawSubmission(beforeReset, afterReset),
      { status: 'insufficient-evidence', suspicious: false });
    // Fresh samples after the reset can be assessed normally.
    assert.deepEqual(assessDrawSubmission(afterReset, sampleDrawSubmission(renderer(1, 0))),
      { status: 'zero-draw-submissions', suspicious: true });
  });

  test(`${scene}: one frame with geometry interrupts zero-draw classification`, () => {
    const first = sampleDrawSubmission(renderer(10, 0));
    const drawn = sampleDrawSubmission(renderer(11, 4, 8));
    const empty = sampleDrawSubmission(renderer(12, 0));
    assert.deepEqual(assessDrawSubmission(first, drawn),
      { status: 'draws-observed', suspicious: false });
    assert.deepEqual(assessDrawSubmission(drawn, empty),
      { status: 'draws-observed', suspicious: false });
  });
}

test('snapshot is immutable and independent of subsequent info.reset mutations', () => {
  const live = renderer(17, 3, 9);
  const captured = sampleDrawSubmission(live);
  live.info.render.frame = 0;
  live.info.render.calls = 0;
  live.info.render.triangles = 0;
  assert.deepEqual(captured, { frame: 17, calls: 3, triangles: 9 });
  assert.ok(Object.isFrozen(captured));
});

test('missing renderer after disposal is insufficient evidence, not a draw failure', () => {
  const before = sampleDrawSubmission(renderer(19, 0));
  const disposed = sampleDrawSubmission(undefined);
  assert.deepEqual(assessDrawSubmission(before, disposed),
    { status: 'insufficient-evidence', suspicious: false });
});
