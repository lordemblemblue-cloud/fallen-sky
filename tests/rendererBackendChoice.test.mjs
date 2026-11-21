import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseSceneRenderer, readRendererOverride, chooseSceneRendererFor, rememberRendererFailure,
  RENDERER_OVERRIDE_KEY, RENDERER_FAILED_KEY,
} from '../src/lib/rendererBackendChoice.mjs';
import { isSceneWebGPUPreviewable, isSceneWebGPUReady } from '../src/lib/webgpuSceneReadiness.mjs';
import { DEVICE_VERDICT_KEY } from '../src/lib/webgpuDeviceVerdict.mjs';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    map,
  };
}

test('live scenes are ready, yet default to WebGPU only where this device measured it at least as fast', () => {
  for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
    assert.equal(isSceneWebGPUReady(sceneId), true);
    assert.deepEqual(chooseSceneRenderer({ sceneId }), { kind: 'webgl', reason: 'device-not-measured' });
    assert.deepEqual(chooseSceneRenderer({ sceneId, deviceVerdict: { webgpuAtLeastAsFast: false } }),
      { kind: 'webgl', reason: 'webgpu-slower-on-this-device' });
    assert.deepEqual(chooseSceneRenderer({ sceneId, deviceVerdict: { webgpuAtLeastAsFast: true } }),
      { kind: 'webgpu', reason: 'scene-ready' });
    assert.equal(chooseSceneRenderer({ sceneId, deviceVerdict: { webgpuAtLeastAsFast: 'yes' } }).kind, 'webgl');
    assert.equal(chooseSceneRenderer({ sceneId, deviceVerdict: { webgpuAtLeastAsFast: true }, previousFailure: true }).kind, 'webgl');
  }
});

test('an explicit WebGPU choice is honoured only for previewable scenes', () => {
  assert.equal(isSceneWebGPUPreviewable('fallen-sky'), true);
  assert.deepEqual(chooseSceneRenderer({ sceneId: 'fallen-sky', override: 'webgpu' }), { kind: 'webgpu', reason: 'override' });
  assert.deepEqual(chooseSceneRenderer({ sceneId: 'fallen-sky', override: 'webgl2' }), { kind: 'webgl2', reason: 'override' });
  for (const sceneId of [undefined, null, '', '__proto__', 'toString', 'unlisted', {}]) {
    assert.equal(isSceneWebGPUPreviewable(sceneId), false);
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgpu' }).kind, 'webgl');
  }
});

test('the classic renderer can always be chosen, and a failure earlier in the tab falls back to it', () => {
  assert.deepEqual(chooseSceneRenderer({ sceneId: 'fallen-sky', override: 'webgl' }), { kind: 'webgl', reason: 'override' });
  assert.equal(chooseSceneRenderer({ sceneId: 'fallen-sky', override: 'webgpu', previousFailure: true }).kind, 'webgl');
  // the forced WebGL2 backend is still allowed after a WebGPU failure (it is the fallback being tested)
  assert.equal(chooseSceneRenderer({ sceneId: 'fallen-sky', override: 'webgl2', previousFailure: true }).kind, 'webgl2');
});

test('a ready scene uses WebGPURenderer by default where WebGPU is the faster renderer', () => {
  const scenes = { 'fallen-sky': { ready: true } };
  const faster = { webgpuAtLeastAsFast: true };
  assert.deepEqual(chooseSceneRenderer({ sceneId: 'fallen-sky', scenes, deviceVerdict: faster }), { kind: 'webgpu', reason: 'scene-ready' });
  assert.deepEqual(chooseSceneRenderer({ sceneId: 'fallen-sky', scenes }), { kind: 'webgl', reason: 'device-not-measured' });
  assert.equal(chooseSceneRenderer({ sceneId: 'fallen-sky', scenes, deviceVerdict: faster, previousFailure: true }).kind, 'webgl');
  assert.equal(chooseSceneRenderer({ sceneId: 'fallen-sky', scenes, deviceVerdict: faster, override: 'webgl' }).kind, 'webgl');
  assert.equal(chooseSceneRenderer({ sceneId: 'fallen-sky', scenes: { 'fallen-sky': { ready: 'yes' } }, deviceVerdict: faster }).kind, 'webgl');
  assert.deepEqual(chooseSceneRenderer({ sceneId: 'fallen-sky', scenes: { 'fallen-sky': { ready: false, preview: true } }, deviceVerdict: faster }),
    { kind: 'webgl', reason: 'scene-not-ready' });
});

test('the browser helper reads this browser build\'s stored verdict', () => {
  const verdict = JSON.stringify({ webgpuAtLeastAsFast: true, fingerprint: 'UA-1', measuredAt: Date.now() });
  const host = (userAgent) => ({ location: { search: '' }, navigator: { userAgent },
    localStorage: memoryStorage({ [DEVICE_VERDICT_KEY]: verdict }), sessionStorage: memoryStorage() });
  assert.deepEqual(chooseSceneRendererFor('fallen-sky', host('UA-1')), { kind: 'webgpu', reason: 'scene-ready' });
  assert.deepEqual(chooseSceneRendererFor('fallen-sky', host('UA-2')), { kind: 'webgl', reason: 'device-not-measured' });
  const failed = host('UA-1');
  rememberRendererFailure(failed);
  assert.equal(chooseSceneRendererFor('fallen-sky', failed).kind, 'webgl');
});

test('the URL override is remembered until ?renderer=auto, and junk is ignored', () => {
  const storage = memoryStorage();
  assert.equal(readRendererOverride({ search: '?renderer=webgpu', storage }), 'webgpu');
  assert.equal(storage.getItem(RENDERER_OVERRIDE_KEY), 'webgpu');
  assert.equal(readRendererOverride({ search: '', storage }), 'webgpu');
  assert.equal(readRendererOverride({ search: '?renderer=WEBGPU', storage }), 'webgpu'); // unknown value: keep saved
  assert.equal(readRendererOverride({ search: '?renderer=auto', storage }), null);
  assert.equal(storage.getItem(RENDERER_OVERRIDE_KEY), null);
  assert.equal(readRendererOverride({ search: '', storage: memoryStorage({ [RENDERER_OVERRIDE_KEY]: 'vulkan' }) }), null);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(readRendererOverride({ search: '?renderer=webgl2', storage: blocked }), 'webgl2');
  assert.equal(readRendererOverride({ search: '', storage: blocked }), null);
});

test('browser helper combines location, localStorage and the per-tab failure flag', () => {
  const host = { location: { search: '?renderer=webgpu' }, localStorage: memoryStorage(), sessionStorage: memoryStorage() };
  assert.equal(chooseSceneRendererFor('fallen-sky', host).kind, 'webgpu');
  rememberRendererFailure(host);
  assert.equal(host.sessionStorage.getItem(RENDERER_FAILED_KEY), '1');
  assert.equal(chooseSceneRendererFor('fallen-sky', host).kind, 'webgl');
  assert.equal(chooseSceneRendererFor('fallen-sky', {}).kind, 'webgl');
});
