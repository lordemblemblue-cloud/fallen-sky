import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseSceneRendererFor,
  readRendererOverride,
  rememberRendererFailure,
  RENDERER_FAILED_KEY,
  RENDERER_OVERRIDE_KEY,
} from '../src/lib/rendererBackendChoice.mjs';

// Explicit classic rendering must not probe WebGPU, including under browser privacy wrappers.
for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
  test(`${sceneId}: explicit WebGL avoids a throwing navigator.gpu getter`, () => {
    const navigator = { userAgent: 'test-browser' };
    Object.defineProperty(navigator, 'gpu', {
      get() { throw new Error('WebGPU getter must not be touched'); },
    });
    const host = {
      navigator,
      isSecureContext: true,
      location: { search: '?renderer=webgl' },
      localStorage: { setItem() {}, getItem() { return null; } },
      sessionStorage: { getItem() { return null; } },
    };
    assert.deepEqual(chooseSceneRendererFor(sceneId, host), {
      kind: 'webgl', reason: 'override',
    });
  });
}

test('renderer=auto clears a persisted override without probing GPU', () => {
  const removed = [];
  const storage = {
    removeItem(key) { removed.push(key); },
    getItem() { throw new Error('must not read stale override'); },
  };
  assert.equal(readRendererOverride({ search: '?renderer=auto', storage }), null);
  assert.deepEqual(removed, [RENDERER_OVERRIDE_KEY]);
});

test('failure marker write is best-effort when session storage throws', () => {
  const host = {
    sessionStorage: {
      setItem(key, value) {
        assert.equal(key, RENDERER_FAILED_KEY);
        assert.equal(value, '1');
        throw new Error('storage blocked');
      },
    },
  };
  assert.doesNotThrow(() => rememberRendererFailure(host));
});

test('failure marker write tolerates inaccessible sessionStorage getter', () => {
  const host = {};
  Object.defineProperty(host, 'sessionStorage', {
    get() { throw new Error('storage inaccessible'); },
  });
  assert.doesNotThrow(() => rememberRendererFailure(host));
});
