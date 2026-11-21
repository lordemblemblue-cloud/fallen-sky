import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSceneRendererBackend } from '../src/lib/webgpuSceneDecision.mjs';

test('both live scenes stay on WebGL automatically unless this device measured WebGPU at least as fast', () => {
  for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
    const auto = selectSceneRendererBackend({ sceneId, requested: 'auto', webgpuAvailable: true });
    assert.equal(auto.backend, 'webgl');
    assert.equal(auto.reason, 'device-not-measured');
    assert.equal(auto.blocker, null);
    assert.equal(selectSceneRendererBackend({ sceneId, requested: 'auto', webgpuAvailable: true,
      deviceVerdict: { webgpuAtLeastAsFast: true } }).backend, 'webgpu');
    // an explicit request for a ready scene is honoured where WebGPU exists
    assert.equal(selectSceneRendererBackend({ sceneId, requested: 'webgpu', webgpuAvailable: true }).backend, 'webgpu');
    assert.equal(selectSceneRendererBackend({ sceneId, requested: 'webgpu', webgpuAvailable: false }).backend, 'webgl');
  }
});

test('unknown and prototype names cannot opt in', () => {
  for (const sceneId of [undefined, null, '__proto__', 'constructor', 'toString', 'unknown', {}]) {
    const decision = selectSceneRendererBackend({ sceneId, requested: 'webgpu', webgpuAvailable: true });
    assert.equal(decision.backend, 'webgl');
    assert.equal(decision.blocker, 'unknown-scene');
  }
});

test('caller cannot override scene readiness via extra fields', () => {
  const forged = selectSceneRendererBackend({
    sceneId: 'unknown', sceneWebGPUReady: true, ready: true,
    requested: 'webgpu', webgpuAvailable: true,
  });
  assert.equal(forged.backend, 'webgl');
  for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
    const plain = selectSceneRendererBackend({ sceneId, requested: 'auto', webgpuAvailable: true });
    const extra = selectSceneRendererBackend({ sceneId, requested: 'auto', webgpuAvailable: true, sceneWebGPUReady: true, ready: true, webgpuAtLeastAsFast: true });
    assert.deepEqual(extra, plain);
  }
});

test('invalid preferences and nonboolean availability fail closed', () => {
  for (const requested of [null, '', 'WEBGPU', {}, 1]) {
    const decision = selectSceneRendererBackend({ sceneId: 'fallen-sky', requested, webgpuAvailable: true });
    assert.equal(decision.backend, 'webgl');
    assert.equal(decision.reason, 'invalid-renderer-request');
  }
  const decision = selectSceneRendererBackend({ sceneId: 'fallen-sky', requested: 'auto', webgpuAvailable: 'true' });
  assert.equal(decision.backend, 'webgl');
});

test('explicit WebGL request remains WebGL', () => {
  const decision = selectSceneRendererBackend({ sceneId: 'duelist-adventure', requested: 'webgl', webgpuAvailable: true });
  assert.equal(decision.backend, 'webgl');
  assert.equal(decision.reason, 'user-selected-webgl');
});
