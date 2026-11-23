/* global process, Buffer, console */
// Cuts the owner's archer parts sheet into transparent PNG layers for Fantasy Battle.
// Usage: node tools/fantasybattle/cut-archer-parts.mjs [sheet.webp] [out-dir] [--overview overview.png]
//
// Parts are separated by alpha-connected regions (alpha >= 128, 8-connected), never by colour: the outfit is white.
// A part = every region whose centre lies in its rectangle, plus the soft fringe next to it; `clip` cuts a region
// that holds two drawings (the stacked faces, a hand and its bracer). The six faces are aligned to one canvas so an
// expression swap needs no offset. Made here, not drawn on the sheet: the closed-eye blink patch (cut from the
// eyes-closed face), the bow without its painted string (the game draws a live string) and the arrow.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { labelAlphaComponents, componentsInRect, extractComponents } from './sheetComponents.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const overviewAt = args.indexOf('--overview');
const overviewPath = overviewAt >= 0 ? args.splice(overviewAt, 2)[1] : null;
const sheetPath = args[0] || path.join(here, 'source', 'archer-parts-sheet.webp');
const outDir = args[1] || path.join(here, '..', '..', 'public', 'fantasybattle', 'archer');
const ALPHA_MIN = 128;
const PAD = 3;

// [name, rect (regions whose centre is inside), clip?, kind]
const PARTS = [
  ['portrait_long_hair', [0, 0, 180, 286], null, 'head'],
  ['hair_back', [455, 0, 605, 275], null, 'hair'],
  ['hair_top', [590, 0, 705, 124], null, 'hair'],
  ['hair_ponytail', [785, 0, 850, 235], null, 'hair'],
  ['hair_strand_a', [698, 60, 738, 190], null, 'hair'],
  ['hair_strand_b', [740, 60, 784, 225], null, 'hair'],
  ['hair_strand_c', [606, 120, 633, 245], null, 'hair'],
  ['hair_strand_d', [634, 120, 670, 245], null, 'hair'],
  ['hair_braid', [671, 105, 700, 240], null, 'hair'],
  ['neck_shoulders', [170, 184, 300, 245], null, 'body'],
  ['neck', [345, 184, 412, 235], null, 'body'],
  ['earring_a', [865, 205, 902, 295], null, 'jewellery'],
  ['earring_b', [905, 205, 950, 295], null, 'jewellery'],
  ['collar_pendant', [955, 205, 1018, 272], null, 'jewellery'],
  ['laurel_left', [728, 222, 787, 312], null, 'jewellery'],
  ['laurel_right', [800, 222, 852, 300], null, 'jewellery'],
  ['laurel_crescent', [765, 270, 815, 322], null, 'jewellery'],
  ['quiver', [958, 268, 1040, 458], null, 'weapon'],
  ['bow', [1040, 190, 1125, 640], null, 'weapon'],
  ['wolf_head', [960, 462, 1060, 630], null, 'extra'],
  ['torso_front', [262, 226, 414, 434], null, 'body'],
  ['torso_back', [415, 230, 532, 434], null, 'body'],
  ['upperarm_wrap', [538, 230, 617, 333], null, 'arm'],
  ['upperarm_band', [638, 232, 717, 316], null, 'arm'],
  ['sleeve_drape_a', [132, 244, 199, 450], null, 'arm'],
  ['sleeve_drape_b', [200, 244, 275, 450], null, 'arm'],
  ['forearm_hand_open', [532, 330, 581, 492], null, 'arm'],
  ['forearm_hand_relaxed', [610, 292, 668, 466], null, 'arm'],
  ['arm_bent', [669, 310, 774, 450], null, 'arm'],
  ['hand_curl', [780, 314, 828, 440], [780, 314, 828, 380], 'arm'],
  ['bracer_curl', [780, 314, 828, 440], [780, 373, 828, 440], 'arm'],
  ['hand_pinch', [836, 318, 888, 442], [836, 318, 888, 382], 'arm'],
  ['bracer_pinch', [836, 318, 888, 442], [836, 375, 888, 442], 'arm'],
  ['bracer_hand_open', [888, 312, 952, 440], null, 'arm'],
  ['hips_front', [254, 434, 407, 606], null, 'body'],
  ['hips_back', [408, 436, 542, 608], null, 'body'],
  ['skirt_side_long', [0, 284, 120, 750], null, 'cloth'],
  ['skirt_slit', [121, 452, 272, 750], null, 'cloth'],
  ['belt_drape', [654, 438, 772, 592], null, 'cloth'],
  ['tabard_laurel', [773, 438, 868, 690], null, 'cloth'],
  ['cape_short', [869, 446, 978, 618], null, 'cloth'],
  ['skirt_laurel', [575, 478, 650, 752], null, 'cloth'],
  ['drape_layered', [690, 590, 790, 750], null, 'cloth'],
  ['drape_side', [484, 534, 560, 750], null, 'cloth'],
  ['drape_narrow', [346, 598, 394, 752], null, 'cloth'],
  ['drape_short_a', [254, 606, 345, 750], null, 'cloth'],
  ['drape_short_b', [395, 608, 488, 752], null, 'cloth'],
  ['sandal_a', [856, 604, 927, 752], null, 'feet'],
  ['sandal_b', [928, 602, 1012, 752], null, 'feet'],
];

// The six faces: one drawing per cell of a 3x2 grid; the smiling face is the canvas the others align to.
const FACE_CELLS = [
  ['face_pout', [183, 0, 274, 91]], ['face_smile', [274, 0, 363, 91]], ['face_wink', [363, 0, 455, 91]],
  ['face_shout', [183, 92, 274, 184]], ['face_focused', [274, 92, 363, 184]], ['face_hurt', [363, 92, 455, 184]],
];
const BASE_FACE = 'face_smile';
// Small shapes laid out in grids at the top right: eyes 5x4, then mouths and blush marks.
const SMALL_GRIDS = [
  ['eye', [835, 0, 1062, 98], 5],
  ['mouth', [860, 100, 1060, 162], 4],
  ['blush', [860, 168, 1060, 198], 4],
];
// Eye centres on the base face (sheet px) for the blink patch, with ellipse radii and feather.
const EYES = [{ x: 305, y: 45 }, { x: 335.5, y: 44.5 }];
const EYE_RX = 11.5;
const EYE_RY = 7.5;
const EYE_FEATHER = 3.5;
// The painted bowstring: a thin vertical line, erased from the bow (the game draws a live string).
const BOW_STRING_ERASE = [1043, 224, 1057, 484];

const { data: rgba, info } = await sharp(sheetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const { labels, components } = labelAlphaComponents(rgba, W, H, { alphaMin: ALPHA_MIN });
fs.mkdirSync(outDir, { recursive: true });

const manifest = { source: path.basename(sheetPath), sheetSize: [W, H], alphaMin: ALPHA_MIN, parts: {} };
const used = new Map();
const pngOf = (img) => sharp(Buffer.from(img.rgba), { raw: { width: img.width, height: img.height, channels: 4 } }).png({ compressionLevel: 9 });

function clipTo(img, clip) {
  if (!clip) return img;
  const [cx0, cy0, cx1, cy1] = clip;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const sx = x + img.x0; const sy = y + img.y0;
      if (sx < cx0 || sx > cx1 || sy < cy0 || sy > cy1) img.rgba[(y * img.width + x) * 4 + 3] = 0;
    }
  }
  return trim(img);
}

// Crop away fully transparent borders, keeping PAD px.
function trim(img) {
  let x0 = img.width; let y0 = img.height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if (img.rgba[(y * img.width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return img;
  x0 = Math.max(0, x0 - PAD); y0 = Math.max(0, y0 - PAD);
  x1 = Math.min(img.width - 1, x1 + PAD); y1 = Math.min(img.height - 1, y1 + PAD);
  const w = x1 - x0 + 1; const h = y1 - y0 + 1;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) out.set(img.rgba.subarray(((y + y0) * img.width + x0) * 4, ((y + y0) * img.width + x0 + w) * 4), y * w * 4);
  return { rgba: out, width: w, height: h, x0: img.x0 + x0, y0: img.y0 + y0 };
}

function cut(name, rect, clip) {
  const ids = componentsInRect(components, rect, { minArea: 30 });
  if (!ids.length) throw new Error(`${name}: no region in ${rect}`);
  for (const id of ids) {
    if (used.has(id) && !clip) console.warn(`region ${id} is in both ${used.get(id)} and ${name}`);
    used.set(id, name);
  }
  return clipTo(extractComponents(rgba, W, H, labels, ids, components, { pad: PAD }), clip);
}

async function save(name, img, kind, extra = {}) {
  await pngOf(img).toFile(path.join(outDir, `${name}.png`));
  manifest.parts[name] = { kind, origin: [img.x0, img.y0], size: [img.width, img.height], ...extra };
}

for (const [name, rect, clip, kind] of PARTS) {
  const img = cut(name, rect, clip);
  if (name === 'bow') eraseRect(img, BOW_STRING_ERASE);
  await save(name, img, kind);
}

// Faces: align each to the base face by the shift with the least colour difference, then cut on the base canvas.
const faceImgs = Object.fromEntries(FACE_CELLS.map(([name, cell]) => [name, cut(name, [cell[0], 0, cell[2], 184], cell)]));
const base = faceImgs[BASE_FACE];
const faceOffsets = {};
for (const [name, cell] of FACE_CELLS) {
  const baseCell = FACE_CELLS.find(([n]) => n === BASE_FACE)[1];
  const grid = [cell[0] - baseCell[0], cell[1] - baseCell[1]];
  const best = alignTo(base, faceImgs[name], grid);
  faceOffsets[name] = best;
  const canvas = { rgba: new Uint8Array(base.width * base.height * 4), width: base.width, height: base.height, x0: base.x0, y0: base.y0 };
  const src = faceImgs[name];
  for (let y = 0; y < base.height; y += 1) {
    for (let x = 0; x < base.width; x += 1) {
      const sx = x + base.x0 + best[0] - src.x0; const sy = y + base.y0 + best[1] - src.y0;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      canvas.rgba.set(src.rgba.subarray((sy * src.width + sx) * 4, (sy * src.width + sx) * 4 + 4), (y * base.width + x) * 4);
    }
  }
  await save(name, canvas, 'face', { alignedTo: BASE_FACE, sheetShift: best });
  faceImgs[name].aligned = canvas;
}

// Blink patch: the closed eyes of the hurt face, in soft ellipses, on the face canvas.
{
  const src = faceImgs.face_hurt.aligned;
  const patch = { rgba: new Uint8Array(src.rgba.length), width: src.width, height: src.height, x0: src.x0, y0: src.y0 };
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) {
      let a = 0;
      for (const eye of EYES) {
        const dx = (x + src.x0 - eye.x) / EYE_RX; const dy = (y + src.y0 - eye.y) / EYE_RY;
        const d = Math.sqrt(dx * dx + dy * dy);
        const edge = EYE_FEATHER / Math.min(EYE_RX, EYE_RY);
        a = Math.max(a, d <= 1 - edge ? 1 : d >= 1 ? 0 : (1 - d) / edge);
      }
      const i = (y * src.width + x) * 4;
      patch.rgba[i] = src.rgba[i]; patch.rgba[i + 1] = src.rgba[i + 1]; patch.rgba[i + 2] = src.rgba[i + 2];
      patch.rgba[i + 3] = Math.round(src.rgba[i + 3] * a);
    }
  }
  await save('face_eyes_closed', patch, 'face', { alignedTo: BASE_FACE, madeFrom: 'face_hurt' });
}

// Eyes, mouths and blush marks, numbered by grid position (row, column).
for (const [prefix, rect, cols] of SMALL_GRIDS) {
  const ids = componentsInRect(components, rect, { minArea: 30 }).sort((a, b) => components[a].cy - components[b].cy || components[a].cx - components[b].cx);
  const colW = (rect[2] - rect[0]) / cols;
  let row = 0; let lastY = -1e9;
  const seen = new Set();
  for (const id of ids) {
    const c = components[id];
    if (c.cy - lastY > 9) { row += 1; lastY = c.cy; }
    const col = Math.min(cols, Math.floor((c.cx - rect[0]) / colW) + 1);
    let name = `${prefix}_${row}_${col}`;
    while (seen.has(name)) name += 'b';
    seen.add(name);
    used.set(id, name);
    await save(name, extractComponents(rgba, W, H, labels, [id], components, { pad: PAD }), prefix === 'eye' ? 'face-shape' : 'face-shape');
  }
}

// The arrow: not on the sheet, drawn here in the sheet's palette (gold head, white fletching).
{
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="168" height="18">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#d9a640"/><stop offset="1" stop-color="#8a5a17"/></linearGradient>
  <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3e6cf"/><stop offset="1" stop-color="#b79a74"/></linearGradient></defs>
  <rect x="14" y="7.6" width="134" height="2.8" rx="1.2" fill="url(#s)" stroke="#6e5638" stroke-width=".5"/>
  <path d="M146 3.5 L166 9 L146 14.5 L150 9 Z" fill="url(#g)" stroke="#6b4511" stroke-width=".7"/>
  <path d="M4 2.5 Q18 5 34 8.2 L34 9 L8 8.4 Z" fill="#fbf8f2" stroke="#c9b48f" stroke-width=".6"/>
  <path d="M4 15.5 Q18 13 34 9.8 L34 9 L8 9.6 Z" fill="#efe9de" stroke="#c9b48f" stroke-width=".6"/>
  <rect x="30" y="7" width="4" height="4" fill="#d9a640"/><rect x="142" y="7.2" width="4" height="3.6" fill="#d9a640"/>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, 'arrow.png'));
  manifest.parts.arrow = { kind: 'weapon', origin: [0, 0], size: [168, 18], procedural: true };
}

const leftovers = components.filter((c) => c.area >= 30 && !used.has(c.id));
if (leftovers.length) console.warn('unassigned regions:', leftovers.map((c) => `${c.id}@${Math.round(c.cx)},${Math.round(c.cy)} (${c.area})`).join(' '));
manifest.faceShifts = faceOffsets;
fs.writeFileSync(path.join(outDir, 'parts.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`${Object.keys(manifest.parts).length} layers -> ${outDir}`);

if (overviewPath) {
  const names = Object.keys(manifest.parts);
  const cell = 120; const cols = 12; const rows = Math.ceil(names.length / cols);
  const tiles = [];
  for (let i = 0; i < names.length; i += 1) {
    const buf = await sharp(path.join(outDir, `${names[i]}.png`)).resize(cell - 8, cell - 22, { fit: 'inside' }).png().toBuffer();
    tiles.push({ input: buf, left: (i % cols) * cell + 4, top: Math.floor(i / cols) * cell + 4 });
    tiles.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="14"><text x="2" y="11" font-size="10" font-family="Arial">${names[i]}</text></svg>`), left: (i % cols) * cell, top: Math.floor(i / cols) * cell + cell - 15 });
  }
  await sharp({ create: { width: cols * cell, height: rows * cell, channels: 4, background: '#8d99a6' } }).composite(tiles).png().toFile(overviewPath);
}

function eraseRect(img, [x0, y0, x1, y1]) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const lx = x - img.x0; const ly = y - img.y0;
      if (lx >= 0 && ly >= 0 && lx < img.width && ly < img.height) img.rgba[(ly * img.width + lx) * 4 + 3] = 0;
    }
  }
}

// Shift (sheet px) of `img` relative to its grid cell that best matches `ref` (least alpha-weighted colour difference).
function alignTo(ref, img, grid) {
  let best = [grid[0], grid[1]]; let bestScore = Infinity;
  for (let dy = -6; dy <= 6; dy += 1) {
    for (let dx = -6; dx <= 6; dx += 1) {
      let sum = 0; let weight = 0;
      for (let y = 0; y < ref.height; y += 2) {
        for (let x = 0; x < ref.width; x += 2) {
          const sx = x + ref.x0 + grid[0] + dx - img.x0; const sy = y + ref.y0 + grid[1] + dy - img.y0;
          const ri = (y * ref.width + x) * 4;
          const ra = ref.rgba[ri + 3];
          const ia = (sx >= 0 && sy >= 0 && sx < img.width && sy < img.height) ? (sy * img.width + sx) * 4 : -1;
          const aa = ia >= 0 ? img.rgba[ia + 3] : 0;
          if (ra === 0 && aa === 0) continue;
          const w = Math.max(ra, aa) / 255;
          let d = Math.abs(ra - aa) * 1.5;
          if (ia >= 0) d += Math.abs(ref.rgba[ri] - img.rgba[ia]) + Math.abs(ref.rgba[ri + 1] - img.rgba[ia + 1]) + Math.abs(ref.rgba[ri + 2] - img.rgba[ia + 2]);
          sum += d * w; weight += w;
        }
      }
      const score = sum / Math.max(1, weight);
      if (score < bestScore) { bestScore = score; best = [grid[0] + dx, grid[1] + dy]; }
    }
  }
  return best;
}
