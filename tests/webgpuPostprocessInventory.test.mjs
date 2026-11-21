import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describePostprocessMigration, inventoryLegacyPostprocess } from '../src/lib/webgpuPostprocessInventory.mjs';
import { isSceneWebGPUReady } from '../src/lib/webgpuSceneReadiness.mjs';

const readSource = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

test('inventory rejects invalid input and does not count absent markers', () => {
  assert.throws(() => inventoryLegacyPostprocess(null), TypeError);
  assert.deepEqual(inventoryLegacyPostprocess('const clean = true;'), []);
  assert.deepEqual(inventoryLegacyPostprocess('new ShaderPass(); texture2D(tDiffuse, uv);'), [
    'shader-pass', 'glsl-texture-sampling',
  ]);
});

test('clean static source never grants runtime WebGPU readiness', () => {
  assert.deepEqual(describePostprocessMigration('test', ''), {
    sceneId: 'test', blockers: [], runtimeValidated: false, webgpuReady: false,
  });
});

// The legacy passes stay for the classic renderer; WebGPURenderer draws their TSL versions (warpNodes.mjs,
// inkWashNodes.mjs). The static inventory still finds the legacy markers and never grants readiness itself: the
// audited inventory (webgpuSceneReadiness.mjs) does, after browser parity checks.
test('Duelist warp keeps its legacy shader/composer for WebGL and a node version for WebGPU', () => {
  const source = readSource('../src/components/duelist/client/warp.mjs');
  const report = describePostprocessMigration('duelist-adventure', source);
  assert.ok(report.blockers.includes('effect-composer'));
  assert.ok(report.blockers.includes('shader-pass'));
  assert.ok(report.blockers.includes('glsl-texture-sampling'));
  assert.equal(report.webgpuReady, false);
  assert.match(source, /createWarpWebGPU/);
  assert.equal(isSceneWebGPUReady(report.sceneId), true);
});

test('Fallen Sky ink pass keeps its WebGL render target and GLSL, and a node version for WebGPU', () => {
  const source = readSource('../src/components/game3d/render/inkWashLook.js');
  const report = describePostprocessMigration('fallen-sky', source);
  assert.ok(report.blockers.includes('webgl-render-target'));
  assert.ok(report.blockers.includes('glsl-fragment-output'));
  assert.equal(report.webgpuReady, false);
  assert.match(source, /createInkWashTwin/);
  assert.equal(isSceneWebGPUReady(report.sceneId), true);
});
