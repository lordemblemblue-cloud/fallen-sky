import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RENDERER_FAILED_KEY,
  RENDERER_OVERRIDE_KEY,
  chooseSceneRendererFor,
  readRendererOverride,
  rememberRendererFailure,
} from '../src/lib/rendererBackendChoice.mjs';

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('explicit preview selection never promotes an unknown scene', () => {
  const localStorage = storage();
  const host = { location: { search: '?renderer=webgpu' }, localStorage, sessionStorage: storage() };
  assert.deepEqual(chooseSceneRendererFor('unknown-scene', host), {
    kind: 'webgl', reason: 'scene-not-previewable',
  });
  assert.equal(localStorage.getItem(RENDERER_OVERRIDE_KEY), 'webgpu');
  assert.deepEqual(chooseSceneRendererFor('fallen-sky', host), {
    kind: 'webgpu', reason: 'override',
  });
});

test('a remembered WebGPU failure overrides explicit WebGPU preview', () => {
  const host = {
    location: { search: '?renderer=webgpu' },
    localStorage: storage(),
    sessionStorage: storage(),
  };
  rememberRendererFailure(host);
  assert.equal(host.sessionStorage.getItem(RENDERER_FAILED_KEY), '1');
  assert.deepEqual(chooseSceneRendererFor('duelist-adventure', host), {
    kind: 'webgl', reason: 'webgpu-failed-earlier',
  });
});

test('auto clears persisted override and restores fail-closed default', () => {
  const localStorage = storage({ [RENDERER_OVERRIDE_KEY]: 'webgpu' });
  const host = { location: { search: '?renderer=auto' }, localStorage, sessionStorage: storage() };
  // no stored verdict that WebGPU is at least as fast on this device: the classic renderer
  assert.deepEqual(chooseSceneRendererFor('fallen-sky', host), {
    kind: 'webgl', reason: 'device-not-measured',
  });
  assert.equal(localStorage.getItem(RENDERER_OVERRIDE_KEY), null);
});

test('untrusted persisted override is ignored', () => {
  assert.equal(readRendererOverride({
    search: '?renderer=invalid',
    storage: storage({ [RENDERER_OVERRIDE_KEY]: 'unexpected' }),
  }), null);
});

test('storage exceptions cannot prevent conservative scene selection', () => {
  const blocked = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  const host = { location: { search: '?renderer=auto' }, localStorage: blocked, sessionStorage: blocked };
  assert.doesNotThrow(() => rememberRendererFailure(host));
  // unreadable storage: the classic renderer (the host counts as unavailable)
  assert.equal(chooseSceneRendererFor('duelist-adventure', host).kind, 'webgl');
});
