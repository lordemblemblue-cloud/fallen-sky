import {useEffect,useMemo,useState} from 'react';
import {
 BookOpen,ChevronRight,ChevronLeft,GitBranch,LockKeyhole,MapPin,Plus,Users,Search,X,
} from 'lucide-react';
import {buildEchoChronicleCrossroads} from './echoChronicleCrossroads.js';
import {buildEchoChronicleRecordedReturns} from './echoChronicleRecordedReturns.js';
import {buildEchoChronicleStoryThreads} from './echoChronicleStoryThreads.js';
import EchoChronicleThreadReader from './EchoChronicleThreadReader.jsx';
import EchoChronicleReadingShelf from './EchoChronicleReadingShelf.jsx';
import {
 ECHO_THREAD_FILTERS,ECHO_THREAD_SORTS,projectEchoChronicleThreadExplorer,
} from './echoChronicleThreadExplorer.js';

// Private context for real saved moments; display names are NOT proof that
// two encounters involved the same unique player or that a quest occurred.
const VIEWS=Object.freeze([
 {id:'places',name:'Recorded places',icon:MapPin},
 {id:'travelers',name:'Traveler names',icon:Users},
 {id:'branches',name:'Chosen continuations',icon:GitBranch},
 {id:'returns',name:'Repeated places',icon:MapPin},
 {id:'threads',name:'Story threads',icon:GitBranch},
]);
export default function EchoChronicleCrossroads({
 entries=[],featuredIds=[],month='all',onOpen,onOpenParent,onContinue,onChooseMonth,
 onChooseReadingShelf,autoOpenReadingShelf=false,
}){
 const [view,setView]=useState(autoOpenReadingShelf?'threads':'places');
 useEffect(()=>setView(autoOpenReadingShelf?'threads':'places'),
  [month,autoOpenReadingShelf]);
 const [threadFilter,setThreadFilter]=useState('all');
 const [threadSort,setThreadSort]=useState('chosen');
 const [threadQuery,setThreadQuery]=useState('');
 const [threadPage,setThreadPage]=useState(0);
 const [readingTip,setReadingTip]=useState(null);
 useEffect(()=>{
  setThreadFilter('all');setThreadSort('chosen');
  setThreadQuery('');setThreadPage(0);
 },[month]);
 useEffect(()=>setReadingTip(null),
  [month,threadFilter,threadSort,threadQuery,threadPage]);
 const crossroads=useMemo(()=>buildEchoChronicleCrossroads(
  entries,featuredIds,month,
 ),[entries,featuredIds,month]);
 const returns=useMemo(()=>buildEchoChronicleRecordedReturns(
  entries,featuredIds,month,
 ),[entries,featuredIds,month]);
 const threads=useMemo(()=>buildEchoChronicleStoryThreads(
  entries,featuredIds,month,
 ),[entries,featuredIds,month]);
 const threadExplorer=useMemo(()=>projectEchoChronicleThreadExplorer(
  threads,{filter:threadFilter,sort:threadSort,query:threadQuery,
   page:threadPage,pageSize:5},
 ),[threads,threadFilter,threadSort,threadQuery,threadPage]);
 const groups=view==='places'?crossroads.places:crossroads.travelerNames;
 return <section className="axe-echo-crossroads"
  aria-label="Where recorded paths cross">
  <header>
   <GitBranch size={17}/>
   <div><h4>Where Paths Cross</h4>
    <p>Revisit places, recorded traveler names and your own chosen branches.</p>
   </div>
   <LockKeyhole size={15} aria-label="Private"/>
  </header>
  <div className="axe-echo-crossroads-views" role="group"
    aria-label="Crossroads memory views">
   {VIEWS.map(item=><button type="button" key={item.id}
     aria-pressed={view===item.id} onClick={()=>setView(item.id)}>
     <item.icon size={15}/>{item.name}
     <small>{item.id==='places'?crossroads.places.length:
      item.id==='travelers'?crossroads.travelerNames.length:
      item.id==='branches'?crossroads.continuations.length:
      item.id==='returns'?returns.repeatedPlaceCount:
      threads.continuationCount}</small>
    </button>)}
  </div>
  {(view==='places'||view==='travelers')&&<div className="axe-echo-crossroads-groups">
   {groups.map(group=><section key={group.title.toLocaleLowerCase()}
    className="axe-echo-crossroads-group">
    <div className="axe-echo-crossroads-group-heading">
     {view==='places'?<MapPin size={15}/>:<Users size={15}/>}
     <strong>{group.title}</strong>
     <small>{group.count} saved {group.count===1?'moment':'moments'}</small>
    </div>
    <div className="axe-echo-crossroads-moments">
     {group.records.map(record=><div key={record.id}
      className="axe-echo-crossroads-record">
      <span><BookOpen size={14}/>{record.title}
       <small>{record.date?new Date(record.date).toLocaleDateString():
        'Date not recorded'}</small></span>
      <button type="button" onClick={()=>onOpen?.(record.id)}
       aria-label={'Open saved memory: '+record.title}>
       Open <ChevronRight size={14}/></button>
      <button type="button" onClick={()=>onContinue?.(record.id)}
       aria-label={'Continue privately from: '+record.title}>
       <Plus size={14}/> Continue</button>
     </div>)}
    </div>
   </section>)}
   {!groups.length&&<p className="axe-echo-crossroads-empty">
    {view==='places'?
     'No place was recorded for the chosen memories in this sky.':
     'No mutually saved traveler names are in the chosen memories for this sky.'}
   </p>}
  </div>}
  {view==='branches'&&<div className="axe-echo-crossroads-groups">
    {crossroads.continuations.map(path=><article
     key={path.child.id} className="axe-echo-crossroads-branch">
     <div><GitBranch size={15}/>
      <strong>{path.parent.title}</strong>
      <span>to</span><strong>{path.child.title}</strong>
     </div>
     <p>Personally chosen memory continuation
      {path.parentInSelectedSky?'':' · earlier memory outside this sky'}</p>
     <nav aria-label="Open recorded branch memories">
      <button type="button" onClick={()=>onOpenParent?.(path.parent.id)}>
       Open earlier memory</button>
      <button type="button" onClick={()=>onOpen?.(path.child.id)}>
       Open continuation</button>
      <button type="button" onClick={()=>onContinue?.(path.child.id)}>
       <Plus size={13}/> Continue privately</button>
     </nav>
    </article>)}
    {!crossroads.continuations.length&&<p className="axe-echo-crossroads-empty">
     There are no explicitly saved, personally chosen branches in this sky.
    </p>}
  </div>}
  {view==='returns'&&<div className="axe-echo-crossroads-groups"
   aria-label="Recorded place repetitions">
   {returns.paths.map(path=><article className="axe-echo-return-path"
    key={path.location.toLocaleLowerCase()}>
    <header>
     <MapPin size={17}/>
     <strong>{path.location}</strong>
     <span>{path.recordCount} saved memories</span>
    </header>
    <p>Same recorded place label in {path.recordCount} saved moments
      {path.crossDay?' across more than one recorded date':''}.
      This does not verify a physical return or quest completion.</p>
    <div className="axe-echo-return-records">
     {path.records.map((record,i)=><button type="button"
      key={record.id} onClick={()=>onOpen?.(record.id)}
      title="Open this original saved memory">
      <BookOpen size={13}/>
      <span>{i===0?'First listed · ':i===path.records.length-1?
       'Last listed · ':''}{record.title}</span>
      <small>{record.date?new Date(record.date).toLocaleDateString():
       'Date not recorded'}</small>
     </button>)}
    </div>
    <div className="axe-echo-return-actions">
     <button type="button" onClick={()=>onOpen?.(path.first.id)}>
       Open first listed memory</button>
     <button type="button" onClick={()=>onOpen?.(path.last.id)}>
       Open last listed memory</button>
     <button type="button" onClick={()=>onContinue?.(path.last.id)}>
       <Plus size={13}/> Continue privately</button>
    </div>
   </article>)}
   {!returns.paths.length&&<p className="axe-echo-crossroads-empty">
    No recorded place label appears in two or more chosen memories
    for this sky. Nothing is inferred from missing location data.
   </p>}
  </div>}
  {view==='threads'&&<section className="axe-echo-thread-list"
    aria-label="Recorded multi-generation story threads">
    <p className="axe-echo-thread-intro">
     Follow saved, personally authored continuations through the original memories.
     A thread is your private journal history, not a game-generated quest.
    </p>
    <EchoChronicleReadingShelf paths={threads.paths}
     entries={entries} featuredIds={featuredIds} month={month}
     onChooseMonth={onChooseMonth}
     onChooseReadingShelf={onChooseReadingShelf}
     autoFocus={autoOpenReadingShelf}
     onOpenSaved={onOpenParent} onContinue={onContinue}/>
    <div className="axe-echo-thread-explorer"
      aria-label="Search and filter recorded story threads">
     <div className="axe-echo-thread-search">
      <Search size={15}/>
      <input type="search" value={threadQuery} maxLength={100}
       aria-label="Search original saved thread titles"
       placeholder="Find a thread or an earlier saved memory..."
       onChange={event=>{
        setThreadQuery(event.target.value);setThreadPage(0);
       }}/>
      {threadQuery&&<button type="button"
        onClick={()=>{setThreadQuery('');setThreadPage(0)}}
        aria-label="Clear thread search"><X size={14}/></button>}
     </div>
     <div className="axe-echo-thread-filter-options" role="group"
       aria-label="Filter saved story threads">
      {ECHO_THREAD_FILTERS.map(option=><button type="button" key={option.id}
       aria-pressed={threadFilter===option.id}
       onClick={()=>{setThreadFilter(option.id);setThreadPage(0)}}>
       {option.label} <span>{threadExplorer.counters[option.id]}</span>
      </button>)}
     </div>
     <div className="axe-echo-thread-sort-row">
      <label>Sort saved threads
       <select aria-label="Sort saved story threads" value={threadSort}
        onChange={event=>{setThreadSort(event.target.value);setThreadPage(0)}}>
        {ECHO_THREAD_SORTS.map(option=><option key={option.id} value={option.id}>
         {option.label}</option>)}
       </select>
      </label>
      <span role="status">
       {threadExplorer.totalMatches} of {threadExplorer.totalAvailable} saved threads
      </span>
     </div>
    </div>
    {threadExplorer.paths.map(path=><article className="axe-echo-thread" key={path.tip.id}>
     <header><GitBranch size={17}/>
      <strong>{path.tip.title}</strong>
      <small>{path.linkCount} saved {path.linkCount===1?'link':'links'}</small>
     </header>
     <ol className="axe-echo-thread-nodes">
      {path.nodes.map((node,index)=><li key={node.id}>
       <span className="axe-echo-thread-step">{index+1}</span>
       <span className="axe-echo-thread-node">
        <strong>{node.title}</strong>
        <small>{node.date?new Date(node.date).toLocaleDateString():
         'Date not recorded'} · {node.source==='personal'?
         'Personal journal':'Mutually saved encounter'}
         {!node.inSelectedSky?' · outside this chosen sky':''}</small>
       </span>
       <button type="button" onClick={()=>onOpenParent?.(node.id)}
        aria-label={'Open original saved memory: '+node.title}>
        Open <ChevronRight size={13}/>
       </button>
      </li>)}
     </ol>
     <p className="axe-echo-thread-status">
      {path.crossesRecordedMonths?'This thread spans recorded months. ':''}
      {path.status==='depth-limit'?'Showing a bounded part of a longer saved thread.':
       path.status==='parent-unavailable'?'An earlier parent memory is currently unavailable.':
       path.status==='cycle'?'A circular saved link stops this thread.':
       'Every displayed link has an existing saved source.'}
     </p>
     <div className="axe-echo-thread-buttons">
      <button type="button" className="axe-echo-thread-read"
       aria-expanded={readingTip===path.tip.id}
       onClick={()=>setReadingTip(tip=>tip===path.tip.id?null:path.tip.id)}>
       <BookOpen size={14}/>
       {readingTip===path.tip.id?'Close thread reader':'Read this thread'}
      </button>
      <button type="button" className="axe-echo-thread-continue"
       onClick={()=>onContinue?.(path.tip.id)}>
       <Plus size={14}/> Continue privately from this memory
      </button>
     </div>
     {readingTip===path.tip.id&&<EchoChronicleThreadReader
       paths={threadExplorer.paths} tipId={path.tip.id}
       onOpenSaved={onOpenParent} onContinue={onContinue}
       onClose={()=>setReadingTip(null)}/>}
    </article>)}
    {threadExplorer.pageCount>1&&<nav className="axe-echo-thread-pager"
       aria-label="Pages of real saved story threads">
      <button type="button" disabled={threadExplorer.page===0}
       onClick={()=>setThreadPage(value=>Math.max(0,value-1))}>
       <ChevronLeft size={14}/> Previous
      </button>
      <span>Page {threadExplorer.page+1} of {threadExplorer.pageCount}</span>
      <button type="button" disabled={!threadExplorer.hasMore}
       onClick={()=>setThreadPage(value=>Math.min(threadExplorer.pageCount-1,value+1))}>
       Next <ChevronRight size={14}/>
      </button>
     </nav>}
    {!!threadExplorer.forks.length&&<section className="axe-echo-thread-forks"
      aria-label="Personally authored memory forks">
     <h5>Saved Story Forks</h5>
     {threadExplorer.forks.map(fork=><div key={fork.parent.id}>
      <button type="button" onClick={()=>onOpenParent?.(fork.parent.id)}>
       <GitBranch size={14}/> {fork.parent.title}
      </button>
      <span>{fork.children.length} separately written continuations</span>
      <div>{fork.children.map(child=><button key={child.id} type="button"
       onClick={()=>onOpenParent?.(child.id)}>{child.title}</button>)}</div>
     </div>)}
    </section>}
    {!!threadExplorer.unresolved.length&&<aside className="axe-echo-thread-unavailable">
     <strong>{threadExplorer.unresolved.length} unresolved saved link
      {threadExplorer.unresolved.length===1?'':'s'}</strong>
     <p>These private pages refer to unavailable or self-referencing parents.
      Their earlier events are not guessed or created.</p>
     {threadExplorer.unresolved.map(item=><button type="button" key={item.id}
      onClick={()=>onOpen?.(item.id)}>
      Open {item.title}
     </button>)}
    </aside>}
    {!threadExplorer.totalMatches&&!threadExplorer.unresolved.length&&
     <p className="axe-echo-crossroads-empty">
      {threads.paths.length?
       'No saved thread matches these filters. Clear search or choose All threads.':
       'No multi-generation threads are currently readable in the chosen sky. Add real private journal continuations to see them here.'}
     </p>}
   </section>}
  <footer><LockKeyhole size={13}/>
   Names and place labels are recorded text, not verified identities or travel.
   Continue opens a private journal draft, not an official quest or public event.
  </footer>
 </section>;
}
