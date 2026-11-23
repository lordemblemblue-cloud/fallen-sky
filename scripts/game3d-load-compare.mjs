#!/usr/bin/env node
// Before/after table of Game 3D area loads (Game3DAreaLoadTiming.mjs results posted to game3d-perf-receiver.mjs).
//
//   node scripts/game3d-load-compare.mjs <runs-dir> [--before load-before] [--after load-after] [--md]
// Each run file's label is <prefix>-<area> (or <prefix>-entry...). The newest file per label wins.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dir = args[0];
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const before = opt('before', 'load-before'); const after = opt('after', 'load-after');
const md = args.includes('--md');

const runs = new Map();
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  if (!String(r.schema || '').includes('load')) continue;
  runs.set(r.label, r); // sorted by time: the newest file per label wins
}
const areas = ['town', 'south', 'west', 'east', 'north'];
const s = (ms) => (ms == null ? '-' : `${(ms / 1000).toFixed(1)} s`);
const m = (n) => `${(n / 1e6).toFixed(2)} M`;
const rows = [];
for (const area of areas) {
  const b = runs.get(`${before}-${area}`); const a = runs.get(`${after}-${area}`);
  if (!b && !a) continue;
  const cell = (r, f) => (r ? f(r) : '-');
  rows.push([area,
    `${cell(b, (r) => r.counted.drawCalls)} → ${cell(a, (r) => r.counted.drawCalls)}`,
    `${cell(b, (r) => m(r.counted.triangles))} → ${cell(a, (r) => m(r.counted.triangles))}`,
    `${cell(b, (r) => r.counted.textureMB)} → ${cell(a, (r) => r.counted.textureMB)}`,
    `${cell(b, (r) => r.downloads.mb)} → ${cell(a, (r) => r.downloads.mb)}`,
    `${cell(b, (r) => s(r.shownMs))} → ${cell(a, (r) => s(r.shownMs))}`,
    `${cell(b, (r) => s(r.settledMs))} → ${cell(a, (r) => s(r.settledMs))}`]);
}
const head = ['area (gate hop)', 'draw calls', 'triangles', 'textures (MB, uncompressed)', 'models + textures loaded (MB)', 'shown', 'settled'];
if (md) {
  console.log(`| ${head.join(' | ')} |`);
  console.log(`|${head.map((_, i) => (i ? '---:' : '---')).join('|')}|`);
  for (const r of rows) console.log(`| ${r.join(' | ')} |`);
} else {
  console.log(head.join('\t'));
  for (const r of rows) console.log(r.join('\t'));
}
