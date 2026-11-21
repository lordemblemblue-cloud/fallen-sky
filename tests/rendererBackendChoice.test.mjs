import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseSceneRenderer, readRendererOverride, chooseSceneRendererFor, rememberRendererFailure,
  RENDERER_OVERRIDE_KEY, RENDERER_FAILED_KEY,
} from '../src/lib/rendererBackendChoice.mjs';
import { isSceneWebGPUPreviewable, isSceneWebGPUReady } from '../src/lib/webgpuSceneReadiness.mjs';

// What builds before 2026-11-21 stored after their WebGPU speed test (removed): it must no longer matter.
const OLD_SPEED_VERDICT_KEY = 'fallen_sky_webgpu_verdict_v1';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    map,
  };
}

test('ready live scenes run on WebGPU by default, with no speed test, and fall back after a WebGPU failure', () => {
  for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
    assert.equal(isSceneWebGPUReady(sceneId), true);
    assert.deepEqual(chooseSceneRenderer({ sceneId }), { kind: 'webgpu', reason: 'scene-ready' });
    // an old "WebGPU is slower here" verdict passed by a stale caller changes nothing
    assert.deepEqual(chooseSceneRenderer({ sceneId, deviceVerdict: { webgpuAtLeastAsFast: false } }),
      { kind: 'webgpu', reason: 'scene-ready' });
    assert.deepEqual(chooseSceneRenderer({ sceneId, previousFailure: true }), { kind: 'webgl', reason: 'webgpu-failed-earlier' });
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

test('a ready scene uses WebGPURenderer by default; unready scenes, failures and ?renderer=webgl keep classic', () => {
  const scenes = { 'fallen-sky': { ready: true } };
  assert.deepEqual(chooseSceneRenderer({ sceneId: 'fallen-sky', scenes }), { kind: 'webgpu', reason: 'scene-ready' });
  assert.equal(chooseSceneRenderer({ sceneId: 'fallen-sky', scenes, previousFailure: true }).kind, 'webgl');
  assert.equal(chooseSceneRenderer({ sceneId: 'fallen-sky', scenes, override: 'webgl' }).kind, 'webgl');
  assert.equal(chooseSceneRenderer({ sceneId: 'fallen-sky', scenes: { 'fallen-sky': { ready: 'yes' } } }).kind, 'webgl');
  assert.deepEqual(chooseSceneRenderer({ sceneId: 'fallen-sky', scenes: { 'fallen-sky': { ready: false, preview: true } } }),
    { kind: 'webgl', reason: 'scene-not-ready' });
});

test('the browser helper picks WebGPU wherever the browser offers it, whatever an old speed verdict says', () => {
  for (const webgpuAtLeastAsFast of [false, true]) {
    const verdict = JSON.stringify({ webgpuAtLeastAsFast, fingerprint: 'UA-1', measuredAt: Date.now() });
    const host = () => ({ location: { search: '' }, navigator: { userAgent: 'UA-1', gpu: {} },
      localStorage: memoryStorage({ [OLD_SPEED_VERDICT_KEY]: verdict }), sessionStorage: memoryStorage() });
    assert.deepEqual(chooseSceneRendererFor('fallen-sky', host()), { kind: 'webgpu', reason: 'scene-ready' });
    assert.deepEqual(chooseSceneRendererFor('duelist-adventure', host()), { kind: 'webgpu', reason: 'scene-ready' });
    const failed = host();
    rememberRendererFailure(failed);
    assert.equal(chooseSceneRendererFor('fallen-sky', failed).kind, 'webgl');
  }
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
  assert.deepEqual(chooseSceneRendererFor('fallen-sky', { navigator: {}, location: { search: '' } }),
    { kind: 'webgl', reason: 'webgpu-api-unavailable' });
  assert.deepEqual(chooseSceneRendererFor('fallen-sky', { isSecureContext: false,
    navigator: { gpu: {} }, location: { search: '' } }),
    { kind: 'webgl', reason: 'webgpu-api-unavailable' });
});
