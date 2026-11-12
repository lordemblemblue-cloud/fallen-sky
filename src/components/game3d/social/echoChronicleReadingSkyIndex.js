// Combat / Quest 65.7–66.1: real saved reading-place counts by sky.
// No player data is transmitted, invented, duplicated, or copied into a
// public index. Only THIS character's selected, still readable story tips
// may produce a month entry. Dates come from the original saved records.
import {buildEchoChronicleStoryThreads} from './echoChronicleStoryThreads.js';
import {
 ECHO_ALL_MONTHS,ECHO_UNDATED_MONTH,
 echoChronicleMonthKey,echoChronicleMonthLabel,
} from './echoChronicleMonthlySky.js';
import {
 normalizeEchoThreadReadingMarks,readEchoThreadReadingMark,
} from './echoChronicleReadingMarks.js';

const validId=id=>typeof id==='string'&&id.length>0&&id.length<=128&&
 !/[\u0000-\u001f\u007f]/.test(id);

export function buildEchoChronicleReadingSkyIndex(
 entries=[],featuredIds=[],rawMarks=[],selectedMonth=ECHO_ALL_MONTHS,
){
 const marks=normalizeEchoThreadReadingMarks(rawMarks);
 const byTip=new Map(marks.map(mark=>[mark.tipId,mark]));
 const threads=buildEchoChronicleStoryThreads(
  entries,featuredIds,ECHO_ALL_MONTHS,
 );
 const groups=new Map(),seen=new Set();
 let visibleCount=0;
 for(const path of threads.paths){
  if(!validId(path?.tip?.id)||seen.has(path.tip.id))continue;
  seen.add(path.tip.id);
  const marked=byTip.get(path.tip.id);
  if(!marked)continue;
  const source=readEchoThreadReadingMark(
   marks,path.tip.id,path.nodes,
  );
  if(!source.ok||!source.found)continue;
  const key=echoChronicleMonthKey(path.tip.date);
  if(!groups.has(key))groups.set(key,{
   month:key,bookmarkCount:0,staleCount:0,
   beforeTipCount:0,atTipCount:0,
  });
  const group=groups.get(key);
  group.bookmarkCount++;visibleCount++;
  if(source.stale)group.staleCount++;
  else if(source.position===path.nodes.length-1)group.atTipCount++;
  else group.beforeTipCount++;
 }
 const skies=[...groups.values()].sort((a,b)=>
  a.month===ECHO_UNDATED_MONTH?1:b.month===ECHO_UNDATED_MONTH?-1:
   b.month.localeCompare(a.month));
 const frozenSkies=Object.freeze(skies.map(item=>Object.freeze({
  ...item,label:echoChronicleMonthLabel(item.month),
  current:item.month===selectedMonth,
 })));
 return Object.freeze({
  skies:frozenSkies,
  selectedMonth,
  bookmarkedSkyCount:frozenSkies.length,
  visibleBookmarkedCount:visibleCount,
  totalSavedCount:marks.length,
  unavailableOrUnselectedCount:marks.length-visibleCount,
  currentSkyCount:skies.find(s=>s.month===selectedMonth)?.bookmarkCount??0,
 });
}
