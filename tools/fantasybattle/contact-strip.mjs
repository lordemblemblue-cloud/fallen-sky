/* global process */
// Puts preview PNGs side by side: node tools/fantasybattle/contact-strip.mjs <dir> <out.png> name1 name2 ...
import sharp from 'sharp';

const [dir, out, ...names] = process.argv.slice(2);
const w = 336;
const h = 390;
const tiles = await Promise.all(names.map(async (n, i) => ({ input: await sharp(`${dir}/${n}.png`).resize(w, h).png().toBuffer(), left: i * w, top: 0 })));
await sharp({ create: { width: w * names.length, height: h, channels: 4, background: '#888888' } }).composite(tiles).png().toFile(out);
