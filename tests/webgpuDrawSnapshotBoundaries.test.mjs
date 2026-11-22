import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleDrawSubmission, assessDrawSubmission } from '../src/lib/webgpuDrawSubmissionHealth.mjs';

for (const scene of ['fallen-sky', 'duelist-adventure']) {
  test(`${scene}: post-render sample is an immutable value snapshot`, () => {
    const counters = { frame: 7, calls: 4, triangles: 12 };
    const sample = sampleDrawSubmission({ info: { render: counters } });
    counters.frame = 8;
    counters.calls = 0;
    assert.deepEqual(sample, { frame: 7, calls: 4, triangles: 12 });
    assert.equal(Object.isFrozen(sample), true);
  });

  test(`${scene}: missing renderer diagnostics never imply successful draws`, () => {
    const sample = sampleDrawSubmission(null);
    assert.deepEqual(sample, { frame: null, calls: null, triangles: null });
    assert.deepEqual(assessDrawSubmission(sample, sample), {
      status: 'insufficient-evidence', suspicious: false,
    });
  });

  test(`${scene}: reset frame counter does not imply black-world rendering`, () => {
    const previous = { frame: 150, calls: 0 };
    const current = { frame: 0, calls: 0 };
    assert.deepEqual(assessDrawSubmission(previous, current), {
      status: 'insufficient-evidence', suspicious: false,
    });
  });

  test(`${scene}: two advancing zero-draw frames are suspicious but not pixel proof`, () => {
    assert.deepEqual(assessDrawSubmission(
      { frame: 2, calls: 0 }, { frame: 3, calls: 0 },
    ), { status: 'zero-draw-submissions', suspicious: true });
  });
}
