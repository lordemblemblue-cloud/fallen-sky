import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { auditShaderSource } from './webgpu-shader-audit.mjs';

const roots = ['src/components/duelist', 'src/components/game3d'];
const extensions = /\.(?:js|jsx|mjs|ts|tsx)$/;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    if (entry.isDirectory()) paths.push(...await walk(join(directory, entry.name)));
    else if (entry.isFile() && extensions.test(entry.name)) paths.push(join(directory, entry.name));
  }
  return paths;
}

const findings = [];
for (const root of roots) {
  for (const file of await walk(root)) {
    findings.push(...auditShaderSource(await readFile(file, 'utf8'), relative('.', file)));
  }
}
findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
console.log(JSON.stringify({ warning: 'Static hints only; manual WebGPU compatibility audit required', findings }, null, 2));
