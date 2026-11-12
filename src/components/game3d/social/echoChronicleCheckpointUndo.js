// Combat / Quest 74.5–74.9 — undo one explicitly confirmed local
// Reading Shelf checkpoint, never a journal edit, game quest, or auto-history.
// Receipts exist in React memory only; no persistent history is created.
import {
 normalizeEchoThreadReadingMarks,readEchoThreadReadingMark,
} from './echoChronicleReadingMarks.js';

const validId=value=>typeof value==='string'&&value.length>0&&
 value.length<=128&&!/[\u0000-\u001f\u007f]/.test(value);
const validTime=value=>typeof value==='string'&&
 Number.isFinite(Date.parse(value));

export function planEchoChronicleCheckpointUndo(
 paths=[],rawMarks=[],receipt,
){
 if(!receipt||!validId(receipt.tipId)||!validId(receipt.fromNodeId)||
  !validId(receipt.toNodeId)||!validTime(receipt.fromSavedAt)||
  !validTime(receipt.toSavedAt))
  return Object.freeze({ok:false,reason:'invalid-receipt'});
 const path=Array.isArray(paths)?
  paths.find(item=>item?.tip?.id===receipt.tipId):null;
 if(!path||path.tip.source!=='personal'||
  !Array.isArray(path.nodes)||path.nodes.length<2||path.nodes.length>12||
  path.nodes.at(-1)?.id!==receipt.tipId||
  path.nodes.some(node=>!validId(node?.id)||
   (node.source!=='personal'&&node.source!=='shared'))||
  new Set(path.nodes.map(node=>node.id)).size!==path.nodes.length)
  return Object.freeze({ok:false,reason:'thread-not-visible'});
 // A receipt is bound to the exact recorded sequence at save time.
 // Reordering, deleting or replacing a saved source must not authorize Undo.
 const sourceNodeIds=path.nodes.map(node=>node.id);
 if(!Array.isArray(receipt.sourceNodeIds)||
  receipt.sourceNodeIds.length!==sourceNodeIds.length||
  receipt.sourceNodeIds.some((id,index)=>
   !validId(id)||id!==sourceNodeIds[index]))
  return Object.freeze({ok:false,reason:'source-changed'});
 const saved=readEchoThreadReadingMark(
  rawMarks,receipt.tipId,path.nodes);
 const current=normalizeEchoThreadReadingMarks(rawMarks)
  .find(mark=>mark.tipId===receipt.tipId);
 if(!saved.ok||!saved.found||saved.stale||!current||
  current.nodeId!==receipt.toNodeId||
  current.updatedAt!==new Date(receipt.toSavedAt).toISOString())
  return Object.freeze({ok:false,reason:'checkpoint-changed'});
 const fromIndex=path.nodes.findIndex(node=>node.id===receipt.fromNodeId);
 const toIndex=path.nodes.findIndex(node=>node.id===receipt.toNodeId);
 if(fromIndex<0||toIndex<=fromIndex||
  saved.position!==toIndex)
  return Object.freeze({ok:false,reason:'source-changed'});
 return Object.freeze({
  ok:true,tipId:receipt.tipId,nodeId:receipt.fromNodeId,
  expectedNodeId:current.nodeId,expectedSavedAt:current.updatedAt,
  fromPosition:toIndex,toPosition:fromIndex,
  totalNodes:path.nodes.length,
  sourceNodeIds:Object.freeze(sourceNodeIds),
 });
}
