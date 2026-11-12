// Combat / Quest 62.9–63.1 — current-user/current-character reading marks.
// Local browser data ONLY. A failed checked write never changes in-memory
// state or tells subscribers that a bookmark was persisted.
import {characterScopedStorage,subscribeCharacterChange}
 from '../characterStorage';
import {
 normalizeEchoThreadReadingMarks,nextEchoThreadReadingMark,
 nextRemovedEchoThreadReadingMark,
} from './echoChronicleReadingMarks.js';

const storage=characterScopedStorage('game3d_echo_private_thread_reading_marks_v1');
const listeners=new Set();
const load=()=>{
 try{return normalizeEchoThreadReadingMarks(JSON.parse(storage.get()||'[]'))}
 catch{return normalizeEchoThreadReadingMarks([])}
};
let marks=load();
const notify=()=>{
 const current=getEchoThreadReadingMarks();
 for(const listener of listeners){
  try{listener(current)}catch{}
 }
};
subscribeCharacterChange(()=>{marks=load();notify()});

export function getEchoThreadReadingMarks(){return [...marks]}
export function subscribeEchoThreadReadingMarks(listener){
 if(typeof listener!=='function')return ()=>{};
 listeners.add(listener);
 try{listener(getEchoThreadReadingMarks())}catch{}
 return ()=>listeners.delete(listener);
}
export function saveEchoThreadReadingMark(input){
 const result=nextEchoThreadReadingMark(marks,input);
 if(!result.ok)return result;
 if(!storage.setChecked(JSON.stringify(result.marks)))
  return Object.freeze({ok:false,reason:'storage-unavailable'});
 marks=result.marks;notify();
 return Object.freeze({ok:true,mark:result.mark});
}
export function removeEchoThreadReadingMark(tipId){
 const result=nextRemovedEchoThreadReadingMark(marks,tipId);
 if(!result.ok)return result;
 if(!storage.setChecked(JSON.stringify(result.marks)))
  return Object.freeze({ok:false,reason:'storage-unavailable'});
 marks=result.marks;notify();
 return Object.freeze({ok:true});
}
