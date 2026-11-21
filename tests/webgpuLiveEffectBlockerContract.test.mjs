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

// The legacy GLSL effects stay: they are what the classic WebGL renderer draws. Each now has a WebGPU (TSL) version
// used by WebGPURenderer, checked against the classic picture in the browser, with a device-loss fallback to the
// classic renderer (docs/webgpu/CONVERSION_SURVEY_20261120.md). A ready scene runs on WebGPU by default wherever
// the browser offers it (owner, 2026-11-21); a WebGPU failure in the tab falls back to the classic renderer.
const webgpuVersions = {
  'fallen-sky': { file: 'src/components/game3d/render/inkWashLook.js', uses: /createInkWashTwin/ },
  'duelist-adventure': { file: 'src/components/duelist/client/warp.mjs', uses: /createWarpWebGPU|createWarpForWebGPU/ },
};

for (const { id, file, signatures } of liveBlockers) {
  test(`${id}: legacy effects keep their WebGPU version; WebGPU by default, classic after a failure`, () => {
    const code = source(file);
    const legacyPresent = signatures.every((pattern) => pattern.test(code));
    assert.equal(legacyPresent, true, `Re-audit ${file}: the classic renderer still needs its GLSL effect`);
    assert.match(source(webgpuVersions[id].file), webgpuVersions[id].uses, `${id} needs its WebGPU effect version`);
    assert.equal(isSceneWebGPUReady(id), true);
    assert.equal(WEBGPU_SCENES[id].ready, true);
    assert.equal(chooseSceneRenderer({ sceneId: id }).kind, 'webgpu');
    assert.equal(chooseSceneRenderer({ sceneId: id, previousFailure: true }).kind, 'webgl');
  });
}

test('unrecognized scenes cannot bypass the live effect inventory', () => {
  for (const sceneId of ['__proto__', 'constructor', 'not-a-scene']) {
    assert.equal(isSceneWebGPUReady(sceneId), false);
    assert.equal(chooseSceneRenderer({ sceneId, override: 'webgpu' }).kind, 'webgl');
  }
});
