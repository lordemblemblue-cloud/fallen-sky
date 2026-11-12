// Combat / Quest 73.4–73.8 — explicit, forward-only private reading checkpoint.
// This is only a validated intention to update a local bookmark. It does NOT
// persist anything, mark a memory as read, or modify a gameplay quest.
import {projectEchoChronicleRemainingPages}
 from './echoChronicleRemainingPages.js';
import {normalizeEchoThreadReadingMarks}
 from './echoChronicleReadingMarks.js';

const validId=id=>typeof id==='string'&&id.length>0&&id.length<=128&&
 !/[\u0000-\u001f\u007f]/.test(id);

export function planEchoChronicleReadingCheckpoint(
 paths=[],rawMarks=[],tipId,targetNodeId,
){
 if(!validId(tipId)||!validId(targetNodeId))
  return Object.freeze({ok:false,reason:'invalid-memory-id'});
 const source=projectEchoChronicleRemainingPages(paths,rawMarks,tipId);
 if(!source.ok)return Object.freeze({ok:false,reason:source.reason});
 const target=source.pages.find(page=>page.id===targetNodeId);
 if(!target)
  return Object.freeze({ok:false,reason:'not-a-following-saved-page'});
 const path=paths.find(item=>item?.tip?.id===tipId);
 const sourceNodeIds=Object.freeze(path.nodes.map(node=>node.id));
 const mark=normalizeEchoThreadReadingMarks(rawMarks)
  .find(item=>item.tipId===tipId);
 if(!mark||mark.nodeId!==source.fromNodeId)
  return Object.freeze({ok:false,reason:'reading-place-changed'});
 return Object.freeze({
  ok:true,tipId,nodeId:targetNodeId,
  fromNodeId:mark.nodeId,
  fromSavedAt:mark.updatedAt,
  toPosition:target.position,
  totalNodes:source.totalNodes,sourceNodeIds,
 });
}
