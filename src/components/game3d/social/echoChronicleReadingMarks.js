// Combat / Quest 62.4–62.8 — private, character-local reader bookmarks.
// A reading mark holds only existing saved memory IDs and a device edit time;
// it does NOT create a memory, quest, public event, or encounter outcome.
export const MAX_ECHO_THREAD_READING_MARKS=60;
const validId=id=>typeof id==='string'&&id.length>0&&id.length<=128&&
 !/[\u0000-\u001f\u007f]/.test(id);
const validTime=value=>typeof value==='string'&&
 Number.isFinite(Date.parse(value));
const safeNodes=nodes=>{
 if(!Array.isArray(nodes)||nodes.length<2||nodes.length>12)return null;
 if(nodes.some(node=>!validId(node?.id)))return null;
 const ids=nodes.map(node=>node.id);
 return new Set(ids).size===ids.length?ids:null;
};

export function normalizeEchoThreadReadingMarks(raw){
 if(!Array.isArray(raw))return Object.freeze([]);
 const seen=new Set(),items=[];
 for(const item of raw){
  if(!item||typeof item!=='object'||!validId(item.tipId)||
   !validId(item.nodeId)||!validTime(item.updatedAt)||
   seen.has(item.tipId))continue;
  seen.add(item.tipId);
  items.push(Object.freeze({
   tipId:item.tipId,nodeId:item.nodeId,
   updatedAt:new Date(item.updatedAt).toISOString(),
  }));
  if(items.length>=MAX_ECHO_THREAD_READING_MARKS)break;
 }
 return Object.freeze(items);
}

export function readEchoThreadReadingMark(marks,tipId,nodes){
 const safe=safeNodes(nodes);
 if(!validId(tipId)||!safe||safe.at(-1)!==tipId)
  return Object.freeze({ok:false,reason:'thread-not-visible'});
 const found=normalizeEchoThreadReadingMarks(marks)
  .find(mark=>mark.tipId===tipId);
 if(!found)return Object.freeze({ok:true,found:false,position:0,
  stale:false,nodeId:safe[0]});
 const index=safe.indexOf(found.nodeId);
 return Object.freeze({
  ok:true,found:true,
  position:index<0?0:index,
  stale:index<0,nodeId:index<0?safe[0]:found.nodeId,
  updatedAt:found.updatedAt,
 });
}

export function nextEchoThreadReadingMark(marks,{
 tipId,nodeId,nodes,now=Date.now,
}={}){
 const safe=safeNodes(nodes);
 if(!validId(tipId)||!validId(nodeId)||!safe||
   safe.at(-1)!==tipId||!safe.includes(nodeId))
  return Object.freeze({ok:false,reason:'not-saved-in-thread'});
 const current=normalizeEchoThreadReadingMarks(marks);
 if(!current.some(mark=>mark.tipId===tipId)&&
    current.length>=MAX_ECHO_THREAD_READING_MARKS)
  return Object.freeze({ok:false,reason:'mark-limit'});
 const time=typeof now==='function'?now():NaN;
 if(!Number.isSafeInteger(time)||time<1||time>8.64e15)
  return Object.freeze({ok:false,reason:'invalid-clock'});
 const mark=Object.freeze({
  tipId,nodeId,updatedAt:new Date(time).toISOString(),
 });
 return Object.freeze({
  ok:true,mark,marks:Object.freeze([
   mark,...current.filter(item=>item.tipId!==tipId),
  ]),
 });
}

export function nextRemovedEchoThreadReadingMark(marks,tipId){
 if(!validId(tipId))return Object.freeze({ok:false,reason:'invalid-tip'});
 const current=normalizeEchoThreadReadingMarks(marks);
 if(!current.some(item=>item.tipId===tipId))
  return Object.freeze({ok:false,reason:'not-found'});
 return Object.freeze({
  ok:true,marks:Object.freeze(current.filter(item=>item.tipId!==tipId)),
 });
}
