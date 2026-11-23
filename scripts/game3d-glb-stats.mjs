#!/usr/bin/env node
// Counts what a GLB costs to draw and download: triangles, draw calls (mesh primitives), materials, textures with
// their pixel sizes, and file size. Pure parsing of the GLB container: no three.js, no decoding of geometry.
// Used by tests/game3d-low-poly-world-budgets.test.mjs and docs/GAME3D_LOW_POLY_20261122.md.
//
//   node scripts/game3d-glb-stats.mjs public/game3d/elm-owner-optimized.glb [more.glb ...]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/** Pixel size of a PNG, JPEG or WebP image from its first bytes; null when unknown. */
export function imageSize(bytes) {
  if (!bytes || bytes.length < 24) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20), format: 'png' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8], format: 'jpeg' };
      }
      i += 2 + length;
    }
    return null;
  }
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45) {
    const kind = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (kind === 'VP8X') return { width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)), format: 'webp' };
    if (kind === 'VP8L') {
      const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)), format: 'webp' };
    }
    if (kind === 'VP8 ') return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff, format: 'webp' };
  }
  return null;
}

/** Parse a GLB buffer into { json, bin }. */
export function readGlb(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a GLB file');
  let offset = 12; let json = null; let bin = null;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (type === CHUNK_BIN) bin = chunk;
    offset += 8 + length;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin };
}

function primitiveTriangles(json, primitive) {
  const mode = primitive.mode ?? 4;
  if (mode !== 4) return 0; // points / lines / strips are not used by the world models
  const count = primitive.indices != null ? json.accessors[primitive.indices].count
    : json.accessors[primitive.attributes.POSITION].count;
  return Math.floor(count / 3);
}

/**
 * @returns {{bytes, meshes, nodesWithMesh, drawCalls, triangles, vertices, materials, textures: Array<{name,width,height,bytes,format}>,
 *   textureMegapixels, perMesh: Array<{name, primitives, triangles}>}}
 */
export function glbStats(buffer) {
  const { json, bin } = readGlb(buffer);
  const perMesh = (json.meshes || []).map((mesh) => ({
    name: mesh.name || '',
    primitives: mesh.primitives.length,
    triangles: mesh.primitives.reduce((a, p) => a + primitiveTriangles(json, p), 0),
    vertices: mesh.primitives.reduce((a, p) => a + (json.accessors[p.attributes.POSITION]?.count ?? 0), 0),
  }));
  // a mesh drawn by several nodes is drawn several times
  const uses = new Map();
  for (const node of json.nodes || []) if (node.mesh != null) uses.set(node.mesh, (uses.get(node.mesh) || 0) + 1);
  let drawCalls = 0; let triangles = 0; let vertices = 0;
  perMesh.forEach((m, i) => { const n = uses.get(i) || 0; drawCalls += n * m.primitives; triangles += n * m.triangles; vertices += n * m.vertices; });
  const textures = (json.images || []).map((image, i) => {
    let size = null; let byteLength = 0;
    if (image.bufferView != null && bin) {
      const bv = json.bufferViews[image.bufferView];
      const slice = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
      size = imageSize(slice); byteLength = bv.byteLength;
    }
    return { name: image.name || `image${i}`, width: size?.width ?? 0, height: size?.height ?? 0, format: size?.format ?? image.mimeType ?? '', bytes: byteLength };
  });
  return {
    bytes: buffer.byteLength ?? buffer.length,
    meshes: perMesh.length,
    nodesWithMesh: [...uses.values()].reduce((a, b) => a + b, 0),
    drawCalls, triangles, vertices,
    materials: (json.materials || []).length,
    textures,
    textureMegapixels: Math.round(textures.reduce((a, t) => a + t.width * t.height, 0) / 1e4) / 100,
    perMesh,
  };
}

export function glbStatsFile(file) {
  return glbStats(fs.readFileSync(file));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  for (const file of process.argv.slice(2)) {
    const s = glbStatsFile(file);
    console.log(`${file}: ${(s.bytes / 1048576).toFixed(2)} MB, ${s.triangles} triangles, ${s.vertices} vertices, ${s.drawCalls} draw calls, ` +
      `${s.materials} materials, textures ${s.textures.map((t) => `${t.width}x${t.height} ${t.format} ${(t.bytes / 1024).toFixed(0)} KB`).join(', ') || 'none'}`);
    for (const m of s.perMesh) console.log(`  mesh ${m.name}: ${m.primitives} primitives, ${m.triangles} triangles, ${m.vertices} vertices`);
  }
}
