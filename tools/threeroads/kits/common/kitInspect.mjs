/* global Buffer */
// Reads a Three Roads kit GLB and checks it against its piece table
// (valleyKitPieces.mjs or empireKitPieces.mjs). Pure: takes the file's bytes,
// returns rows and failures. Used by check_kit.mjs and the kit tests.
import { VALLEY_KIT_PIECES, VALLEY_KIT_LIMITS, VALLEY_KIT_URL } from '../../../../src/components/game3d/threeroads/kits/valleyKitPieces.mjs';
import { EMPIRE_KITS, EMPIRE_KIT_LIMITS } from '../../../../src/components/game3d/threeroads/kits/empireKitPieces.mjs';

export const SIZE_TOLERANCE = 0.05; // the tables' 5 percent
export const FRAME_REACH = 6; // pivot 'frame': the piece reaches this far beyond its footprint toward +Z
export const MAX_DRAFT = 1.5; // pivot 'waterline': hull allowed below the water
// Pieces that sit on another piece start at this height (the tables' comments).
export const PIVOT_LIFT = Object.freeze({ wagon: 1.2, basket: 1.2, bowl: 1.1, brazier: 1.1, kettle: 0 });

export const KITS = Object.freeze({
  valley: { id: 'valley', url: VALLEY_KIT_URL, pieces: VALLEY_KIT_PIECES, limits: VALLEY_KIT_LIMITS },
  ...Object.fromEntries(Object.values(EMPIRE_KITS).map(kit => [kit.id, { id: kit.id, url: kit.url, pieces: kit.pieces, limits: EMPIRE_KIT_LIMITS }])),
});
export const kitMaterials = kit => ({ lit: `${kit}_lit`, glow: `${kit}_glow` });

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

// Where a piece's mesh must lie: [lo, hi] per axis (x, y, z), from its table row.
export function expectedBox(entry) {
  const [w, d, h] = entry.size;
  const skirt = entry.skirt || 0;
  const x = [-w / 2, w / 2];
  const z = entry.pivot === 'frame' ? [-d / 2, d / 2 + FRAME_REACH] : [-d / 2, d / 2];
  let y;
  switch (entry.pivot) {
    case 'top': y = [-h, 0]; break;
    case 'hub':
    case 'centre': y = [-h / 2, h / 2]; break;
    case 'waterline': y = [null, h]; break; // the hull's draft below the water is the modeller's
    default: {
      const lift = PIVOT_LIFT[entry.pivot];
      y = lift !== undefined ? [lift, lift + h] : [-skirt, h];
    }
  }
  return { x, y, z };
}

export function inspectKit(bytes, kitId) {
  const kit = KITS[kitId];
  if (!kit) throw new Error(`unknown kit ${kitId}`);
  const { pieces, limits } = kit;
  const mats = kitMaterials(kitId);
  const fileBytes = bytes.byteLength;
  const { json, bin } = parseGlb(bytes);
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
    const used = new Set();
    for (const prim of mesh.primitives) {
      const pos = json.accessors[prim.attributes.POSITION];
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos.min[k]); hi[k] = Math.max(hi[k], pos.max[k]); }
      const mode = prim.mode === undefined ? 4 : prim.mode;
      if (mode !== 4) failures.push(`${node.name}: primitive mode ${mode} is not triangles`);
      triangles += (prim.indices !== undefined ? json.accessors[prim.indices].count : pos.count) / 3;
      used.add(prim.material !== undefined ? json.materials[prim.material].name : '(none)');
      if (!prim.attributes.TEXCOORD_0) failures.push(`${node.name}: no texture coordinates`);
    }
    meshByName.set(node.name, { name: node.name, moved, triangles, lo, hi, materials: [...used] });
  }

  const rows = [];
  const totals = { lod0: 0, lod1: 0 };
  const expectedNames = new Set();
  for (const entry of pieces) {
    const box = expectedBox(entry);
    for (const lod of [0, 1]) {
      const name = `${entry.id}_LOD${lod}`;
      expectedNames.add(name);
      const m = meshByName.get(name);
      if (!m) { failures.push(`${name}: missing`); continue; }
      // axis order of the tables: x, z (depth), y (height)
      const axes = [['x', 0, box.x], ['z', 2, box.z], ['y', 1, box.y]];
      const size = axes.map(([, k]) => m.hi[k] - m.lo[k]);
      const want = axes.map(([, , r]) => (r[0] === null ? r[1] : r[1] - r[0]));
      const row = {
        name, id: entry.id, lod, triangles: m.triangles, size, want,
        centre: [(m.hi[0] + m.lo[0]) / 2, (m.hi[2] + m.lo[2]) / 2],
        minY: m.lo[1], maxY: m.hi[1], pivot: entry.pivot, skirt: entry.skirt || 0, materials: m.materials,
      };
      row.ratio = size.map((s, i) => (axes[i][2][0] === null ? 1 : s / want[i]));
      rows.push(row);
      totals[`lod${lod}`] += m.triangles;
      for (const [label, k, [elo, ehi]] of axes) {
        const ext = (elo === null ? ehi : ehi - elo);
        const tol = 0.02 * ext + 0.01;
        if (elo === null) {
          if (Math.abs(m.hi[k] - ehi) > tol) failures.push(`${name}: ${label} top at ${m.hi[k].toFixed(3)}, wants ${ehi}`);
          if (m.lo[k] > tol || m.lo[k] < -MAX_DRAFT) failures.push(`${name}: hull bottom at ${m.lo[k].toFixed(3)}, wants 0 to -${MAX_DRAFT}`);
          continue;
        }
        const got = m.hi[k] - m.lo[k];
        if (Math.abs(got / ext - 1) > SIZE_TOLERANCE + 1e-6 && Math.abs(got - ext) > 0.002) {
          failures.push(`${name}: ${label} size ${got.toFixed(3)} m, table ${ext.toFixed(3)} m`);
        }
        if (Math.abs(m.lo[k] - elo) > tol || Math.abs(m.hi[k] - ehi) > tol) {
          failures.push(`${name}: ${label} spans ${m.lo[k].toFixed(3)}..${m.hi[k].toFixed(3)}, pivot '${entry.pivot}'${entry.skirt ? ` skirt ${entry.skirt}` : ''} wants ${elo}..${ehi}`);
        }
      }
      if (m.moved) failures.push(`${name}: node is moved, rotated or scaled; the pivot must be in the mesh`);
      const wantMat = entry.material === 'glow' ? mats.glow : mats.lit;
      if (m.materials.length !== 1 || m.materials[0] !== wantMat) failures.push(`${name}: material ${m.materials.join('+')}, wants ${wantMat}`);
      const limit = lod === 0 ? limits.maxTrianglesLod0PerPiece : limits.maxTrianglesLod1PerPiece;
      if (m.triangles > limit) failures.push(`${name}: ${m.triangles} triangles, limit ${limit}`);
    }
  }
  for (const name of meshByName.keys()) {
    if (!expectedNames.has(name)) failures.push(`${name}: not in the piece table (misnamed or extra)`);
  }
  if (pieces.length > limits.maxPieces) failures.push(`${pieces.length} pieces, limit ${limits.maxPieces}`);
  if (totals.lod0 > limits.maxTrianglesLod0Total) failures.push(`LOD0 total ${totals.lod0} triangles, limit ${limits.maxTrianglesLod0Total}`);
  if (fileBytes > limits.maxBytes) failures.push(`file ${fileBytes} bytes, limit ${limits.maxBytes}`);
  const extra = materials.filter(n => n !== mats.lit && n !== mats.glow);
  if (extra.length) failures.push(`extra materials: ${extra.join(', ')}`);

  const images = (json.images || []).map(img => {
    const view = json.bufferViews[img.bufferView];
    const data = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    return { name: img.name, mimeType: img.mimeType, bytes: view.byteLength, ...(imageSize(data) || {}) };
  });
  if (images.length !== 1) failures.push(`${images.length} images in the file, wants one atlas`);
  for (const img of images) {
    if (img.width !== limits.atlasPixels || img.height !== limits.atlasPixels) {
      failures.push(`image ${img.name} is ${img.width}x${img.height}, wants ${limits.atlasPixels}`);
    }
  }
  return { kit: kitId, rows, totals, fileBytes, materials, images, failures, limits };
}
