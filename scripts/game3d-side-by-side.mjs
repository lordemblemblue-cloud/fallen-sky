#!/usr/bin/env node
// Joins two folders of same-named pictures side by side (left: first folder, right: second) with a caption bar.
//   node scripts/game3d-side-by-side.mjs <left-dir> <right-dir> <out-dir> "<left label>" "<right label>"
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [left, right, out, leftLabel = 'before', rightLabel = 'after'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const label = (text, width) => Buffer.from(`<svg width="${width}" height="34" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101418"/><text x="12" y="23" font-family="Segoe UI, Arial" font-size="18" fill="#f2f2f2">${text}</text></svg>`);
for (const name of fs.readdirSync(left).filter((f) => /\.(jpe?g|png)$/i.test(f))) {
  const b = path.join(right, name);
  if (!fs.existsSync(b)) continue;
  const meta = await sharp(path.join(left, name)).metadata();
  const w = meta.width; const h = meta.height;
  const canvas = sharp({ create: { width: w * 2 + 8, height: h + 34, channels: 3, background: '#101418' } });
  const file = path.join(out, name.replace(/\.(png|jpe?g)$/i, '.jpg'));
  await canvas.composite([
    { input: label(`${leftLabel} - ${name.replace(/\.(png|jpe?g)$/i, '')}`, w), left: 0, top: 0 },
    { input: label(rightLabel, w), left: w + 8, top: 0 },
    { input: path.join(left, name), left: 0, top: 34 },
    { input: b, left: w + 8, top: 34 },
  ]).jpeg({ quality: 84, mozjpeg: true }).toFile(file);
  console.log('wrote', file);
}
