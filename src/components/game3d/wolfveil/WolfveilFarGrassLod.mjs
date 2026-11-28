// Player-relative distance detail for the valley's own long-grass tiles (docs/GAME3D_LOW_POLY_20261122.md, part 3).
// WolfveilGrassTileReplacement draws the "far" ring (everything beyond 85 m of the market) as 64 m chunks of the
// owner's 720-triangle far tile, whatever the player's position; the area loader draws per-area copies of those
// chunks. This swaps each visible chunk's tile by its distance from the player, with the meadow's rule
// (WolfveilGrassClumpLod.mjs): the full tile within 85 m, half the blades to 145 m, a quarter beyond, each kept blade
// widened so the patch covers about the same ground. Decorative only (no raycast, no collision); the instances,
// their places and materials do not change. No three.js import beyond the thinning helper's.
import { createMeadowClumpLods } from './WolfveilGrassClumpLod.mjs';

export const FAR_GRASS_CHUNK_NAME = /LongGrass_Tile_2m_Far/;

export function farGrassLevel(distance, { near = 85, mid = 145 } = {}) {
  return distance < near ? 'near' : distance < mid ? 'mid' : 'far';
}

/**
 * @param {{root: object, sourceGeometry: object, intervalS?: number, refreshS?: number}} options
 * root: the valley group the chunks (and the area loader's copies) live under; sourceGeometry: the far tile.
 */
export function createFarGrassLod({ root, sourceGeometry, intervalS = 0.5, refreshS = 4 } = {}) {
  const lods = createMeadowClumpLods();
  let meshes = [];
  let elapsed = intervalS; let untilRefresh = 0;
  const swaps = { near: 0, mid: 0, far: 0 };
  const collect = () => {
    meshes = [];
    root?.traverse?.((o) => {
      if (o.isInstancedMesh && FAR_GRASS_CHUNK_NAME.test(o.name || '') &&
          (o.geometry === sourceGeometry || o.geometry?.userData?.lowPolyOf === sourceGeometry?.uuid)) meshes.push(o);
    });
  };
  return {
    get meshes() { return meshes.length; },
    get swaps() { return { ...swaps }; },
    update(dt, player) {
      if (!sourceGeometry || !player || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return;
      elapsed += Math.max(0, Number(dt) || 0); untilRefresh -= Math.max(0, Number(dt) || 0);
      if (elapsed < intervalS) return;
      elapsed = 0;
      if (untilRefresh <= 0) { collect(); untilRefresh = refreshS; }
      for (const mesh of meshes) {
        if (!mesh.boundingSphere) mesh.computeBoundingSphere?.();
        const c = mesh.boundingSphere?.center; if (!c) continue;
        const e = mesh.matrixWorld.elements;
        const wx = e[0] * c.x + e[4] * c.y + e[8] * c.z + e[12];
        const wz = e[2] * c.x + e[6] * c.y + e[10] * c.z + e[14];
        const level = farGrassLevel(Math.hypot(wx - player.x, wz - player.z));
        const geometry = lods.get(sourceGeometry, level);
        if (mesh.geometry !== geometry) { mesh.geometry = geometry; swaps[level] += 1; }
      }
    },
    dispose() { for (const mesh of meshes) if (mesh.geometry !== sourceGeometry) mesh.geometry = sourceGeometry; meshes = []; lods.dispose(); },
  };
}
