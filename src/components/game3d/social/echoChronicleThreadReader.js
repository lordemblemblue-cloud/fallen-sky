// Combat / Quest 61.3–61.7: ephemeral, private Story Thread reading.
// Builds a single step-by-step view from already selected, saved parent-linked
// memories. It writes nothing to character storage or the Quest Logbook.

const validId=id=>typeof id==='string'&&id.length>0&&id.length<=128&&
 !/[\u0000-\u001f\u007f]/.test(id);
const safeIndex=(i,size)=>Number.isInteger(i)?
 Math.min(size-1,Math.max(0,i)):0;
const safeTitle=value=>typeof value==='string'?
 value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100):'';

export function readEchoChronicleThread(threadPaths,tipId,requestedIndex=0){
 const paths=Array.isArray(threadPaths)?threadPaths:[];
 if(!validId(tipId))
  return Object.freeze({ok:false,reason:'invalid-tip'});
 const path=paths.find(item=>item?.tip?.id===tipId&&
  Array.isArray(item.nodes)&&item.nodes.length>=2&&item.nodes.length<=12);
 if(!path)return Object.freeze({ok:false,reason:'thread-not-visible'});
 // A path in the explorer must contain the selected saved tip as its final
 // record. Malformed data is refused, never repaired with invented nodes.
 if(path.nodes.at(-1)?.id!==tipId||path.nodes.some(node=>!validId(node?.id)))
  return Object.freeze({ok:false,reason:'invalid-path'});
 const index=safeIndex(requestedIndex,path.nodes.length);
 const nodes=Object.freeze(path.nodes.map(node=>Object.freeze({
  id:node.id,
  title:safeTitle(node.title)||'Saved memory',
  date:typeof node.date==='string'&&Number.isFinite(Date.parse(node.date))
   ?new Date(node.date).toISOString():null,
  source:node.source==='personal'?'personal':'shared',
  inSelectedSky:node.inSelectedSky===true,
 })));
 const step=nodes[index];
 return Object.freeze({
  ok:true,tipId,position:index,total:nodes.length,
  node:step,nodes,previous:index>0?nodes[index-1]:null,
  next:index+1<nodes.length?nodes[index+1]:null,
  isTip:index===nodes.length-1,
  status:['complete','depth-limit','cycle','parent-unavailable']
   .includes(path.status)?path.status:'unknown',
  crossesRecordedMonths:path.crossesRecordedMonths===true,
 });
}

export function stepEchoChronicleThread(threadPaths,tipId,currentIndex,direction){
 if(direction!=='previous'&&direction!=='next')
  return Object.freeze({ok:false,reason:'invalid-direction'});
 const read=readEchoChronicleThread(threadPaths,tipId,currentIndex);
 if(!read.ok)return read;
 const next=read.position+(direction==='previous'?-1:1);
 if(next<0||next>=read.total)
  return Object.freeze({ok:false,reason:'edge'});
 return readEchoChronicleThread(threadPaths,tipId,next);
}
