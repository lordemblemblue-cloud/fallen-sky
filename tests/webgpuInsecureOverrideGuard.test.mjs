import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSceneRendererFor } from '../src/lib/rendererBackendChoice.mjs';

const GAMES = ['fallen-sky', 'duelist-adventure'];

function browser({ secure = true, search = '?renderer=webgpu', gpu = {} } = {}) {
  return {
    isSecureContext: secure,
    navigator: { gpu },
    location: { search },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null },
  };
}

test('explicit native WebGPU cannot bypass insecure-context restrictions in either game', () => {
  for (const sceneId of GAMES) {
    assert.deepEqual(
      chooseSceneRendererFor(sceneId, browser({ secure: false })),
      { kind: 'webgl', reason: 'webgpu-api-unavailable' },
      sceneId,
    );
  }
});

test('secure browser contexts still permit explicit WebGPU for both games', () => {
  for (const sceneId of GAMES) {
    assert.deepEqual(
      chooseSceneRendererFor(sceneId, browser()),
      { kind: 'webgpu', reason: 'override' },
      sceneId,
    );
  }
});

test('forced WebGL2 fallback remains available on insecure pages for QA', () => {
  for (const sceneId of GAMES) {
    assert.deepEqual(
      chooseSceneRendererFor(sceneId, browser({ secure: false, search: '?renderer=webgl2', gpu: undefined })),
      { kind: 'webgl2', reason: 'override' },
      sceneId,
    );
  }
});

test('throwing secure-context getter fails closed instead of crashing native override', () => {
  for (const sceneId of GAMES) {
    const host = browser();
    Object.defineProperty(host, 'isSecureContext', {
      get() { throw new Error('browser security wrapper'); },
    });
    assert.deepEqual(
      chooseSceneRendererFor(sceneId, host),
      { kind: 'webgl', reason: 'webgpu-api-unavailable' },
      sceneId,
    );
  }
});

test('unknown scenes stay blocked regardless of secure context or explicit override', () => {
  assert.equal(chooseSceneRendererFor('unlisted-game', browser()).kind, 'webgl');
  assert.equal(chooseSceneRendererFor('unlisted-game', browser({ secure: false })).kind, 'webgl');
});
