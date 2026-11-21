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
export const WOLFVEIL_WHOLE_WORLD_STORAGE_KEY='game3d.wolfveilWholeWorld';
export const WOLFVEIL_WHOLE_WORLD_QUERY='wholeWorld';

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
