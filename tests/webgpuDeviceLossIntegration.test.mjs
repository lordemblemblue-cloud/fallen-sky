import test from 'node:test';
import assert from 'node:assert/strict';
import { observeWebGPUDeviceLoss } from '../src/lib/webgpuDeviceLossObserver.mjs';
import { classifyWebGPUDeviceLoss } from '../src/lib/webgpuDeviceLossPolicy.mjs';
import { coordinateWebGPUDeviceLoss } from '../src/lib/webgpuLossFallbackCoordinator.mjs';

// Exercise the real merged modules together, not substituted callbacks.
// A microtask drain is sufficient for Promise.resolve(lost).then handlers.
const drain = async () => { await new Promise((resolve) => setImmediate(resolve)); };

function setup(device) {
  const fallbacks = [];
  const controller = coordinateWebGPUDeviceLoss({
    device,
    observe: observeWebGPUDeviceLoss,
    classify: classifyWebGPUDeviceLoss,
    fallback: (event) => { fallbacks.push(event); },
  });
  return { controller, fallbacks };
}

test('unexpected device loss reaches WebGL fallback through all three modules', async () => {
  let resolveLoss;
  const lost = new Promise((resolve) => { resolveLoss = resolve; });
  const { controller, fallbacks } = setup({ lost });
  assert.equal(controller.attached, true);
  resolveLoss({ reason: 'unknown', message: 'adapter reset' });
  await drain();
  assert.equal(fallbacks.length, 1);
  assert.equal(fallbacks[0].reason, 'device-loss');
  assert.deepEqual(fallbacks[0].decision, {
    reason: 'unknown', retry: false, action: 'fallback-webgl',
  });
  controller.stop();
});

test('intentional destruction does not trigger a fallback', async () => {
  const { controller, fallbacks } = setup({ lost: Promise.resolve({ reason: 'destroyed' }) });
  await drain();
  assert.equal(controller.attached, true);
  assert.deepEqual(fallbacks, []);
  controller.stop();
});

test('teardown before device loss suppresses a stale fallback', async () => {
  let resolveLoss;
  const lost = new Promise((resolve) => { resolveLoss = resolve; });
  const { controller, fallbacks } = setup({ lost });
  controller.stop();
  resolveLoss({ reason: 'unknown' });
  await drain();
  assert.deepEqual(fallbacks, []);
});

test('loss-monitor rejection conservatively falls back to WebGL', async () => {
  const { controller, fallbacks } = setup({ lost: Promise.reject(new Error('monitor failed')) });
  await drain();
  assert.equal(fallbacks.length, 1);
  assert.equal(fallbacks[0].decision.action, 'fallback-webgl');
  assert.equal(fallbacks[0].decision.retry, false);
  controller.stop();
});

test('missing loss promise triggers immediate fail-closed fallback', () => {
  const { controller, fallbacks } = setup({});
  assert.equal(controller.attached, false);
  assert.equal(fallbacks.length, 1);
  assert.equal(fallbacks[0].decision.action, 'fallback-webgl');
  controller.stop();
});
