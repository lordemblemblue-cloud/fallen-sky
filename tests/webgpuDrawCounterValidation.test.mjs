import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDrawSubmission } from '../src/lib/webgpuDrawSubmissionHealth.mjs';

const insufficient = { status: 'insufficient-evidence', suspicious: false };
const sample = (frame, calls) => ({ frame, calls, triangles: 0 });

test('invalid frame counters cannot imply a stalled or active renderer', () => {
  for (const bad of [-1, NaN, Infinity, '10', undefined]) {
    assert.deepEqual(assessDrawSubmission(sample(bad, 1), sample(11, 1)), insufficient);
    assert.deepEqual(assessDrawSubmission(sample(10, 1), sample(bad, 1)), insufficient);
  }
});

test('invalid draw counters cannot imply active GPU submissions', () => {
  for (const bad of [-1, NaN, Infinity, '1', undefined]) {
    assert.deepEqual(assessDrawSubmission(sample(10, bad), sample(11, 0)), insufficient);
    assert.deepEqual(assessDrawSubmission(sample(10, 0), sample(11, bad)), insufficient);
  }
});

test('hostile diagnostic snapshots cannot crash either game', () => {
  for (const scene of ['fallen-sky', 'duelist-adventure']) {
    const hostile = Object.defineProperty({}, 'frame', { get() { throw Error(scene); } });
    assert.deepEqual(assessDrawSubmission(hostile, sample(11, 1)), insufficient);
    const { proxy, revoke } = Proxy.revocable(sample(10, 1), {});
    revoke();
    assert.deepEqual(assessDrawSubmission(proxy, sample(11, 1)), insufficient);
  }
});

test('valid zero-draw, stalled, and advancing frame semantics are preserved', () => {
  assert.deepEqual(assessDrawSubmission(sample(10, 0), sample(11, 0)),
    { status: 'zero-draw-submissions', suspicious: true });
  assert.deepEqual(assessDrawSubmission(sample(10, 2), sample(10, 2)),
    { status: 'frame-not-advancing', suspicious: true });
  assert.deepEqual(assessDrawSubmission(sample(10, 2), sample(11, 1)),
    { status: 'draws-observed', suspicious: false });
});
