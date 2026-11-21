import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRendererBackend } from '../src/lib/rendererSelection.mjs';

// This lower-level selector may be reused by either live scene. Invalid requests
// must not accidentally enable WebGPU even when all other gates are satisfied.
for (const requested of [null, undefined, '', 'WEBGPU', 'webgl2', 'webgpu ', 0, 1, false, true, {}, [], ['webgpu']]) {
  test(`malformed renderer request ${String(requested)} fails closed`, () => {
    // undefined is intentionally omitted from the option bag: it is the
    // documented default ('auto'), not an invalid explicit request.
    const options = { webgpuAvailable: true, sceneWebGPUReady: true };
    if (requested !== undefined) options.requested = requested;
    const result = selectRendererBackend(options);
    if (requested === undefined) {
      assert.deepEqual(result, { backend: 'webgpu', reason: 'auto-webgpu' });
    } else {
      assert.deepEqual(result, { backend: 'webgl', reason: 'invalid-renderer-request' });
    }
  });
}

for (const requested of ['auto', 'webgpu']) {
  for (const [webgpuAvailable, sceneWebGPUReady, expectedReason] of [
    [false, false, 'scene-not-migrated'],
    [true, false, 'scene-not-migrated'],
    [false, true, 'webgpu-unavailable'],
  ]) {
    test(`${requested} requires both availability and readiness (${webgpuAvailable}/${sceneWebGPUReady})`, () => {
      assert.deepEqual(
        selectRendererBackend({ requested, webgpuAvailable, sceneWebGPUReady }),
        { backend: 'webgl', reason: expectedReason },
      );
    });
  }
}

test('explicit WebGL remains authoritative when both WebGPU gates pass', () => {
  assert.deepEqual(
    selectRendererBackend({ requested: 'webgl', webgpuAvailable: true, sceneWebGPUReady: true }),
    { backend: 'webgl', reason: 'user-selected-webgl' },
  );
});
