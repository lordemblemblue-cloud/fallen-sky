import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleDrawSubmission, assessDrawSubmission } from '../src/lib/webgpuDrawSubmissionHealth.mjs';

const renderer = (frame, calls, triangles = 0) => ({ info: { render: { frame, calls, triangles } } });

test('captures post-render draw counters without retaining mutable renderer state', () => {
  const r = renderer(2, 0, 0);
  const sample = sampleDrawSubmission(r);
  r.info.render.calls = 4;
  assert.deepEqual(sample, { frame: 2, calls: 0, triangles: 0 });
  assert.equal(Object.isFrozen(sample), true);
});

test('flags advancing frames with zero draws in both samples for either game', () => {
  for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
    assert.deepEqual(assessDrawSubmission(sampleDrawSubmission(renderer(10, 0)),
      sampleDrawSubmission(renderer(11, 0))), { status: 'zero-draw-submissions', suspicious: true }, sceneId);
  }
});

test('does not call a single empty frame a sustained zero-draw condition', () => {
  assert.equal(assessDrawSubmission(sampleDrawSubmission(renderer(10, 5)),
    sampleDrawSubmission(renderer(11, 0))).status, 'draws-observed');
});

test('identifies a non-advancing frame counter separately', () => {
  assert.equal(assessDrawSubmission(sampleDrawSubmission(renderer(10, 0)),
    sampleDrawSubmission(renderer(10, 0))).status, 'frame-not-advancing');
});

test('rejects missing, negative, non-finite or reversed counters', () => {
  assert.equal(sampleDrawSubmission(renderer(1, -1)).calls, null);
  assert.equal(sampleDrawSubmission(renderer(Infinity, 0)).frame, null);
  assert.equal(assessDrawSubmission(sampleDrawSubmission(null), sampleDrawSubmission(renderer(2, 0))).status, 'insufficient-evidence');
  assert.equal(assessDrawSubmission(sampleDrawSubmission(renderer(5, 0)), sampleDrawSubmission(renderer(4, 0))).status, 'insufficient-evidence');
});

test('does not claim screen visibility or hardware WebGPU from draw calls', () => {
  const status = assessDrawSubmission(sampleDrawSubmission(renderer(1, 1)), sampleDrawSubmission(renderer(2, 3)));
  assert.deepEqual(status, { status: 'draws-observed', suspicious: false });
  assert.equal('webgpuActive' in status, false);
});
