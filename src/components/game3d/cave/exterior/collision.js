// Circular solids shared with the approach plan. A push-out lets the player
// slide along a boulder instead of sticking to the previous frame, and a
// final revert catches a push that would leave them inside another rock.

function overlaps(x, z, solids, radius) {
  for (const solid of solids) {
    const reach = solid.radius + radius;
    const dx = x - solid.x, dz = z - solid.z;
    if (dx * dx + dz * dz < reach * reach) return solid;
  }
  return null;
}

/**
 * @param {object} now world-space position, mutated on X/Z
 * @param {object} previous world-space position from before this step
 * @param {number} radius capsule radius
 * @param {number} offsetZ village group Z (70 in the live game, 0 in local space)
 * @param {Array<{x:number,z:number,radius:number}>} solids Wolfveil-local
 */
export function resolveAshenCliffCollision(now, previous, radius = 0.62, offsetZ = 0, solids = []) {
  if (!now || !previous || !solids.length) return false;
  if (![now.x, now.z, previous.x, previous.z].every(Number.isFinite)) return false;
  const cap = Math.max(0.2, Math.min(1.4, Number(radius) || 0.62));
  let localX = now.x;
  let localZ = now.z - offsetZ;
  let hit = false;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const solid of solids) {
      const dx = localX - solid.x, dz = localZ - solid.z;
      const reach = solid.radius + cap;
      const dist2 = dx * dx + dz * dz;
      if (dist2 >= reach * reach) continue;
      const dist = Math.sqrt(dist2) || 0.0001;
      localX = solid.x + (dx / dist) * (reach + 0.03);
      localZ = solid.z + (dz / dist) * (reach + 0.03);
      moved = true;
      hit = true;
    }
    if (!moved) break;
  }
  if (overlaps(localX, localZ, solids, cap)) {
    now.x = previous.x;
    now.z = previous.z;
    return true;
  }
  if (hit) {
    now.x = localX;
    now.z = localZ + offsetZ;
  }
  return hit;
}

/** Metres of free space around a local point. Negative means the point is inside a solid. */
export function solidClearance(x, z, solids) {
  let best = Infinity;
  for (const solid of solids) {
    best = Math.min(best, Math.hypot(x - solid.x, z - solid.z) - solid.radius);
  }
  return best;
}
