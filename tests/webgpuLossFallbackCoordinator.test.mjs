import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinateWebGPUDeviceLoss } from '../src/lib/webgpuLossFallbackCoordinator.mjs';

function harness(classify = (info) => info?.reason === 'destroyed' ? { action: 'ignore' } : { action: 'fallback-webgl' }) {
  let emit;
  let stops = 0;
  const actions = [];
  const controller = coordinateWebGPUDeviceLoss({
    device: {},
    observe: (_device, callback) => { emit = callback; return { attached: true, stop: () => { stops++; } }; },
    classify,
    fallback: (action) => actions.push(action),
  });
  return { controller, actions, fire: (info) => emit({ reason: 'device-lost', info }), get stops() { return stops; } };
}

test('unexpected GPU loss triggers one WebGL fallback', () => {
  const h = harness();
  h.fire({ reason: 'unknown' });
  h.fire({ reason: 'unknown' });
  assert.equal(h.actions.length, 1);
  assert.equal(h.actions[0].decision.action, 'fallback-webgl');
});

test('actual nested GPU loss reason, not observer wrapper, is classified', () => {
  const h = harness();
  h.fire({ reason: 'destroyed' });
  assert.equal(h.actions.length, 0);
});

test('stopped scene ignores stale notifications and stops subscription', () => {
  const h = harness();
  assert.equal(h.controller.attached, true);
  h.controller.stop();
  h.fire({ reason: 'unknown' });
  assert.equal(h.actions.length, 0);
  assert.equal(h.stops, 1);
});

test('policy errors fail closed to WebGL', () => {
  const h = harness(() => { throw Error('bad policy'); });
  h.fire(null);
  assert.equal(h.actions[0].decision.action, 'fallback-webgl');
});

test('observer attachment failures fail closed without throwing', () => {
  const actions = [];
  const controller = coordinateWebGPUDeviceLoss({
    device: {},
    observe: () => { throw Error('observer failed'); },
    classify: () => ({ action: 'fallback-webgl' }),
    fallback: (action) => actions.push(action),
  });
  assert.equal(controller.attached, false);
  assert.equal(actions.length, 1);
});

test('reject missing dependencies', () => {
  assert.throws(() => coordinateWebGPUDeviceLoss({}), TypeError);
});
