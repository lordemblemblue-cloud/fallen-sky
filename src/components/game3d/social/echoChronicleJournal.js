// Combat / Quest 46.9–47.4: explicit PERSONAL Echo Chronicle pages.
// No quest/combat authority, automatic memories, XP, loot, or public sharing.
// Records are private to the signed-in character on this browser.
import {characterScopedStorage,subscribeCharacterChange} from '../characterStorage';
import {getEchoMemories} from './echoChronicleStore';
import {isChroniclePhoto} from './echoChroniclePhoto';

const storage=characterScopedStorage('game3d_echo_personal_journal_v1');
const listeners=new Set();
const TYPES=new Set(['training','exploration','quest','reflection']);
const field=(value,max)=>typeof value==='string'
 ? value.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max):'';
const clean=(value,max)=>field(value,max).trim();
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const makeSecureId=()=>{
 const crypto=globalThis.crypto;
 if(typeof crypto?.randomUUID==='function')return crypto.randomUUID();
 if(typeof crypto?.getRandomValues==='function'){
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  return [...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
 }
 return null;
};
const safeEntry=e=>{
 if(!e||typeof e!=='object'||typeof e.id!=='string'||
   !e.id.startsWith('journal:')||e.id.length>80||!validTime(e.date)||
   !TYPES.has(e.context))return null;
 return Object.freeze({
  id:e.id,source:'personal',date:e.date,
  rememberedAt:e.date,title:clean(e.title,80)||'Untitled moment',
  region:clean(e.region,60),context:e.context,
  parentId:typeof e.parentId==='string'?e.parentId.slice(0,100):null,
  reflection:field(e.reflection,2000),bookmarked:e.bookmarked===true,
  photoDataUri:isChroniclePhoto(e.photoDataUri)?e.photoDataUri:'',
  previousEncounters:0,lines:Object.freeze([]),agreedAdventure:null,
 });
};
const load=()=>{
 try{
  const raw=JSON.parse(storage.get()||'[]');
  return Array.isArray(raw)?raw.slice(0,100).map(safeEntry).filter(Boolean):[];
 }catch{return []}
};
let entries=load();
const emit=()=>listeners.forEach(fn=>fn(getEchoJournalEntries()));
const save=next=>{
 if(!storage.setChecked(JSON.stringify(next)))return false;
 entries=next;emit();return true;
};
subscribeCharacterChange(()=>{entries=load();emit()});
export function getEchoJournalEntries(){return [...entries]}
export function subscribeEchoJournalEntries(listener){
 if(typeof listener!=='function')return ()=>{};
 listeners.add(listener);listener(getEchoJournalEntries());
 return ()=>listeners.delete(listener);
}
export function createEchoJournalEntry({
 title,reflection='',context='reflection',region='',parentId=null,
}={}, {now=Date.now,makeId=makeSecureId}={}){
 const heading=clean(title,80);
 if(!heading||!TYPES.has(context)||entries.length>=100||
   typeof now!=='function'||typeof makeId!=='function')return null;
 const rawId=makeId(),moment=now();
 if(typeof rawId!=='string'||!/^[a-zA-Z0-9-]{8,60}$/.test(rawId)||
   !Number.isSafeInteger(moment)||moment<=0||moment>8.64e15)return null;
 const id='journal:'+rawId;
 if(entries.some(entry=>entry.id===id)||getEchoMemories().some(e=>e.id===id))
  return null;
 const candidates=[...entries,...getEchoMemories()];
 const linked=typeof parentId==='string'&&candidates.some(e=>e.id===parentId)
  ?parentId:null;
 const page=safeEntry({id,date:new Date(moment).toISOString(),title:heading,
  reflection,context,region,parentId:linked,bookmarked:false,photoDataUri:''});
 if(!page)return null;
 return save([page,...entries])?id:null;
}
// Edit a PERSONAL entry only; do not rewrite its timestamp, source,
// branch parent or server-owned multiplayer history.
export function updateEchoJournalEntry(id,patch={}){
 const index=entries.findIndex(e=>e.id===id);
 if(index<0||!patch||typeof patch!=='object')return false;
 const current=entries[index];
 const next=safeEntry({...current,
  ...(typeof patch.title==='string'?{title:clean(patch.title,80)}:{}),
  ...(typeof patch.reflection==='string'?{reflection:field(patch.reflection,2000)}:{}),
  ...(typeof patch.bookmarked==='boolean'?{bookmarked:patch.bookmarked}:{}),
  ...(patch.photoDataUri===''||isChroniclePhoto(patch.photoDataUri)
   ?{photoDataUri:patch.photoDataUri}:{})});
 if(!next||!next.title)return false;
 return save(entries.map((entry,i)=>i===index?next:entry));
}
export function removeEchoJournalEntry(id){
 if(!entries.some(e=>e.id===id))return false;
 // Surviving descendants become independent stars instead of dangling links.
 return save(entries.filter(e=>e.id!==id).map(e=>
  e.parentId===id?safeEntry({...e,parentId:null}):e));
}
export const ECHO_JOURNAL_TYPES=Object.freeze([...TYPES]);
