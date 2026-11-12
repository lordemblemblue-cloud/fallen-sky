import {useEffect,useMemo,useRef,useState} from 'react';
import {
 Bookmark,BookOpen,CalendarDays,ChevronLeft,ChevronRight,LockKeyhole,Search,Trash2,X,
} from 'lucide-react';
import {getStorageUser,getActiveId} from '../characterStorage';
import {
 getEchoThreadReadingMarks,subscribeEchoThreadReadingMarks,
 removeEchoThreadReadingMark,
} from './echoChronicleReadingMarkStore.js';
import {
 ECHO_READING_SHELF_FILTERS,ECHO_READING_SHELF_SORTS,
 projectEchoChronicleReadingShelf,
} from './echoChronicleReadingShelf.js';
import EchoChronicleThreadReader from './EchoChronicleThreadReader';
import EchoChronicleNextMemoryQueue from './EchoChronicleNextMemoryQueue';
import {planEchoChronicleNextSavedMemory}
 from './echoChronicleNextSavedMemory.js';
import {buildEchoChronicleReadingSkyIndex}
 from './echoChronicleReadingSkyIndex.js';
import {planEchoReadingShelfNavigation}
 from './echoChronicleReadingShelfNavigation.js';

// Read-only index of the current character's previously saved reading places.
// Only tips present in this actually selected month's saved threads can open.
export default function EchoChronicleReadingShelf({
 paths=[],entries=[],featuredIds=[],month='all',
 onOpenSaved,onContinue,onChooseMonth,onChooseReadingShelf,autoFocus=false,
}){
 const [scopeKey]=useState(()=>
  JSON.stringify([getStorageUser(),getActiveId()]));
 const shelfElement=useRef(null);
 useEffect(()=>{
  if(autoFocus){
   shelfElement.current?.focus?.({preventScroll:true});
   shelfElement.current?.scrollIntoView?.({behavior:'auto',block:'nearest'});
  }
 },[autoFocus,month]);
 const [marks,setMarks]=useState(getEchoThreadReadingMarks);
 const [page,setPage]=useState(0);
 const [filter,setFilter]=useState('all');
 const [sort,setSort]=useState('recent');
 const [query,setQuery]=useState('');
 const [activeTip,setActiveTip]=useState(null);
 const [readerMode,setReaderMode]=useState('saved');
 const [feedback,setFeedback]=useState('');
 useEffect(()=>subscribeEchoThreadReadingMarks(setMarks),[]);
 useEffect(()=>{
  setPage(0);setFilter('all');setSort('recent');setQuery('');
  setActiveTip(null);setFeedback('');
 },[paths]);
 const shelf=useMemo(()=>projectEchoChronicleReadingShelf(paths,marks,{
  page,pageSize:5,filter,sort,query,
 }),[paths,marks,page,filter,sort,query]);
 const nextPlans=useMemo(()=>new Map(shelf.items.map(item=>[
  item.tipId,planEchoChronicleNextSavedMemory(paths,marks,item.tipId),
 ])),[shelf.items,paths,marks]);
 const skyIndex=useMemo(()=>buildEchoChronicleReadingSkyIndex(
  entries,featuredIds,marks,month,
 ),[entries,featuredIds,marks,month]);
 const chooseFilter=value=>{
  setFilter(value);setPage(0);setActiveTip(null);
 };
 const chooseSort=value=>{
  setSort(value);setPage(0);setActiveTip(null);
 };
 const chooseQuery=value=>{
  setQuery(value);setPage(0);setActiveTip(null);
 };
 const scopeActive=()=>scopeKey===
  JSON.stringify([getStorageUser(),getActiveId()]);
 const openMarkedThread=(tipId,mode='saved')=>{
  if(!scopeActive()){
   setFeedback('The active character changed. Reopen this Chronicle.');return;
  }
  if(!shelf.items.some(item=>item.tipId===tipId))return;
  if(mode==='next'&&!nextPlans.get(tipId)?.ok){
   setFeedback('The following saved memory is not available in this thread.');
   return;
  }
  setActiveTip(active=>active===tipId&&readerMode===mode?null:tipId);
  setReaderMode(mode);
  setFeedback('');
 };
 const forgetMarkedThread=tipId=>{
  if(!scopeActive()){
   setFeedback('The active character changed. Nothing was removed.');return;
  }
  if(!shelf.items.some(item=>item.tipId===tipId))return;
  if(!window.confirm(
   'Forget only this private reading position? Your saved story and original memories will remain.'
  ))return;
  const result=removeEchoThreadReadingMark(tipId);
  if(result.ok){
   setActiveTip(active=>active===tipId?null:active);
   setFeedback('Reading position forgotten. No original memory was deleted.');
  }else setFeedback(result.reason==='storage-unavailable'
   ?'Browser storage is unavailable or full. The prior reading position is unchanged.'
   :'Could not remove this private reading position.');
 };
 return <section ref={shelfElement} tabIndex={-1}
  className={'axe-echo-reading-shelf'+(autoFocus?' is-reading-shelf-destination':'')}
  aria-label="Private saved Story Thread reading places">
  <header><Bookmark size={17}/>
   <div><h4>My Reading Shelf</h4>
    <p>Return to a saved place in your own recorded story.</p></div>
   <small><LockKeyhole size={12}/> Private</small>
  </header>
  {autoFocus&&<p className="axe-echo-shelf-arrival" role="status">
    Opened this month's private saved reading positions. Choose a real
    bookmark below to resume its original Story Thread.
   </p>}
  <p className="axe-echo-shelf-summary">
   {shelf.currentSkyCount} saved reading {shelf.currentSkyCount===1?'place':'places'}
   {' '}in this chosen sky.
   {shelf.otherSkyOrUnavailableCount>0&&
    <span> {shelf.otherSkyOrUnavailableCount} other saved {shelf.otherSkyOrUnavailableCount===1?'place is':'places are'}
     {' '}in another sky or currently unavailable; none were deleted.</span>}
  </p>
  {!!skyIndex.skies.length&&<section className="axe-echo-shelf-sky-index"
    aria-label="Find saved reading places in other monthly skies">
    <header><CalendarDays size={15}/>
      <strong>Reading places across my skies</strong>
      <small>{skyIndex.bookmarkedSkyCount} recorded
       {skyIndex.bookmarkedSkyCount===1?' sky':' skies'}</small>
    </header>
    <p>These are counts of your own saved reading positions.
      Choose a month to open its private sky; then open Journey Trail and
      Story Threads to read a saved memory.</p>
    <div className="axe-echo-shelf-sky-links">
      {skyIndex.skies.map(sky=><button type="button" key={sky.month}
       aria-current={sky.current?'true':undefined}
       disabled={sky.current||!onChooseMonth}
       onClick={()=>{
        const request=planEchoReadingShelfNavigation(
         skyIndex,sky.month,scopeKey,
         JSON.stringify([getStorageUser(),getActiveId()]),
        );
        if(!request.ok){
         setFeedback(request.reason==='character-changed'
          ?'The active character changed. Reopen this Chronicle.'
          :'This sky has no currently readable saved positions.');
         return;
        }
        if(onChooseReadingShelf)onChooseReadingShelf(request);
        else onChooseMonth?.(sky.month);
       }}>
       <CalendarDays size={13}/>
       <strong>{sky.label}</strong>
       <span>{sky.bookmarkCount} saved
        {sky.bookmarkCount===1?' place':' places'}</span>
       {sky.staleCount>0&&<small>{sky.staleCount} unavailable position
        {sky.staleCount===1?'':'s'}</small>}
       <em>{sky.current?'Current sky':'Open sky'}</em>
      </button>)}
    </div>
  </section>}
  <EchoChronicleNextMemoryQueue paths={paths} marks={marks}
   onOpenSaved={onOpenSaved} onContinue={onContinue}/>
  {shelf.currentSkyCount>0&&<section className="axe-echo-shelf-discovery"
   aria-label="Find your private saved reading positions">
   <div className="axe-echo-shelf-search">
    <Search size={15}/>
    <input type="search" value={query} maxLength={100}
     aria-label="Search saved reading places"
     placeholder="Search saved story titles or current memory..."
     onChange={event=>chooseQuery(event.target.value)}/>
    {!!query&&<button type="button" onClick={()=>chooseQuery('')}
      aria-label="Clear reading shelf search"><X size={14}/></button>}
   </div>
   <div className="axe-echo-shelf-filters" role="group"
    aria-label="Filter saved reading places">
    {ECHO_READING_SHELF_FILTERS.map(option=><button type="button"
     key={option.id} aria-pressed={filter===option.id}
     onClick={()=>chooseFilter(option.id)}>
     {option.label} <span>{shelf.filterCounts[option.id]}</span>
    </button>)}
   </div>
   <div className="axe-echo-shelf-sort">
    <label>Sort reading places
     <select value={sort} aria-label="Sort saved reading places"
      onChange={event=>chooseSort(event.target.value)}>
      {ECHO_READING_SHELF_SORTS.map(option=><option key={option.id}
       value={option.id}>{option.label}</option>)}
     </select>
    </label>
    <span role="status">
     Showing {shelf.matchingCount} of {shelf.currentSkyCount} reading places
    </span>
   </div>
   {shelf.hasFilters&&<button type="button"
    className="axe-echo-shelf-clear"
    onClick={()=>{chooseFilter('all');chooseQuery('')}}>
    Clear search and filters
   </button>}
  </section>}
  {!!shelf.staleCount&&<p className="axe-echo-shelf-stale-note">
   {shelf.staleCount} saved {shelf.staleCount===1?'position has':'positions have'}
   {' '}an unavailable memory in this sky. The original markers are preserved.
  </p>}
  <div className="axe-echo-shelf-items">
   {shelf.items.map(item=><article key={item.tipId} className="axe-echo-shelf-item">
    <div>
     <strong>{item.title}</strong>
     <small>{item.stale?'Saved page temporarily unavailable':
      'Saved at memory '+(item.position+1)+' of '+item.totalNodes}
      {' · '}Device mark {new Date(item.updatedAt).toLocaleDateString()}
     </small>
     {!item.stale&&item.nodeTitle&&<span>{item.nodeTitle}</span>}
    </div>
    <nav aria-label={'Reading actions for '+item.title}>
     <button type="button" onClick={()=>openMarkedThread(item.tipId)}
      aria-expanded={activeTip===item.tipId}>
      <BookOpen size={13}/>
      {activeTip===item.tipId&&readerMode==='saved'?'Close reader':'Read saved place'}
     </button>
     {nextPlans.get(item.tipId)?.ok&&<button type="button"
      className="axe-echo-shelf-read-next"
      onClick={()=>openMarkedThread(item.tipId,'next')}
      aria-expanded={activeTip===item.tipId&&readerMode==='next'}>
      <ChevronRight size={13}/> Read next saved memory
     </button>}
     <button type="button" onClick={()=>forgetMarkedThread(item.tipId)}>
      <Trash2 size={13}/> Forget position
     </button>
    </nav>
    {activeTip===item.tipId&&<EchoChronicleThreadReader
     paths={paths} tipId={item.tipId}
     startAfterBookmark={readerMode==='next'}
     onOpenSaved={onOpenSaved} onContinue={onContinue}
     onClose={()=>setActiveTip(null)}/>}
   </article>)}
   {!shelf.matchingCount&&<p className="axe-echo-shelf-empty">
    {shelf.currentSkyCount?
     'No saved reading places match your search or filter. Clear filters to see available bookmarks.':
     'No saved reading places in this chosen sky. Open a real Story Thread and select Save my reading place to add one.'}
   </p>}
  </div>
  {shelf.pageCount>1&&<nav className="axe-echo-shelf-pager"
   aria-label="Saved reading place pages">
   <button type="button" disabled={shelf.page===0}
    onClick={()=>{setPage(Math.max(0,shelf.page-1));setActiveTip(null)}}>
    <ChevronLeft size={13}/> Previous
   </button>
   <span>Page {shelf.page+1} of {shelf.pageCount}</span>
   <button type="button" disabled={!shelf.hasMore}
    onClick={()=>{setPage(Math.min(shelf.pageCount-1,shelf.page+1));setActiveTip(null)}}>
    Next <ChevronRight size={13}/>
   </button>
  </nav>}
  {feedback&&<p role="status" className="axe-echo-shelf-feedback">{feedback}</p>}
  <footer><LockKeyhole size={12}/>
   Bookmarks stay on this device for the current character. Removing a
   reading position never removes a story, photograph or quest record.
  </footer>
 </section>;
}
