// Combat / Quest 77.8–78.8 — read-only recovery visibility for bookmarks
// whose originally saved source is not presently in a selected Story Thread.
// Never guesses a different saved position, writes a mark or fetches other skies.
import {normalizeEchoThreadReadingMarks,readEchoThreadReadingMark}
 from './echoChronicleReadingMarks.js';

const validId=id=>typeof id==='string'&&id.length>0&&id.length<=128&&
 !/[\u0000-\u001f\u007f]/.test(id);
const safeTitle=value=>typeof value==='string'
 ?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100):'';

export function projectEchoChronicleUnavailableReadingPlaces(
 paths=[],rawMarks=[],
){
 const selected=Array.isArray(paths)?paths:[];
 const marks=new Map(normalizeEchoThreadReadingMarks(rawMarks)
  .map(mark=>[mark.tipId,mark]));
 const seen=new Set(),items=[];
 for(const path of selected){
  const tipId=path?.tip?.id;
  // A mark in another sky is not evidence that its source is missing.
  if(!validId(tipId)||seen.has(tipId)||!marks.has(tipId)||
   path.tip.source!=='personal')continue;
  seen.add(tipId);
  const validSource=Array.isArray(path.nodes)&&
   path.nodes.length>=2&&path.nodes.length<=12&&
   path.nodes.at(-1)?.id===tipId&&
   path.nodes.every(node=>validId(node?.id)&&
    (node.source==='personal'||node.source==='shared'))&&
   new Set(path.nodes.map(node=>node.id)).size===path.nodes.length;
  const result=validSource?readEchoThreadReadingMark(
   [marks.get(tipId)],tipId,path.nodes):{ok:false};
  if(result.ok&&!result.stale)continue;
  items.push(Object.freeze({
   tipId,
   threadTitle:safeTitle(path.tip.title)||'Saved story thread',
   reason:!result.ok?'thread-unavailable':'saved-page-unavailable',
  }));
 }
 return Object.freeze({
  items:Object.freeze(items),
  unavailableCount:items.length,
 });
}
