import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryGameWorldRenderer } from '../scripts/gameworld-webgpu-context-audit.mjs';

test('identifies renderer and context dependencies with stable line numbers', () => {
  const result = inventoryGameWorldRenderer([
    'const renderer = new THREE.WebGLRenderer({canvas});',
    'renderer.getContext();',
    'if (gl.isContextLost()) return;',
    'renderer.render(scene, camera);',
    'renderer.setSize(100, 100);',
    'renderer.dispose();',
  ].join('\\n'));
  assert.deepEqual(result, {
    renderer: [1], context: [2], contextLoss: [3],
    render: [4], resize: [5], dispose: [6],
  });
});

test('does not treat comments about WebGPU as a renderer migration', () => {
  const result = inventoryGameWorldRenderer('// WebGPU TODO\\nconst renderer = {};');
  assert.ok(Object.values(result).every((lines) => lines.length === 0));
});

test('rejects invalid input and reports repeated occurrences', () => {
  assert.throws(() => inventoryGameWorldRenderer(null), TypeError);
  assert.deepEqual(inventoryGameWorldRenderer('renderer.render(a,b);\\nrenderer.render(c,d);').render, [1, 2]);
});
