import { initialChronicleLibrary, validateChronicleLibrary } from './chronicleBlueprintModel.mjs';

// Private authoring drafts, NOT authoritative game inventory. Keep each user's
// catalog separated and never fall back to a shared anonymous save.
const storageKey=userId=>'game3d_chronicle_blueprint_drafts_v1::'+encodeURIComponent(String(userId));
const authorizedId=userId=>typeof userId==='string'&&userId.trim().length>0&&userId.length<=160;
export function loadChronicleBlueprints(userId,storage=globalThis.localStorage){
  if(!authorizedId(userId))return {ok:false,reason:'sign-in-required',library:null};
  try{
    const saved=storage.getItem(storageKey(userId));
    if(saved===null)return {ok:true,library:initialChronicleLibrary(),created:true};
    return {ok:true,library:validateChronicleLibrary(JSON.parse(saved)),created:false};
  }catch(error){
    // Never overwrite an unreadable existing save with a fresh empty catalog.
    return {ok:false,reason:'unreadable-saved-data',message:String(error?.message||error),library:null};
  }
}
export function saveChronicleBlueprints(userId,library,storage=globalThis.localStorage){
  if(!authorizedId(userId))return {ok:false,reason:'sign-in-required'};
  try{
    const document=validateChronicleLibrary(library);
    const encoded=JSON.stringify(document);
    storage.setItem(storageKey(userId),encoded);
    if(storage.getItem(storageKey(userId))!==encoded)
      return {ok:false,reason:'write-not-confirmed'};
    return {ok:true,bytes:encoded.length};
  }catch(error){
    return {ok:false,reason:'storage-rejected',message:String(error?.message||error)};
  }
}
export function parseChronicleBlueprintBackup(source){
  if(typeof source!=='string'||source.length>8_000_000)throw Error('Backup exceeds 8 MB');
  return validateChronicleLibrary(JSON.parse(source));
}
export function createChronicleBlueprintBackup(library){
  return JSON.stringify(validateChronicleLibrary(library),null,2);
}
