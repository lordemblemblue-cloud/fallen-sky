import test from 'node:test';
import assert from 'node:assert/strict';
import { observeGPUDeviceLoss } from '../src/lib/webgpuDeviceLoss.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('rejects missing GPUDevice lost promise', () => {
  assert.throws(() => observeGPUDeviceLoss({}, () => {}), TypeError);
});
test('rejects invalid callbacks', () => {
  assert.throws(() => observeGPUDeviceLoss({ lost: Promise.resolve({}) }, null), TypeError);
});
test('delivers normalized device loss exactly once', async () => {
  let resolveLoss;
  const lost = new Promise((resolve) => { resolveLoss = resolve; });
  const calls = [];
  observeGPUDeviceLoss({ lost }, (info) => calls.push(info));
  resolveLoss({ reason: 'destroyed', message: 'GPU reset' });
  await tick();
  assert.deepEqual(calls, [{ reason: 'destroyed', message: 'GPU reset' }]);
});
test('normalizes missing loss information', async () => {
  const calls = [];
  observeGPUDeviceLoss({ lost: Promise.resolve(null) }, (info) => calls.push(info));
  await tick();
  assert.deepEqual(calls, [{ reason: 'unknown', message: '' }]);
});
test('unsubscription prevents callbacks after teardown', async () => {
  const calls = [];
  const stop = observeGPUDeviceLoss({ lost: Promise.resolve({ reason: 'unknown' }) }, (info) => calls.push(info));
  stop();
  await tick();
  assert.deepEqual(calls, []);
});
test('rejected device promise goes to error callback', async () => {
  const errors = [];
  observeGPUDeviceLoss({ lost: Promise.reject(new Error('device failed')) }, () => {}, (error) => errors.push(error.message));
  await tick();
  assert.deepEqual(errors, ['device failed']);
});
test('callback errors are forwarded without unhandled rejections', async () => {
  const errors = [];
  observeGPUDeviceLoss({ lost: Promise.resolve({}) }, () => { throw new Error('handler failed'); }, (error) => errors.push(error.message));
  await tick();
  assert.deepEqual(errors, ['handler failed']);
});
