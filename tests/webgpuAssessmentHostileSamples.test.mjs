import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDrawSubmission } from '../src/lib/webgpuDrawSubmissionHealth.mjs';

for (const scene of ['fallen-sky', 'duelist-adventure']) {
  test(`${scene}: throwing previous frame getter fails closed`, () => {
    const previous = { get frame() { throw new Error('disposed'); }, calls: 0 };
    assert.deepEqual(assessDrawSubmission(previous, { frame: 2, calls: 0 }), {
      status: 'insufficient-evidence', suspicious: false,
    });
  });

  test(`${scene}: revoked current sample fails closed`, () => {
    const { proxy, revoke } = Proxy.revocable({ frame: 2, calls: 0 }, {});
    revoke();
    assert.deepEqual(assessDrawSubmission({ frame: 1, calls: 0 }, proxy), {
      status: 'insufficient-evidence', suspicious: false,
    });
  });

  test(`${scene}: inaccessible calls getter fails closed after advancing frame`, () => {
    const current = { frame: 2, get calls() { throw new Error('unavailable'); } };
    assert.deepEqual(assessDrawSubmission({ frame: 1, calls: 0 }, current), {
      status: 'insufficient-evidence', suspicious: false,
    });
  });

  test(`${scene}: valid frozen zero-draw samples remain suspicious`, () => {
    assert.deepEqual(assessDrawSubmission(
      Object.freeze({ frame: 1, calls: 0 }),
      Object.freeze({ frame: 2, calls: 0 }),
    ), { status: 'zero-draw-submissions', suspicious: true });
  });
}
