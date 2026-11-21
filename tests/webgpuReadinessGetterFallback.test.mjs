import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSceneWebGPUReady,
  isSceneWebGPUPreviewable,
  getSceneWebGPUBlocker,
} from '../src/lib/webgpuSceneReadiness.mjs';
import { chooseSceneRenderer } from '../src/lib/rendererBackendChoice.mjs';

for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
  test(`${sceneId}: throwing scene accessor fails closed`, () => {
    const scenes = {};
    Object.defineProperty(scenes, sceneId, {
      enumerable: true,
      get() { throw new Error('blocked scene policy'); },
    });
    assert.equal(isSceneWebGPUReady(sceneId, scenes), false);
    assert.equal(isSceneWebGPUPreviewable(sceneId, scenes), false);
    assert.equal(getSceneWebGPUBlocker(sceneId, scenes), 'unknown-scene');
    assert.deepEqual(chooseSceneRenderer({ sceneId, scenes }), { kind: 'webgl', reason: 'scene-not-ready' });
  });

  test(`${sceneId}: throwing proxy ownership check fails closed`, () => {
    const scenes = new Proxy({}, {
      getOwnPropertyDescriptor() { throw new Error('blocked ownership'); },
    });
    assert.equal(isSceneWebGPUReady(sceneId, scenes), false);
    assert.equal(isSceneWebGPUPreviewable(sceneId, scenes), false);
    assert.deepEqual(chooseSceneRenderer({ sceneId, scenes, override: 'webgpu' }), {
      kind: 'webgl', reason: 'scene-not-previewable',
    });
  });

  test(`${sceneId}: throwing policy fields fail closed`, () => {
    const policy = {
      get ready() { throw new Error('blocked readiness'); },
      get preview() { throw new Error('blocked preview'); },
      get blocker() { throw new Error('blocked blocker'); },
    };
    const scenes = { [sceneId]: policy };
    assert.equal(isSceneWebGPUReady(sceneId, scenes), false);
    assert.equal(isSceneWebGPUPreviewable(sceneId, scenes), false);
    assert.equal(getSceneWebGPUBlocker(sceneId, scenes), 'not-validated');
  });
}

test('normal own scene policy remains supported', () => {
  const scenes = { 'fallen-sky': { ready: true, preview: true } };
  assert.equal(isSceneWebGPUReady('fallen-sky', scenes), true);
  assert.equal(isSceneWebGPUPreviewable('fallen-sky', scenes), true);
  assert.equal(getSceneWebGPUBlocker('fallen-sky', scenes), null);
  assert.equal(isSceneWebGPUReady('toString', scenes), false);
});
