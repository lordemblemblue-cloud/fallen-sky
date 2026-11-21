// Portal scenes: one Wolfveil area per scene, the far side of every border
// unloaded (not drawn, no ground) until the player goes through a gate.
//
// The owner's stopgap (2026-11-21): "We only doing this until we figure out a
// way to get the whole game to run smoothly without actually relying on a
// portal system." Portal scenes are ON by default. Switch them off to load the
// whole valley in one scene again (all ground and scenery, gates decorative,
// no travel between areas):
//   - this tab:   add ?wholeWorld=1 to the game URL (?wholeWorld=0 forces portal scenes);
//   - this device: localStorage.setItem('game3d.wolfveilWholeWorld','1').
import {wolfveilAreaRect} from './WolfveilFiveAreaPlan.mjs';

export const WOLFVEIL_WHOLE_WORLD_STORAGE_KEY='game3d.wolfveilWholeWorld';
export const WOLFVEIL_WHOLE_WORLD_QUERY='wholeWorld';

/**
 * A portal scene holds exactly one area, so its area loader must never leave
 * it: the position it is given is kept `inset` metres inside the area
 * (WORLD x/z, local z + offsetZ). A stray position (a teleport, a model briefly
 * somewhere else) can then not switch the loader and hide the scene's own
 * ground and town; only going through a gate changes the area (a new scene).
 */
export function keepInWolfveilArea(position,area,{offsetZ=70,inset=1}={}){
  const rect=wolfveilAreaRect(area);
  const x=Number(position?.x),z=Number(position?.z);
  if(!rect||!Number.isFinite(x)||!Number.isFinite(z))return position;
  const clamp=(v,lo,hi)=>Math.min(hi-inset,Math.max(lo+inset,v));
  return {x:clamp(x,rect.minX,rect.maxX),y:Number(position.y)||0,z:clamp(z-offsetZ,rect.minZ,rect.maxZ)+offsetZ};
}

export function wolfveilAreaScenesEnabled(win=globalThis.window){
  try{
    const query=new globalThis.URLSearchParams(win?.location?.search||'').get(WOLFVEIL_WHOLE_WORLD_QUERY);
    if(query==='1'||query==='true')return false;
    if(query==='0'||query==='false')return true;
    return win?.localStorage?.getItem(WOLFVEIL_WHOLE_WORLD_STORAGE_KEY)!=='1';
  }catch{
    return true; // storage blocked: keep the playable default
  }
}
