import test from 'node:test';
import assert from 'node:assert/strict';
import { WEBGPU_SCENES, isSceneWebGPUReady, getSceneWebGPUBlocker } from '../src/lib/webgpuSceneReadiness.mjs';
import { selectRendererBackend } from '../src/lib/rendererSelection.mjs';

test('both live games are validated for WebGPU (their default still depends on the device, rendererBackendChoice)', () => {
  for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
    assert.equal(isSceneWebGPUReady(sceneId), true);
    assert.equal(getSceneWebGPUBlocker(sceneId), null);
    assert.equal(selectRendererBackend({
      webgpuAvailable: true,
      requested: 'webgpu',
      sceneWebGPUReady: isSceneWebGPUReady(sceneId),
    }).backend, 'webgpu');
    assert.equal(selectRendererBackend({
      webgpuAvailable: false,
      requested: 'webgpu',
      sceneWebGPUReady: isSceneWebGPUReady(sceneId),
    }).backend, 'webgl');
  }
});

test('unknown and prototype scene identifiers fail closed', () => {
  for (const sceneId of [undefined, null, '', 'toString', '__proto__', 'unlisted-scene', {}]) {
    assert.equal(isSceneWebGPUReady(sceneId), false);
    assert.equal(getSceneWebGPUBlocker(sceneId), 'unknown-scene');
  }
});

test('readiness requires literal true, not truthy values', () => {
  assert.equal(isSceneWebGPUReady('scene', { scene: { ready: 'true' } }), false);
  assert.equal(isSceneWebGPUReady('scene', { scene: { ready: 1 } }), false);
  assert.equal(isSceneWebGPUReady('scene', { scene: { ready: true } }), true);
  assert.equal(getSceneWebGPUBlocker('scene', { scene: { ready: true } }), null);
});

test('default readiness inventory cannot be mutated', () => {
  assert.equal(Object.isFrozen(WEBGPU_SCENES), true);
  assert.equal(Object.isFrozen(WEBGPU_SCENES['fallen-sky']), true);
});
