// Combat / Quest 70.1–70.5 — a private "next recorded memory" reading queue.
// This list is calculated from real chosen Story Threads and explicit local
// bookmarks. It is NOT an unread-message count, quest completion, or server task.
import {normalizeEchoThreadReadingMarks}
 from './echoChronicleReadingMarks.js';
import {planEchoChronicleNextSavedMemory}
 from './echoChronicleNextSavedMemory.js';

export const ECHO_NEXT_QUEUE_FILTERS=Object.freeze([
 Object.freeze({id:'all',label:'All next memories'}),
 Object.freeze({id:'first',label:'First continuation'}),
 Object.freeze({id:'later',label:'Later in thread'}),
 Object.freeze({id:'incomplete',label:'Incomplete links'}),
]);
export const ECHO_NEXT_QUEUE_SORTS=Object.freeze([
 Object.freeze({id:'recent',label:'Recently bookmarked'}),
 Object.freeze({id:'oldest',label:'Oldest bookmark'}),
 Object.freeze({id:'title',label:'Thread title'}),
 Object.freeze({id:'next',label:'Next memory title'}),
]);
const FILTER_IDS=new Set(ECHO_NEXT_QUEUE_FILTERS.map(item=>item.id));
const SORT_IDS=new Set(ECHO_NEXT_QUEUE_SORTS.map(item=>item.id));
const safeQuery=value=>typeof value==='string'
 ?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100).toLocaleLowerCase():'';
const matchesFilter=(item,filter)=>filter==='all'||
 (filter==='first'&&item.nextPosition===1)||
 (filter==='later'&&item.nextPosition>=2)||
 (filter==='incomplete'&&item.chainIncomplete);
const compareCandidates=(a,b,sort)=>{
 if(sort==='title')return a.threadTitle.localeCompare(b.threadTitle)||
  a.tipId.localeCompare(b.tipId);
 if(sort==='next')return a.nextTitle.localeCompare(b.nextTitle)||
  a.tipId.localeCompare(b.tipId);
 const dt=Date.parse(b.savedAt)-Date.parse(a.savedAt);
 return (sort==='oldest'?-dt:dt)||a.tipId.localeCompare(b.tipId);
};
const validId=value=>typeof value==='string'&&value.length>0&&
 value.length<=128&&!/[\u0000-\u001f\u007f]/.test(value);
const safeTitle=value=>typeof value==='string'?
 value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100):'';
const pageSizeOf=value=>Number.isInteger(value)?
 Math.min(10,Math.max(2,value)):5;

export function buildEchoChronicleNextMemoryQueue(
 paths=[],rawMarks=[],{
  page=0,pageSize=5,filter='all',sort='recent',query='',
 }={},
){
 const selectedFilter=FILTER_IDS.has(filter)?filter:'all';
 const selectedSort=SORT_IDS.has(sort)?sort:'recent';
 const search=safeQuery(query);
 const chosen=Array.isArray(paths)?paths:[];
 const marks=normalizeEchoThreadReadingMarks(rawMarks);
 const marked=new Map(marks.map(item=>[item.tipId,item]));
 const seen=new Set(),available=[];
 let blockedCount=0;
 for(const path of chosen){
  const id=path?.tip?.id;
  if(!validId(id)||seen.has(id)||!marked.has(id))continue;
  seen.add(id);
  // Only a personally saved journal continuation can be the tip. A
  // mutually consented shared encounter can appear as an ancestor.
  if(path.tip.source!=='personal'){blockedCount++;continue}
  const plan=planEchoChronicleNextSavedMemory(chosen,marks,id);
  if(!plan.ok){blockedCount++;continue}
  const node=path.nodes[plan.nextPosition];
  const source=marked.get(id);
  if(!node||node.id!==plan.nextNodeId||
   (node.source!=='personal'&&node.source!=='shared')){
   blockedCount++;continue
  }
  available.push(Object.freeze({
   tipId:id,
   threadTitle:safeTitle(path.tip.title)||'Saved story thread',
   nextNodeId:node.id,
   nextTitle:safeTitle(node.title)||'Saved memory',
   nextPosition:plan.nextPosition,
   totalNodes:plan.totalNodes,
   source:node.source==='personal'?'personal':'shared',
   savedAt:source.updatedAt,
   chainIncomplete:path.status!=='complete',
  }));
 }
 const filterCounts=Object.freeze(Object.fromEntries(
  ECHO_NEXT_QUEUE_FILTERS.map(option=>[
   option.id,available.filter(item=>matchesFilter(item,option.id)).length,
  ]),
 ));
 const matching=available.filter(item=>
  matchesFilter(item,selectedFilter)&&(!search||
   [item.threadTitle,item.nextTitle].some(title=>
    title.toLocaleLowerCase().includes(search))));
 matching.sort((a,b)=>compareCandidates(a,b,selectedSort));
 const size=pageSizeOf(pageSize);
 const pageCount=Math.max(1,Math.ceil(matching.length/size));
 const safePage=Number.isInteger(page)?Math.max(0,Math.min(page,pageCount-1)):0;
 return Object.freeze({
  items:Object.freeze(matching.slice(safePage*size,(safePage+1)*size)),
  eligibleCount:available.length,
  matchingCount:matching.length,
  filter:selectedFilter,sort:selectedSort,query:search,
  filterCounts,hasFilters:selectedFilter!=='all'||Boolean(search),
  blockedCount,
  markedVisibleCount:available.length+blockedCount,
  page:safePage,pageCount,hasMore:safePage+1<pageCount,
 });
}
