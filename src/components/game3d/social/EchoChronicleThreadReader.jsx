import {useEffect,useMemo,useState} from 'react';
import {
 BookOpen,Bookmark,BookmarkMinus,ChevronLeft,ChevronRight,Clock3,GitBranch,LockKeyhole,
 Plus,X,
} from 'lucide-react';
import {readEchoChronicleThread,stepEchoChronicleThread}
 from './echoChronicleThreadReader.js';
import {getStorageUser,getActiveId} from '../characterStorage';
import {readEchoThreadReadingMark} from './echoChronicleReadingMarks.js';
import {planEchoChronicleNextSavedMemory}
 from './echoChronicleNextSavedMemory.js';
import {projectEchoChronicleRemainingPages}
 from './echoChronicleRemainingPages.js';
import {
 getEchoThreadReadingMarks,subscribeEchoThreadReadingMarks,
 saveEchoThreadReadingMark,removeEchoThreadReadingMark,
} from './echoChronicleReadingMarkStore.js';

// This reader never copies personal notes into an export or a social feed.
// Each step only points to a real, already-saved current-character memory.
// Open Full Memory navigates through the existing canonical Chronicle reader.
export default function EchoChronicleThreadReader({
 paths=[],tipId,onOpenSaved,onContinue,onClose,
 startAfterBookmark=false,startAtNodeId=null,
}){
 const [readerScope]=useState(()=>
  JSON.stringify([getStorageUser(),getActiveId()]));
 const [position,setPosition]=useState(0);
 const [marks,setMarks]=useState(getEchoThreadReadingMarks);
 const [markFeedback,setMarkFeedback]=useState('');
 useEffect(()=>subscribeEchoThreadReadingMarks(setMarks),[]);
 useEffect(()=>{
  const path=paths.find(item=>item?.tip?.id===tipId);
  const saved=readEchoThreadReadingMark(
   getEchoThreadReadingMarks(),tipId,path?.nodes);
  const remaining=startAtNodeId?projectEchoChronicleRemainingPages(
   paths,getEchoThreadReadingMarks(),tipId,
  ):null;
  const selected=remaining?.ok?
   remaining.pages.find(page=>page.id===startAtNodeId):null;
  const next=!startAtNodeId&&startAfterBookmark?
   planEchoChronicleNextSavedMemory(
    paths,getEchoThreadReadingMarks(),tipId,
   ):null;
  setPosition(selected?selected.position:
   next?.ok?next.nextPosition:saved.ok?saved.position:0);
  setMarkFeedback(startAtNodeId&&!selected?
   'That following memory is no longer available after this saved reading place. Showing the last saved position.':
   next&&!next.ok?
    'The next saved memory is currently unavailable. Showing the original saved reading place.':'');
 },[tipId,paths,startAfterBookmark,startAtNodeId]);
 const current=useMemo(()=>readEchoChronicleThread(paths,tipId,position),
  [paths,tipId,position]);
 const savedMark=useMemo(()=>readEchoThreadReadingMark(
  marks,tipId,current.ok?current.nodes:[]),
  [marks,tipId,current]);
 const scopeStillActive=()=>readerScope===
  JSON.stringify([getStorageUser(),getActiveId()]);
 const markError=result=>result.reason==='storage-unavailable'
  ?'Browser storage could not save this place; the previous mark is unchanged.'
  :result.reason==='mark-limit'?'This character has 60 saved thread places. Clear one before adding another.'
  :'The reading place could not be saved. Please reopen the current thread.';
 const savePlace=()=>{
  if(!scopeStillActive()){setMarkFeedback('The active character changed. No reading place was saved.');return;}
  if(!current.ok)return;
  const result=saveEchoThreadReadingMark({
   tipId,nodeId:current.node.id,nodes:current.nodes,
  });
  setMarkFeedback(result.ok?'Saved your private reading place on this device.':markError(result));
 };
 const forgetPlace=()=>{
  if(!scopeStillActive()){setMarkFeedback('The active character changed. Nothing was removed.');return;}
  const result=removeEchoThreadReadingMark(tipId);
  setMarkFeedback(result.ok?'Reading place cleared. Your original memories are untouched.':markError(result));
 };
 const resumePlace=()=>{
  if(!scopeStillActive()){setMarkFeedback('The active character changed. Reopen this thread.');return;}
  if(savedMark.ok&&savedMark.found&&!savedMark.stale){
   setPosition(savedMark.position);setMarkFeedback('');
  }
 };
 if(!current.ok)return null;
 const advance=direction=>{
  const result=stepEchoChronicleThread(paths,tipId,current.position,direction);
  if(result.ok)setPosition(result.position);
 };
 return <section className="axe-echo-thread-reader"
  role="region" aria-label="Read real saved story thread">
  <header>
   <GitBranch size={18}/>
   <div><h4>Read My Story Thread</h4>
    <p>{startAtNodeId?
      'Reading a chosen existing saved page after your private bookmark.':
      startAfterBookmark?
       'Showing the next existing saved memory after your private bookmark.':
       'Follow your recorded memories, from earliest visible to latest.'}</p>
   </div>
   <button type="button" onClick={onClose}
    aria-label="Close thread reader"><X size={17}/></button>
  </header>
  <nav aria-label="Saved thread reading steps" className="axe-echo-reader-dots">
   {current.nodes.map((node,index)=><button type="button" key={node.id}
    aria-current={index===current.position?'step':undefined}
    onClick={()=>setPosition(index)}
    aria-label={'Step '+(index+1)+': '+node.title}>
    {index+1}
   </button>)}
  </nav>
  <div className="axe-echo-reader-page">
   <span className="axe-echo-reader-index">
    Saved memory {current.position+1} of {current.total}
   </span>
   <h5>{current.node.title}</h5>
   <p><Clock3 size={13}/>
    {current.node.date?new Date(current.node.date).toLocaleString():
     'Date not recorded'}
   </p>
   <p><BookOpen size={13}/>
    {current.node.source==='personal'?'Personal journal':
      'Mutually saved encounter'}
    {!current.node.inSelectedSky?' · Outside this chosen sky':''}
   </p>
   {current.status!=='complete'&&<small className="axe-echo-reader-warning">
    {current.status==='depth-limit'?'This is only the saved portion currently displayed.':
     current.status==='cycle'?'A circular saved link limits this thread.':
     current.status==='parent-unavailable'?'An earlier memory is unavailable.':
      'Some thread source details cannot be confirmed.'}
   </small>}
  </div>
  <div className="axe-echo-reader-actions">
   <button type="button" disabled={!current.previous}
    onClick={()=>advance('previous')}>
    <ChevronLeft size={15}/> Previous
   </button>
   <button type="button" className="axe-echo-reader-open"
    onClick={()=>{if(scopeStillActive())onOpenSaved?.(current.node.id)}}>
    <BookOpen size={15}/> Open full memory
   </button>
   <button type="button" disabled={!current.next}
    onClick={()=>advance('next')}>
    Next <ChevronRight size={15}/>
   </button>
  </div>
  <div className="axe-echo-reader-mark" aria-label="Private reading place">
   <div className="axe-echo-reader-mark-heading">
    <Bookmark size={15}/>
    <span>{savedMark.ok&&savedMark.found
     ?savedMark.stale?'Previously saved page is no longer in this thread. Your mark is preserved.':
      'Saved reading place: '+(savedMark.position+1)+' of '+current.total
     :'No reading place saved for this thread'}</span>
   </div>
   <div className="axe-echo-reader-mark-buttons">
    <button type="button" onClick={savePlace}>
     <Bookmark size={13}/> Save my reading place
    </button>
    {savedMark.ok&&savedMark.found&&<>
     <button type="button" disabled={savedMark.stale} onClick={resumePlace}>
      Resume saved place
     </button>
     <button type="button" onClick={forgetPlace}>
      <BookmarkMinus size={13}/> Forget saved place
     </button>
    </>}
   </div>
   {markFeedback&&<p role="status">{markFeedback}</p>}
  </div>
  <button type="button" className="axe-echo-reader-continue"
   onClick={()=>{if(scopeStillActive())onContinue?.(current.node.id)}}>
   <Plus size={15}/> Continue privately from this saved memory
  </button>
  <footer><LockKeyhole size={12}/>
   Private character history only. Reading does not create, finish,
   publish or reward a game quest.
  </footer>
 </section>;
}
