// Combat / Quest 63.5–63.9 — private reading shelf projection.
// Only currently selected, actually saved Chronicle threads are named.
// Other-character or missing-source records are never recovered by guessing.
import {
 normalizeEchoThreadReadingMarks,readEchoThreadReadingMark,
} from './echoChronicleReadingMarks.js';

export const ECHO_READING_SHELF_FILTERS=Object.freeze([
 Object.freeze({id:'all',label:'All saved places'}),
 Object.freeze({id:'ready',label:'Available'}),
 Object.freeze({id:'unfinished',label:'Before last memory'}),
 Object.freeze({id:'at-tip',label:'At last memory'}),
 Object.freeze({id:'stale',label:'Needs attention'}),
]);
export const ECHO_READING_SHELF_SORTS=Object.freeze([
 Object.freeze({id:'recent',label:'Recently saved'}),
 Object.freeze({id:'oldest',label:'Oldest saved'}),
 Object.freeze({id:'title',label:'Story title'}),
 Object.freeze({id:'progress',label:'Furthest read'}),
]);
const FILTER_IDS=new Set(ECHO_READING_SHELF_FILTERS.map(item=>item.id));
const SORT_IDS=new Set(ECHO_READING_SHELF_SORTS.map(item=>item.id));
const safeQuery=value=>typeof value==='string'
 ?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100).toLocaleLowerCase():'';
const matchesFilter=(item,filter)=>{
 if(filter==='stale')return item.stale;
 if(filter==='ready')return !item.stale;
 if(filter==='unfinished')return !item.stale&&item.position<item.totalNodes-1;
 if(filter==='at-tip')return !item.stale&&item.position===item.totalNodes-1;
 return true;
};
const progress=item=>item.stale?-1:item.position/(item.totalNodes-1);
const compareItems=(a,b,sort)=>{
 if(sort==='title')return a.title.localeCompare(b.title)||a.tipId.localeCompare(b.tipId);
 if(sort==='progress')return progress(b)-progress(a)||
  Date.parse(b.updatedAt)-Date.parse(a.updatedAt)||
  a.tipId.localeCompare(b.tipId);
 const dt=Date.parse(b.updatedAt)-Date.parse(a.updatedAt);
 return (sort==='oldest'?-dt:dt)||a.tipId.localeCompare(b.tipId);
};
const validId=id=>typeof id==='string'&&id.length>0&&id.length<=128&&
 !/[\u0000-\u001f\u007f]/.test(id);
const safeTitle=value=>typeof value==='string'
 ?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100):'';
const safePageSize=value=>Number.isInteger(value)
 ?Math.max(2,Math.min(10,value)):5;
const validPath=path=>validId(path?.tip?.id)&&
 Array.isArray(path.nodes)&&path.nodes.length>=2&&path.nodes.length<=12&&
 path.nodes.at(-1)?.id===path.tip.id&&
 path.nodes.every(node=>validId(node?.id))&&
 new Set(path.nodes.map(node=>node.id)).size===path.nodes.length;

export function projectEchoChronicleReadingShelf(paths=[],rawMarks=[],{
 page=0,pageSize=5,filter='all',sort='recent',query='',
}={}){
 const selectedFilter=FILTER_IDS.has(filter)?filter:'all';
 const selectedSort=SORT_IDS.has(sort)?sort:'recent';
 const search=safeQuery(query);
 const marks=normalizeEchoThreadReadingMarks(rawMarks);
 const markMap=new Map(marks.map(mark=>[mark.tipId,mark]));
 const displayed=[],seen=new Set();
 for(const path of Array.isArray(paths)?paths:[]){
  if(!validPath(path)||seen.has(path.tip.id))continue;
  seen.add(path.tip.id);
  const mark=markMap.get(path.tip.id);
  if(!mark)continue;
  const source=readEchoThreadReadingMark(marks,path.tip.id,path.nodes);
  if(!source.ok||!source.found)continue;
  const node=path.nodes.find(item=>item.id===mark.nodeId);
  displayed.push(Object.freeze({
   tipId:path.tip.id,
   title:safeTitle(path.tip.title)||'Saved thread',
   nodeId:mark.nodeId,
   nodeTitle:node?safeTitle(node.title)||'Saved memory':null,
   position:source.stale?null:source.position,
   totalNodes:path.nodes.length,
   stale:source.stale,
   updatedAt:mark.updatedAt,
  }));
 }
 const filterCounts=Object.freeze(Object.fromEntries(
  ECHO_READING_SHELF_FILTERS.map(item=>[
   item.id,displayed.filter(row=>matchesFilter(row,item.id)).length,
  ]),
 ));
 const matching=displayed.filter(item=>
  matchesFilter(item,selectedFilter)&&(!search||
   [item.title,item.nodeTitle].some(text=>
    typeof text==='string'&&text.toLocaleLowerCase().includes(search))));
 matching.sort((a,b)=>compareItems(a,b,selectedSort));
 const size=safePageSize(pageSize);
 const pageCount=Math.max(1,Math.ceil(matching.length/size));
 const index=Number.isInteger(page)?Math.max(0,Math.min(pageCount-1,page)):0;
 return Object.freeze({
  items:Object.freeze(matching.slice(index*size,(index+1)*size)),
  currentSkyCount:displayed.length,
  matchingCount:matching.length,
  filter:selectedFilter,sort:selectedSort,query:search,
  filterCounts,hasFilters:selectedFilter!=='all'||Boolean(search),
  totalSavedCount:marks.length,
  otherSkyOrUnavailableCount:marks.length-displayed.length,
  staleCount:displayed.filter(item=>item.stale).length,
  page:index,pageCount,hasMore:index+1<pageCount,
 });
}
