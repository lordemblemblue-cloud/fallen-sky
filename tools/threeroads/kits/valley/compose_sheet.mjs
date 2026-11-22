#!/usr/bin/env node
/* global process, console, Buffer */
// node tools/threeroads/kits/valley/compose_sheet.mjs TILEDIR near|far OUT.png
// Lays the per-piece renders from render_sheets.py out in table order with labels.
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { VALLEY_KIT_PIECES } from '../../../../src/components/game3d/threeroads/kits/valleyKitPieces.mjs';

const [dir, mode, out] = process.argv.slice(2);
const far = mode === 'far';
const TW = far ? 420 : 300;
const TH = far ? 260 : 320;
const COLS = far ? 5 : 8;
const LABEL = 22;
const rows = Math.ceil(VALLEY_KIT_PIECES.length / COLS);
const W = COLS * TW;
const H = rows * (TH + LABEL) + 40;
const layers = [];
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><style>text{font-family:Arial,sans-serif;font-size:15px;fill:#222}</style>`;
svg += `<text x="10" y="26" style="font-size:20px">Valley kit: ${far ? 'LOD0 (left) and LOD1 (right) at 60 m, one block = one screen pixel' : 'LOD0, with a 1.8 m figure'}</text>`;
for (const [i, entry] of VALLEY_KIT_PIECES.entries()) {
  const file = path.join(dir, `${entry.id}.png`);
  if (!existsSync(file)) continue;
  const x = (i % COLS) * TW;
  const y = 40 + Math.floor(i / COLS) * (TH + LABEL);
  const meta = await sharp(file).metadata();
  let img = sharp(file);
  if (far) {
    const k = Math.max(1, Math.floor(Math.min(TW / meta.width, TH / meta.height)));
    const w = meta.width * k <= TW ? meta.width * k : TW;
    const h = Math.round(meta.height * (w / meta.width));
    img = img.resize(w, Math.min(h, TH), { kernel: 'nearest', fit: 'inside' });
  } else {
    img = img.resize(TW - 6, TH - 6, { fit: 'inside' });
  }
  const buf = await img.png().toBuffer();
  const m2 = await sharp(buf).metadata();
  layers.push({ input: buf, left: x + Math.round((TW - m2.width) / 2), top: y + Math.round((TH - m2.height) / 2) });
  svg += `<text x="${x + 8}" y="${y + TH + 16}">${i + 1}. ${esc(entry.id)} ${entry.size.join('x')}</text>`;
}
svg += '</svg>';
layers.push({ input: Buffer.from(svg), left: 0, top: 0 });
await sharp({ create: { width: W, height: H, channels: 3, background: '#e9e6df' } }).composite(layers).png().toFile(out);
console.log('wrote', out, W, 'x', H);
