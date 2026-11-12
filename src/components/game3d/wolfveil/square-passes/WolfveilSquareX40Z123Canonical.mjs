// LAND-WS04: deterministic Play-only input adapter for ONE reserved 5m square.
// It is intentionally NOT imported by the shared scene; WS15 owns activation.
// No geometry, meshes, terrain changes, collisions or player/server state.
import {createWolfveilTerrainSurfaceSampler} from '../WolfveilTerrainSurfaceSampler.mjs';
import {
  clearOf,wolfveilForestTrunkColliders,wolfveilTreePlacements,
} from '../WolfveilForestLayout.js';
import {wolfveilRouteClearance,wolfveilDistanceToRiver} from '../WolfveilLayout.js';
import {
  WOLFVEIL_SQUARE_X40_Z123 as SQUARE,
  planWolfveilSquareX40Z123,
} from './WolfveilSquareX40Z123.mjs';

export const WOLFVEIL_X40_Z123_CANONICAL_CONTRACT=Object.freeze({
  squareId:SQUARE.id,
  coordinateFrame:'unshifted-wolfveil-layout',
  visibleWorldOffsetZ:SQUARE.playOffsetZ,
  terrain:'WolfveilTerrainSurfaceSampler.mjs / exact rendered triangles',
  safety:'WolfveilForestLayout.js clearOf + registered trunk colliders + bamboo',
  route:'WolfveilLayout.js wolfveilRouteClearance',
  river:'WolfveilLayout.js wolfveilDistanceToRiver',
  renderEnabled:false,
  gameplayCollidersAdded:0,
});

/**
 * Source-level preview using canonical Wolfveil functions, never fixture
 * heights. The host must explicitly affirm the real Game 3D +70m offset;
 * calling this for Game 1's originAtMarket:false fails before any work.
 *
 * This returns DATA ONLY. It does not mount objects or grant collision and
 * must not be mistaken for visible/physics/QA acceptance.
 */
export function planWolfveilSquareX40Z123Canonical({
  sceneOffsetZ,terrainSpan=1100,terrainSegments=310,
  seed=0x40a123,maxSlope=.48,
}={}) {
  if(sceneOffsetZ!==SQUARE.playOffsetZ)
    throw new RangeError('X40-Z123 requires Game 3D market origin +70m Z; do not mount in Game 1');
  const margin=1;
  const furthest=Math.max(Math.abs(SQUARE.minX),Math.abs(SQUARE.maxX),
    Math.abs(SQUARE.minZ),Math.abs(SQUARE.maxZ));
  if(!Number.isFinite(terrainSpan)||terrainSpan/2<=furthest+margin||
      !Number.isInteger(terrainSegments)||terrainSegments<8||terrainSegments>4096)
    throw new RangeError('Tile must fit inside the actual Wolfveil terrain mesh');

  const heightAt=createWolfveilTerrainSurfaceSampler({
    span:terrainSpan,segments:terrainSegments,
  });
  // Original ancient/cedar/maple trunk radii are those shared with the
  // server-side movement rules. Avoid bamboo visually as well even though
  // the current trunk-collider map intentionally excludes bamboo.
  const colliderTrunks=wolfveilForestTrunkColliders();
  const bamboo=wolfveilTreePlacements().filter(t=>t.kind==='bamboo').map(t=>({
    x:t.x,z:t.z,radius:.6,
  }));
  const trees=[...colliderTrunks,...bamboo];
  if(trees.some(t=>!Number.isFinite(t.x)||!Number.isFinite(t.z)||
      !Number.isFinite(t.radius)||t.radius<0))
    throw new Error('Wolfveil authoritative tree footprint input invalid');

  const plan=planWolfveilSquareX40Z123({
    heightAt,clearOf,
    routeClearance:wolfveilRouteClearance,
    riverDistance:wolfveilDistanceToRiver,
    trees,seed,maxSlope,
  });
  if(!plan.sourceArtAudit.passed||
      plan.placements.some(p=>Math.abs(p.y-heightAt(p.x,p.z))>1e-8))
    throw new Error('X40-Z123 canonical placement does not match the rendered mesh');

  const counts=Object.freeze({
    grass:plan.placements.filter(p=>p.kind==='short-grass').length,
    stones:plan.placements.filter(p=>p.kind==='moss-stone').length,
    understory:plan.placements.filter(p=>p.kind==='understory').length,
    excludedTrunkAnchors:trees.length,
  });
  return Object.freeze({
    square:SQUARE,plan,counts,contract:WOLFVEIL_X40_Z123_CANONICAL_CONTRACT,
    terrainSpan,terrainSegments,
    unshiftedCoordinates:true,
    sceneAttached:false,rendered:false,collidersAdded:0,
    independentlyBrowserVerified:false,independentlyPhysicsVerified:false,
  });
}
