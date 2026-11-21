import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WEBGPU_SCENES, isSceneWebGPUReady } from '../src/lib/webgpuSceneReadiness.mjs';
import { chooseSceneRenderer } from '../src/lib/rendererBackendChoice.mjs';

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL('../' + relativePath, import.meta.url)), 'utf8');
}

const liveBlockers = [
  {
    id: 'fallen-sky',
    file: 'src/components/game3d/render/inkWashLook.js',
    signatures: [/const FRAGMENT\s*=\s*\/\* glsl \*\//, /texture2D\s*\(/, /gl_FragColor/],
  },
  {
    id: 'duelist-adventure',
    file: 'src/components/duelist/client/warp.mjs',
    signatures: [/postprocessing\/EffectComposer\.js/, /postprocessing\/ShaderPass\.js/, /texture2D\s*\(/],
  },
];

for (const { id, file, signatures } of liveBlockers) {
  test(`${id}: legacy effect signatures require a fail-closed production default`, () => {
    const code = source(file);
    const legacyPresent = signatures.every((pattern) => pattern.test(code));
    // When a port removes these signatures, this test should be updated with
    // explicit visual-parity and device-loss evidence before readiness changes.
    assert.equal(legacyPresent, true, `Re-audit ${file} and replace this guard with browser parity evidence`);
    assert.equal(isSceneWebGPUReady(id), false, `${id} must not be promoted by static source changes`);
    assert.equal(WEBGPU_SCENES[id].ready, false);
    assert.equal(chooseSceneRenderer({ sceneId: id }).kind, 'webgl');
    assert.match(WEBGPU_SCENES[id].blocker, /.+/);
  });
}

test('unrecognized scenes cannot bypass the live effect inventory', () => {
  for (const sceneId of ['__proto__', 'constructor', 'not-a-scene']) {
    assert.equal(isSceneWebGPUReady(sceneId), false);
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgpu' }).kind, 'webgl');
  }
});
