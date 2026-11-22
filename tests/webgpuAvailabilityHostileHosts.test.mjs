import test from 'node:test';
import assert from 'node:assert/strict';
import { detectWebGPUAvailability, selectRendererBackend } from '../src/lib/rendererSelection.mjs';

// These tests cover browser/extension host objects that cannot be inspected safely.
// No browser or actual GPU adapter is needed to exercise this fail-closed boundary.
for (const scene of ['fallen-sky', 'duelist-adventure']) {
  test(`${scene}: a throwing navigator.gpu getter cannot crash renderer selection`, () => {
    const host = Object.defineProperty({}, 'gpu', {
      get() { throw new Error('navigator.gpu denied'); },
    });
    const available = detectWebGPUAvailability(host);
    assert.equal(available, false);
    assert.deepEqual(selectRendererBackend({
      requested: 'webgpu', sceneWebGPUReady: true, webgpuAvailable: available,
    }), { backend: 'webgl', reason: 'webgpu-unavailable' });
  });

  test(`${scene}: revoked navigator proxy fails closed`, () => {
    const { proxy, revoke } = Proxy.revocable({ gpu: {} }, {});
    revoke();
    assert.equal(detectWebGPUAvailability(proxy), false);
  });

  test(`${scene}: absent host and absent GPU property fail closed`, () => {
    assert.equal(detectWebGPUAvailability(null), false);
    assert.equal(detectWebGPUAvailability({}), false);
  });

  test(`${scene}: an exposed GPU surface permits capability gating, not proof of drawing`, () => {
    const available = detectWebGPUAvailability({ gpu: { requestAdapter() {} } });
    assert.equal(available, true);
    assert.equal(selectRendererBackend({
      requested: 'auto', sceneWebGPUReady: false, webgpuAvailable: available,
    }).backend, 'webgl');
  });
}
