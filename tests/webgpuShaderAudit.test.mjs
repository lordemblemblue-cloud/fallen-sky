import test from 'node:test';
import assert from 'node:assert/strict';
import { auditShaderSource, maskNonCode } from '../scripts/webgpu-shader-audit.mjs';

test('detects renderer-specific constructs with accurate lines', () => {
  const hits = auditShaderSource('const x = new THREE.ShaderMaterial({});\nconst pass = new ShaderPass({});', 'a.jsx');
  assert.deepEqual(hits, [
    { path: 'a.jsx', line: 1, kind: 'ShaderMaterial' },
    { path: 'a.jsx', line: 2, kind: 'ShaderPass' },
  ]);
});
test('ignores commented examples and string literals', () => {
  assert.deepEqual(auditShaderSource('// ShaderMaterial\n/* ShaderPass */\nconst s = "RawShaderMaterial";'), []);
});
test('detects GLSL properties and custom compilation', () => {
  assert.deepEqual(auditShaderSource('onBeforeCompile = fn;\nfragmentShader: glsl;').map(h => h.kind), ['onBeforeCompile', 'glsl']);
});
test('preserves line breaks while masking', () => {
  assert.equal(maskNonCode('/* ShaderMaterial\nShaderPass */\nconst x = 1').split('\n').length, 3);
});
test('rejects invalid input', () => {
  assert.throws(() => auditShaderSource(null), TypeError);
});
