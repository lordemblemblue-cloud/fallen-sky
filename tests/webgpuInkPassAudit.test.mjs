import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INK_PASS_FILE, INK_PORT_BLOCKERS, inventoryInkPass, summarizeInkPass } from '../scripts/webgpu-ink-pass-audit.mjs';

test('detects shader, render-target and depth dependencies with 1-based line numbers', () => {
  const source = [
    'const VERTEX = /* glsl */`void main() {}`;',
    'const FRAGMENT = /* glsl */`',
    '#include <packing>',
    'texture2D(tDepth, vUv);',
    'gl_FragColor = vec4(1.0);',
    '`;',
    'const target = new THREE.WebGLRenderTarget(100, 100);',
    'target.depthTexture = new THREE.DepthTexture(100, 100);',
    'const pass = new THREE.ShaderMaterial({});',
    'renderer.setRenderTarget(target);',
  ].join('\n');
  const result = inventoryInkPass(source);
  assert.deepEqual(result.glslVertex.lines, [1]);
  assert.deepEqual(result.glslFragment.lines, [2]);
  assert.deepEqual(result.glslPacking.lines, [3]);
  assert.deepEqual(result.texture2D.lines, [4]);
  assert.deepEqual(result.glFragColor.lines, [5]);
  assert.deepEqual(result.renderTarget.lines, [7]);
  assert.deepEqual(result.depthTexture.lines, [8]);
  assert.deepEqual(result.shaderMaterial.lines, [9]);
  assert.deepEqual(result.setRenderTarget.lines, [10]);
  assert.equal(summarizeInkPass(result).webgpuValidated, false);
});

test('ignores ordinary comments and rejects non-text input', () => {
  const source = [
    '// new THREE.ShaderMaterial();',
    '  // renderer.setRenderTarget(target)',
    '* texture2D(tDepth, uv)',
    'const other = 123;',
  ].join('\n');
  assert.ok(Object.values(inventoryInkPass(source)).every(entry => entry.lines.length === 0));
  assert.throws(() => inventoryInkPass(null), TypeError);
});

test('the real Fallen Sky ink postprocess has actionable migration blockers', () => {
  const source = readFileSync(new URL('../' + INK_PASS_FILE, import.meta.url), 'utf8');
  const result = inventoryInkPass(source);
  for (const id of ['glslVertex', 'glslFragment', 'texture2D', 'glFragColor', 'glslPacking']) {
    assert.ok(result[id].lines.length > 0, id + ' must be inventoried before switching renderer');
  }
  assert.deepEqual(Object.keys(result), Object.keys(INK_PORT_BLOCKERS));
  assert.ok(summarizeInkPass(result).occurrences >= 5);
  assert.equal(summarizeInkPass(result).webgpuValidated, false);
});
