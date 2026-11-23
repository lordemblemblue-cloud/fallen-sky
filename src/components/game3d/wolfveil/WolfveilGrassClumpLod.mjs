// Low-poly world (docs/GAME3D_LOW_POLY_20261122.md): distance versions of the owner's 2 m long-grass clump for the
// streamed meadow. The clump (720 triangles) is 72 separate blades of 10 triangles. Far from the player a blade is
// a few pixels, so a middle or far meadow square draws the same clump with only some of its blades, each one made
// wider (about its own centre line, keeping its height and bend) so the patch covers about the same ground.
// Deterministic: the same blades are kept on every load.
import * as THREE from 'three';

function islands(geometry) {
  const count = geometry.attributes.position.count;
  const parent = new Int32Array(count);
  for (let i = 0; i < count; i++) parent[i] = i;
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const index = geometry.index;
  const tris = index ? index.count : count;
  for (let t = 0; t < tris; t += 3) {
    const a = index ? index.getX(t) : t; const b = index ? index.getX(t + 1) : t + 1; const c = index ? index.getX(t + 2) : t + 2;
    const ra = find(a); parent[find(b)] = ra; parent[find(c)] = ra;
  }
  const byRoot = new Map();
  for (let i = 0; i < count; i++) {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(i);
  }
  return [...byRoot.values()];
}

/**
 * @param {THREE.BufferGeometry} geometry the clump (indexed or not)
 * @param {{keep: number, widen?: number, seed?: number}} options keep: share of blades kept (0..1]; widen: width
 *   factor for the kept blades (default 1/sqrt(keep), capped at 2.2)
 * @returns {THREE.BufferGeometry} a new geometry (the source is not changed)
 */
export function thinGrassClump(geometry, { keep, widen = Math.min(2.2, 1 / Math.sqrt(keep)), seed = 7 } = {}) {
  if (!(keep > 0 && keep <= 1)) throw new Error('thinGrassClump: keep must be in (0, 1]');
  const blades = islands(geometry);
  // seeded, evenly spread choice: every blade gets a stable random rank, keep the lowest ranks
  let s = seed >>> 0;
  const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ranked = blades.map((verts) => ({ verts, rank: rand() })).sort((a, b) => a.rank - b.rank);
  const kept = ranked.slice(0, Math.max(1, Math.round(blades.length * keep))).map((b) => b.verts);
  const keepVertex = new Int32Array(geometry.attributes.position.count).fill(-1);
  let next = 0;
  for (const verts of kept) for (const v of verts) keepVertex[v] = next++;

  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const array = new attr.array.constructor(next * attr.itemSize);
    for (let v = 0; v < keepVertex.length; v++) {
      const to = keepVertex[v];
      if (to < 0) continue;
      for (let k = 0; k < attr.itemSize; k++) array[to * attr.itemSize + k] = attr.array[v * attr.itemSize + k];
    }
    out.setAttribute(name, new THREE.BufferAttribute(array, attr.itemSize, attr.normalized));
  }
  // widen each kept blade: pair its vertices by height (a blade is a strip of left/right pairs) and push each pair
  // apart about its own midpoint
  const pos = out.attributes.position;
  for (const verts of kept) {
    const rows = verts.map((v) => keepVertex[v]).sort((a, b) => pos.getY(a) - pos.getY(b));
    for (let i = 0; i + 1 < rows.length; i += 2) {
      const a = rows[i]; const b = rows[i + 1];
      const mx = (pos.getX(a) + pos.getX(b)) / 2; const mz = (pos.getZ(a) + pos.getZ(b)) / 2;
      pos.setXYZ(a, mx + (pos.getX(a) - mx) * widen, pos.getY(a), mz + (pos.getZ(a) - mz) * widen);
      pos.setXYZ(b, mx + (pos.getX(b) - mx) * widen, pos.getY(b), mz + (pos.getZ(b) - mz) * widen);
    }
  }
  const index = geometry.index;
  const tris = index ? index.count : geometry.attributes.position.count;
  const newIndex = [];
  for (let t = 0; t < tris; t += 3) {
    const a = index ? index.getX(t) : t; const b = index ? index.getX(t + 1) : t + 1; const c = index ? index.getX(t + 2) : t + 2;
    if (keepVertex[a] >= 0 && keepVertex[b] >= 0 && keepVertex[c] >= 0) newIndex.push(keepVertex[a], keepVertex[b], keepVertex[c]);
  }
  out.setIndex(newIndex);
  out.computeBoundingBox();
  out.computeBoundingSphere();
  out.name = `${geometry.name || 'grass'}_keep${Math.round(keep * 100)}`;
  out.userData.lowPolyOf = geometry.uuid;
  return out;
}

/** Meadow clump per distance class: the full clump near, half the blades in the middle ring, a quarter far. */
export const MEADOW_CLUMP_KEEP = Object.freeze({ near: 1, mid: 0.5, far: 0.25 });

/** Cache of thinned clumps per source geometry (the owner GLB's far tile is shared by every meadow square). */
export function createMeadowClumpLods() {
  const cache = new Map();
  return {
    /** level: 'near' | 'mid' | 'far' */
    get(source, level) {
      const keep = MEADOW_CLUMP_KEEP[level] ?? 1;
      if (!source || keep >= 1) return source;
      const key = `${source.uuid}|${keep}`;
      if (!cache.has(key)) cache.set(key, thinGrassClump(source, { keep }));
      return cache.get(key);
    },
    dispose() { for (const g of cache.values()) g.dispose(); cache.clear(); },
  };
}
