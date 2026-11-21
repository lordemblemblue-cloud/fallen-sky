import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseSceneRendererFor,
  readRendererOverride,
  RENDERER_OVERRIDE_KEY,
  RENDERER_FAILED_KEY,
} from '../src/lib/rendererBackendChoice.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test('explicit preview choice persists across both games, but does not change the measured default', () => {
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  const host = { location: { search: '?renderer=webgpu' }, localStorage, sessionStorage };
  assert.deepEqual(chooseSceneRendererFor('fallen-sky', host), { kind: 'webgpu', reason: 'override' });
  assert.equal(localStorage.getItem(RENDERER_OVERRIDE_KEY), 'webgpu');

  host.location.search = '';
  assert.deepEqual(chooseSceneRendererFor('duelist-adventure', host), { kind: 'webgpu', reason: 'override' });
  // back to the default: without this device's faster-WebGPU verdict, the classic renderer
  host.location.search = '?renderer=auto';
  assert.deepEqual(chooseSceneRendererFor('duelist-adventure', host), { kind: 'webgl', reason: 'device-not-measured' });
  assert.equal(localStorage.getItem(RENDERER_OVERRIDE_KEY), null);
  host.location.search = '';
  assert.deepEqual(chooseSceneRendererFor('fallen-sky', host), { kind: 'webgl', reason: 'device-not-measured' });
});

test('a failed WebGPU device overrides persisted preview preference in either scene', () => {
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  localStorage.setItem(RENDERER_OVERRIDE_KEY, 'webgpu');
  sessionStorage.setItem(RENDERER_FAILED_KEY, '1');
  const host = { location: { search: '' }, localStorage, sessionStorage };
  for (const scene of ['fallen-sky', 'duelist-adventure']) {
    assert.deepEqual(chooseSceneRendererFor(scene, host), { kind: 'webgl', reason: 'webgpu-failed-earlier' });
  }
});

test('unrecognized URL renderer values cannot override a valid saved classic WebGL preference', () => {
  const localStorage = memoryStorage();
  localStorage.setItem(RENDERER_OVERRIDE_KEY, 'webgl');
  const host = { location: { search: '?renderer=WEBGPU' }, localStorage, sessionStorage: memoryStorage() };
  for (const scene of ['fallen-sky', 'duelist-adventure']) {
    assert.deepEqual(chooseSceneRendererFor(scene, host), { kind: 'webgl', reason: 'override' });
  }
  assert.equal(localStorage.getItem(RENDERER_OVERRIDE_KEY), 'webgl');
});

test('blocked persistent storage does not crash explicit preview or reset', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.equal(readRendererOverride({ search: '?renderer=webgpu', storage }), 'webgpu');
  assert.equal(readRendererOverride({ search: '?renderer=auto', storage }), null);
  assert.equal(readRendererOverride({ search: '', storage }), null);
});
