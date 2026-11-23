#!/usr/bin/env node
// Rewrites the embedded textures of a GLB: textures larger than --max pixels on a side are scaled down, and PNG or
// JPEG images are re-encoded as WebP (EXT_texture_webp, which three.js's GLTFLoader reads) when that is smaller.
// Geometry, nodes, materials and animations are copied byte for byte.
//
//   node scripts/game3d-glb-textures.mjs in.glb out.glb [--max 1024] [--webp] [--quality 82]
import fs from 'node:fs';
import sharp from 'sharp';
import { readGlb } from './game3d-glb-stats.mjs';

const align4 = (n) => (n + 3) & ~3;

/** Build a GLB from a glTF JSON object and its BIN chunk. */
export function writeGlb(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc(align4(jsonBytes.length) - jsonBytes.length, 0x20)]);
  const binPadded = Buffer.concat([bin, Buffer.alloc(align4(bin.length) - bin.length, 0)]);
  const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonPadded.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binPadded.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonPadded, binHeader, binPadded]);
}

/**
 * @param {Buffer} input GLB bytes
 * @param {{max?: number, webp?: boolean, quality?: number}} options
 * @returns {Promise<{glb: Buffer, images: Array<{name, from, to}>}>}
 */
export async function rewriteGlbTextures(input, { max = 1024, webp = false, quality = 82 } = {}) {
  const { json, bin } = readGlb(input);
  const views = json.bufferViews.map((bv) => Buffer.from(bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)));
  const report = [];
  const webpImages = new Set();
  for (const [index, image] of (json.images || []).entries()) {
    if (image.bufferView == null) continue;
    const bytes = views[image.bufferView];
    const meta = await sharp(bytes).metadata();
    const scale = Math.min(1, max / Math.max(meta.width, meta.height));
    let pipeline = sharp(bytes);
    if (scale < 1) pipeline = pipeline.resize(Math.round(meta.width * scale), Math.round(meta.height * scale), { kernel: 'lanczos3' });
    let out; let mime = image.mimeType;
    if (webp) {
      out = await pipeline.clone().webp({ quality, alphaQuality: 90, effort: 6 }).toBuffer();
      mime = 'image/webp';
    } else if (image.mimeType === 'image/png') {
      out = await pipeline.clone().png({ compressionLevel: 9, palette: false }).toBuffer();
    } else {
      out = await pipeline.clone().jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    }
    if (!webp && scale >= 1 && out.length >= bytes.length) { report.push({ name: image.name || `image${index}`, from: `${meta.width}x${meta.height} ${bytes.length}`, to: 'kept' }); continue; }
    views[image.bufferView] = out;
    if (mime !== image.mimeType) { image.mimeType = mime; webpImages.add(index); }
    report.push({ name: image.name || `image${index}`, from: `${meta.width}x${meta.height} ${meta.format} ${bytes.length}`,
      to: `${Math.round(meta.width * scale)}x${Math.round(meta.height * scale)} ${mime} ${out.length}` });
  }
  if (webpImages.size) {
    for (const texture of json.textures || []) {
      if (!webpImages.has(texture.source)) continue;
      texture.extensions = { ...(texture.extensions || {}), EXT_texture_webp: { source: texture.source } };
      // keep `source` too: EXT_texture_webp is listed as used, not required, so the WebP stays the image to load
    }
    json.extensionsUsed = [...new Set([...(json.extensionsUsed || []), 'EXT_texture_webp'])];
  }
  // repack the BIN chunk with every bufferView 4-byte aligned
  const parts = []; let offset = 0;
  json.bufferViews.forEach((bv, i) => {
    const data = views[i];
    bv.byteOffset = offset; bv.byteLength = data.length;
    parts.push(data);
    const pad = align4(data.length) - data.length;
    if (pad) parts.push(Buffer.alloc(pad, 0));
    offset += data.length + pad;
  });
  const newBin = Buffer.concat(parts);
  json.buffers = [{ ...(json.buffers?.[0] || {}), byteLength: newBin.length }];
  delete json.buffers[0].uri;
  return { glb: writeGlb(json, newBin), images: report };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const [input, output] = process.argv.slice(2);
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? Number(process.argv[i + 1]) : fallback; };
  const { glb, images } = await rewriteGlbTextures(fs.readFileSync(input), { max: arg('max', 1024), webp: process.argv.includes('--webp'), quality: arg('quality', 82) });
  fs.writeFileSync(output, glb);
  for (const r of images) console.log(`${r.name}: ${r.from} -> ${r.to}`);
  console.log(`${input} ${fs.statSync(input).size} -> ${output} ${glb.length} bytes`);
}
