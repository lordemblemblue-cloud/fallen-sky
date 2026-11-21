import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSceneRenderer } from '../src/lib/rendererBackendChoice.mjs';
import { verdictFromTimings, readDeviceVerdict, writeDeviceVerdict, DEVICE_VERDICT_KEY, VERDICT_MAX_AGE_MS } from '../src/lib/webgpuDeviceVerdict.mjs';

const scenes = Object.freeze({
  'fallen-sky': Object.freeze({ ready: true, preview: true }),
  'duelist-adventure': Object.freeze({ ready: true, preview: true }),
  'pending-scene': Object.freeze({ ready: false, preview: true }),
});

for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
  test(`${sceneId}: slower measured WebGPU prefers classic WebGL unless explicitly overridden`, () => {
    const verdict = verdictFromTimings({ webglMs: 10, webgpuMs: 15 });
    assert.equal(verdict.webgpuAtLeastAsFast, false);
    assert.deepEqual(chooseSceneRenderer({ sceneId, scenes, deviceVerdict: verdict }),
      { kind: 'webgl', reason: 'webgpu-slower-on-this-device' });
    assert.deepEqual(chooseSceneRenderer({ sceneId, scenes, deviceVerdict: verdict, override: 'webgpu' }),
      { kind: 'webgpu', reason: 'override' });
    assert.deepEqual(chooseSceneRenderer({ sceneId, scenes, deviceVerdict: verdict, previousFailure: true }),
      { kind: 'webgl', reason: 'webgpu-failed-earlier' });
    assert.deepEqual(chooseSceneRenderer({ sceneId, scenes, deviceVerdict: verdict, previousFailure: true, override: 'webgpu' }),
      { kind: 'webgl', reason: 'webgpu-failed-earlier' });
  });
}

test('a performance verdict cannot promote unready or unknown scenes', () => {
  const fast = verdictFromTimings({ webglMs: 15, webgpuMs: 10 });
  assert.equal(fast.webgpuAtLeastAsFast, true);
  for (const sceneId of ['pending-scene', 'missing-scene', 'toString']) {
    assert.equal(chooseSceneRenderer({ sceneId, scenes, deviceVerdict: fast }).kind, 'webgl');
  }
  assert.equal(chooseSceneRenderer({ sceneId: 'pending-scene', scenes, override: 'webgpu' }).kind, 'webgpu');
  assert.equal(chooseSceneRenderer({ sceneId: 'missing-scene', scenes, override: 'webgpu' }).kind, 'webgl');
});

test('invalid timings never manufacture a device verdict', () => {
  for (const [webglMs, webgpuMs] of [[0, 10], [10, 0], [-1, 10], [10, Infinity], [NaN, 10]]) {
    assert.equal(verdictFromTimings({ webglMs, webgpuMs }), null);
  }
});

test('device verdict storage rejects another browser build and expired measurements', () => {
  const entries = new Map();
  const storage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
  };
  const now = 1_800_000_000_000;
  const verdict = verdictFromTimings({ webglMs: 10, webgpuMs: 12 });
  assert.equal(writeDeviceVerdict({ storage, fingerprint: 'browser-A', verdict, now }), true);
  assert.equal(readDeviceVerdict({ storage, fingerprint: 'browser-A', now })?.webgpuAtLeastAsFast, false);
  assert.equal(readDeviceVerdict({ storage, fingerprint: 'browser-B', now }), null);
  assert.equal(readDeviceVerdict({ storage, fingerprint: 'browser-A', now: now + VERDICT_MAX_AGE_MS + 1 }), null);
  entries.set(DEVICE_VERDICT_KEY, '{broken');
  assert.equal(readDeviceVerdict({ storage, fingerprint: 'browser-A', now }), null);
});
