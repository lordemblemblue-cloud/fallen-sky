import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySamplePair } from '../scripts/webgpu-native-browser-qa.mjs';

function sample(sceneId, overrides = {}) {
  return {
    sceneId, backend: 'webgpu', deviceConfirmed: true, deviceLost: false,
    frameCount: 11, gameplayFrames: 6, canvasAttached: true, ...overrides,
  };
}

for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
  test(sceneId + ': hostile CDP samples fail closed without throwing', () => {
    const first = sample(sceneId);
    const last = sample(sceneId, { frameCount: 12, gameplayFrames: 7 });
    assert.equal(classifySamplePair(first, last).ok, true);

    const revoked = Proxy.revocable(last, {});
    revoked.revoke();
    assert.deepEqual(classifySamplePair(first, revoked.proxy), {
      ok: false, reason: 'unreadable-scene-samples',
    });
    assert.deepEqual(classifySamplePair(revoked.proxy, last), {
      ok: false, reason: 'unreadable-scene-samples',
    });

    for (const key of ['sceneId', 'backend', 'deviceConfirmed', 'frameCount', 'gameplayFrames']) {
      const hostile = new Proxy(last, {
        get(target, property) {
          if (property === key) throw new Error('unreadable ' + key);
          return Reflect.get(target, property);
        },
      });
      assert.deepEqual(classifySamplePair(first, hostile), {
        ok: false, reason: 'unreadable-scene-samples',
      });
    }
  });

  test(sceneId + ': normal non-native samples retain specific rejection reasons', () => {
    assert.deepEqual(classifySamplePair(sample(sceneId), sample(sceneId, {
      backend: 'webgl2-fallback', frameCount: 12, gameplayFrames: 7,
    })), { ok: false, reason: 'not-native-webgpu:webgl2-fallback' });
    assert.deepEqual(classifySamplePair(sample(sceneId), sample(sceneId, {
      frameCount: 11, gameplayFrames: 7,
    })), { ok: false, reason: 'render-frame-counter-not-advancing' });
  });
}
