import {planForestFloorX49Z113, FOREST_TILE_X49_Z113} from './X49Z113.mjs';

/**
 * X49-Z113 only: read-only opt-in preflight for canonical Wolfveil callbacks.
 * WS15 injects functions from the existing WolfveilGroundCover/ForestLayout
 * integration, not from a second generated terrain surface or invented trees.
 * No Three.js, scene writes, terrain mutation, mesh loading, or teleport.
 */
export function preflightX49Z113Canonically({
  originAtMarket = false, world, sampleVisibleGround, routeClearance,
  riverDistance, clearOf, wolfveilTreePlacements,
} = {}) {
  if (originAtMarket !== true || world?.group?.position?.z !== 70 ||
      world?.group?.userData?.environment !== 'wolfveil')
    throw new RangeError('X49-Z113 requires authenticated Wolfveil +70m scene origin');
  if (![sampleVisibleGround, routeClearance, riverDistance, clearOf,
    wolfveilTreePlacements].every(f => typeof f === 'function'))
    throw new TypeError('All canonical Wolfveil terrain/route/river/clearance/tree callbacks are required');
  const trees = wolfveilTreePlacements();
  if (!Array.isArray(trees) || trees.some(t => !Number.isFinite(t?.x) ||
      !Number.isFinite(t?.z) || !Number.isFinite(t?.y)))
    throw new TypeError('Canonical tree positions must be a finite world-local array');

  const {local} = FOREST_TILE_X49_Z113;
  const safeSample = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z) ||
        x < local.minX || x >= local.maxX ||
        z < local.minZ || z >= local.maxZ)
      throw new RangeError('Terrain sample left the X49-Z113 exclusive claim');
    return sampleVisibleGround(x, z);
  };
  const plan = planForestFloorX49Z113({
    sampleHeight:safeSample, routeClearance, riverDistance, clearOf,
    existingTrees:trees,
  });
  if (!plan?.decorativeOnly || plan.mounted !== false ||
      plan.altersTerrainHeight !== false ||
      plan.tileId !== FOREST_TILE_X49_Z113.id)
    throw new Error('Unexpected world mutation request from tile planner');
  return plan;
}
