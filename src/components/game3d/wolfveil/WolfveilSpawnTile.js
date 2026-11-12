// Wolfveil World Art — first authored development square, at the live market spawn.
// These are *local Wolfveil layout* coordinates; the Game 3D viewer shifts Z by +70.
import {WOLFVEIL_SITES} from './WolfveilLayout.js';

export const WOLFVEIL_SPAWN_TILE=Object.freeze({
  id:'wolfveil_spawn_tile_01',
  label:'Market Spawn — First Finished Square',
  centerX:WOLFVEIL_SITES.market.x,
  centerZ:WOLFVEIL_SITES.market.z,
  halfExtent:48,
  edgeBlendMeters:6,
});

// Decoration/terrain appearance only; never replace the source terrain collision.
export function isInsideWolfveilSpawnTile(x,z,halfExtent=WOLFVEIL_SPAWN_TILE.halfExtent){
  return Number.isFinite(x)&&Number.isFinite(z)&&
    Number.isFinite(halfExtent)&&halfExtent>0&&
    Math.abs(x-WOLFVEIL_SPAWN_TILE.centerX)<=halfExtent&&
    Math.abs(z-WOLFVEIL_SPAWN_TILE.centerZ)<=halfExtent;
}
