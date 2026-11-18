import {useEffect,useMemo,useState} from 'react';
import {
 CalendarDays,Camera,ChevronLeft,ChevronRight,LockKeyhole,
 MoonStar,Star,Users,BookOpen,X,GitBranch,
} from 'lucide-react';
import {
 ECHO_ALL_MONTHS,echoChronicleMonthLabel,echoChronicleMonthKey,
} from './echoChronicleMonthlySky';
import {isChroniclePhoto} from './echoChroniclePhoto';
import {buildPrivateEchoStarPreview} from './echoChronicleSkyJourney';
import EchoChronicleSkyChapterEditor from './EchoChronicleSkyChapterEditor';
// Explicit .jsx: echoChronicleSkyAtlas.js / echoChronicleJourneyTrail.js differ only by case, and a
// case-insensitive disk (Windows) would otherwise resolve these to the data helpers.
import EchoChronicleSkyAtlas,{EchoChronicleSkyStoryboard} from './EchoChronicleSkyAtlas.jsx';
import EchoChronicleJourneyTrail from './EchoChronicleJourneyTrail.jsx';
import {getStorageUser,getActiveId} from '../characterStorage';
import {planEchoReadingShelfReturn}
 from './echoChronicleReadingShelfReturn.js';
import {isEchoReadingShelfNavigationActive}
 from './echoChronicleReadingShelfNavigation.js';

// PRIVATE, per-character and device. Neither this gallery nor its preview
// permits publication to a real multiplayer sky. Shared source memories must
// already be saved by the original two-party consent flow.
export default function EchoChronicleMonthArchive({
 buckets=[],selected=ECHO_ALL_MONTHS,onChoose,
 featuredRecords=[],featuredCounts={},onOpenFeatured,
 onMoveFeatured,onRemoveFeatured,unavailableCount=0,onClearUnavailable,
 onOpenSaved,onContinueSaved,
 featuredError='',skyChapter=null,onSaveSkyChapter,onDeleteSkyChapter,
 allRecords=[],featuredIds=[],skyChapters=[],scopeKey='',
}){
 const [showSky,setShowSky]=useState(false);
 const [showTrail,setShowTrail]=useState(false);
 const [readingNavigation,setReadingNavigation]=useState(null);
 const [previousReadingSky,setPreviousReadingSky]=useState(null);
 const currentScope=()=>JSON.stringify([getStorageUser(),getActiveId()]);
 useEffect(()=>{
  setReadingNavigation(null);
  setPreviousReadingSky(null);
 },[scopeKey]);
 const shelfRequested=isEchoReadingShelfNavigationActive(
  readingNavigation,selected,scopeKey,
 );
 useEffect(()=>setShowTrail(shelfRequested),
  [selected,scopeKey,shelfRequested]);
 const chooseRecordedMonth=month=>{
  setReadingNavigation(null);
  setPreviousReadingSky(null);
  onChoose?.(month);
 };
 const visitReadingShelf=request=>{
  if(!request?.ok||request.scope!==scopeKey||
   request.scope!==currentScope()||
   !request.month||request.view!=='reading-shelf')return;
  setPreviousReadingSky(selected);
  setReadingNavigation(request);
  onChoose?.(request.month);
  setShowSky(true);
  setShowTrail(true);
 };
 const returnToPreviousReadingSky=()=>{
  const destination=planEchoReadingShelfReturn(
   readingNavigation,previousReadingSky,selected,scopeKey,currentScope(),
  );
  if(!destination.ok)return;
  chooseRecordedMonth(destination.month);
  setShowSky(true);
 };
 const total=buckets.reduce((sum,bucket)=>sum+bucket.count,0);
 const preview=useMemo(()=>buildPrivateEchoStarPreview(
  featuredRecords,featuredRecords.map(entry=>entry.id),
 ),[featuredRecords]);
 const visitSkyChapter=month=>{
  chooseRecordedMonth(month);
  setShowSky(true);
 };
 return <section className={'axe-echo-month-archive'+(showSky?' is-sky-expanded':'')+(showTrail?' is-journey-open':'')}
  aria-label="Your private monthly constellation archive">
   <header className="axe-echo-month-header">
    <span className="axe-echo-month-sigil" aria-hidden="true"><MoonStar size={26}/></span>
    <div>
     <h3>My Monthly Skies</h3>
     <p>Browse the moments you really recorded, month by month.
       These stars remain private to your character and this device.</p>
    </div>
    <span className="axe-echo-month-private"><LockKeyhole size={13}/> Private preview</span>
   </header>
   <div className="axe-echo-month-grid" role="group" aria-label="Choose recorded month">
    <button type="button" className="axe-echo-month-card"
     aria-pressed={selected===ECHO_ALL_MONTHS}
     onClick={()=>chooseRecordedMonth(ECHO_ALL_MONTHS)}>
     <MoonStar size={21}/>
     <strong>All Months</strong><span>{total} recorded {total===1?'moment':'moments'}</span>
    </button>
    {buckets.map(bucket=><button type="button" key={bucket.key}
     className="axe-echo-month-card"
     aria-pressed={selected===bucket.key}
     onClick={()=>chooseRecordedMonth(bucket.key)}>
     <CalendarDays size={19}/>
     <strong>{bucket.label}</strong>
     <span>{bucket.count} {bucket.count===1?'moment':'moments'}</span>
     {featuredCounts[bucket.key]>0&&<span className="axe-echo-month-highlight-count">
       <Star size={12}/> {featuredCounts[bucket.key]} chosen stars
     </span>}
     <small><Users size={12}/> {bucket.shared} shared
       <Star size={12}/> {bucket.personal} personal
       <Camera size={12}/> {bucket.photos} photos</small>
     {bucket.chosenBranches>0&&<em>{bucket.chosenBranches} chosen
       {bucket.chosenBranches===1?' branch':' branches'}</em>}
    </button>)}
   </div>
   <EchoChronicleSkyAtlas entries={allRecords} featuredIds={featuredIds}
    chapters={skyChapters} selected={selected} onChoose={visitSkyChapter}/>
   <section className="axe-echo-month-curated" aria-label="Your privately chosen constellation stars">
     <header><Star size={15}/> My Chosen Stars
       <small>{featuredRecords.length} in {selected===ECHO_ALL_MONTHS?
        'all months':echoChronicleMonthLabel(selected)}</small>
       <button type="button" className="axe-echo-sky-toggle"
        aria-expanded={showSky} onClick={()=>{
         if(showSky){setReadingNavigation(null);setShowTrail(false)}
         setShowSky(value=>!value);
        }}>
        <MoonStar size={14}/>{showSky?'Close star preview':'View my private sky'}
       </button>
     </header>
     <div className="axe-echo-month-chosen-strip">
       {featuredRecords.length?featuredRecords.map(entry=>
        <div key={entry.id} className="axe-echo-chosen-entry">
         <button type="button" className="axe-echo-month-chosen-star"
          onClick={()=>onOpenFeatured?.(entry.id)}
          title="Open this already saved memory in your book">
          {isChroniclePhoto(entry.photoDataUri)?
           <img src={entry.photoDataUri} alt="Private locally attached memory"/>:
           <BookOpen size={17}/>}
          <span>{String(entry.title||entry.partnerName||'Saved memory').slice(0,45)}</span>
          <small>{echoChronicleMonthLabel(echoChronicleMonthKey(entry.date))}</small>
         </button>
         <div className="axe-echo-star-actions" role="group"
          aria-label={'Arrange star: '+String(entry.title||entry.partnerName||'Saved memory').slice(0,45)}>
          <button type="button" title="Move earlier within this month"
           aria-label="Move star earlier" onClick={()=>onMoveFeatured?.(entry.id,'left')}>
           <ChevronLeft size={15}/>
          </button>
          <button type="button" title="Move later within this month"
           aria-label="Move star later" onClick={()=>onMoveFeatured?.(entry.id,'right')}>
           <ChevronRight size={15}/>
          </button>
          <button type="button" title="Remove star from private sky"
           aria-label="Remove star from My Chosen Stars"
           onClick={()=>onRemoveFeatured?.(entry.id)}><X size={15}/></button>
         </div>
        </div>):<p>No stars chosen for this period. Open a saved memory and select
         Add to My Sky. Your selection stays on this character and device.</p>}
     </div>
   </section>
   {showSky&&<section className="axe-echo-private-sky"
    aria-label="Interactive private constellation preview">
    <header><MoonStar size={16}/> Private Stargazing
     <span>{preview.total===0?'No chosen stars':preview.total+
      (preview.total===1?' saved star':' saved stars')}</span>
    </header>
    {shelfRequested&&previousReadingSky!==null&&
     <div className="axe-echo-reading-return">
      <button type="button" onClick={returnToPreviousReadingSky}
       aria-label={'Return to previous private sky: '+
        (previousReadingSky===ECHO_ALL_MONTHS?'All Months':
         echoChronicleMonthLabel(previousReadingSky))}>
       <ChevronLeft size={15}/>
       Return to {previousReadingSky===ECHO_ALL_MONTHS?
        'All Months':echoChronicleMonthLabel(previousReadingSky)}
      </button>
      <small>Back to your previous private sky. No memory or
       reading position will be changed.</small>
     </div>}
    <EchoChronicleSkyChapterEditor key={scopeKey} month={selected} chapter={skyChapter}
      canWrite={featuredRecords.length>0} onSave={onSaveSkyChapter}
      onDelete={onDeleteSkyChapter}/>
    <div className="axe-echo-private-sky-field">
     <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
       {preview.edges.map(edge=><line key={edge.toId}
        x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
        stroke={edge.kind==='chosen-branch'?'#f8dfa8':'#caa9ed'}
        strokeDasharray={edge.kind==='chosen-branch'?'none':'1.5 1.5'}
        strokeWidth={edge.kind==='chosen-branch'?'.8':'.45'}/>)}
     </svg>
     {preview.nodes.map(node=><button type="button" key={node.id}
      className="axe-echo-private-sky-node"
      style={{left:node.x+'%',top:node.y+'%'}}
      onClick={()=>onOpenFeatured?.(node.id)}
      title="Open real selected Chronicle moment">
      <Star size={16}/><span>
       {String(node.entry.title||node.entry.partnerName||'Memory').slice(0,25)}
      </span></button>)}
     {!preview.nodes.length&&<div className="axe-echo-private-sky-empty">
      <MoonStar size={34}/> Choose saved memories to fill this private sky.
     </div>}
    </div>
    {preview.hiddenCount>0&&<p className="axe-echo-sky-note">
     Showing the first {preview.nodes.length} of {preview.total} chosen stars.
     Use the cards above for the remaining moments.</p>}
    <p className="axe-echo-sky-note">Gold connections are personally chosen
     branches. Dotted lines are visual order only, not relationships or quest proof.</p>
    <EchoChronicleSkyStoryboard entries={allRecords} featuredIds={featuredIds}
     month={selected} onOpen={onOpenFeatured}/>
    <button type="button" className="axe-echo-journey-toggle"
     aria-expanded={showTrail} aria-controls="axe-echo-journey-content"
     onClick={()=>setShowTrail(value=>!value)}>
     <GitBranch size={16}/>
     {showTrail?'Close my journey trail':'Explore my journey trail'}
    </button>
    <div id="axe-echo-journey-content" hidden={!showTrail}>
     {showTrail&&<EchoChronicleJourneyTrail key={scopeKey} entries={allRecords} featuredIds={featuredIds}
      month={selected} onOpen={onOpenFeatured} onOpenParent={onOpenSaved}
      onContinue={onContinueSaved} onChooseMonth={visitSkyChapter}
      onChooseReadingShelf={visitReadingShelf}
      autoOpenReadingShelf={shelfRequested}/>}
    </div>
   </section>}
   {selected===ECHO_ALL_MONTHS&&unavailableCount>0&&
    <aside className="axe-echo-sky-unavailable">
     <LockKeyhole size={16}/>
     <p>{unavailableCount} previous star {unavailableCount===1?'selection is':'selections are'}
      currently unavailable in this character's loaded Chronicle.
      They are hidden, not automatically deleted.</p>
     <button type="button" onClick={()=>onClearUnavailable?.()}>
      Remove unavailable selections
     </button>
    </aside>}
   {featuredError&&<p className="axe-echo-curated-error" role="alert">
    {featuredError}</p>}
   {buckets.length===0&&<p className="axe-echo-month-empty">
    No recorded months yet. Write a personal moment or mutually save an encounter
    to illuminate your first constellation.</p>}
   <footer className="axe-echo-month-future">
    <LockKeyhole size={14}/> The end-of-month community sky is planned,
    but sharing is not enabled here. No memory is published automatically.
   </footer>
  </section>;
}
