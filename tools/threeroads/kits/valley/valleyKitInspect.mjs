// Reads the valley kit GLB and checks it against the piece table
// (src/components/game3d/threeroads/kits/valleyKitPieces.mjs). Pure: takes the
// file's bytes, returns rows and failures. Used by check_valley_kit.mjs and by
// tests/game3d-three-roads-valley-kit.test.mjs.
import { VALLEY_KIT_PIECES, VALLEY_KIT_LIMITS } from '../../../../src/components/game3d/threeroads/kits/valleyKitPieces.mjs';

export const SIZE_TOLERANCE = 0.05; // the table's 5 percent
export const LIT_MATERIAL = 'valley_lit';
export const GLOW_MATERIAL = 'valley_glow';

export function parseGlb(bytes) {
  const buf = Buffer.from(bytes.buffer ? bytes.buffer : bytes, bytes.byteOffset || 0, bytes.byteLength);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB file');
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const body = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString('utf8'));
    else if (type === 0x004e4942) bin = body;
    offset += 8 + length;
  }
  return { json, bin };
}

// Width and height of a WebP, PNG or JPEG held in a buffer.
export function imageSize(b) {
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), mime: 'image/webp' };
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, mime: 'image/webp' };
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff), mime: 'image/webp' };
    }
  }
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), mime: 'image/png' };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc2) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5), mime: 'image/jpeg' };
      i += 2 + len;
    }
  }
  return null;
}

function expectedVertical(entry) {
  const h = entry.size[2];
  switch (entry.pivot) {
    case 'top': return { minY: -h, maxY: 0 };
    case 'hub': return { minY: -h / 2, maxY: h / 2 };
    case 'wagon':
    case 'basket': return { minY: 1.2, maxY: 1.2 + h };
    default: return { minY: 0, maxY: h };
  }
}

export function inspectValleyKit(bytes) {
  const fileBytes = bytes.byteLength;
  const { json } = parseGlb(bytes);
  const failures = [];
  const materials = (json.materials || []).map(m => m.name);
  const meshByName = new Map();
  for (const node of json.nodes || []) {
    if (node.mesh === undefined) continue;
    const moved = (node.translation && node.translation.some(v => Math.abs(v) > 1e-6))
      || (node.rotation && (Math.abs(node.rotation[3] - 1) > 1e-6))
      || (node.scale && node.scale.some(v => Math.abs(v - 1) > 1e-6));
    const mesh = json.meshes[node.mesh];
    let triangles = 0;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    const mats = new Set();
    for (const prim of mesh.primitives) {
      const pos = json.accessors[prim.attributes.POSITION];
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos.min[k]); hi[k] = Math.max(hi[k], pos.max[k]); }
      const mode = prim.mode === undefined ? 4 : prim.mode;
      if (mode !== 4) failures.push(`${node.name}: primitive mode ${mode} is not triangles`);
      triangles += (prim.indices !== undefined ? json.accessors[prim.indices].count : pos.count) / 3;
      mats.add(prim.material !== undefined ? json.materials[prim.material].name : '(none)');
      if (!prim.attributes.TEXCOORD_0) failures.push(`${node.name}: no texture coordinates`);
    }
    meshByName.set(node.name, { name: node.name, moved, triangles, lo, hi, materials: [...mats] });
  }

  const rows = [];
  const totals = { lod0: 0, lod1: 0 };
  const expectedNames = new Set();
  for (const entry of VALLEY_KIT_PIECES) {
    for (const lod of [0, 1]) {
      const name = `${entry.id}_LOD${lod}`;
      expectedNames.add(name);
      const m = meshByName.get(name);
      if (!m) { failures.push(`${name}: missing`); continue; }
      const [w, d, h] = entry.size;
      const size = [m.hi[0] - m.lo[0], m.hi[2] - m.lo[2], m.hi[1] - m.lo[1]];
      const ratio = size.map((s, k) => s / entry.size[k]);
      const centre = [(m.hi[0] + m.lo[0]) / 2, (m.hi[2] + m.lo[2]) / 2];
      const vert = expectedVertical(entry);
      const row = {
        name, id: entry.id, lod, triangles: m.triangles, size, want: [w, d, h], ratio, centre,
        minY: m.lo[1], maxY: m.hi[1], pivot: entry.pivot, materials: m.materials,
      };
      rows.push(row);
      totals[`lod${lod}`] += m.triangles;
      ratio.forEach((r, k) => {
        if (Math.abs(r - 1) > SIZE_TOLERANCE + 1e-6) failures.push(`${name}: ${'xzy'[k]} size ${size[k].toFixed(3)} m, table ${entry.size[k]} m`);
      });
      const tolXZ = [0.02 * w + 0.01, 0.02 * d + 0.01];
      if (Math.abs(centre[0]) > tolXZ[0] || Math.abs(centre[1]) > tolXZ[1]) {
        failures.push(`${name}: footprint centre at (${centre[0].toFixed(3)}, ${centre[1].toFixed(3)}), not on the pivot`);
      }
      const tolY = 0.02 * h + 0.01;
      if (Math.abs(m.lo[1] - vert.minY) > tolY || Math.abs(m.hi[1] - vert.maxY) > tolY) {
        failures.push(`${name}: spans y ${m.lo[1].toFixed(3)}..${m.hi[1].toFixed(3)}, pivot '${entry.pivot}' wants ${vert.minY}..${vert.maxY}`);
      }
      if (m.moved) failures.push(`${name}: node is moved, rotated or scaled; the pivot must be in the mesh`);
      const wantMat = entry.material === 'glow' ? GLOW_MATERIAL : LIT_MATERIAL;
      if (m.materials.length !== 1 || m.materials[0] !== wantMat) failures.push(`${name}: material ${m.materials.join('+')}, wants ${wantMat}`);
      const limit = lod === 0 ? VALLEY_KIT_LIMITS.maxTrianglesLod0PerPiece : VALLEY_KIT_LIMITS.maxTrianglesLod1PerPiece;
      if (m.triangles > limit) failures.push(`${name}: ${m.triangles} triangles, limit ${limit}`);
    }
  }
  for (const name of meshByName.keys()) {
    if (!expectedNames.has(name)) failures.push(`${name}: not in the piece table (misnamed or extra)`);
  }
  if (VALLEY_KIT_PIECES.length > VALLEY_KIT_LIMITS.maxPieces) failures.push(`${VALLEY_KIT_PIECES.length} pieces, limit ${VALLEY_KIT_LIMITS.maxPieces}`);
  if (totals.lod0 > VALLEY_KIT_LIMITS.maxTrianglesLod0Total) failures.push(`LOD0 total ${totals.lod0} triangles, limit ${VALLEY_KIT_LIMITS.maxTrianglesLod0Total}`);
  if (fileBytes > VALLEY_KIT_LIMITS.maxBytes) failures.push(`file ${fileBytes} bytes, limit ${VALLEY_KIT_LIMITS.maxBytes}`);
  const extra = materials.filter(n => n !== LIT_MATERIAL && n !== GLOW_MATERIAL);
  if (extra.length) failures.push(`extra materials: ${extra.join(', ')}`);

  const { bin } = parseGlb(bytes);
  const images = (json.images || []).map(img => {
    const view = json.bufferViews[img.bufferView];
    const data = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    return { name: img.name, mimeType: img.mimeType, bytes: view.byteLength, ...(imageSize(data) || {}) };
  });
  if (images.length !== 1) failures.push(`${images.length} images in the file, wants one atlas`);
  for (const img of images) {
    if (img.width !== VALLEY_KIT_LIMITS.atlasPixels || img.height !== VALLEY_KIT_LIMITS.atlasPixels) {
      failures.push(`image ${img.name} is ${img.width}x${img.height}, wants ${VALLEY_KIT_LIMITS.atlasPixels}`);
    }
  }
  return { rows, totals, fileBytes, materials, images, failures };
}
