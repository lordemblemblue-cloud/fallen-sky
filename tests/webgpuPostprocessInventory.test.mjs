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

test('Duelist warp legacy shader/composer remains gated', () => {
  const source = readSource('../src/components/duelist/client/warp.mjs');
  const report = describePostprocessMigration('duelist-adventure', source);
  assert.ok(report.blockers.includes('effect-composer'));
  assert.ok(report.blockers.includes('shader-pass'));
  assert.ok(report.blockers.includes('glsl-texture-sampling'));
  assert.equal(isSceneWebGPUReady(report.sceneId), false);
});

test('Fallen Sky ink pass render target and GLSL remain gated', () => {
  const source = readSource('../src/components/game3d/render/inkWashLook.js');
  const report = describePostprocessMigration('fallen-sky', source);
  assert.ok(report.blockers.includes('webgl-render-target'));
  assert.ok(report.blockers.includes('glsl-fragment-output'));
  assert.equal(isSceneWebGPUReady(report.sceneId), false);
});
