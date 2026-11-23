#!/usr/bin/env node
// Writes the pictures inside a capture result (src/components/game3d/performance/Game3DViewCapture.mjs, posted to
// scripts/game3d-perf-receiver.mjs) as JPEG files: <out>/<label>/<view id>.jpg.
//
//   node scripts/game3d-extract-captures.mjs <capture.json> <out-dir>
import fs from 'node:fs';
import path from 'node:path';

const [file, out] = process.argv.slice(2);
const result = JSON.parse(fs.readFileSync(file, 'utf8'));
const dir = path.join(out, String(result.label || 'captures').replace(/[^A-Za-z0-9._-]+/g, '-'));
fs.mkdirSync(dir, { recursive: true });
for (const shot of result.shots || []) {
  const match = /^data:image\/(jpeg|png);base64,(.*)$/.exec(shot.dataUrl || '');
  if (!match) { console.log('skipped', shot.id, shot.error || 'no picture'); continue; }
  const name = path.join(dir, `${shot.id}.${match[1] === 'png' ? 'png' : 'jpg'}`);
  fs.writeFileSync(name, Buffer.from(match[2], 'base64'));
  console.log('wrote', name);
}
