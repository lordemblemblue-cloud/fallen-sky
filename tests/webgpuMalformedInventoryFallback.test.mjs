import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSceneWebGPUReady,
  isSceneWebGPUPreviewable,
  getSceneWebGPUBlocker,
} from '../src/lib/webgpuSceneReadiness.mjs';
import { chooseSceneRenderer } from '../src/lib/rendererBackendChoice.mjs';

for (const scenes of [null, undefined, false, 0, 'invalid']) {
  test(`malformed readiness inventory ${String(scenes)} fails closed`, () => {
    assert.equal(isSceneWebGPUReady('fallen-sky', scenes), false);
    assert.equal(isSceneWebGPUPreviewable('duelist-adventure', scenes), false);
    assert.equal(getSceneWebGPUBlocker('fallen-sky', scenes), 'unknown-scene');
    assert.deepEqual(chooseSceneRenderer({ sceneId: 'fallen-sky', scenes }), {
      kind: 'webgl', reason: 'scene-not-ready',
    });
    assert.deepEqual(chooseSceneRenderer({ sceneId: 'duelist-adventure', override: 'webgpu', scenes }), {
      kind: 'webgl', reason: 'scene-not-previewable',
    });
  });
}

test('valid own-property readiness remains supported', () => {
  const scenes = Object.create(null);
  scenes['fallen-sky'] = { ready: true };
  assert.equal(isSceneWebGPUReady('fallen-sky', scenes), true);
  assert.equal(isSceneWebGPUPreviewable('fallen-sky', scenes), true);
  assert.equal(getSceneWebGPUBlocker('fallen-sky', scenes), null);
  assert.equal(isSceneWebGPUReady('toString', scenes), false);
});
