// Builds the Fantasy Battle hub tile and backdrop (public/hub/fantasy-battle-*.webp)
// from the owner's archer parts sheet (1125x750 WebP, transparent background):
// the laureled head and the upper half of the bow over a dusk gradient.
// A stand-in until the Fantasy Battle game has its own key art.
// usage: node tools/games-hub/make-fantasy-battle-hub-art.cjs <archer-parts-sheet.webp> public/hub
/* global process, console, Buffer */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const SHEET = process.argv[2];
const OUT = process.argv[3];
if (!SHEET || !OUT) {
  console.error('usage: node make-fantasy-battle-hub-art.cjs <archer-parts-sheet.webp> <outDir>');
  process.exit(1);
}

// Sheet regions (1125x750, transparent background).
const HEAD = { left: 0, top: 0, width: 183, height: 292 };
const BOW = { left: 1008, top: 186, width: 117, height: 286 };

async function place(input, left, top, cw, ch) {
  const m = await sharp(input).metadata();
  const x0 = Math.max(0, left), y0 = Math.max(0, top);
  const x1 = Math.min(cw, left + m.width), y1 = Math.min(ch, top + m.height);
  const cut = await sharp(input).extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 }).png().toBuffer();
  return { input: cut, left: x0, top: y0 };
}

let bowCache = null;
// Upper half of the bow (tip to grip, with its string). Below y=471 the wolf head
// and quiver crowd it, so the crop ends there and the layout hides that edge.
async function bowOnly() {
  if (bowCache) return bowCache;
  const { data, info } = await sharp(SHEET).extract(BOW).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < info.height; y++) {
    const minX = BOW.top + y < 214 ? BOW.width : (BOW.top + y < 250 ? 1016 : 1040) - BOW.left;
    for (let x = 0; x < Math.max(0, minX); x++) data[(y * info.width + x) * 4 + 3] = 0;
  }
  bowCache = await sharp(data, { raw: info }).png().toBuffer();
  return bowCache;
}

async function headPortrait() {
  // The head crop also catches the corner of the neck/shoulder pieces next to it:
  // clear everything right of x=163 below y=186 before using it.
  const { data, info } = await sharp(SHEET).extract(HEAD).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 186; y < info.height; y++) {
    for (let x = 160; x < info.width; x++) data[(y * info.width + x) * 4 + 3] = 0;
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

function backgroundSvg(w, h, glow) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d0b22"/>
      <stop offset="0.55" stop-color="#26163d"/>
      <stop offset="1" stop-color="#4a2a2c"/>
    </linearGradient>
    <radialGradient id="glow" cx="${glow.cx}" cy="${glow.cy}" r="${glow.r}">
      <stop offset="0" stop-color="#f6d58a" stop-opacity="0.85"/>
      <stop offset="0.35" stop-color="#d79a4a" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#d79a4a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="moon" cx="${glow.mx}" cy="${glow.my}" r="${glow.mr}">
      <stop offset="0" stop-color="#e9e4ff" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#e9e4ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  <rect width="${w}" height="${h}" fill="url(#moon)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
</svg>`);
}

async function tile() {
  const size = 384;
  const head = await sharp(await headPortrait()).resize({ height: 452 }).png().toBuffer();
  const bow = await sharp(await bowOnly()).resize({ height: 470 })
    .rotate(-16, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const bowMeta = await sharp(bow).metadata();
  const bowFaded = await sharp(bow).composite([{
    input: Buffer.from([0, 0, 0, 140]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'dest-in',
  }]).png().toBuffer();
  await sharp(backgroundSvg(size, size, { cx: '0.55', cy: '0.32', r: '0.62', mx: '0.15', my: '0.1', mr: '0.5' }))
    .composite([
      await place(bowFaded, Math.round(size - bowMeta.width * 0.86), -18, size, size),
      await place(head, -46, 22, size, size),
    ])
    .webp({ quality: 82, effort: 6 })
    .toFile(path.join(OUT, 'fantasy-battle-tile.webp'));
}

async function backdrop() {
  const w = 1280, h = 720;
  const head = await sharp(await headPortrait()).resize({ height: 860, kernel: 'lanczos3' }).blur(0.9).png().toBuffer();
  const headMeta = await sharp(head).metadata();
  const bow = await sharp(await bowOnly()).resize({ height: 860 })
    .rotate(-14, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).blur(1.2).png().toBuffer();
  const bowMeta = await sharp(bow).metadata();
  const bowFaded = await sharp(bow).composite([{
    input: Buffer.from([0, 0, 0, 120]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'dest-in',
  }]).png().toBuffer();
  await sharp(backgroundSvg(w, h, { cx: '0.74', cy: '0.3', r: '0.5', mx: '0.2', my: '0.05', mr: '0.45' }))
    .composite([
      await place(bowFaded, Math.round(w - bowMeta.width * 0.92), -30, w, h),
      await place(head, Math.round(w * 0.6 - headMeta.width * 0.3), 8, w, h),
    ])
    .webp({ quality: 72, effort: 6 })
    .toFile(path.join(OUT, 'fantasy-battle-backdrop.webp'));
}

(async () => {
  await tile();
  await backdrop();
  for (const f of ['fantasy-battle-tile.webp', 'fantasy-battle-backdrop.webp']) {
    const m = await sharp(path.join(OUT, f)).metadata();
    console.log(f, m.width, m.height, fs.statSync(path.join(OUT, f)).size, 'bytes');
  }
})().catch((e) => { console.error(e); process.exit(1); });
