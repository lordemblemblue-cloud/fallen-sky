import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isRecoverableWebGPUPipelineError } from '../src/components/game3d/render/recoverableWebGPUPipelineError.mjs';

const webgpu = { isWebGPURenderer: true };
const classic = { isWebGPURenderer: false };
const cacheError = new TypeError("Cannot read properties of undefined (reading 'usedTimes')");

test('a Three r171 WebGPU pipeline refcount crash triggers scene recovery', () => {
  assert.equal(isRecoverableWebGPUPipelineError(cacheError, webgpu), true);
  assert.equal(isRecoverableWebGPUPipelineError(new TypeError('Pipeline.usedTimes is undefined'), webgpu), true);
});

test('the refcount guard never masks unrelated errors or falsely classifies classic WebGL', () => {
  assert.equal(isRecoverableWebGPUPipelineError(cacheError, classic), false);
  assert.equal(isRecoverableWebGPUPipelineError(cacheError, null), false);
  assert.equal(isRecoverableWebGPUPipelineError(new Error("reading 'usedTimes'"), webgpu), false);
  assert.equal(isRecoverableWebGPUPipelineError(new TypeError('mesh geometry is missing'), webgpu), false);
  assert.equal(isRecoverableWebGPUPipelineError(null, webgpu), false);
});

test('original Wolfveil render path catches only the known cache crash and uses the existing recovery mechanism', () => {
  const file = readFileSync(new URL('../src/components/game3d/GameWorld3D.jsx', import.meta.url), 'utf8');
  assert.match(file, /if \(recovering\) return;/);
  assert.match(file, /try \{\s*inkLook\.render\(scene, activeCamera\);/);
  assert.match(file, /if \(!isRecoverableWebGPUPipelineError\(error, renderer\)\) throw error;/);
  assert.match(file, /recoverRenderer\('webgpu-pipeline-refcount-invalid'\)/);
  assert.match(file, /rememberRendererFailure\(window, 'fallen-sky'\)/);
  assert.match(file, /rendererGuard\.markDisposed\(\);\s*cancelAnimationFrame\(frameId\);/);
});
