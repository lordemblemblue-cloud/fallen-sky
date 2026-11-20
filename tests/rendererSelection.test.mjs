import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRendererBackend, detectWebGPUAvailability } from '../src/lib/rendererSelection.mjs';

test('unmigrated scenes always retain WebGL', () => {
  assert.deepEqual(selectRendererBackend({ webgpuAvailable: true, sceneWebGPUReady: false }), {
    backend: 'webgl', reason: 'scene-not-migrated',
  });
});
test('explicit WebGL choice wins over WebGPU support', () => {
  assert.equal(selectRendererBackend({ requested: 'webgl', webgpuAvailable: true, sceneWebGPUReady: true }).backend, 'webgl');
});
test('migrated scenes fall back when WebGPU is missing', () => {
  assert.equal(selectRendererBackend({ requested: 'webgpu', sceneWebGPUReady: true }).backend, 'webgl');
});
test('migrated scenes can use WebGPU', () => {
  assert.equal(selectRendererBackend({ requested: 'auto', webgpuAvailable: true, sceneWebGPUReady: true }).backend, 'webgpu');
});
test('availability check supports server-side rendering', () => {
  assert.equal(detectWebGPUAvailability(undefined), false);
  assert.equal(detectWebGPUAvailability({ gpu: {} }), true);
});
