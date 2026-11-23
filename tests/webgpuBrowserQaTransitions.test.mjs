import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySamplePair } from '../scripts/webgpu-native-browser-qa.mjs';

// An advancing counter is necessary, not sufficient: both samples must be
// attributable to the same initialized, attached native gameplay renderer.
for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
  const sample = (changes = {}) => ({
    sceneId, backend: 'webgpu', deviceConfirmed: true, deviceLost: false,
    canvasAttached: true, frameCount: 10, gameplayFrames: 4, ...changes,
  });
  const advancing = () => sample({ frameCount: 11, gameplayFrames: 5 });

  test(sceneId + ': device loss at either sample invalidates advancing counters', () => {
    for (const position of ['first', 'last']) {
      const first = sample(position === 'first' ? { deviceLost: true } : {});
      const last = sample(position === 'last'
        ? { ...advancing(), deviceLost: true } : advancing());
      assert.deepEqual(classifySamplePair(first, last),
        { ok: false, reason: 'gpu-device-lost' });
    }
  });

  test(sceneId + ': a detached canvas at either sample invalidates advancing counters', () => {
    for (const position of ['first', 'last']) {
      const first = sample(position === 'first' ? { canvasAttached: false } : {});
      const last = sample(position === 'last'
        ? { ...advancing(), canvasAttached: false } : advancing());
      assert.deepEqual(classifySamplePair(first, last),
        { ok: false, reason: 'renderer-canvas-not-attached' });
    }
  });

  test(sceneId + ': native to fallback and fallback to native are not continuous evidence', () => {
    assert.equal(classifySamplePair(sample(), sample({
      ...advancing(), backend: 'webgl2-fallback',
    })).ok, false);
    assert.deepEqual(classifySamplePair(sample({ backend: 'webgl2-fallback' }), advancing()),
      { ok: false, reason: 'backend-changed-during-sample' });
  });

  test(sceneId + ': both frame counters must advance independently', () => {
    assert.equal(classifySamplePair(sample(), sample({ frameCount: 11, gameplayFrames: 4 })).ok, false);
    assert.equal(classifySamplePair(sample(), sample({ frameCount: 10, gameplayFrames: 5 })).ok, false);
    assert.deepEqual(classifySamplePair(sample(), advancing()),
      { ok: true, reason: 'native-webgpu-gameplay-draws-advancing' });
  });

  test(sceneId + ': malformed first-sample counters cannot be rescued by later draws', () => {
    for (const bad of [-1, 0.5, NaN, Infinity, '10', Number.MAX_SAFE_INTEGER + 1]) {
      assert.deepEqual(classifySamplePair(sample({ frameCount: bad }), advancing()),
        { ok: false, reason: 'invalid-render-counters' });
      assert.deepEqual(classifySamplePair(sample({ gameplayFrames: bad }), advancing()),
        { ok: false, reason: 'invalid-render-counters' });
    }
  });
}
