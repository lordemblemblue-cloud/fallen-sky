import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FALLEN_SKY_BLACK_SCENE_FALLBACK,
  resolveFallenSkyLiveRendererChoice,
} from '../src/components/game3d/render/liveRendererRecovery.mjs';
import { chooseSceneRendererFor } from '../src/lib/rendererBackendChoice.mjs';

function storage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
const host = (search = '', saved = {}) => ({
  location: { search },
  navigator: { gpu: {} },
  isSecureContext: true,
  localStorage: storage(saved),
  sessionStorage: storage(),
});

test('Fallen Sky live world defaults to the classic WebGL pipeline even on a WebGPU-ready browser', () => {
  const browser = host('');
  const proposed = chooseSceneRendererFor('fallen-sky', browser);
  assert.equal(proposed.kind, 'webgpu');
  assert.deepEqual(resolveFallenSkyLiveRendererChoice(proposed, browser.location),
    { kind: 'webgl', reason: FALLEN_SKY_BLACK_SCENE_FALLBACK });
  // Shared selection for Duelist Adventure is unaffected.
  assert.equal(chooseSceneRendererFor('duelist-adventure', browser).kind, 'webgpu');
});

test('the saved WebGPU/WebGL2 override cannot silently keep the 3D live world black', () => {
  for (const savedKind of ['webgpu', 'webgl2']) {
    const browser = host('', { fallen_sky_renderer_v1: savedKind });
    const proposed = chooseSceneRendererFor('fallen-sky', browser);
    assert.equal(proposed.kind, savedKind);
    assert.equal(resolveFallenSkyLiveRendererChoice(proposed, browser.location).kind, 'webgl');
  }
});

test('engineers retain deliberate, URL-only WebGPU and WebGL2 previews', () => {
  for (const kind of ['webgpu', 'webgl2']) {
    const browser = host('?renderer=' + kind);
    const selected = chooseSceneRendererFor('fallen-sky', browser);
    assert.deepEqual(resolveFallenSkyLiveRendererChoice(selected, browser.location), selected);
  }
});

test('classic WebGL overrides and failure fallbacks are never changed', () => {
  const browser = host('?renderer=webgl');
  const selected = chooseSceneRendererFor('fallen-sky', browser);
  assert.equal(selected.kind, 'webgl');
  assert.equal(resolveFallenSkyLiveRendererChoice(selected, browser.location), selected);
  assert.equal(resolveFallenSkyLiveRendererChoice({ kind: 'webgl', reason: 'webgpu-failed-earlier' }).kind, 'webgl');
  assert.equal(resolveFallenSkyLiveRendererChoice({ kind: 'webgpu', reason: 'override' }, { search: '?renderer=auto' }).kind, 'webgl');
  assert.equal(resolveFallenSkyLiveRendererChoice({ kind: 'webgpu', reason: 'override' }, { search: '???' }).kind, 'webgl');
  assert.equal(resolveFallenSkyLiveRendererChoice(null), null);
});
