import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEBGPU_SCENES,
  isSceneWebGPUReady,
  isSceneWebGPUPreviewable,
  getSceneWebGPUBlocker,
} from '../src/lib/webgpuSceneReadiness.mjs';
import { selectSceneRendererBackend } from '../src/lib/webgpuSceneDecision.mjs';

test('the live games are ready, but WebGPU is automatic only with a faster-WebGPU device verdict', () => {
  for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
    assert.equal(WEBGPU_SCENES[sceneId].ready, true);
    assert.equal(isSceneWebGPUPreviewable(sceneId), true);
    assert.equal(isSceneWebGPUReady(sceneId), true);
    assert.equal(getSceneWebGPUBlocker(sceneId), null);
    const auto = selectSceneRendererBackend({ sceneId, requested: 'auto', webgpuAvailable: true });
    assert.equal(auto.backend, 'webgl');
    assert.equal(auto.reason, 'device-not-measured');
    const slower = selectSceneRendererBackend({ sceneId, requested: 'auto', webgpuAvailable: true, deviceVerdict: { webgpuAtLeastAsFast: false } });
    assert.equal(slower.reason, 'webgpu-slower-on-this-device');
    const faster = selectSceneRendererBackend({ sceneId, requested: 'auto', webgpuAvailable: true, deviceVerdict: { webgpuAtLeastAsFast: true } });
    assert.equal(faster.backend, 'webgpu');
    assert.equal(selectSceneRendererBackend({ sceneId, requested: 'auto', webgpuAvailable: false, deviceVerdict: { webgpuAtLeastAsFast: true } }).backend, 'webgl');
  }
});

test('preview and readiness are independent when evaluating future audited inventories', () => {
  const scenes = Object.create(null);
  scenes.previewOnly = { preview: true, ready: false, blocker: 'visual parity pending' };
  scenes.validated = { preview: false, ready: true };
  scenes.blocked = { preview: false, ready: false };
  assert.equal(isSceneWebGPUPreviewable('previewOnly', scenes), true);
  assert.equal(isSceneWebGPUReady('previewOnly', scenes), false);
  assert.equal(getSceneWebGPUBlocker('previewOnly', scenes), 'visual parity pending');
  assert.equal(isSceneWebGPUPreviewable('validated', scenes), true);
  assert.equal(isSceneWebGPUReady('validated', scenes), true);
  assert.equal(getSceneWebGPUBlocker('validated', scenes), null);
  assert.equal(isSceneWebGPUPreviewable('blocked', scenes), false);
  assert.equal(getSceneWebGPUBlocker('blocked', scenes), 'not-validated');
});

test('inherited scene identifiers and malformed identifiers cannot obtain preview eligibility', () => {
  for (const id of ['constructor', '__proto__', 'toString', null, undefined, {}, 0]) {
    assert.equal(isSceneWebGPUPreviewable(id), false);
    assert.equal(isSceneWebGPUReady(id), false);
    assert.equal(getSceneWebGPUBlocker(id), 'unknown-scene');
  }
});

test('the audited inventory and scene records cannot be mutated to force readiness', () => {
  assert.equal(Object.isFrozen(WEBGPU_SCENES), true);
  for (const id of ['fallen-sky', 'duelist-adventure']) {
    assert.equal(Object.isFrozen(WEBGPU_SCENES[id]), true);
  }
});
