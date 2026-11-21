import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleDrawSubmission, assessDrawSubmission } from '../src/lib/webgpuDrawSubmissionHealth.mjs';

const throws = () => { throw new Error('renderer context lost'); };
const empty = { frame: null, calls: null, triangles: null };

test('diagnostic sampling survives inaccessible renderer info on either scene', () => {
  for (const scene of ['fallen-sky', 'duelist-adventure']) {
    const renderer = Object.defineProperty({}, 'info', { get: throws });
    assert.deepEqual(sampleDrawSubmission(renderer), empty, scene);
  }
});

test('diagnostic sampling survives inaccessible render and counter getters', () => {
  assert.deepEqual(sampleDrawSubmission({ info: Object.defineProperty({}, 'render', { get: throws }) }), empty);
  const render = Object.defineProperty({ frame: 12, calls: 1 }, 'triangles', { get: throws });
  assert.deepEqual(sampleDrawSubmission({ info: { render } }), empty);
});

test('diagnostic sampling survives revoked renderer proxy', () => {
  const { proxy, revoke } = Proxy.revocable({ info: { render: { frame: 1, calls: 2 } } }, {});
  revoke();
  assert.deepEqual(sampleDrawSubmission(proxy), empty);
});

test('inaccessible counters never become evidence of a black world or GPU success', () => {
  const good = sampleDrawSubmission({ info: { render: { frame: 10, calls: 2, triangles: 4 } } });
  assert.deepEqual(assessDrawSubmission(good, sampleDrawSubmission(Object.defineProperty({}, 'info', { get: throws }))),
    { status: 'insufficient-evidence', suspicious: false });
});
