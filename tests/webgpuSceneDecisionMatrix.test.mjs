import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSceneRenderer } from '../src/lib/rendererBackendChoice.mjs';
import { WEBGPU_SCENES, getSceneWebGPUBlocker, isSceneWebGPUReady } from '../src/lib/webgpuSceneReadiness.mjs';

const scenes = ['fallen-sky', 'duelist-adventure'];
const overrides = [null, 'webgpu', 'webgl2', 'webgl', 'auto', 'invalid'];

test('both live scenes stay WebGL by default without a faster-WebGPU verdict, and after any GPU failure', () => {
  const faster = { webgpuAtLeastAsFast: true };
  for (const sceneId of scenes) {
    assert.equal(isSceneWebGPUReady(sceneId), true, sceneId);
    assert.equal(getSceneWebGPUBlocker(sceneId), null, sceneId);
    for (const previousFailure of [false, true]) {
      assert.equal(chooseSceneRenderer({ sceneId, previousFailure }).kind, 'webgl', sceneId);
      assert.equal(chooseSceneRenderer({ sceneId, previousFailure, deviceVerdict: { webgpuAtLeastAsFast: false } }).kind, 'webgl', sceneId);
    }
    assert.equal(chooseSceneRenderer({ sceneId, previousFailure: true, deviceVerdict: faster }).kind, 'webgl', sceneId);
    assert.equal(chooseSceneRenderer({ sceneId, deviceVerdict: faster }).kind, 'webgpu', sceneId);
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

test('explicit previews keep working and never change the measured default', () => {
  for (const sceneId of scenes) {
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgpu' }).kind, 'webgpu');
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgl2' }).kind, 'webgl2');
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgpu', previousFailure: true }).kind, 'webgl');
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgl2', previousFailure: true }).kind, 'webgl2');
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgl', deviceVerdict: { webgpuAtLeastAsFast: true } }).kind, 'webgl');
    assert.equal(chooseSceneRenderer({ sceneId }).kind, 'webgl');
    assert.equal(WEBGPU_SCENES[sceneId].ready, true);
  }
});

test('a ready custom scene follows the device verdict and respects a previous failure', () => {
  const customScenes = { 'test-scene': { ready: true, preview: true } };
  const faster = { webgpuAtLeastAsFast: true };
  assert.deepEqual(chooseSceneRenderer({ sceneId: 'test-scene', scenes: customScenes, deviceVerdict: faster }), {
    kind: 'webgpu', reason: 'scene-ready',
  });
  assert.deepEqual(chooseSceneRenderer({ sceneId: 'test-scene', scenes: customScenes }), {
    kind: 'webgl', reason: 'device-not-measured',
  });
  assert.deepEqual(chooseSceneRenderer({ sceneId: 'test-scene', scenes: customScenes, deviceVerdict: faster, previousFailure: true }), {
    kind: 'webgl', reason: 'webgpu-failed-earlier',
  });
});
