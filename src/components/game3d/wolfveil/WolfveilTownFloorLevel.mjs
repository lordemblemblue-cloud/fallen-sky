// The assembled town was modelled in two different ground heights: the 80
// walkable Tile_* squares sat 0.029 model units BELOW the paving, lawns,
// terraces, house bases (0.720-0.754) and tree trunks (0.722). Scaled by
// 12.44 that is a 36cm step, so every wall and trunk in the town hovered above
// the floor the player actually walks on, and each terrace edge cut a dark
// shadow line across the stone.
//
// This settles every walkable surface of the town onto ONE floor height - the
// level the model's own houses and trees were built for - leaving only the
// canal bed recessed so the water still has a channel to sit in.
import {
  WOLFVEIL_IMPORTED_TOWN,
  WOLFVEIL_IMPORTED_TOWN_CANAL,
} from './WolfveilImportedTownLayout.mjs';

const FLOOR = WOLFVEIL_IMPORTED_TOWN.floorSourceY;
// Ground-level tops only: walls, roofs, lanterns and house interiors are above.
const GROUND_BAND_MIN = 0.6;
const GROUND_BAND_MAX = 0.8;
// Anything at or below this is the canal bed, which must stay below the water.
const CANAL_BED_MAX = 0.7;
// A lawn sits a hair proud of the paving so the two never fight for the same
// pixel where a park strip meets the stone.
const LAWN_LIFT = 0.0015;
// Paving settles fractionally under the tile grid: 1.5cm at world scale, far
// below the eye but enough that the two coplanar surfaces never flicker.
const PAVING_DROP = 0.0012;
const PAVING_MESH = /^(paving$|Expansion_paving$|stone$)/;

const FLOOR_MESH = /^(Tile_|paving$|Expansion_paving$|grass$|Expansion_grass$|stone$)/;
const LAWN_MESH = /^(grass|Expansion_grass)$/;
// Walls that were built one storey-terrace higher than the floor. Dropping the
// whole small piece seats every wall on the ground instead of leaving a gap.
const ARCHITECTURE_MAX_JUMP = 0.06;
const ARCHITECTURE_MAX_HEIGHT = 1.0;
// Only bases that sit clearly above the floor, never upper storeys or canopies.
const ARCHITECTURE_BAND_MIN = 0.755;
const ARCHITECTURE_BAND_MAX = 0.8;

function geometryBounds(position) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return { min, max };
}

/** Drops an architecture piece that floats above the floor by a small step. */
function seatFloatingArchitecture(node) {
  const position = node.geometry?.attributes?.position;
  if (!position) return 0;
  const { min, max } = geometryBounds(position);
  if (!(min > FLOOR + 0.004 && min <= FLOOR + ARCHITECTURE_MAX_JUMP)) return 0;
  // Tall merged meshes (gilt trim, canopies) share one base with roof details
  // far above it, so they must never be moved as a block.
  if (max > FLOOR + ARCHITECTURE_MAX_HEIGHT) return 0;
  const drop = min - FLOOR;
  for (let i = 0; i < position.count; i++) position.setY(i, position.getY(i) - drop);
  position.needsUpdate = true;
  node.geometry.computeVertexNormals();
  return 1;
}

/**
 * Pulls the very bottom ring of a wall or a gilt base ring down onto the floor.
 * Merged meshes that also carry roof finials cannot move as a whole, but their
 * lowest band can, which is the part that shows a gap under it.
 */
function settleLowestBand(node) {
  const position = node.geometry?.attributes?.position;
  if (!position) return 0;
  let moved = 0;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y < ARCHITECTURE_BAND_MIN || y > ARCHITECTURE_BAND_MAX) continue;
    position.setY(i, FLOOR);
    moved++;
  }
  if (moved) {
    position.needsUpdate = true;
    node.geometry.computeVertexNormals();
  }
  return moved;
}

/**
 * Snaps the town's walkable tops onto the single town floor height.
 * Returns the number of vertices settled, for tests and diagnostics.
 */
export function flattenWolfveilTownFloorLevels(townRoot) {
  let settled = 0;
  let canalBed = 0;
  let seated = 0;
  townRoot?.traverse?.((node) => {
    if (!node.isMesh) return;
    if (/water|foam/i.test(node.name)) return;
    if (!FLOOR_MESH.test(node.name)) {
      seated += seatFloatingArchitecture(node) || (settleLowestBand(node) > 0 ? 1 : 0);
      return;
    }
    const position = node.geometry?.attributes?.position;
    if (!position) return;
    // The tile grid is the walkable reference. Paving and stone sit a hair
    // below it and lawns a hair above, so no two ground surfaces ever share a
    // plane (which would flicker) and no step is visible to the eye.
    const target = FLOOR + (LAWN_MESH.test(node.name) ? LAWN_LIFT
      : PAVING_MESH.test(node.name) ? -PAVING_DROP : 0);
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      if (y < GROUND_BAND_MIN || y > GROUND_BAND_MAX) continue;
      const x = position.getX(i), z = position.getZ(i);
      const inCanal = x > WOLFVEIL_IMPORTED_TOWN_CANAL.minX && x < WOLFVEIL_IMPORTED_TOWN_CANAL.maxX
        && z > WOLFVEIL_IMPORTED_TOWN_CANAL.minZ && z < WOLFVEIL_IMPORTED_TOWN_CANAL.maxZ;
      if (inCanal && y <= CANAL_BED_MAX) { canalBed++; continue; }
      if (Math.abs(y - target) > 1e-6) { position.setY(i, target); settled++; }
    }
    if (settled) position.needsUpdate = true;
    node.geometry.computeVertexNormals();
    node.geometry.computeBoundingBox();
    node.geometry.computeBoundingSphere();
    node.userData.wolfveilFloorLevel = FLOOR;
  });
  return { floor: FLOOR, settled, canalBed, seated };
}