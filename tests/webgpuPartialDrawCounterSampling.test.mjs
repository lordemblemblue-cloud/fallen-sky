import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleDrawSubmission, assessDrawSubmission } from '../src/lib/webgpuDrawSubmissionHealth.mjs';

test('a throwing optional triangles getter does not discard valid frame and call counters', () => {
  for (const scene of ['fallen-sky', 'duelist-adventure']) {
    const render = { frame: 12, calls: 3 };
    Object.defineProperty(render, 'triangles', { get() { throw new Error(scene); } });
    const snapshot = sampleDrawSubmission({ info: { render } });
    assert.deepEqual(snapshot, { frame: 12, calls: 3, triangles: null });
    assert.equal(Object.isFrozen(snapshot), true);
    assert.deepEqual(assessDrawSubmission({ frame: 11, calls: 1 }, snapshot),
      { status: 'draws-observed', suspicious: false });
  }
});

test('a throwing calls getter retains other counters without asserting GPU activity', () => {
  const render = { frame: 22, triangles: 60 };
  Object.defineProperty(render, 'calls', { get() { throw Error('blocked'); } });
  const snapshot = sampleDrawSubmission({ info: { render } });
  assert.deepEqual(snapshot, { frame: 22, calls: null, triangles: 60 });
  assert.deepEqual(assessDrawSubmission({ frame: 21, calls: 1 }, snapshot),
    { status: 'insufficient-evidence', suspicious: false });
});

test('a throwing frame getter cannot imply progress even when draws are readable', () => {
  const render = { calls: 2, triangles: 6 };
  Object.defineProperty(render, 'frame', { get() { throw Error('blocked'); } });
  const snapshot = sampleDrawSubmission({ info: { render } });
  assert.deepEqual(snapshot, { frame: null, calls: 2, triangles: 6 });
  assert.deepEqual(assessDrawSubmission({ frame: 10, calls: 1 }, snapshot),
    { status: 'insufficient-evidence', suspicious: false });
});

test('inaccessible renderer info remains entirely unavailable', () => {
  const renderer = Object.defineProperty({}, 'info', { get() { throw Error('disposed'); } });
  assert.deepEqual(sampleDrawSubmission(renderer), { frame: null, calls: null, triangles: null });
});
