/* global process, Buffer, console */
// Lists the alpha-connected regions of a parts sheet and writes an overview image with each region's box and id.
// Usage: node tools/fantasybattle/analyze-sheet.mjs <sheet.webp> <out-dir> [minArea]
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { labelAlphaComponents } from './sheetComponents.mjs';

const [sheetPath, outDir, minAreaArg, alphaArg] = process.argv.slice(2);
const minArea = Number(minAreaArg || 40);
const { data, info } = await sharp(sheetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { components } = labelAlphaComponents(data, info.width, info.height, { alphaMin: Number(alphaArg || 16) });
const big = components.filter((c) => c.area >= minArea);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'components.json'), JSON.stringify(big.map((c) => ({
  id: c.id, area: c.area, box: [c.x0, c.y0, c.x1, c.y1], c: [Math.round(c.cx), Math.round(c.cy)],
})), null, 0).replace(/},/g, '},\n'));
const scale = 2;
const rects = big.map((c) => `<rect x="${c.x0 * scale}" y="${c.y0 * scale}" width="${(c.x1 - c.x0 + 1) * scale}" height="${(c.y1 - c.y0 + 1) * scale}" fill="none" stroke="#e0218a" stroke-width="1.5"/>`
  + `<text x="${c.x0 * scale + 2}" y="${c.y0 * scale + 14}" font-size="14" font-family="Arial" font-weight="bold" fill="#0050ff" stroke="#fff" stroke-width="0.6">${c.id}</text>`).join('');
const W = info.width * scale; const H = info.height * scale;
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${rects}</svg>`);
await sharp(sheetPath).resize(W, H).flatten({ background: '#b9c4cf' }).composite([{ input: svg }]).png().toFile(path.join(outDir, 'overview.png'));
console.log(`${components.length} regions, ${big.length} with area >= ${minArea}`);
