import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWebGPUDeviceLoss } from '../src/lib/webgpuDeviceLossPolicy.mjs';

test('explicit destruction does not initiate fallback or restart', () => {
  assert.deepEqual(classifyWebGPUDeviceLoss({ reason: 'destroyed' }), { reason: 'destroyed', retry: false, action: 'ignore' });
});
test('unknown and transient device loss fail closed to WebGL', () => {
  for (const info of [undefined, null, {}, { reason: 'unknown' }, { reason: 'out-of-memory' }, { reason: 'other' }, { reason: 42 }]) {
    const decision = classifyWebGPUDeviceLoss(info);
    assert.equal(decision.retry, false);
    assert.equal(decision.action, 'fallback-webgl');
    assert.equal(Object.isFrozen(decision), true);
  }
});
test('untrusted reason values cannot authorize recovery', () => {
  for (const info of ['destroyed', { reason: 'recovered', retry: true }, { reason: '' }]) {
    assert.equal(classifyWebGPUDeviceLoss(info).retry, false);
  }
});
