// Combat / Quest 72.3–72.7: preview only actually saved following pages.
// A private, immutable reading projection; never a quest, server query,
// generated journal entry, public share, or automatic bookmark update.
import {readEchoThreadReadingMark} from './echoChronicleReadingMarks.js';

const validId=id=>typeof id==='string'&&id.length>0&&id.length<=128&&
 !/[\u0000-\u001f\u007f]/.test(id);
const safeTitle=value=>typeof value==='string'?
 value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100):'';
const safeDate=value=>{
 if(typeof value!=='string'||!value.trim())return null;
 const timestamp=Date.parse(value);
 return Number.isFinite(timestamp)?new Date(timestamp).toISOString():null;
};
const safePath=(path,tipId)=>path?.tip?.id===tipId&&
 path.tip.source==='personal'&&
 Array.isArray(path.nodes)&&path.nodes.length>=2&&path.nodes.length<=12&&
 path.nodes.at(-1)?.id===tipId&&
 path.nodes.every(node=>validId(node?.id)&&
  (node.source==='personal'||node.source==='shared'))&&
 new Set(path.nodes.map(node=>node.id)).size===path.nodes.length;

/**
 * The preview begins AFTER a manually marked real saved node.
 * A missing source, stale bookmark, duplicate source ID or final-page
 * bookmark refuses to invent any continuation.
 */
export function projectEchoChronicleRemainingPages(
 paths=[],marks=[],tipId,
){
 if(!validId(tipId))return Object.freeze({ok:false,reason:'invalid-tip'});
 const path=Array.isArray(paths)?
  paths.find(item=>item?.tip?.id===tipId):null;
 if(!safePath(path,tipId))
  return Object.freeze({ok:false,reason:'thread-not-visible'});
 const mark=readEchoThreadReadingMark(marks,tipId,path.nodes);
 if(!mark.ok||!mark.found)
  return Object.freeze({ok:false,reason:'no-reading-place'});
 if(mark.stale)
  return Object.freeze({ok:false,reason:'reading-place-unavailable'});
 if(mark.position===path.nodes.length-1)
  return Object.freeze({ok:false,reason:'at-last-memory'});
 const pages=path.nodes.slice(mark.position+1).map((node,index)=>Object.freeze({
  id:node.id,
  title:safeTitle(node.title)||'Saved memory',
  date:safeDate(node.date),
  source:node.source,
  inSelectedSky:node.inSelectedSky===true,
  position:mark.position+1+index,
 }));
 return Object.freeze({
  ok:true,tipId,fromNodeId:mark.nodeId,
  totalNodes:path.nodes.length,
  remainingCount:pages.length,
  pathStatus:path.status==='complete'?'complete':'incomplete',
  pages:Object.freeze(pages),
 });
}
