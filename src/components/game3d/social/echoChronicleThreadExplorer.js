// Combat / Quest 60.2–60.7 — read-only private Story Thread explorer.
// All paths and forks originate from existing saved Chronicle records.
// Search and filters do not modify memories, grant quests or publish data.
export const ECHO_THREAD_FILTERS=Object.freeze([
 Object.freeze({id:'all',label:'All threads'}),
 Object.freeze({id:'cross-month',label:'Across months'}),
 Object.freeze({id:'deep',label:'Long threads'}),
 Object.freeze({id:'forked',label:'Saved forks'}),
 Object.freeze({id:'attention',label:'Needs attention'}),
]);
export const ECHO_THREAD_SORTS=Object.freeze([
 Object.freeze({id:'chosen',label:'Chosen order'}),
 Object.freeze({id:'newest',label:'Newest memory'}),
 Object.freeze({id:'oldest',label:'Oldest memory'}),
 Object.freeze({id:'longest',label:'Longest thread'}),
]);
const FILTER_IDS=new Set(ECHO_THREAD_FILTERS.map(item=>item.id));
const SORT_IDS=new Set(ECHO_THREAD_SORTS.map(item=>item.id));
const safeQuery=value=>typeof value==='string'
 ?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100).toLocaleLowerCase():'';
const validPath=path=>path&&typeof path.tip?.id==='string'&&
 Array.isArray(path.nodes)&&path.nodes.length>=2;
const dateMs=path=>{
 const time=typeof path.tip?.date==='string'?Date.parse(path.tip.date):NaN;
 return Number.isFinite(time)?time:null;
};
const forkChildIds=threads=>{
 const ids=new Set();
 for(const fork of Array.isArray(threads?.forks)?threads.forks:[]){
  for(const child of Array.isArray(fork?.children)?fork.children:[]){
   if(typeof child?.id==='string')ids.add(child.id);
  }
 }
 return ids;
};
const matchesFilter=(path,filter,forkIds)=>{
 if(filter==='cross-month')return path.crossesRecordedMonths===true;
 if(filter==='deep')return path.linkCount>=3;
 if(filter==='forked')return path.nodes.some(node=>forkIds.has(node.id));
 if(filter==='attention')return path.status!=='complete';
 return true;
};
const matchesQuery=(path,query)=>!query||path.nodes.some(node=>
 typeof node?.title==='string'&&node.title.toLocaleLowerCase().includes(query));
const safePageSize=n=>Number.isInteger(n)?Math.max(2,Math.min(10,n)):5;
const comparePath=(a,b,sort)=>{
 if(sort==='longest')return b.linkCount-a.linkCount||a.tip.id.localeCompare(b.tip.id);
 const ta=dateMs(a),tb=dateMs(b);
 if(ta===null&&tb!==null)return 1;
 if(tb===null&&ta!==null)return -1;
 const order=sort==='oldest'?1:-1;
 return (ta??0)!==(tb??0)?order*((ta??0)-(tb??0)):
  a.tip.id.localeCompare(b.tip.id);
};

export function projectEchoChronicleThreadExplorer(threads,{
 filter='all',sort='chosen',query='',page=0,pageSize=5,
}={}){
 const all=(Array.isArray(threads?.paths)?threads.paths:[]).filter(validPath);
 const forkIds=forkChildIds(threads);
 const selectedFilter=FILTER_IDS.has(filter)?filter:'all';
 const selectedSort=SORT_IDS.has(sort)?sort:'chosen';
 const search=safeQuery(query);
 const counters={all:all.length,'cross-month':0,deep:0,forked:0,attention:0};
 for(const path of all){
  for(const key of ['cross-month','deep','forked','attention']){
   if(matchesFilter(path,key,forkIds))counters[key]++;
  }
 }
 const matching=all.filter(path=>matchesFilter(path,selectedFilter,forkIds)&&
  matchesQuery(path,search));
 const ordered=selectedSort==='chosen'?matching:
  [...matching].sort((a,b)=>comparePath(a,b,selectedSort));
 const size=safePageSize(pageSize),pageCount=Math.max(1,Math.ceil(ordered.length/size));
 const current=Number.isInteger(page)?Math.min(pageCount-1,Math.max(0,page)):0;
 const paths=Object.freeze(ordered.slice(current*size,(current+1)*size));
 const visibleNodeIds=new Set(paths.flatMap(path=>path.nodes.map(node=>node.id)));
 const forks=Object.freeze((Array.isArray(threads?.forks)?threads.forks:[])
  .filter(fork=>Array.isArray(fork?.children)&&
   fork.children.some(child=>visibleNodeIds.has(child.id))));
 const unresolved=Object.freeze((selectedFilter==='all'||selectedFilter==='attention'
  ?(Array.isArray(threads?.unresolved)?threads.unresolved:[]):[])
  .filter(item=>!search||(typeof item?.title==='string'&&
   item.title.toLocaleLowerCase().includes(search))));
 return Object.freeze({
  paths,forks,unresolved,
  counters:Object.freeze(counters),
  filter:selectedFilter,sort:selectedSort,query:search,
  page:current,pageCount,totalMatches:ordered.length,
  totalAvailable:all.length,hasFilters:selectedFilter!=='all'||!!search,
  hasMore:current+1<pageCount,
 });
}
