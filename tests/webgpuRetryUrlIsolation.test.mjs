import test from 'node:test';
import assert from 'node:assert/strict';
import { URL } from 'node:url';
import {
  retryWebGPU, rememberRendererFailure, chooseSceneRendererFor,
  RENDERER_FAILED_KEY,
} from '../src/lib/rendererBackendChoice.mjs';

function browserHost(href) {
  const entries = new Map();
  const navigation = [];
  let reloads = 0;
  const location = {
    href,
    get search() { return new URL(this.href).search; },
    assign(url) { navigation.push(url); this.href = url; },
    reload() { reloads += 1; },
  };
  return {
    location,
    navigator: { gpu: {} },
    isSecureContext: true,
    sessionStorage: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, String(value)),
      removeItem: (key) => entries.delete(key),
    },
    entries, navigation, get reloads() { return reloads; },
  };
}

for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
  test(`${sceneId}: retry preserves unrelated query, fragment and URL encoding`, () => {
    const host = browserHost('https://game.example/gameview?character=Artemis%20Moon&quality=ultra#abilities');
    rememberRendererFailure(host, sceneId);
    retryWebGPU(sceneId, host);
    assert.equal(host.navigation.length, 1);
    const destination = new URL(host.navigation[0]);
    assert.equal(destination.pathname, '/gameview');
    assert.equal(destination.searchParams.get('character'), 'Artemis Moon');
    assert.equal(destination.searchParams.get('quality'), 'ultra');
    assert.equal(destination.searchParams.get('renderer'), 'webgpu');
    assert.equal(destination.hash, '#abilities');
    assert.equal(host.entries.get(RENDERER_FAILED_KEY + ':' + sceneId), undefined);
    assert.equal(host.reloads, 0);
  });

  test(`${sceneId}: retry of an already-WebGPU URL reloads rather than stacking history`, () => {
    const host = browserHost('https://game.example/gameview?renderer=webgpu&quality=high#fight');
    rememberRendererFailure(host, sceneId);
    retryWebGPU(sceneId, host);
    assert.equal(host.reloads, 1);
    assert.deepEqual(host.navigation, []);
    assert.equal(host.entries.get(RENDERER_FAILED_KEY + ':' + sceneId), undefined);
  });

  test(`${sceneId}: retry clears only its own failure and leaves the other game downgraded`, () => {
    const other = sceneId === 'fallen-sky' ? 'duelist-adventure' : 'fallen-sky';
    const host = browserHost('https://game.example/gameview?renderer=webgpu');
    rememberRendererFailure(host, sceneId);
    rememberRendererFailure(host, other);
    assert.equal(chooseSceneRendererFor(sceneId, host).kind, 'webgl');
    assert.equal(chooseSceneRendererFor(other, host).kind, 'webgl');
    retryWebGPU(sceneId, host);
    assert.equal(chooseSceneRendererFor(sceneId, host).kind, 'webgpu');
    assert.equal(chooseSceneRendererFor(other, host).kind, 'webgl');
    assert.equal(host.entries.get(RENDERER_FAILED_KEY + ':' + other), '1');
  });

  test(`${sceneId}: blocked session storage does not prevent a user-triggered retry`, () => {
    const host = browserHost('https://game.example/gameview?quality=low');
    host.sessionStorage.removeItem = () => { throw new Error('storage blocked'); };
    assert.doesNotThrow(() => retryWebGPU(sceneId, host));
    assert.equal(new URL(host.navigation[0]).searchParams.get('renderer'), 'webgpu');
  });
}
