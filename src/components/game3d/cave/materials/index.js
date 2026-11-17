// Shared cave surfaces for the underground and the approach outside it.
//
// Import this module from cave layout, the cave mouth, and gameplay dressing.
// Do not dispose a material returned here: textures and materials are shared.
// Pass `seed`, `tint`, or `repeat` when a surface needs its own tint or tile
// density. Those options return a cached variant that still shares image data.
//
//   getCaveMaterial('mossyRock', { seed: 3 })
//   createBrickWall({ variant: 'worn', width: 6, height: 3, seed: 2 })
//
// Pieces sit on Y = 0, are centered on X, and face +Z. Units are meters.
// Call prepareCaveSurface(geometry) before using a cave material on your own
// mesh so the ambient-occlusion map has a uv2 channel.
//
// Preview every surface at /cave-materials.

import { releaseCaveMaterials } from './library.js';
import { releaseCaveGeometries } from './pieces.js';

export {
  CAVE_MATERIAL_IDS,
  listCaveMaterials,
  getCaveMaterial,
  getCaveMaterialSpec,
  prepareCaveSurface,
  releaseCaveMaterials,
  seedTint,
} from './library.js';

export {
  listCavePieces,
  createBrickGeometry,
  createBrickPiece,
  createBrickWall,
  createRockChunkGeometry,
  createRockChunk,
  createRockCluster,
  createRockWall,
  createWoodPlank,
  createWoodSupport,
  createPlankDeck,
  createCaveFloor,
  createApproachPath,
  createCliffFace,
  releaseCaveGeometries,
} from './pieces.js';

export {
  createCaveMaterialShowcase,
  getCaveShowcaseFrame,
  planCaveShowcase,
} from './showcase.js';

export const CAVE_LIBRARY_VERSION = 1;

export function releaseCaveLibrary() {
  releaseCaveGeometries();
  releaseCaveMaterials();
}
