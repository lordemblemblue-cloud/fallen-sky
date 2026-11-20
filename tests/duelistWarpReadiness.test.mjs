import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDuelistWarp, auditCheckedInDuelistWarp } from '../scripts/duelist-warp-readiness.mjs';

test('checked-in Duelist warp remains explicitly WebGL-only until a compatible port exists', () => {
  const result = auditCheckedInDuelistWarp();
  assert.equal(result.webgpuReady, false);
  assert.deepEqual(result.blockers, [
    'WebGL EffectComposer', 'GLSL ShaderPass', 'WebGL OutputPass',
    'raw GLSL shader source', 'GLSL texture2D sampling',
  ]);
  assert.deepEqual(result.requiresVisualParity, [
    'outward ring', 'inward ring', 'held lens', 'chromatic fringe', 'glow',
  ]);
});

test('reports all known legacy postprocessing constructs without duplicates', () => {
  const source = [
    "from 'three/examples/jsm/postprocessing/EffectComposer.js'",
    "from 'three/examples/jsm/postprocessing/ShaderPass.js'",
    "from 'three/examples/jsm/postprocessing/OutputPass.js'",
    'vertexShader: `void main() {}`, fragmentShader: `texture2D(x, uv)`',
    'texture2D(x, uv)',
  ].join('\n');
  assert.equal(auditDuelistWarp(source).blockers.length, 5);
});

test('a compatible-source candidate is not blocked by legacy-pattern audit', () => {
  const result = auditDuelistWarp('import { pass } from "three/tsl"; export const effect = pass;');
  assert.equal(result.webgpuReady, true);
  assert.deepEqual(result.blockers, []);
});

test('rejects non-source inputs', () => {
  assert.throws(() => auditDuelistWarp(null), TypeError);
  assert.throws(() => auditDuelistWarp({}), TypeError);
});
