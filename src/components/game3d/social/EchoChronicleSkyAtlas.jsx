import {useEffect,useMemo,useState} from 'react';
import {
 BookOpen,CalendarDays,Camera,ChevronLeft,ChevronRight,Clock3,
 LockKeyhole,Star,ScrollText,
} from 'lucide-react';
import {
 ECHO_ALL_MONTHS,
} from './echoChronicleMonthlySky';
import {
 buildEchoSkyChapterAtlas,buildEchoSkyStoryboard,
} from './echoChronicleSkyAtlas';
import {isChroniclePhoto} from './echoChroniclePhoto';

// An illustrated index to REAL months and player-written private captions.
// An authored chapter with missing stars stays visible, explicitly marked as
// unavailable; it is never promoted to a shared/public memory.
export default function EchoChronicleSkyAtlas({
 entries=[],featuredIds=[],chapters=[],selected=ECHO_ALL_MONTHS,
 onChoose,
}){
 const atlas=useMemo(()=>buildEchoSkyChapterAtlas({
  entries,featuredIds,chapters,
 }),[entries,featuredIds,chapters]);
 return <section className="axe-echo-atlas" aria-label="Private book of monthly skies">
   <header className="axe-echo-atlas-heading">
    <BookOpen size={18}/>
    <div><h3>Book of Skies</h3>
     <p>Return to chapters of your journey. Titles and reflections are your own words.</p></div>
    <small><LockKeyhole size={12}/> Private archive</small>
   </header>
   <div className="axe-echo-atlas-months" role="group"
    aria-label="Recorded sky chapters">
    {atlas.map(chapter=><button key={chapter.month} type="button"
     className="axe-echo-atlas-month"
     aria-pressed={selected===chapter.month}
     onClick={()=>onChoose?.(chapter.month)}>
     <span className="axe-echo-atlas-month-icon"><Star size={17}/></span>
     <span className="axe-echo-atlas-month-copy">
      <strong>{chapter.chapterTitle||chapter.label}</strong>
      <small>{chapter.label} · {chapter.chosenCount} chosen
       {chapter.chosenCount===1?' star':' stars'} ·
       {chapter.savedCount} saved {chapter.savedCount===1?'memory':'memories'}</small>
      {chapter.excerpt&&<em>{chapter.excerpt}</em>}
      {chapter.hasChapter&&!chapter.available&&<small className="axe-echo-atlas-unavailable">
       Chapter retained; chosen memories currently unavailable
      </small>}
     </span>
     <ChevronRight size={15}/>
    </button>)}
    {!atlas.length&&<p className="axe-echo-atlas-empty">
     Your Book of Skies is empty. Record a real memory or choose a saved
     constellation star to begin a chapter.</p>}
   </div>
 </section>;
}

// Read-only storyboard. Each thumbnail is an explicitly selected, validated
// local photograph or a neutral empty-book icon — not AI-created imagery.
export function EchoChronicleSkyStoryboard({
 entries=[],featuredIds=[],month=ECHO_ALL_MONTHS,onOpen,
}){
 const [requestedPage,setPage]=useState(0);
 useEffect(()=>setPage(0),[month,entries,featuredIds]);
 const result=useMemo(()=>buildEchoSkyStoryboard(
  entries,featuredIds,month,{page:requestedPage,pageSize:6},
 ),[entries,featuredIds,month,requestedPage]);
 return <section className="axe-echo-storyboard"
  aria-label="True memories behind this sky chapter">
  <header><ScrollText size={16}/>
   <div><h4>Moments Behind the Stars</h4>
    <small>{result.total} recorded and personally chosen
     {result.total===1?' memory':' memories'}</small></div>
  </header>
  <div className="axe-echo-storyboard-grid">
   {result.cards.map(card=><button key={card.id} type="button"
     className="axe-echo-storyboard-card"
     onClick={()=>onOpen?.(card.id)} title="Open this recorded memory">
     <span className="axe-echo-storyboard-image">
      {isChroniclePhoto(card.photoDataUri)?
       <img src={card.photoDataUri} alt={'Private saved photo: '+card.title}/>:
       <BookOpen size={29}/>}
     </span>
     <strong>{card.title}</strong>
     <small><Clock3 size={12}/>
      {card.date?new Date(card.date).toLocaleString():'Time not recorded'}
     </small>
     <small><CalendarDays size={12}/>
      {card.source==='personal'?'Private journal':'Mutually saved encounter'}
     </small>
     {card.parentId&&<em><Star size={11}/> Chosen continuation</em>}
    </button>)}
   {!result.total&&<p className="axe-echo-storyboard-empty">
    No chosen memories in this sky yet. Only real saved entries appear here.</p>}
  </div>
  {result.pageCount>1&&<nav className="axe-echo-storyboard-pager"
    aria-label="Sky memory pages">
   <button type="button" disabled={result.page===0}
    onClick={()=>setPage(value=>Math.max(0,value-1))}>
    <ChevronLeft size={14}/> Previous</button>
   <span>Page {result.page+1} of {result.pageCount}</span>
   <button type="button" disabled={result.page>=result.pageCount-1}
    onClick={()=>setPage(value=>Math.min(result.pageCount-1,value+1))}>
    Next <ChevronRight size={14}/></button>
  </nav>}
  <footer><LockKeyhole size={12}/> Private view only. No photographs,
   stories, or star positions are sent to other players.</footer>
 </section>;
}
