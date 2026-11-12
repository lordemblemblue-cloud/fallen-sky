// Combat / Quest 50.7–50.9: character-scoped PRIVATE star curation.
// Stores only IDs of real, locally readable Chronicle records. This store
// has no network endpoint, no export and no permission to publish anything.
import {characterScopedStorage,subscribeCharacterChange} from '../characterStorage';
import {
 normalizeFeaturedEchoIds,nextFeaturedEchoSelection,
} from './echoChronicleCurationModel.js';
import {
 nextReorderedFeaturedEchoSelection,nextCleanFeaturedEchoSelection,
} from './echoChronicleSkyJourney.js';

const storage=characterScopedStorage('game3d_echo_private_featured_stars_v1');
const listeners=new Set();
const load=()=>{
 try{return normalizeFeaturedEchoIds(JSON.parse(storage.get()||'[]'))}
 catch{return normalizeFeaturedEchoIds([])}
};
let ids=load();
const notify=()=>{for(const listener of listeners){
 try{listener(getFeaturedEchoStarIds())}catch{}
}};
subscribeCharacterChange(()=>{ids=load();notify()});

export function getFeaturedEchoStarIds(){return [...ids]}
export function subscribeFeaturedEchoStarIds(listener){
 if(typeof listener!=='function')return ()=>{};
 listeners.add(listener);
 try{listener(getFeaturedEchoStarIds())}catch{}
 return ()=>listeners.delete(listener);
}
export function toggleFeaturedEchoStar(id,savedEntries){
 const result=nextFeaturedEchoSelection(savedEntries,ids,id);
 if(!result.ok)return result;
 const next=result.ids;
 if(!storage.setChecked(JSON.stringify(next)))
  return Object.freeze({ok:false,reason:'storage-unavailable'});
 ids=next;
 notify();
 return Object.freeze({ok:true,featured:result.featured});
}

/**
 * Move a chosen star only relative to other stars in its calendar month.
 * The persisted array is an owner/character-scoped ordering, not a
 * permanent or public leaderboard.
 */
export function moveFeaturedEchoStar(id,direction,savedEntries){
 const result=nextReorderedFeaturedEchoSelection(savedEntries,ids,id,direction);
 if(!result.ok)return result;
 const next=result.ids;
 if(!storage.setChecked(JSON.stringify(next)))
  return Object.freeze({ok:false,reason:'storage-unavailable'});
 ids=next;notify();
 return Object.freeze({ok:true});
}

/**
 * A missing memory might simply not have loaded. Never delete its pin
 * automatically; this function must be triggered by an explicit user click.
 */
export function clearUnavailableFeaturedEchoStars(savedEntries){
 const result=nextCleanFeaturedEchoSelection(savedEntries,ids);
 if(!result.ok)return result;
 const next=result.ids;
 if(!storage.setChecked(JSON.stringify(next)))
  return Object.freeze({ok:false,reason:'storage-unavailable'});
 ids=next;notify();
 return Object.freeze({ok:true,removed:result.removed});
}
