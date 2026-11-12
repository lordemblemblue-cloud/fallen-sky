// Combat / Quest 59.1–59.6: private, read-only story thread projections.
// These are EXPLICIT saved journal parent links, not generated quest branches,
// player relationships, social identities, or multiplayer achievements.
import {projectFeaturedEchoStars} from './echoChronicleCurationModel.js';
import {echoChronicleMonthKey,ECHO_ALL_MONTHS} from './echoChronicleMonthlySky.js';

export const MAX_ECHO_THREAD_NODES=12;
const validId=id=>typeof id==='string'&&id.length>0&&id.length<=128&&
 !/[\u0000-\u001f\u007f]/.test(id);
const titleOf=entry=>String(entry.title||entry.partnerName||'Saved memory')
 .replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100)||'Saved memory';
const savedRecords=entries=>{
 const byId=new Map();
 for(const entry of Array.isArray(entries)?entries:[]){
  if(entry&&validId(entry.id)&&!byId.has(entry.id))byId.set(entry.id,entry);
 }
 return byId;
};
const recordedDate=entry=>{
 const time=typeof entry?.date==='string'?Date.parse(entry.date):NaN;
 return Number.isFinite(time)?new Date(time).toISOString():null;
};
const projectedRecord=(entry,chosenIds)=>Object.freeze({
 id:entry.id,title:titleOf(entry),date:recordedDate(entry),
 source:entry.source==='personal'?'personal':'shared',
 inSelectedSky:chosenIds.has(entry.id),
});
const safeDepth=value=>Number.isInteger(value)?
 Math.max(2,Math.min(MAX_ECHO_THREAD_NODES,value)):MAX_ECHO_THREAD_NODES;

/**
 * A player may follow several generations of ACTUALLY SAVED personal
 * continuations. An unpinned parent is visible only if still readable in
 * the current character's own Chronicle. Missing parents are never guessed.
 * Cycle and depth conditions stop traversal without modifying any record.
 */
export function buildEchoChronicleStoryThreads(
 entries=[],featuredIds=[],month=ECHO_ALL_MONTHS,{maxNodes=MAX_ECHO_THREAD_NODES}={},
){
 const byId=savedRecords(entries);
 const selected=projectFeaturedEchoStars([...byId.values()],featuredIds,month);
 const selectedIds=new Set(selected.map(e=>e.id));
 const limit=safeDepth(maxNodes);
 const paths=[],unresolved=[],childrenByParent=new Map();
 for(const entry of selected){
  if(entry.source!=='personal'||!validId(entry.parentId))continue;
  const parentId=entry.parentId;
  if(parentId===entry.id){
   unresolved.push(Object.freeze({id:entry.id,title:titleOf(entry),reason:'self-reference'}));
   continue;
  }
  const parent=byId.get(parentId);
  if(!parent){
   unresolved.push(Object.freeze({id:entry.id,title:titleOf(entry),reason:'parent-unavailable'}));
   continue;
  }
  if(!childrenByParent.has(parentId))childrenByParent.set(parentId,[]);
  childrenByParent.get(parentId).push(entry);
  const trace=[entry],seen=new Set([entry.id]);
  let current=entry,status='complete';
  while(current.source==='personal'&&validId(current.parentId)){
   if(trace.length>=limit){status='depth-limit';break}
   if(seen.has(current.parentId)){status='cycle';break}
   const previous=byId.get(current.parentId);
   if(!previous){status='parent-unavailable';break}
   trace.push(previous);seen.add(previous.id);current=previous;
  }
  if(trace.length<2)continue;
  const ancestry=[...trace].reverse().map(e=>projectedRecord(e,selectedIds));
  const months=new Set(trace.map(e=>echoChronicleMonthKey(e.date)));
  paths.push(Object.freeze({
   tip:projectedRecord(entry,selectedIds),
   earliestLoaded:ancestry[0],
   nodes:Object.freeze(ancestry),
   linkCount:ancestry.length-1,
   crossesRecordedMonths:months.size>1,
   status,
  }));
 }
 const forks=[];
 for(const [parentId,children] of childrenByParent){
  if(children.length<2)continue;
  const parent=byId.get(parentId);
  if(!parent)continue;
  forks.push(Object.freeze({
   parent:projectedRecord(parent,selectedIds),
   children:Object.freeze(children.map(e=>projectedRecord(e,selectedIds))),
  }));
 }
 return Object.freeze({
  paths:Object.freeze(paths),
  forks:Object.freeze(forks),
  unresolved:Object.freeze(unresolved),
  selectedCount:selected.length,
  continuationCount:paths.length,
  forkCount:forks.length,
  unavailableCount:unresolved.length,
 });
}
