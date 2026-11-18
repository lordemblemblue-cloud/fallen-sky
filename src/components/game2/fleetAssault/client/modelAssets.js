// Optional low-cost static LOD geometry for the owner's uploaded Fleet Assault GLBs.
// Put the optimized asset pack's public/assets/game2/fleet/ directory into the app.
// Files are loaded only once per ship class; absent files use built-in geometry.
// Character rigs are NOT replaced by static GLBs: the Jedi Outcast skeleton must
// continue driving infantry movement, weapons, and Force animations.
export const FLEET_MODEL_ASSETS = Object.freeze({
  republic: Object.freeze({
    cruiser: 'republic_cruiser', fighter: 'republic_fighter', command: 'republic_command',
    jedi: 'republic_jedi', breacher: 'republic_breacher',
    trooper: 'republic_trooper', heavy: 'republic_heavy',
  }),
  separatist: Object.freeze({
    cruiser: 'imperial_cruiser', fighter: 'imperial_fighter', command: 'imperial_command',
    jedi: 'imperial_jedi', breacher: 'imperial_breacher',
    trooper: 'imperial_trooper',
  }),
});
export const FLEET_EXTRA_ASSETS = Object.freeze(['mandalorian']);
const BASE = '/assets/game2/fleet/';
function accessorBytes(bin, json, accessorIndex) {
  const acc = json.accessors[accessorIndex];
  if (!acc || acc.sparse) throw new Error('Unsupported glTF accessor');
  const view = json.bufferViews[acc.bufferView];
  if (!view || view.byteStride) throw new Error('Interleaved glTF buffers are not supported in the lightweight LOD loader');
  const count = acc.count * ({ SCALAR: 1, VEC3: 3, VEC4: 4 }[acc.type] || 1);
  const off = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType];
  const begin = off, end = begin + count * bytes;
  if (!bytes || end > bin.byteLength) throw new Error('Invalid glTF binary accessor');
  const raw = new DataView(bin, begin, end - begin);
  if (acc.componentType === 5121) return new Uint8Array(bin.slice(begin, end));
  const out = new (acc.componentType === 5126 ? Float32Array : acc.componentType === 5123 ? Uint16Array : Uint32Array)(count);
  for (let i = 0; i < count; i++) out[i] = acc.componentType === 5126 ? raw.getFloat32(i * 4, true) :
    acc.componentType === 5125 ? raw.getUint32(i * 4, true) : raw.getUint16(i * 2, true);
  return out;
}
// The provided optimized GLBs are single static meshes exported in +Y-up coordinates.
// Parse their geometry directly into Game 2's WebGL2 vertex-colour pipeline.
// No Three.js, no 8K texture uploads, no skin animation duplication.
export function decodeFleetStaticGLB(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== view.byteLength)
    throw new Error('Invalid GLB header');
  let json = null, bin = null, offset = 12;
  while (offset + 8 <= view.byteLength) {
    const len = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    offset += 8;
    if (offset + len > view.byteLength) throw new Error('Invalid GLB chunk length');
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset, len)));
    if (type === 0x004e4942) bin = buffer.slice(offset, offset + len);
    offset += len;
  }
  const prim = json?.meshes?.[0]?.primitives?.[0];
  if (!prim || !bin || prim.mode !== 4) throw new Error('GLB is not a static triangle mesh');
  const pos = accessorBytes(bin, json, prim.attributes.POSITION);
  const rawIndices = accessorBytes(bin, json, prim.indices);
  const idx = new Uint32Array(rawIndices);
  let col = prim.attributes.COLOR_0 !== undefined ? accessorBytes(bin, json, prim.attributes.COLOR_0) : null;
  if (!col || col.length !== pos.length / 3 * 4) {
    col = new Uint8Array(pos.length / 3 * 4);
    col.fill(205);
    for (let i = 3; i < col.length; i += 4) col[i] = 255;
  }
  const nrm = new Float32Array(pos.length);
  for (let k = 0; k < idx.length; k += 3) {
    const i = idx[k] * 3, j = idx[k + 1] * 3, m = idx[k + 2] * 3;
    if (m + 2 >= pos.length || j + 2 >= pos.length || i + 2 >= pos.length) throw new Error('GLB index out of range');
    const ax = pos[j] - pos[i], ay = pos[j + 1] - pos[i + 1], az = pos[j + 2] - pos[i + 2];
    const bx = pos[m] - pos[i], by = pos[m + 1] - pos[i + 1], bz = pos[m + 2] - pos[i + 2];
    const x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx;
    for (const off of [i, j, m]) { nrm[off] += x; nrm[off + 1] += y; nrm[off + 2] += z; }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const d = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    nrm[i] /= d; nrm[i + 1] /= d; nrm[i + 2] /= d;
  }
  return { pos: new Float32Array(pos), nrm, col: new Uint8Array(col), idx };
}
export async function loadFleetModelMeshes(renderer, signal) {
  const upload = {};
  const unique = new Set(Object.values(FLEET_MODEL_ASSETS).flatMap(x => Object.values(x)));
  // Only the in-space assets are uploaded; infantry GLBs remain available
  // for their separate rigging / animation integration workflow.
  for (const name of unique) {
    if (name.endsWith('trooper') || name.endsWith('heavy')) continue;
    try {
      const res = await fetch(BASE + name + '.glb', { signal });
      if (!res.ok) continue;
      const buffer = await res.arrayBuffer();
      if (signal?.aborted) break;
      upload[name] = renderer.uploadStatic(decodeFleetStaticGLB(buffer));
    } catch (e) { if (signal?.aborted) break; }
  }
  return upload;
}
