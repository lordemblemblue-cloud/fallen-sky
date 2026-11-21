import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSceneRenderer } from '../src/lib/rendererBackendChoice.mjs';
import { WEBGPU_SCENES, getSceneWebGPUBlocker, isSceneWebGPUReady } from '../src/lib/webgpuSceneReadiness.mjs';

const scenes = ['fallen-sky', 'duelist-adventure'];
const overrides = [null, 'webgpu', 'webgl2', 'webgl', 'auto', 'invalid'];

test('both live scenes run on WebGPU by default, and on WebGL after any GPU failure', () => {
  for (const sceneId of scenes) {
    assert.equal(isSceneWebGPUReady(sceneId), true, sceneId);
    assert.equal(getSceneWebGPUBlocker(sceneId), null, sceneId);
    assert.equal(chooseSceneRenderer({ sceneId }).kind, 'webgpu', sceneId);
    assert.equal(chooseSceneRenderer({ sceneId, previousFailure: true }).kind, 'webgl', sceneId);
  }
});

test('unknown and prototype-key scenes fail closed for every override and failure state', () => {
  for (const sceneId of ['unknown', '__proto__', 'constructor', 'toString', '', null]) {
    for (const override of overrides) {
      for (const previousFailure of [false, true]) {
        const decision = chooseSceneRenderer({ sceneId, override, previousFailure });
        assert.equal(decision.kind, 'webgl', String(sceneId) + ':' + String(override));
      }
    }
  }
});

test('explicit choices keep working next to the WebGPU default', () => {
  for (const sceneId of scenes) {
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgpu' }).kind, 'webgpu');
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgl2' }).kind, 'webgl2');
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgpu', previousFailure: true }).kind, 'webgl');
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgl2', previousFailure: true }).kind, 'webgl2');
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgl' }).kind, 'webgl');
    assert.equal(chooseSceneRenderer({ sceneId }).kind, 'webgpu');
    assert.equal(WEBGPU_SCENES[sceneId].ready, true);
  }
});

test('a ready custom scene runs on WebGPU and respects a previous failure', () => {
  const customScenes = { 'test-scene': { ready: true, preview: true } };
  assert.deepEqual(chooseSceneRenderer({ sceneId: 'test-scene', scenes: customScenes }), {
    kind: 'webgpu', reason: 'scene-ready',
  });
  assert.deepEqual(chooseSceneRenderer({ sceneId: 'test-scene', scenes: customScenes, previousFailure: true }), {
    kind: 'webgl', reason: 'webgpu-failed-earlier',
  });
});
