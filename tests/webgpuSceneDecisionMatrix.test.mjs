import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSceneRenderer } from '../src/lib/rendererBackendChoice.mjs';
import { WEBGPU_SCENES, getSceneWebGPUBlocker, isSceneWebGPUReady } from '../src/lib/webgpuSceneReadiness.mjs';

const scenes = ['fallen-sky', 'duelist-adventure'];
const overrides = [null, 'webgpu', 'webgl2', 'webgl', 'auto', 'invalid'];

test('both live scenes remain WebGL by default regardless of prior GPU failure', () => {
  for (const sceneId of scenes) {
    assert.equal(isSceneWebGPUReady(sceneId), false, sceneId);
    assert.equal(typeof getSceneWebGPUBlocker(sceneId), 'string', sceneId);
    for (const previousFailure of [false, true]) {
      assert.equal(chooseSceneRenderer({ sceneId, previousFailure }).kind, 'webgl', sceneId);
    }
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

test('explicit previews never promote live scene production readiness', () => {
  for (const sceneId of scenes) {
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgpu' }).kind, 'webgpu');
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgl2' }).kind, 'webgl2');
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgpu', previousFailure: true }).kind, 'webgl');
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgl2', previousFailure: true }).kind, 'webgl2');
    assert.equal(isSceneWebGPUReady(sceneId), false);
    assert.equal(WEBGPU_SCENES[sceneId].ready, false);
  }
});

test('explicitly ready custom scene respects previous failure without changing live defaults', () => {
  const customScenes = { 'test-scene': { ready: true, preview: true } };
  assert.deepEqual(chooseSceneRenderer({ sceneId: 'test-scene', scenes: customScenes }), {
    kind: 'webgpu', reason: 'scene-ready',
  });
  assert.deepEqual(chooseSceneRenderer({ sceneId: 'test-scene', scenes: customScenes, previousFailure: true }), {
    kind: 'webgl', reason: 'webgpu-failed-earlier',
  });
  assert.equal(isSceneWebGPUReady('fallen-sky'), false);
  assert.equal(isSceneWebGPUReady('duelist-adventure'), false);
});
