import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRendererBackend } from '../src/lib/rendererSelection.mjs';

for (const scene of ['fallen-sky', 'duelist-adventure']) {
  test(`${scene}: malformed readiness cannot silently opt into WebGPU`, () => {
    for (const value of ['true', 1, {}, [], new Boolean(true), null, undefined]) {
      assert.deepEqual(
        selectRendererBackend({ requested: 'auto', sceneWebGPUReady: value, webgpuAvailable: true }),
        { backend: 'webgl', reason: 'scene-not-migrated' },
      );
    }
  });

  test(`${scene}: malformed availability cannot silently opt into WebGPU`, () => {
    for (const value of ['true', 1, {}, [], new Boolean(true), null, undefined]) {
      assert.deepEqual(
        selectRendererBackend({ requested: 'webgpu', sceneWebGPUReady: true, webgpuAvailable: value }),
        { backend: 'webgl', reason: 'webgpu-unavailable' },
      );
    }
  });

  test(`${scene}: valid flags and explicit WebGL selection retain precedence`, () => {
    assert.deepEqual(
      selectRendererBackend({ requested: 'auto', sceneWebGPUReady: true, webgpuAvailable: true }),
      { backend: 'webgpu', reason: 'auto-webgpu' },
    );
    assert.deepEqual(
      selectRendererBackend({ requested: 'webgpu', sceneWebGPUReady: true, webgpuAvailable: true }),
      { backend: 'webgpu', reason: 'user-selected-webgpu' },
    );
    assert.deepEqual(
      selectRendererBackend({ requested: 'webgl', sceneWebGPUReady: true, webgpuAvailable: true }),
      { backend: 'webgl', reason: 'user-selected-webgl' },
    );
  });
}
