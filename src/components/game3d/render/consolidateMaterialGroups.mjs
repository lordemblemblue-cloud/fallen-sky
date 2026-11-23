// One draw group per material (docs/GAME3D_LOW_POLY_20261122.md, "Zombies"). Some imported models list their
// triangles in many short runs that alternate between materials: the owner's zombie FBX is one skinned mesh with 205
// groups alternating between its 2 materials, and three.js draws every group separately (205 draw calls per zombie).
// This reorders the triangles so each material's triangles are contiguous, keeping their order within a material, and
// leaves one group per material. Every vertex keeps all its attributes (position, normal, uv, skin indices and
// weights, morph targets), so the shape, the skinning and the animation are unchanged.
// No three.js import: works on any BufferGeometry-like object.

/**
 * @param {object} geometry a BufferGeometry with `groups`
 * @returns {{before: number, after: number}} group counts (unchanged geometry when there is nothing to gain)
 */
export function consolidateMaterialGroups(geometry) {
  const groups = geometry?.groups;
  if (!Array.isArray(groups) || groups.length < 2) return { before: groups?.length || 0, after: groups?.length || 0 };
  const materials = [...new Set(groups.map((g) => g.materialIndex ?? 0))].sort((a, b) => a - b);
  if (materials.length >= groups.length) return { before: groups.length, after: groups.length };
  const runsByMaterial = new Map(materials.map((m) => [m, []]));
  for (const g of groups) runsByMaterial.get(g.materialIndex ?? 0).push(g);
  const index = geometry.index;
  const newGroups = [];
  if (index) {
    const src = index.array;
    const out = new src.constructor(groups.reduce((n, g) => n + g.count, 0));
    let at = 0;
    for (const m of materials) {
      const start = at;
      for (const g of runsByMaterial.get(m)) { out.set(src.subarray(g.start, g.start + g.count), at); at += g.count; }
      newGroups.push({ start, count: at - start, materialIndex: m });
    }
    index.array = out;
    index.count = out.length;
    index.needsUpdate = true;
  } else {
    // non-indexed: groups count vertices; move every attribute's vertex runs together
    const order = [];
    for (const m of materials) {
      const start = order.reduce((n, r) => n + r.count, 0);
      for (const g of runsByMaterial.get(m)) order.push(g);
      const count = order.reduce((n, r) => n + r.count, 0) - start;
      newGroups.push({ start, count, materialIndex: m });
    }
    const reorder = (attribute) => {
      const size = attribute.itemSize;
      const src = attribute.array;
      const out = new src.constructor(src.length);
      let at = 0;
      for (const run of order) {
        out.set(src.subarray(run.start * size, (run.start + run.count) * size), at * size);
        at += run.count;
      }
      // vertices outside every group (none in practice) keep their place after the grouped ones
      if (at * size < src.length) out.set(src.subarray(at * size), at * size);
      attribute.array = out;
      attribute.needsUpdate = true;
    };
    for (const attribute of Object.values(geometry.attributes)) {
      if (attribute.isInterleavedBufferAttribute) return { before: groups.length, after: groups.length };
    }
    const covered = order.reduce((n, r) => n + r.count, 0);
    const vertices = geometry.attributes.position?.count ?? 0;
    if (covered !== vertices) return { before: groups.length, after: groups.length }; // overlapping or partial groups
    for (const attribute of Object.values(geometry.attributes)) reorder(attribute);
    for (const list of Object.values(geometry.morphAttributes || {})) for (const attribute of list) reorder(attribute);
  }
  const before = groups.length;
  geometry.clearGroups();
  for (const g of newGroups) geometry.addGroup(g.start, g.count, g.materialIndex);
  return { before, after: newGroups.length };
}

/** Consolidate every multi-material mesh under `root`; returns the summed group counts. */
export function consolidateModelMaterialGroups(root) {
  const geometries = new Set();
  let before = 0; let after = 0;
  root?.traverse?.((node) => {
    if (!node.isMesh || !Array.isArray(node.material) || !node.geometry || geometries.has(node.geometry)) return;
    geometries.add(node.geometry);
    const r = consolidateMaterialGroups(node.geometry);
    before += r.before; after += r.after;
  });
  return { before, after };
}
