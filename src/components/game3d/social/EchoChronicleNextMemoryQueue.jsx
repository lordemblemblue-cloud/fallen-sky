import {useEffect,useMemo,useState} from 'react';
import {BookOpen,ChevronLeft,ChevronRight,GitBranch,LockKeyhole,Search,CalendarDays,X} from 'lucide-react';
import {getStorageUser,getActiveId} from '../characterStorage';
import {
 ECHO_NEXT_QUEUE_FILTERS,ECHO_NEXT_QUEUE_SORTS,
 buildEchoChronicleNextMemoryQueue,
} from './echoChronicleNextMemoryQueue.js';
import EchoChronicleThreadReader from './EchoChronicleThreadReader.jsx';
import {projectEchoChronicleRemainingPages}
 from './echoChronicleRemainingPages.js';
import {planEchoChronicleReadingCheckpoint}
 from './echoChronicleReadingCheckpoint.js';
import {planEchoChronicleCheckpointUndo}
 from './echoChronicleCheckpointUndo.js';
import {planEchoChronicleCheckpointRedo}
 from './echoChronicleCheckpointRedo.js';
import {projectEchoChronicleUnavailableReadingPlaces}
 from './echoChronicleUnavailableReadingPlaces.js';
import {getEchoThreadReadingMarks,subscribeEchoThreadReadingMarks,saveEchoThreadReadingMark}
 from './echoChronicleReadingMarkStore.js';

// Offers only genuine next saved memories, never automatically "reads" them.
// The original source memories and explicitly saved bookmark remain unchanged.
export default function EchoChronicleNextMemoryQueue({
 paths=[],onOpenSaved,onContinue,
}){
 const [readerScope]=useState(()=>
  JSON.stringify([getStorageUser(),getActiveId()]));
 const [page,setPage]=useState(0);
 const [filter,setFilter]=useState('all');
 const [sort,setSort]=useState('recent');
 const [query,setQuery]=useState('');
 const [activeTip,setActiveTip]=useState(null);
 const [activeNodeId,setActiveNodeId]=useState(null);
 const [previewTip,setPreviewTip]=useState(null);
 const [checkpointReceipt,setCheckpointReceipt]=useState(null);
 const [redoReceipt,setRedoReceipt]=useState(null);
 // Subscribe to the checked, character-scoped bookmark store. Parent props
 // can be stale immediately after a confirmed save or undo.
 const [liveMarks,setLiveMarks]=useState(()=>getEchoThreadReadingMarks());
 useEffect(()=>subscribeEchoThreadReadingMarks(setLiveMarks),[]);
 const [feedback,setFeedback]=useState('');
 const queue=useMemo(()=>buildEchoChronicleNextMemoryQueue(
  paths,liveMarks,{page,pageSize:5,filter,sort,query},
 ),[paths,liveMarks,page,filter,sort,query]);
 const remainingByTip=useMemo(()=>new Map(queue.items.map(item=>[
  item.tipId,projectEchoChronicleRemainingPages(paths,liveMarks,item.tipId),
 ])),[queue.items,paths,liveMarks]);
 const unavailable=useMemo(()=>projectEchoChronicleUnavailableReadingPlaces(
  paths,liveMarks),[paths,liveMarks]);
 const undoPlan=useMemo(()=>checkpointReceipt?
  planEchoChronicleCheckpointUndo(paths,liveMarks,checkpointReceipt):null,
  [paths,liveMarks,checkpointReceipt]);
 const redoPlan=useMemo(()=>redoReceipt?
  planEchoChronicleCheckpointRedo(paths,liveMarks,redoReceipt):null,
  [paths,liveMarks,redoReceipt]);
 // A parent re-render with identical saved IDs must not consume a one-time
 // Undo/Redo receipt. Reset only when the selected recorded paths change.
 const pathIdentity=JSON.stringify(Array.isArray(paths)?paths.map(path=>[
  path?.tip?.id,path?.tip?.source,
  Array.isArray(path?.nodes)?path.nodes.map(node=>[node?.id,node?.source]):null,
 ]):[]);
 useEffect(()=>{
  setPage(0);setFilter('all');setSort('recent');setQuery('');
  setActiveTip(null);setActiveNodeId(null);setPreviewTip(null);
  setCheckpointReceipt(null);setRedoReceipt(null);setFeedback('');
 },[pathIdentity]);
 const chooseFilter=value=>{
  setFilter(value);setPage(0);setActiveTip(null);setPreviewTip(null);
 };
 const chooseSort=value=>{
  setSort(value);setPage(0);setActiveTip(null);setPreviewTip(null);
 };
 const chooseQuery=value=>{
  setQuery(value);setPage(0);setActiveTip(null);setPreviewTip(null);
 };
 useEffect(()=>{
  if(activeTip&&!queue.items.some(item=>item.tipId===activeTip))
   setActiveTip(null);
  if(previewTip&&!queue.items.some(item=>item.tipId===previewTip))
   setPreviewTip(null);
 },[queue.items,activeTip,previewTip]);
 const scopeActive=()=>readerScope===
  JSON.stringify([getStorageUser(),getActiveId()]);
 const openNext=(tipId)=>{
  if(!scopeActive()){
   setFeedback('The active character changed. Reopen this private Chronicle.');
   return;
  }
  if(!queue.items.some(item=>item.tipId===tipId))return;
  setActiveTip(previous=>previous===tipId&&activeNodeId===null?null:tipId);
  setActiveNodeId(null);
  setFeedback('');
 };
 const openRemaining=(tipId,nodeId)=>{
  if(!scopeActive()){
   setFeedback('The active character changed. Reopen this private Chronicle.');
   return;
  }
  if(!queue.items.some(item=>item.tipId===tipId))return;
  const preview=projectEchoChronicleRemainingPages(
   paths,getEchoThreadReadingMarks(),tipId);
  if(!preview.ok||!preview.pages.some(page=>page.id===nodeId)){
   setFeedback('That original following page is no longer available. No bookmark changed.');
   setActiveTip(null);return;
  }
  setActiveTip(tipId);setActiveNodeId(nodeId);setFeedback('');
 };
 const saveFollowingPlace=(tipId,nodeId)=>{
  if(!scopeActive()){
   setFeedback('The active character changed. No reading place was changed.');
   return;
  }
  if(!queue.items.some(item=>item.tipId===tipId))return;
  const check=()=>planEchoChronicleReadingCheckpoint(
   paths,getEchoThreadReadingMarks(),tipId,nodeId);
  const initial=check();
  if(!initial.ok){
   setFeedback('The original reading place or following memory changed. No bookmark was saved.');
   return;
  }
  const record=paths.find(path=>path?.tip?.id===tipId)
   ?.nodes?.find(node=>node.id===nodeId);
  if(!record)return;
  if(!window.confirm(
   'Save this existing memory as your private reading place: '+
   (record.title||'Saved memory')+' ('+(initial.toPosition+1)+
   ' of '+initial.totalNodes+')? Your original memories will remain unchanged.'
  ))return;
  // Recheck after the user's confirmation: no stale source or switched character.
  if(!scopeActive()){
   setFeedback('The active character changed. No reading place was changed.');
   return;
  }
  const fresh=check();
  if(!fresh.ok||fresh.fromSavedAt!==initial.fromSavedAt||
   fresh.fromNodeId!==initial.fromNodeId||
   fresh.toPosition!==initial.toPosition||
   fresh.totalNodes!==initial.totalNodes||
   JSON.stringify(fresh.sourceNodeIds)!==JSON.stringify(initial.sourceNodeIds)){
   setFeedback('The reading place changed while confirming. No bookmark was overwritten.');
   return;
  }
  const path=paths.find(item=>item?.tip?.id===tipId);
  const result=saveEchoThreadReadingMark({
   tipId,nodeId,nodes:path.nodes,
  });
  if(!result.ok){
   setFeedback(result.reason==='storage-unavailable'
    ?'Browser storage could not save this place. Your previous bookmark is unchanged.'
    :'The reading place could not be updated. No original memory was changed.');
   return;
  }
  setActiveTip(null);setActiveNodeId(null);setPreviewTip(null);
  setRedoReceipt(null);
  setCheckpointReceipt(Object.freeze({
   tipId,fromNodeId:initial.fromNodeId,fromSavedAt:initial.fromSavedAt,
   toNodeId:nodeId,toSavedAt:result.mark.updatedAt,
   sourceNodeIds:initial.sourceNodeIds,
  }));
  setFeedback('Your private reading place was saved at this recorded memory. No game quest changed.');
 };
 const undoLastCheckpoint=()=>{
  if(!checkpointReceipt)return;
  if(!scopeActive()){
   setCheckpointReceipt(null);
   setFeedback('The active character changed. No reading place was changed.');
   return;
  }
  const check=()=>planEchoChronicleCheckpointUndo(
   paths,getEchoThreadReadingMarks(),checkpointReceipt);
  const initial=check();
  if(!initial.ok){
   setCheckpointReceipt(null);
   setFeedback('Undo is no longer available because the bookmark or original memory changed.');
   return;
  }
  if(!window.confirm(
   'Return this private reading place to the previously saved memory? '+
   'No original story or game quest will be changed.'
  ))return;
  if(!scopeActive()){
   setCheckpointReceipt(null);
   setFeedback('The active character changed. No reading place was changed.');
   return;
  }
  const fresh=check();
  if(!fresh.ok||fresh.expectedNodeId!==initial.expectedNodeId||
   fresh.expectedSavedAt!==initial.expectedSavedAt||
   JSON.stringify(fresh.sourceNodeIds)!==JSON.stringify(initial.sourceNodeIds)){
   setCheckpointReceipt(null);
   setFeedback('The saved place changed while confirming. Nothing was overwritten.');
   return;
  }
  const path=paths.find(item=>item?.tip?.id===fresh.tipId);
  if(!path)return;
  const result=saveEchoThreadReadingMark({
   tipId:fresh.tipId,nodeId:fresh.nodeId,nodes:path.nodes,
  });
  if(!result.ok){
   setFeedback(result.reason==='storage-unavailable'
    ?'Storage could not restore your previous reading place. Your current bookmark is unchanged.'
    :'Could not restore the prior saved reading place. No original memory was changed.');
   return;
  }
  setCheckpointReceipt(null);
  setRedoReceipt(Object.freeze({
   tipId:fresh.tipId,restoredNodeId:fresh.nodeId,
   restoredSavedAt:result.mark.updatedAt,
   targetNodeId:checkpointReceipt.toNodeId,
   sourceNodeIds:checkpointReceipt.sourceNodeIds,
  }));
  setActiveTip(null);setActiveNodeId(null);setPreviewTip(null);
  setFeedback('Your previous private reading place has been restored. You can redo that checkpoint once. No game quest changed.');
 };
 const redoLastCheckpoint=()=>{
  if(!redoReceipt)return;
  if(!scopeActive()){
   setRedoReceipt(null);
   setFeedback('The active character changed. No reading place was changed.');
   return;
  }
  const check=()=>planEchoChronicleCheckpointRedo(
   paths,getEchoThreadReadingMarks(),redoReceipt);
  const initial=check();
  if(!initial.ok){
   setRedoReceipt(null);
   setFeedback('Redo is no longer available because your saved place or original page changed.');
   return;
  }
  if(!window.confirm(
   'Redo the last undone private reading checkpoint? '+
   'Only your saved reading place will move forward to the same recorded memory.'
  ))return;
  if(!scopeActive()){
   setRedoReceipt(null);
   setFeedback('The active character changed. No reading place was changed.');
   return;
  }
  const fresh=check();
  if(!fresh.ok||fresh.expectedNodeId!==initial.expectedNodeId||
   fresh.expectedSavedAt!==initial.expectedSavedAt||
   fresh.nodeId!==initial.nodeId||
   fresh.toPosition!==initial.toPosition||
   JSON.stringify(fresh.sourceNodeIds)!==JSON.stringify(initial.sourceNodeIds)){
   setRedoReceipt(null);
   setFeedback('The saved place changed while confirming. Nothing was overwritten.');
   return;
  }
  const path=paths.find(item=>item?.tip?.id===fresh.tipId);
  if(!path){
   setRedoReceipt(null);
   setFeedback('That saved thread is unavailable. No reading place changed.');
   return;
  }
  const result=saveEchoThreadReadingMark({
   tipId:fresh.tipId,nodeId:fresh.nodeId,nodes:path.nodes,
  });
  if(!result.ok){
   setFeedback(result.reason==='storage-unavailable'
    ?'Storage could not redo your reading place. Your current bookmark is unchanged.'
    :'Could not redo the saved reading place. No original memory was changed.');
   return;
  }
  setRedoReceipt(null);
  setCheckpointReceipt(null);
  setActiveTip(null);setActiveNodeId(null);setPreviewTip(null);
  setFeedback('Your undone private reading checkpoint has been redone once. No game quest changed.');
 };
 if(!queue.markedVisibleCount&&!undoPlan?.ok&&!redoPlan?.ok&&
    unavailable.unavailableCount===0)return null;
 return <section className="axe-echo-next-memory-queue"
  aria-label="Next real saved memories in this sky">
  <header><GitBranch size={17}/>
   <div><h4>My Next Recorded Memories</h4>
    <p>Continue after your own saved reading places. These pages already exist.</p>
   </div>
   <small><LockKeyhole size={12}/> Private</small>
  </header>
  <p className="axe-echo-next-queue-summary">
   {queue.eligibleCount} following saved {queue.eligibleCount===1?'memory':'memories'}
   {' '}available in this chosen sky.
   {queue.blockedCount>0&&<span> {queue.blockedCount} marked
    {queue.blockedCount===1?' thread has':' threads have'}
    {' '}no available following page or a currently unavailable source.</span>}
  </p>
  {unavailable.unavailableCount>0&&<aside className="axe-echo-next-queue-unavailable"
   aria-label="Saved reading places with unavailable original pages">
   <strong><LockKeyhole size={13}/> Reading places waiting for saved pages</strong>
   <ul>{unavailable.items.map(item=><li key={item.tipId}>
    <span>{item.threadTitle}</span> — {item.reason==='saved-page-unavailable'?
     'The bookmarked page is not in this selected saved thread.':
     'This saved thread cannot currently be verified.'}
   </li>)}</ul>
   <small>Your private bookmark is preserved. When the original saved page
    becomes available in this selection again, its reading place can resume.
    No other page will be substituted automatically.</small>
  </aside>}
  {undoPlan?.ok&&<div className="axe-echo-next-queue-undo"
    aria-label="Undo the last confirmed private reading checkpoint">
   <button type="button" onClick={undoLastCheckpoint}>
    <ChevronLeft size={14}/> Undo last reading checkpoint
   </button>
   <small>Restore your previous saved place from this open book.
    No original memories are deleted.</small>
  </div>}
  {redoPlan?.ok&&<div className="axe-echo-next-queue-undo axe-echo-next-queue-redo"
    aria-label="Redo the last undone private reading checkpoint">
   <button type="button" onClick={redoLastCheckpoint}>
    <ChevronRight size={14}/> Redo last reading checkpoint
   </button>
   <small>Return to the recorded page from the checkpoint you just undid.
    Only one redo is available; original memories stay unchanged.</small>
  </div>}
  {queue.eligibleCount>0&&<section className="axe-echo-next-queue-discovery"
   aria-label="Find the next saved memories">
   <div className="axe-echo-next-queue-search">
    <Search size={15}/>
    <input type="search" value={query} maxLength={100}
     aria-label="Search next saved memory titles"
     placeholder="Search an actual story or following memory..."
     onChange={event=>chooseQuery(event.target.value)}/>
    {!!query&&<button type="button" onClick={()=>chooseQuery('')}
      aria-label="Clear next memory search"><X size={14}/></button>}
   </div>
   <div className="axe-echo-next-queue-filters" role="group"
    aria-label="Filter next saved memories">
    {ECHO_NEXT_QUEUE_FILTERS.map(option=><button type="button"
     key={option.id} aria-pressed={filter===option.id}
     onClick={()=>chooseFilter(option.id)}>
     {option.label} <span>{queue.filterCounts[option.id]}</span>
    </button>)}
   </div>
   <div className="axe-echo-next-queue-sort">
    <label>Sort next memories
     <select value={sort} aria-label="Sort next saved memories"
      onChange={event=>chooseSort(event.target.value)}>
      {ECHO_NEXT_QUEUE_SORTS.map(option=><option key={option.id}
       value={option.id}>{option.label}</option>)}
     </select>
    </label>
    <span role="status">
     Showing {queue.matchingCount} of {queue.eligibleCount} existing next memories
    </span>
   </div>
   {queue.hasFilters&&<button type="button"
    className="axe-echo-next-queue-clear"
    onClick={()=>{chooseFilter('all');chooseQuery('')}}>
    Clear search and filters
   </button>}
  </section>}
  {queue.items.length>0?<div className="axe-echo-next-queue-items">
   {queue.items.map(item=><article key={item.tipId}
     className="axe-echo-next-queue-item">
    <div>
     <strong>{item.threadTitle}</strong>
     <span>Next actual memory {item.nextPosition+1} of {item.totalNodes}</span>
     <p><BookOpen size={13}/>{item.nextTitle}</p>
     {item.chainIncomplete&&<small>Some earlier saved links are incomplete.
      Only the displayed, actually saved next memory will open.</small>}
    </div>
    <div className="axe-echo-next-queue-actions">
     <button type="button"
      aria-expanded={activeTip===item.tipId&&activeNodeId===null}
      onClick={()=>openNext(item.tipId)}>
      <ChevronRight size={14}/>
      {activeTip===item.tipId&&activeNodeId===null?
       'Close next memory':'Read following memory'}
     </button>
     <button type="button"
      aria-expanded={previewTip===item.tipId}
      onClick={()=>{
       if(!scopeActive()){
        setFeedback('The active character changed. Reopen this Chronicle.');
        return;
       }
       setPreviewTip(current=>current===item.tipId?null:item.tipId);
      }}>
      <BookOpen size={14}/>
      {previewTip===item.tipId?'Hide recorded pages':'Preview remaining pages'}
     </button>
    </div>
    {previewTip===item.tipId&&remainingByTip.get(item.tipId)?.ok&&
     <div className="axe-echo-next-queue-preview"
      aria-label={'Remaining saved pages in '+item.threadTitle}>
      <p>{remainingByTip.get(item.tipId).remainingCount}
       {' '}already recorded {remainingByTip.get(item.tipId).remainingCount===1?
        'page':'pages'} after your saved bookmark.</p>
      {remainingByTip.get(item.tipId).pages.map(page=><div
       className="axe-echo-next-queue-preview-page" key={page.id}>
       <div>
        <strong>{page.position+1} of {remainingByTip.get(item.tipId).totalNodes}
         {' · '}{page.title}</strong>
        <small><CalendarDays size={12}/>
         {page.date?new Date(page.date).toLocaleDateString():
          'Date not recorded'}
         {' · '}{page.source==='personal'?'Personal journal':'Mutually saved encounter'}
        </small>
       </div>
       <div className="axe-echo-next-queue-preview-actions">
        <button type="button"
         aria-current={activeTip===item.tipId&&activeNodeId===page.id?'step':undefined}
         onClick={()=>openRemaining(item.tipId,page.id)}>
         Read this saved page
        </button>
        <button type="button" className="axe-echo-next-queue-save-place"
         onClick={()=>saveFollowingPlace(item.tipId,page.id)}>
         Save as reading place
        </button>
       </div>
      </div>)}
     </div>}
    {activeTip===item.tipId&&<EchoChronicleThreadReader
     paths={paths} tipId={item.tipId} startAfterBookmark
     startAtNodeId={activeNodeId}
     onOpenSaved={onOpenSaved} onContinue={onContinue}
     onClose={()=>{setActiveTip(null);setActiveNodeId(null)}}/>}
   </article>)}
  </div>:<p className="axe-echo-next-queue-empty">
   {queue.eligibleCount?
    'No recorded next memories match your search or filter. Clear filters to see available pages.':
    'Every currently marked thread is at its last existing saved page or its original bookmarked memory is unavailable. No extra pages were generated.'}
  </p>}
  {queue.pageCount>1&&<nav className="axe-echo-next-queue-pager"
    aria-label="Pages of next recorded memories">
   <button type="button" disabled={queue.page===0}
    onClick={()=>{setPage(Math.max(0,queue.page-1));setActiveTip(null);setPreviewTip(null)}}>
    <ChevronLeft size={14}/> Previous
   </button>
   <span>Page {queue.page+1} of {queue.pageCount}</span>
   <button type="button" disabled={!queue.hasMore}
    onClick={()=>{setPage(Math.min(queue.pageCount-1,queue.page+1));setActiveTip(null);setPreviewTip(null)}}>
    Next <ChevronRight size={14}/>
   </button>
  </nav>}
  {feedback&&<p role="status" className="axe-echo-next-queue-feedback">
   {feedback}
  </p>}
  <footer><LockKeyhole size={12}/>
   Opening a saved memory does not update a reading mark, publish a memory
   or complete an official game quest.
  </footer>
 </section>;
}
