// Static inventory only: this does not enable WebGPU or claim runtime compatibility.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const WEBGL_DEPENDENCIES = Object.freeze({
  renderer: /new\s+THREE\.WebGLRenderer\s*\(/g,
  context: /renderer\.getContext\s*\(/g,
  contextLoss: /isContextLost\s*\(/g,
  render: /renderer\.render\s*\(/g,
  resize: /renderer\.setSize\s*\(/g,
  dispose: /renderer\.dispose\s*\(/g,
});

export function inventoryGameWorldRenderer(source) {
  if (typeof source !== 'string') throw new TypeError('source must be a string');
  const lines = source.split(/\r?\n/);
  return Object.fromEntries(Object.entries(WEBGL_DEPENDENCIES).map(([key, pattern]) => {
    const matches = [];
    for (let i = 0; i < lines.length; i++) {
      pattern.lastIndex = 0;
      if (pattern.test(lines[i])) matches.push(i + 1);
    }
    return [key, matches];
  }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = resolve(process.argv[2] || 'src/components/game3d/GameWorld3D.jsx');
  console.log(JSON.stringify({ file: path, dependencies: inventoryGameWorldRenderer(readFileSync(path, 'utf8')) }, null, 2));
}
