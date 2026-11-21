import test from 'node:test';
import assert from 'node:assert/strict';
import { detectWebGPUAvailability, selectRendererBackend } from '../src/lib/rendererSelection.mjs';

test('missing and null browser hosts are unavailable', () => {
  assert.equal(detectWebGPUAvailability(undefined), false);
  assert.equal(detectWebGPUAvailability(null), false);
  assert.equal(detectWebGPUAvailability({}), false);
});

test('throwing navigator.gpu getter fails closed instead of crashing startup', () => {
  const host = Object.defineProperty({}, 'gpu', {
    get() { throw new Error('blocked by browser policy'); },
  });
  assert.equal(detectWebGPUAvailability(host), false);
});

test('available GPU object is recognized and unavailable host keeps WebGL fallback', () => {
  assert.equal(detectWebGPUAvailability({ gpu: {} }), true);
  const host = Object.defineProperty({}, 'gpu', {
    get() { throw new Error('GPU unavailable'); },
  });
  const decision = selectRendererBackend({
    requested: 'webgpu',
    sceneWebGPUReady: true,
    webgpuAvailable: detectWebGPUAvailability(host),
  });
  assert.equal(decision.backend, 'webgl');
  assert.equal(decision.reason, 'webgpu-unavailable');
});
