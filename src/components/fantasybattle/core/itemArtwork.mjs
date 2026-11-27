import {GEAR_IDS} from './equipmentCatalog.mjs';
import {WEAPON_IDS} from './weaponCatalog.mjs';
// Only committed, reviewed local raster artwork is allowed. Never read asset URLs from saves.
export const ITEM_ART_IDS=Object.freeze([...WEAPON_IDS,'recoveryTonic','sapphireOre',...GEAR_IDS]);
export const ITEM_ART_ROOT='/fantasybattle/sapphire/items/';
// Add entries only after the corresponding files are delivered and reviewed.
export const ITEM_ARTWORK=Object.freeze({});
export function validItemArtwork(entries){
 if(!entries||typeof entries!=='object'||Array.isArray(entries))return false;
 return Object.entries(entries).every(([id,path])=>ITEM_ART_IDS.includes(id)&&path===ITEM_ART_ROOT+id+'.webp');
}
export function itemArtworkFor(id,entries=ITEM_ARTWORK){
 if(!ITEM_ART_IDS.includes(id)||!Object.hasOwn(entries,id))return null;
 const path=entries[id];
 return path===ITEM_ART_ROOT+id+'.webp'?path:null;
}
