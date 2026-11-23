import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseSceneRendererFor, rememberRendererFailure, retryWebGPU,
  RENDERER_FAILED_KEY, RENDERER_OVERRIDE_KEY,
} from '../src/lib/rendererBackendChoice.mjs';

const SCENES = ['fallen-sky', 'duelist-adventure'];

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function browser() {
  const localStorage = storage();
  const sessionStorage = storage();
  const location = {
    href: 'https://example.test/gameview?mode=practice',
    search: '',
    assigned: [],
    assign(url) { this.assigned.push(url); this.href = url; this.search = new URL(url).search; },
    reload() { throw new Error('Unexpected reload'); },
  };
  return { isSecureContext: true, navigator: { gpu: {} }, localStorage, sessionStorage, location };
}

for (const failedScene of SCENES) {
  const healthyScene = SCENES.find((scene) => scene !== failedScene);

  test(failedScene + ': a device-loss marker downgrades only its own game', () => {
    const host = browser();
    assert.equal(chooseSceneRendererFor(failedScene, host).kind, 'webgpu');
    assert.equal(chooseSceneRendererFor(healthyScene, host).kind, 'webgpu');

    rememberRendererFailure(host, failedScene);
    assert.equal(host.sessionStorage.getItem(RENDERER_FAILED_KEY + ':' + failedScene), '1');
    assert.equal(host.sessionStorage.getItem(RENDERER_FAILED_KEY + ':' + healthyScene), null);
    assert.deepEqual(chooseSceneRendererFor(failedScene, host),
      { kind: 'webgl', reason: 'webgpu-failed-earlier' });
    assert.deepEqual(chooseSceneRendererFor(healthyScene, host),
      { kind: 'webgpu', reason: 'scene-ready' });

    // Explicit native retry must not override a known device failure until
    // the user invokes the scene-scoped retry action.
    host.location.search = '?renderer=webgpu';
    assert.deepEqual(chooseSceneRendererFor(failedScene, host),
      { kind: 'webgl', reason: 'webgpu-failed-earlier' });
    assert.deepEqual(chooseSceneRendererFor(healthyScene, host),
      { kind: 'webgpu', reason: 'override' });
  });

  test(failedScene + ': retry clears only that scene failure, preserving the peer marker', () => {
    const host = browser();
    rememberRendererFailure(host, failedScene);
    rememberRendererFailure(host, healthyScene);
    retryWebGPU(failedScene, host);

    assert.equal(host.sessionStorage.getItem(RENDERER_FAILED_KEY + ':' + failedScene), null);
    assert.equal(host.sessionStorage.getItem(RENDERER_FAILED_KEY + ':' + healthyScene), '1');
    assert.equal(host.location.assigned.length, 1);
    assert.equal(new URL(host.location.assigned[0]).searchParams.get('renderer'), 'webgpu');
    assert.equal(chooseSceneRendererFor(failedScene, host).kind, 'webgpu');
    assert.equal(chooseSceneRendererFor(healthyScene, host).kind, 'webgl');
    assert.equal(host.localStorage.getItem(RENDERER_OVERRIDE_KEY), 'webgpu');
  });
}

test('unavailable session storage does not crash either game renderer selection', () => {
  const host = browser();
  host.sessionStorage = {
    getItem() { throw new Error('session blocked'); },
    setItem() { throw new Error('session blocked'); },
    removeItem() { throw new Error('session blocked'); },
  };
  for (const scene of SCENES) {
    assert.doesNotThrow(() => rememberRendererFailure(host, scene));
    assert.deepEqual(chooseSceneRendererFor(scene, host),
      { kind: 'webgpu', reason: 'scene-ready' });
  }
});
