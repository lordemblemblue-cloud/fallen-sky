import test from 'node:test';
import assert from 'node:assert/strict';
import { observeWebGPUDeviceLoss } from '../src/lib/webgpuDeviceLossObserver.mjs';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

test('missing device or loss promise is inert', () => {
  const events = [];
  assert.equal(observeWebGPUDeviceLoss(undefined, (event) => events.push(event)).attached, false);
  assert.equal(observeWebGPUDeviceLoss({}, (event) => events.push(event)).attached, false);
  assert.deepEqual(events, []);
});

test('resolved device loss notifies once', async () => {
  let resolveLoss;
  const lost = new Promise((resolve) => { resolveLoss = resolve; });
  const events = [];
  const observer = observeWebGPUDeviceLoss({ lost }, (event) => events.push(event));
  assert.equal(observer.attached, true);
  resolveLoss({ reason: 'destroyed' });
  await flush();
  assert.deepEqual(events, [{ reason: 'device-lost', info: { reason: 'destroyed' } }]);
});

test('stop suppresses late device-loss callback', async () => {
  let resolveLoss;
  const lost = new Promise((resolve) => { resolveLoss = resolve; });
  const events = [];
  const observer = observeWebGPUDeviceLoss({ lost }, (event) => events.push(event));
  observer.stop();
  resolveLoss({ reason: 'unknown' });
  await flush();
  assert.deepEqual(events, []);
});

test('rejected loss promise reports failure without unhandled rejection', async () => {
  const events = [];
  observeWebGPUDeviceLoss({ lost: Promise.reject(new Error('device unavailable')) }, (event) => events.push(event));
  await flush();
  assert.deepEqual(events, [{ reason: 'device-loss-monitor-failed', info: null }]);
});

test('invalid callback is rejected synchronously', () => {
  assert.throws(() => observeWebGPUDeviceLoss({ lost: Promise.resolve() }, null), TypeError);
});

test('callback exceptions are contained', async () => {
  observeWebGPUDeviceLoss({ lost: Promise.resolve({ reason: 'destroyed' }) }, () => { throw new Error('consumer failure'); });
  await flush();
});
