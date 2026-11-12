// Combat / Quest 69.0–69.4 — "Next saved memory" within a real private Story Thread.
// This is a read-only navigation plan, NOT a read receipt, generated quest,
// automatic journal write, public publication, or saved bookmark mutation.
import {readEchoThreadReadingMark}
 from './echoChronicleReadingMarks.js';

const validId=id=>typeof id==='string'&&id.length>0&&id.length<=128&&
 !/[\u0000-\u001f\u007f]/.test(id);
const validPath=(path,tipId)=>path&&path.tip?.id===tipId&&
 Array.isArray(path.nodes)&&path.nodes.length>=2&&path.nodes.length<=12&&
 path.nodes.at(-1)?.id===tipId&&
 path.nodes.every(node=>validId(node?.id))&&
 new Set(path.nodes.map(node=>node.id)).size===path.nodes.length;

/**
 * Advances one step beyond a *manually saved*, currently readable mark.
 * Missing/unselected parent records, stale marks and final-node marks fail
 * closed. The returned next ID belongs to the same existing saved path.
 */
export function planEchoChronicleNextSavedMemory(
 paths=[],marks=[],tipId,
){
 if(!validId(tipId))
  return Object.freeze({ok:false,reason:'invalid-tip'});
 const path=Array.isArray(paths)?
  paths.find(item=>item?.tip?.id===tipId):null;
 if(!validPath(path,tipId))
  return Object.freeze({ok:false,reason:'thread-not-visible'});
 const saved=readEchoThreadReadingMark(marks,tipId,path.nodes);
 if(!saved.ok||!saved.found)
  return Object.freeze({ok:false,reason:'no-reading-place'});
 if(saved.stale)
  return Object.freeze({ok:false,reason:'reading-place-unavailable'});
 if(saved.position>=path.nodes.length-1)
  return Object.freeze({ok:false,reason:'at-last-memory'});
 const next=path.nodes[saved.position+1];
 return Object.freeze({
  ok:true,tipId,
  fromNodeId:path.nodes[saved.position].id,
  nextNodeId:next.id,
  nextPosition:saved.position+1,
  totalNodes:path.nodes.length,
 });
}
