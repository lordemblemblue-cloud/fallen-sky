// Combat / Quest 51.4–52.0: PRIVATE star-order and sky-preview helpers.
// Only existing, user-readable Chronicle records can be shown. A dotted
// line is chronological/presentation order, never a relationship claim.
import {ECHO_ALL_MONTHS,echoChronicleMonthKey} from './echoChronicleMonthlySky.js';
import {
 normalizeFeaturedEchoIds,projectFeaturedEchoStars,
} from './echoChronicleCurationModel.js';

const coords=Object.freeze([
 [16,28],[37,17],[68,26],[86,53],[60,73],[25,76],[45,49],[78,12],
]);
const known=entries=>{
 const map=new Map();
 for(const entry of Array.isArray(entries)?entries:[]){
  if(!entry||typeof entry.id!=='string'||entry.id.length===0||
     entry.id.length>128||/[\u0000-\u001f\u007f]/.test(entry.id)||
     map.has(entry.id))continue;
  map.set(entry.id,entry); // same first-record rule as the Chronicle viewer
 }
 return map;
};

export function inspectFeaturedEchoSelection(entries,rawIds){
 const ids=normalizeFeaturedEchoIds(rawIds),saved=known(entries);
 const unavailableIds=ids.filter(id=>!saved.has(id));
 return Object.freeze({
  selectedCount:ids.length,
  availableCount:ids.length-unavailableIds.length,
  unavailableCount:unavailableIds.length,
  unavailableIds:Object.freeze(unavailableIds),
 });
}

// Explicit user action only. A temporarily unavailable record might be
// restored by a later account fetch; NEVER silently purge on a render.
export function nextCleanFeaturedEchoSelection(entries,rawIds){
 const ids=normalizeFeaturedEchoIds(rawIds),saved=known(entries);
 const remaining=ids.filter(id=>saved.has(id));
 if(remaining.length===ids.length)
  return Object.freeze({ok:false,reason:'nothing-unavailable'});
 return Object.freeze({ok:true,removed:ids.length-remaining.length,
  ids:Object.freeze(remaining)});
}

// Move one star one step within its OWN calendar month; interleaved months
// retain their existing positions. Does not change saved memory data.
export function nextReorderedFeaturedEchoSelection(entries,rawIds,id,direction){
 if(direction!=='left'&&direction!=='right')
  return Object.freeze({ok:false,reason:'invalid-direction'});
 const ids=normalizeFeaturedEchoIds(rawIds),saved=known(entries);
 const i=ids.indexOf(id),record=saved.get(id);
 if(i<0||!record)return Object.freeze({ok:false,reason:'not-available'});
 const month=echoChronicleMonthKey(record.date),step=direction==='left'?-1:1;
 let other=i+step;
 while(other>=0&&other<ids.length){
  const candidate=saved.get(ids[other]);
  if(candidate&&echoChronicleMonthKey(candidate.date)===month)break;
  other+=step;
 }
 if(other<0||other>=ids.length)
  return Object.freeze({ok:false,reason:'edge'});
 const next=[...ids];[next[i],next[other]]=[next[other],next[i]];
 return Object.freeze({ok:true,ids:Object.freeze(next)});
}

// Bounded, deterministic positions in a PRIVATE on-device preview. The
// gallery is not a night-sky broadcast, achievement, or quest completion.
export function buildPrivateEchoStarPreview(entries,ids,month=ECHO_ALL_MONTHS){
 const records=projectFeaturedEchoStars(entries,ids,month);
 const visible=records.slice(0,coords.length);
 const nodes=visible.map((entry,index)=>Object.freeze({
  id:entry.id,entry,x:coords[index][0],y:coords[index][1],
 }));
 const nodesById=new Map(nodes.map(node=>[node.id,node]));
 const edges=nodes.slice(1).map((node,index)=>{
  const parent=nodesById.get(node.entry.parentId);
  const start=parent&&parent.id!==node.id?parent:nodes[index];
  return Object.freeze({
   fromId:start.id,toId:node.id,x1:start.x,y1:start.y,
   x2:node.x,y2:node.y,
   kind:parent&&parent.id!==node.id?'chosen-branch':'display-order',
  });
 });
 return Object.freeze({
  nodes:Object.freeze(nodes),edges:Object.freeze(edges),
  total:records.length,hiddenCount:Math.max(0,records.length-visible.length),
 });
}
