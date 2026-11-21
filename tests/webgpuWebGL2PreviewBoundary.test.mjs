import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSceneRenderer, chooseSceneRendererFor, RENDERER_FAILED_KEY } from '../src/lib/rendererBackendChoice.mjs';
import { WEBGPU_SCENES } from '../src/lib/webgpuSceneReadiness.mjs';

const games = ['fallen-sky', 'duelist-adventure'];

test('forced WebGL2 is a developer preview; the default stays classic without a faster-WebGPU verdict', () => {
  for (const sceneId of games) {
    assert.equal(WEBGPU_SCENES[sceneId].ready, true);
    assert.deepEqual(chooseSceneRenderer({ sceneId, override: 'webgl2' }), {
      kind: 'webgl2', reason: 'override',
    });
    assert.deepEqual(chooseSceneRenderer({ sceneId }), {
      kind: 'webgl', reason: 'device-not-measured',
    });
    // a verdict never selects the forced WebGL2 backend: the default is WebGPU or the classic renderer
    assert.equal(chooseSceneRenderer({ sceneId, deviceVerdict: { webgpuAtLeastAsFast: true } }).kind, 'webgpu');
  }
});

test('a recorded WebGPU device failure blocks automatic and WebGPU paths, but permits explicit WebGL2 backend inspection', () => {
  for (const sceneId of games) {
    assert.deepEqual(chooseSceneRenderer({ sceneId, override: 'webgpu', previousFailure: true }), {
      kind: 'webgl', reason: 'webgpu-failed-earlier',
    });
    assert.deepEqual(chooseSceneRenderer({ sceneId, override: 'webgl2', previousFailure: true }), {
      kind: 'webgl2', reason: 'override',
    });
  }
});

test('unknown and inherited scene identifiers cannot force WebGL2 preview', () => {
  for (const sceneId of ['toString', '__proto__', 'constructor', 'not-a-scene', null, undefined]) {
    assert.deepEqual(chooseSceneRenderer({ sceneId, override: 'webgl2' }), {
      kind: 'webgl', reason: 'scene-not-previewable',
    });
  }
});

test('browser host failure marker still permits explicit WebGL2 fallback inspection', () => {
  const host = {
    location: { search: '?renderer=webgl2' },
    localStorage: { getItem: () => null, setItem: () => {} },
    sessionStorage: { getItem: key => key === RENDERER_FAILED_KEY ? '1' : null },
  };
  for (const sceneId of games) {
    assert.deepEqual(chooseSceneRendererFor(sceneId, host), { kind: 'webgl2', reason: 'override' });
  }
});
