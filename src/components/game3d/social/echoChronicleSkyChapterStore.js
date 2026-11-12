// Combat / Quest 52.9–53.1. Account- and character-local private sky stories.
// No server route, network upload, public audience or quest authority.
import {characterScopedStorage,subscribeCharacterChange}
 from '../characterStorage';
import {
 normalizeEchoSkyChapters,nextEchoSkyChapter,nextDeletedEchoSkyChapter,
} from './echoChronicleSkyChapters.js';

const storage=characterScopedStorage('game3d_echo_private_sky_chapters_v1');
const listeners=new Set();
const load=()=>{
 try{return normalizeEchoSkyChapters(JSON.parse(storage.get()||'[]'))}
 catch{return normalizeEchoSkyChapters([])}
};
let chapters=load();
const notify=()=>{
 const current=getEchoSkyChapters();
 for(const listener of listeners)try{listener(current)}catch{}
};
subscribeCharacterChange(()=>{
 chapters=load();
 notify();
});

export function getEchoSkyChapters(){return [...chapters]}
export function subscribeEchoSkyChapters(listener){
 if(typeof listener!=='function')return ()=>{};
 listeners.add(listener);
 try{listener(getEchoSkyChapters())}catch{}
 return ()=>listeners.delete(listener);
}

export function writeEchoSkyChapter(input){
 const result=nextEchoSkyChapter(chapters,input);
 if(!result.ok)return result;
 // Persist before notifying: the browser can reject writes at full quota.
 if(!storage.setChecked(JSON.stringify(result.chapters)))
  return Object.freeze({ok:false,reason:'storage-unavailable'});
 chapters=result.chapters;
 notify();
 return Object.freeze({ok:true,chapter:result.chapter});
}

export function deleteEchoSkyChapter(month){
 const result=nextDeletedEchoSkyChapter(chapters,month);
 if(!result.ok)return result;
 if(!storage.setChecked(JSON.stringify(result.chapters)))
  return Object.freeze({ok:false,reason:'storage-unavailable'});
 chapters=result.chapters;
 notify();
 return Object.freeze({ok:true});
}
