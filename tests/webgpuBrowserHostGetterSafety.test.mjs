import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseSceneRendererFor,
  RENDERER_FAILED_KEY,
} from '../src/lib/rendererBackendChoice.mjs';

for (const property of ['sessionStorage', 'location', 'localStorage']) {
  test(`throwing browser ${property} getter does not disable a capable renderer`, () => {
    const host = {
      navigator: { gpu: {} },
      sessionStorage: { getItem: () => null },
      location: { search: '?renderer=webgpu' },
      localStorage: { getItem: () => null },
    };
    Object.defineProperty(host, property, { get() { throw new Error('access denied'); } });
    assert.deepEqual(chooseSceneRendererFor('fallen-sky', host), {
      kind: 'webgpu', reason: property === 'location' ? 'scene-ready' : 'override',
    });
    assert.deepEqual(chooseSceneRendererFor('duelist-adventure', host), {
      kind: 'webgpu', reason: property === 'location' ? 'scene-ready' : 'override',
    });
  });
}

test('normal explicit preview selection remains available', () => {
  const host = {
    sessionStorage: { getItem: () => null },
    location: { search: '?renderer=webgpu' },
    localStorage: { setItem: () => {} },
  };
  assert.deepEqual(chooseSceneRendererFor('fallen-sky', host), {
    kind: 'webgpu', reason: 'override',
  });
});

test('previous device failure still forces WebGL for explicit WebGPU preview', () => {
  const host = {
    sessionStorage: { getItem: (key) => key === RENDERER_FAILED_KEY + ':duelist-adventure' ? '1' : null },
    location: { search: '?renderer=webgpu' },
    localStorage: { setItem: () => {} },
  };
  assert.deepEqual(chooseSceneRendererFor('duelist-adventure', host), {
    kind: 'webgl', reason: 'webgpu-failed-earlier',
  });
});
