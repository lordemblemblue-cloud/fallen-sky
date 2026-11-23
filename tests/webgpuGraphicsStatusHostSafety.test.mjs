import test from 'node:test';
import assert from 'node:assert/strict';
import { readGraphicsRuntimeStatus } from '../src/lib/graphicsRuntimeStatus.mjs';

const throwing = new Proxy({}, { get() { throw new Error('inaccessible host property'); } });
function gpuRenderer() {
  return {
    isWebGPURenderer: true,
    __sceneState: { ready: true, gameplayFrames: 2 },
    backend: { isWebGPUBackend: true, device: {
      createCommandEncoder() {}, queue: { submit() {} },
      adapterInfo: { vendor: 'Test Vendor', device: 'Test GPU' },
    } },
    info: { render: { frame: 3 } },
  };
}

for (const [scene, rendererKey, choiceKey] of [
  ['fallen-sky', '__gw3dRenderer', '__gw3dRendererChoice'],
  ['duelist-adventure', '__duelistGameRenderer', '__duelistGameRendererChoice'],
]) {
  test(`${scene}: inaccessible host properties fail closed`, () => {
    const status = readGraphicsRuntimeStatus(scene, throwing);
    assert.equal(status.webgpuActive, false);
    assert.equal(status.rendererPresent, false);
    assert.equal(status.backend, 'none');
  });

  test(`${scene}: revoked renderer proxy cannot claim GPU activity`, () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const status = readGraphicsRuntimeStatus(scene, { [rendererKey]: proxy });
    assert.equal(status.webgpuActive, false);
    assert.equal(status.rendererPresent, false);
    assert.equal(status.backend, 'none');
  });

  test(`${scene}: throwing adapter and selection getters preserve valid renderer evidence`, () => {
    const renderer = gpuRenderer();
    renderer.backend.device.adapterInfo = throwing;
    const status = readGraphicsRuntimeStatus(scene, {
      [rendererKey]: renderer, [choiceKey]: throwing,
    });
    assert.equal(status.webgpuActive, true);
    assert.equal(status.rendererPresent, true);
    assert.equal(status.adapterName, null);
    assert.equal(status.selectionReason, null);
  });

  test(`${scene}: hostile device accessor never creates false WebGPU proof`, () => {
    const renderer = gpuRenderer();
    Object.defineProperty(renderer.backend, 'device', { get() { throw new Error('device lost'); } });
    const status = readGraphicsRuntimeStatus(scene, { [rendererKey]: renderer });
    assert.equal(status.webgpuActive, false);
    assert.equal(status.rendererPresent, false);
  });
}

test('Fallen Sky: throwing classic WebGL renderer name does not hide backend status', () => {
  const status = readGraphicsRuntimeStatus('fallen-sky', {
    __gw3dRenderer: { info: { render: { frame: 2 } } },
    __gw3dGpuInfo: throwing,
  });
  assert.equal(status.backend, 'classic-webgl');
  assert.equal(status.rendererPresent, true);
  assert.equal(status.webglRendererName, null);
});
