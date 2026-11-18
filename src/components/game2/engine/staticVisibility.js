// Conservative draw ranges for large opaque static meshes. Only the index
// order changes: every source triangle, vertex, normal and material survives.
// Physics never consumes this render-only data.
export function partitionStaticMesh(mesh, cellSize = 20) {
  if (!(cellSize > 0)) throw new RangeError('Static cell size must be positive');
  const { pos, idx } = mesh;
  const cells = new Map();
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const x = Math.floor((pos[a] + pos[b] + pos[c]) / (3 * cellSize));
    const z = Math.floor((pos[a + 2] + pos[b + 2] + pos[c + 2]) / (3 * cellSize));
    const key = x + ',' + z;
    let cell = cells.get(key);
    if (!cell) {
      cell = { x, z, indices: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      cells.set(key, cell);
    }
    cell.indices.push(idx[i], idx[i + 1], idx[i + 2]);
    // Bounds enclose the complete triangle, including ones crossing a cell
    // boundary. A centroid-only bound would wrongly remove visible walls.
    for (const vertex of [a, b, c]) for (let k = 0; k < 3; k++) {
      cell.min[k] = Math.min(cell.min[k], pos[vertex + k]);
      cell.max[k] = Math.max(cell.max[k], pos[vertex + k]);
    }
  }
  const indices = new idx.constructor(idx.length), ranges = [];
  let offset = 0;
  for (const cell of [...cells.values()].sort((a, b) => a.z - b.z || a.x - b.x)) {
    indices.set(cell.indices, offset);
    ranges.push({ min: cell.min, max: cell.max, count: cell.indices.length,
      byteOffset: offset * indices.BYTES_PER_ELEMENT });
    offset += cell.indices.length;
  }
  return { indices, ranges };
}

// AABB against the six homogeneous clip planes. `clip` is projection * view
// * model, so rotated/local GLB wall ranges use the same conservative test.
// A box intersecting any plane is kept; no occlusion guesses or distance LOD.
export function staticRangeVisible(range, clip) {
  const { min, max } = range;
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const x = clip[3] + sign * clip[axis];
    const y = clip[7] + sign * clip[4 + axis];
    const z = clip[11] + sign * clip[8 + axis];
    const w = clip[15] + sign * clip[12 + axis];
    const distance = x * (x >= 0 ? max[0] : min[0]) +
      y * (y >= 0 ? max[1] : min[1]) + z * (z >= 0 ? max[2] : min[2]) + w;
    // Small floating-point tolerance retains touching/near-plane geometry.
    if (distance < -1e-4) return false;
  }
  return true;
}

// Contiguous visible cells share one drawElements call. Looking down the
// entire map should remain one submission, rather than hundreds of draws.
export function visibleStaticRanges(ranges, clip, bytesPerIndex) {
  const visible = [];
  for (const range of ranges) {
    if (!staticRangeVisible(range, clip)) continue;
    const previous = visible[visible.length - 1];
    if (previous && previous.byteOffset + previous.count * bytesPerIndex === range.byteOffset) {
      previous.count += range.count;
    } else visible.push({ byteOffset: range.byteOffset, count: range.count });
  }
  return visible;
}
