// Combat / Quest 80.0–80.4 — one-time Redo of an explicitly undone
// private Chronicle reading checkpoint. This plans only: it never persists,
// reads from other skies, generates memories, or changes gameplay quests.
import {
 normalizeEchoThreadReadingMarks,readEchoThreadReadingMark,
} from './echoChronicleReadingMarks.js';

const validId=value=>typeof value==='string'&&value.length>0&&
 value.length<=128&&!/[\u0000-\u001f\u007f]/.test(value);
const validTime=value=>typeof value==='string'&&
 Number.isFinite(Date.parse(value));

export function planEchoChronicleCheckpointRedo(
 paths=[],rawMarks=[],receipt,
){
 if(!receipt||!validId(receipt.tipId)||
  !validId(receipt.restoredNodeId)||!validId(receipt.targetNodeId)||
  !validTime(receipt.restoredSavedAt)||
  !Array.isArray(receipt.sourceNodeIds)||
  receipt.sourceNodeIds.length<2||receipt.sourceNodeIds.length>12||
  receipt.sourceNodeIds.some(id=>!validId(id)))
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
 const sourceNodeIds=path.nodes.map(node=>node.id);
 // The exact original source ordering must survive Undo and Redo.
 if(sourceNodeIds.length!==receipt.sourceNodeIds.length||
  sourceNodeIds.some((id,index)=>id!==receipt.sourceNodeIds[index]))
  return Object.freeze({ok:false,reason:'source-changed'});
 const saved=readEchoThreadReadingMark(rawMarks,receipt.tipId,path.nodes);
 const current=normalizeEchoThreadReadingMarks(rawMarks)
  .find(mark=>mark.tipId===receipt.tipId);
 if(!saved.ok||!saved.found||saved.stale||!current||
  current.nodeId!==receipt.restoredNodeId||
  current.updatedAt!==new Date(receipt.restoredSavedAt).toISOString())
  return Object.freeze({ok:false,reason:'checkpoint-changed'});
 const fromPosition=sourceNodeIds.indexOf(receipt.restoredNodeId);
 const toPosition=sourceNodeIds.indexOf(receipt.targetNodeId);
 if(fromPosition<0||toPosition<=fromPosition||
  saved.position!==fromPosition)
  return Object.freeze({ok:false,reason:'source-changed'});
 return Object.freeze({
  ok:true,tipId:receipt.tipId,nodeId:receipt.targetNodeId,
  expectedNodeId:current.nodeId,expectedSavedAt:current.updatedAt,
  fromPosition,toPosition,totalNodes:sourceNodeIds.length,
  sourceNodeIds:Object.freeze(sourceNodeIds),
 });
}
