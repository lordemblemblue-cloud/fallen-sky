import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSceneRendererBackend } from '../src/lib/webgpuSceneDecision.mjs';

test('both live scenes stay on WebGL even when WebGPU is requested and available', () => {
  for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
    for (const requested of ['auto', 'webgpu']) {
      const decision = selectSceneRendererBackend({ sceneId, requested, webgpuAvailable: true });
      assert.equal(decision.backend, 'webgl');
      assert.equal(decision.reason, 'scene-not-migrated');
      assert.equal(typeof decision.blocker, 'string');
    }
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
  const decision = selectSceneRendererBackend({
    sceneId: 'fallen-sky', sceneWebGPUReady: true, ready: true,
    requested: 'webgpu', webgpuAvailable: true,
  });
  assert.equal(decision.backend, 'webgl');
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
