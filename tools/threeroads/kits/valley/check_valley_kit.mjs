#!/usr/bin/env node
/* global process, console */
// node tools/threeroads/kits/valley/check_valley_kit.mjs [path/to/valley.glb]
// Prints, per piece and level of detail: triangles, size against the table,
// pivot, material; then the totals against VALLEY_KIT_LIMITS. Exits 1 on any failure.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inspectValleyKit } from './valleyKitInspect.mjs';
import { VALLEY_KIT_LIMITS } from '../../../../src/components/game3d/threeroads/kits/valleyKitPieces.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.resolve(here, '../../../../public/game3d/threeroads/kits/valley.glb');
const report = inspectValleyKit(readFileSync(file));
const f = (n, d = 2) => n.toFixed(d);
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

console.log(`${pad('mesh', 26)}${lpad('tris', 6)}  ${pad('size w x d x h (m)', 22)}${pad('table', 18)}${pad('worst', 7)}${pad('pivot', 7)}${pad('y span', 15)}material`);
for (const r of report.rows) {
  const worst = Math.max(...r.ratio.map(x => Math.abs(x - 1)));
  console.log(`${pad(r.name, 26)}${lpad(r.triangles, 6)}  ${pad(r.size.map(s => f(s)).join(' x '), 22)}${pad(r.want.join(' x '), 18)}${pad((worst * 100).toFixed(1) + '%', 7)}${pad(r.pivot, 7)}${pad(`${f(r.minY)}..${f(r.maxY)}`, 15)}${r.materials.join('+')}`);
}
const L = VALLEY_KIT_LIMITS;
console.log('');
console.log(`pieces        ${report.rows.length / 2} (limit ${L.maxPieces})`);
console.log(`LOD0 total    ${report.totals.lod0} triangles (limit ${L.maxTrianglesLod0Total})`);
console.log(`LOD1 total    ${report.totals.lod1} triangles (${f(report.totals.lod1 / Math.max(1, report.totals.lod0) * 100, 0)}% of LOD0)`);
console.log(`largest LOD0  ${Math.max(...report.rows.filter(r => r.lod === 0).map(r => r.triangles))} (limit ${L.maxTrianglesLod0PerPiece})`);
console.log(`largest LOD1  ${Math.max(...report.rows.filter(r => r.lod === 1).map(r => r.triangles))} (limit ${L.maxTrianglesLod1PerPiece})`);
console.log(`file          ${report.fileBytes} bytes = ${f(report.fileBytes / 1048576)} MB (limit ${f(L.maxBytes / 1048576)} MB)`);
console.log(`materials     ${report.materials.join(', ')}`);
for (const img of report.images) console.log(`image         ${img.name} ${img.mimeType} ${img.width}x${img.height}, ${img.bytes} bytes`);
if (report.failures.length) {
  console.log(`\nFAILED (${report.failures.length}):`);
  for (const line of report.failures) console.log(`  ${line}`);
  process.exit(1);
}
console.log('\nOK');
