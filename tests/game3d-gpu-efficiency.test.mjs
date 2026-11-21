import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifyGame3DGpu, game3dEfficiencyTighten, game3dGpuContextAttributes, readGame3DGpuHints,
} from '../src/components/game3d/performance/Game3DGpuEfficiency.mjs';
import { game3dWorldGraphicsBudget } from '../src/components/game3d/performance/Game3DWorldGraphicsBudget.mjs';
import { rendererPixelRatioLimit } from '../src/components/game3d/performance/AdaptiveGraphics.mjs';

const world = readFileSync(new URL('../src/components/game3d/GameWorld3D.jsx', import.meta.url), 'utf8');

test('efficiency uses the high-performance GPU without inventing a VRAM size', () => {
  const attrs = game3dGpuContextAttributes({ profile: 'performance', hints: { deviceMemoryGb: 8 } });
  assert.equal(attrs.powerPreference, 'high-performance');
  assert.equal(attrs.antialias, false);
  assert.equal(attrs.preserveDrawingBuffer, false);
  assert.equal(game3dGpuContextAttributes({ profile: 'quality' }).antialias, true);
  assert.equal(classifyGame3DGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070)'), 'discrete');
  assert.equal(classifyGame3DGpu('Google SwiftShader'), 'software');
  assert.equal(readGame3DGpuHints({ navigator: { deviceMemory: 8, hardwareConcurrency: 16 } }).deviceMemoryGb, 8);
  assert.equal(readGame3DGpuHints({}).deviceMemoryGb, null);
});


test('GPU class detection supports multiple vendors without assuming all Radeon or Intel chips are alike', () => {
  assert.equal(classifyGame3DGpu('NVIDIA Ada Lovelace GeForce RTX 4070'), 'discrete');
  assert.equal(classifyGame3DGpu('AMD Radeon RX 7800 XT'), 'discrete');
  assert.equal(classifyGame3DGpu('AMD Radeon 780M Graphics'), 'integrated');
  assert.equal(classifyGame3DGpu('AMD Radeon 890M'), 'integrated');
  assert.equal(classifyGame3DGpu('Intel Iris Xe Graphics'), 'integrated');
  assert.equal(classifyGame3DGpu('Intel Arc A770 Graphics'), 'discrete');
  assert.equal(classifyGame3DGpu('Intel Arc 140V'), 'integrated');
  assert.equal(classifyGame3DGpu('Apple M3 GPU'), 'integrated');
  assert.equal(classifyGame3DGpu('Adreno 740'), 'integrated');
  assert.equal(classifyGame3DGpu('AMD Radeon Graphics'), 'unknown');
  assert.equal(classifyGame3DGpu('GPU not reported by this browser'), 'unknown');
  assert.equal(classifyGame3DGpu('Google SwiftShader'), 'software');
  assert.equal(game3dEfficiencyTighten({ profile: 'auto', gpuClass: classifyGame3DGpu('AMD Radeon 780M') }), 'balanced');
  assert.equal(game3dEfficiencyTighten({ profile: 'auto', gpuClass: classifyGame3DGpu('Intel Arc A770') }), 'none');
});

test('performance profile cuts world work harder than the quality preset alone', () => {
  const plain = game3dWorldGraphicsBudget({ quality: 'ultra', shadows: true });
  const efficient = game3dWorldGraphicsBudget(
    { quality: 'ultra', shadows: true },
    { tighten: 'performance' },
  );
  assert.equal(plain.shadowSize, 2048);
  assert.equal(efficient.shadowSize, 256);
  assert.ok(efficient.fogScale < plain.fogScale);
  assert.ok(efficient.particleScale < plain.particleScale);
  assert.equal(game3dEfficiencyTighten({ profile: 'performance' }), 'performance');
  assert.equal(game3dEfficiencyTighten({ profile: 'auto', deviceMemoryGb: 4 }), 'balanced');
  assert.equal(game3dEfficiencyTighten({ profile: 'quality', deviceMemoryGb: 2 }), 'none');
  assert.equal(rendererPixelRatioLimit({
    profile: 'auto', quality: 'high', devicePixelRatio: 2, deviceMemoryGb: 4, gpuClass: 'integrated',
  }), 1);
  assert.match(world, /powerPreference: 'high-performance'/);
  assert.match(world, /game3dCloneGPUProfileChanged/);
  assert.match(world, /__gw3dGpuInfo/);
});
