import {wolfveilRouteClearance, wolfveilDistanceToRiver} from '../../../../wolfveil/WolfveilLayout.js';
import {clearOf, wolfveilTreePlacements} from '../../../../wolfveil/WolfveilForestLayout.js';
import {preflightX49Z113Canonically} from './X49Z113CanonicalPreflight.mjs';
import {straightGrassClumpRibbons, irregularMossStoneShell} from './X49Z113.mjs';
import {mountX49Z113VisualBatch} from './X49Z113VisualBatch.mjs';

/**
 * Exclusive Wolfveil X49-Z113 5m Play square.
 * A single WS15-owned call site can wire this adapter to the existing
 * WolfveilGroundCover's already-sampled rendered terrain and owned materials.
 * Disabled by default: never touches Game 1, other squares or shared renderer.
 * Do not enable/merge before independently verified 100% signed-in Play QA.
 */
export function mountX49Z113CanonicalWolfveil({
  enabled = false, THREE, world, originAtMarket = false,
  sampleVisibleGround, grassMaterial, stoneMaterial,
} = {}) {
  if (!enabled) return null;
  const plan = preflightX49Z113Canonically({
    originAtMarket, world, sampleVisibleGround,
    routeClearance: wolfveilRouteClearance,
    riverDistance: wolfveilDistanceToRiver,
    clearOf, wolfveilTreePlacements,
  });
  const batch = mountX49Z113VisualBatch({
    enabled: true, THREE, world, plan,
    grassRecipe: straightGrassClumpRibbons(),
    stoneRecipe: irregularMossStoneShell(),
    grassMaterial, stoneMaterial, parentWorldZOffset: 70,
  });
  return Object.freeze({
    tileId: 'X49-Z113', source: 'canonical-wolfveil',
    grassClumps: batch.grassClumps, stones: batch.stones,
    meshes: batch.meshes,
    decorativeOnly: true,
    terrainChanged: false, collisionChanged: false,
  });
}
