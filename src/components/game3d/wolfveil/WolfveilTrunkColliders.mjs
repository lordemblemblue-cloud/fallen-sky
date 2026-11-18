// Every tree trunk that blocks the way in Wolfveil, for the client and the
// server alike: the owner's forest trees and elms (WolfveilForestLayout.js)
// plus the trees planted by the four-sides plan (WolfveilFourSidesPlan.mjs).
//
// A side joins WOLFVEIL_PLANTED_SIDES when its scenery is built into the
// game. The scene draws exactly these trees and the server blocks exactly
// these trunks, from the same deterministic plan.
import {wolfveilForestTrunkColliders} from './WolfveilForestLayout.js';
import {planWolfveilSidePlanting} from './WolfveilFourSidesPlan.mjs';

export const WOLFVEIL_PLANTED_SIDES=Object.freeze(['west']);
// Trunk radius by kind, in metres: what a body bumps into, not the crown.
export const WOLFVEIL_PLANTED_TRUNK_RADIUS=Object.freeze({cedar:.55,pine:.5,maple:.5});

const plans=new Map();
/** The planting plan of one built side (computed once, about 150 ms). */
export function wolfveilPlantedSide(side){
  if(!WOLFVEIL_PLANTED_SIDES.includes(side))return null;
  if(!plans.has(side))plans.set(side,planWolfveilSidePlanting(side));
  return plans.get(side);
}
let plantedTrunks=null;
/** Trunks of the planted trees, in Wolfveil-local metres. */
export function wolfveilPlantedTrunkColliders(){
  if(!plantedTrunks){
    const list=[];
    for(const side of WOLFVEIL_PLANTED_SIDES)
      for(const item of wolfveilPlantedSide(side).placements)
        if(item.trunk)list.push(Object.freeze({x:item.x,z:item.z,
          radius:WOLFVEIL_PLANTED_TRUNK_RADIUS[item.kind]??.5,kind:'planted_'+item.kind}));
    plantedTrunks=Object.freeze(list);
  }
  return plantedTrunks;
}
/** Every blocking trunk: the owner's trees first, then the planted ones. */
export function wolfveilTrunkColliders(){
  return [...wolfveilForestTrunkColliders(),...wolfveilPlantedTrunkColliders()];
}

/**
 * A grid over round obstacles, so a step is tested against the few trunks
 * near it instead of every trunk in the valley. `some(x,z,test)` answers
 * exactly as `circles.some(test)` would for any obstacle whose reach (its
 * radius plus the body's) is no more than one cell.
 */
export function createWolfveilCircleGrid(circles,{cellMeters=16}={}){
  const cells=new Map();
  const index=value=>Math.floor(value/cellMeters);
  for(const circle of circles){
    const key=index(circle.x)+':'+index(circle.z);
    if(!cells.has(key))cells.set(key,[]);
    cells.get(key).push(circle);
  }
  return {
    cellMeters,size:circles.length,
    some(x,z,test){
      const cx=index(x),cz=index(z);
      for(let i=cx-1;i<=cx+1;i++)for(let j=cz-1;j<=cz+1;j++){
        const list=cells.get(i+':'+j);
        if(list)for(const circle of list)if(test(circle))return true;
      }
      return false;
    },
  };
}
