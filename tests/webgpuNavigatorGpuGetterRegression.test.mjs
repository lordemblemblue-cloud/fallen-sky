import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSceneRendererFor } from '../src/lib/rendererBackendChoice.mjs';

// Regression: navigator.gpu is accessed after the browser-host property guard.
// Privacy wrappers can throw on this getter even when navigator itself is readable.
for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
  test(`${sceneId}: inaccessible navigator.gpu must fail closed to WebGL`, () => {
    const navigator = { userAgent: 'test-browser' };
    Object.defineProperty(navigator, 'gpu', {
      get() { throw new Error('GPU access blocked'); },
    });
    const host = {
      navigator,
      isSecureContext: true,
      location: { search: '' },
      localStorage: { getItem: () => null },
      sessionStorage: { getItem: () => null },
    };
    assert.deepEqual(chooseSceneRendererFor(sceneId, host), {
      kind: 'webgl',
      reason: 'webgpu-api-unavailable',
    });
  });
}

test('an ordinary unavailable navigator.gpu keeps the existing fallback contract', () => {
  const host = {
    navigator: { userAgent: 'test-browser' },
    location: { search: '' },
    localStorage: { getItem: () => null },
    sessionStorage: { getItem: () => null },
  };
  assert.deepEqual(chooseSceneRendererFor('fallen-sky', host), {
    kind: 'webgl',
    reason: 'webgpu-api-unavailable',
  });
});
