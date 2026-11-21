import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEBGPU_SCENES,
  isSceneWebGPUReady,
  isSceneWebGPUPreviewable,
  getSceneWebGPUBlocker,
} from '../src/lib/webgpuSceneReadiness.mjs';
import { selectSceneRendererBackend } from '../src/lib/webgpuSceneDecision.mjs';

test('preview eligibility never promotes either live game to automatic WebGPU readiness', () => {
  for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
    assert.equal(WEBGPU_SCENES[sceneId].ready, false);
    assert.equal(isSceneWebGPUPreviewable(sceneId), true);
    assert.equal(isSceneWebGPUReady(sceneId), false);
    assert.equal(typeof getSceneWebGPUBlocker(sceneId), 'string');
    for (const requested of ['auto', 'webgpu']) {
      const decision = selectSceneRendererBackend({ sceneId, requested, webgpuAvailable: true });
      assert.equal(decision.backend, 'webgl');
      assert.equal(decision.reason, 'scene-not-migrated');
    }
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
