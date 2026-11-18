import {useEffect,useMemo,useState} from 'react';
import {
 BookOpen,CalendarDays,Camera,Clock3,GitBranch,LockKeyhole,
 MapPin,Star,Users,Search,X,Compass,
} from 'lucide-react';
import {buildEchoChronicleJourneyTrail} from './echoChronicleJourneyTrail';
import EchoChronicleCrossroads from './EchoChronicleCrossroads.jsx';
import {
 ECHO_JOURNEY_FILTERS,projectEchoChronicleJourneyView,
 echoJourneyContextCounts,
} from './echoChronicleJourneyDiscovery.js';

// Read-only narrative trail: every event and chosen continuation already
// exists in this player's saved Chronicle. Not a gameplay/quest event log.
export default function EchoChronicleJourneyTrail({
 entries=[],featuredIds=[],month='all',onOpen,onOpenParent,onContinue,onChooseMonth,
 onChooseReadingShelf,autoOpenReadingShelf=false,
}){
 const trail=useMemo(()=>buildEchoChronicleJourneyTrail(
  entries,featuredIds,month,
 ),[entries,featuredIds,month]);
 const [filter,setFilter]=useState('all');
 const [query,setQuery]=useState('');
 const [showCrossroads,setShowCrossroads]=useState(autoOpenReadingShelf);
 useEffect(()=>{
  setFilter('all');setQuery('');setShowCrossroads(Boolean(autoOpenReadingShelf));
 },[month,autoOpenReadingShelf]);
 const view=useMemo(()=>projectEchoChronicleJourneyView(trail,{
  filter,query,
 }),[trail,filter,query]);
 const counts=useMemo(()=>echoJourneyContextCounts(trail),[trail]);
 return <section className="axe-echo-journey-trail"
  aria-label="Dated personal journey through chosen memories">
  <header>
   <GitBranch size={18}/>
   <div>
    <h4>My Journey Through the Stars</h4>
    <p>Every moment is saved; gold branches are personal continuations,
     not automatically generated quests.</p>
   </div>
   <small><LockKeyhole size={12}/> Private</small>
  </header>
  <div className="axe-echo-journey-summary" aria-label="Saved journey summary">
   <span><CalendarDays size={13}/>{trail.dayCount}
    {trail.dayCount===1?' recorded day':' recorded days'}</span>
   <span><Star size={13}/>{trail.total}
    {trail.total===1?' chosen moment':' chosen moments'}</span>
   <span><Camera size={13}/>{trail.photoCount} photos</span>
   <span><GitBranch size={13}/>{trail.chosenBranchCount} chosen branches</span>
  </div>
  {trail.total>0&&<div className="axe-echo-journey-discovery"
    aria-label="Find moments within this private journey">
    <div className="axe-echo-journey-search">
     <Search size={16}/>
     <input type="search" value={query} maxLength={100}
      aria-label="Search saved journey moments"
      placeholder="Search title, place, memory type or date..."
      onChange={event=>setQuery(event.target.value)}/>
     {query&&<button type="button" onClick={()=>setQuery('')}
       aria-label="Clear journey search"><X size={15}/></button>}
    </div>
    <div className="axe-echo-journey-filters" role="group"
      aria-label="Filter recorded journey moments">
     {ECHO_JOURNEY_FILTERS.map(option=><button type="button" key={option.id}
      aria-pressed={filter===option.id}
      onClick={()=>setFilter(option.id)}>
      {option.label} <span>{counts[option.id]}</span>
     </button>)}
    </div>
    <div className="axe-echo-journey-results" role="status">
     Showing {view.visible} of {view.total} saved {view.total===1?'moment':'moments'}
     {view.isFiltered&&<button type="button" onClick={()=>{
      setFilter('all');setQuery('');
     }}>Clear filters</button>}
    </div>
   </div>}
  {view.groups.length?
   <ol className="axe-echo-journey-days">
    {view.groups.map(group=><li className="axe-echo-journey-day" key={group.key}>
     <div className="axe-echo-journey-day-header">
      <CalendarDays size={15}/><strong>{group.label}</strong>
      <small>{group.steps.length}
       {group.steps.length===1?' moment':' moments'}</small>
     </div>
     <ol className="axe-echo-journey-steps">
      {group.steps.map(step=><li key={step.id}>
       <button type="button" className="axe-echo-journey-memory"
        onClick={()=>onOpen?.(step.id)}
        title="Open this existing Chronicle memory">
        <span className="axe-echo-journey-sigil">
         {step.source==='personal'?<BookOpen size={17}/>:<Users size={17}/>}
        </span>
        <span className="axe-echo-journey-content">
         <strong>{step.title}</strong>
         <small><Clock3 size={12}/>
          {step.at?new Date(step.at).toLocaleTimeString(undefined,{
           hour:'numeric',minute:'2-digit',
          }):'Time not recorded'}
          <MapPin size={12}/>{step.location}</small>
         <em>{step.source==='personal'?'Personal journal':'Mutually saved encounter'}
          {' · '}{step.context}
          {step.hasPhoto?' · Photo saved':''}</em>
        </span>
        <Star size={14} className="axe-echo-journey-open"/>
       </button>
       {step.parent&&<div className="axe-echo-journey-parent">
        <GitBranch size={14}/>
        <span>Chosen continuation from</span>
        <button type="button"
         onClick={()=>onOpenParent?.(step.parent.id)}
         title="Open the existing earlier memory">
         {step.parent.title}
         {step.parent.otherDay?' · another day':''}
         {!step.parent.inSky?' · outside chosen sky':''}
        </button>
       </div>}
      </li>)}
     </ol>
    </li>)}
   </ol>:
   <p className="axe-echo-journey-empty">
    {trail.total>0?
     'No saved moments match these filters. Change the category or clear your search.':
     'No chosen moments for this sky. Select a saved memory in Echo Chronicle to begin recording your journey.'}
   </p>}
  {trail.total>0&&<section className="axe-echo-crossroads-section"
    aria-label="Connected memories in the chosen sky">
    <button type="button" className="axe-echo-crossroads-toggle"
      aria-expanded={showCrossroads}
      onClick={()=>setShowCrossroads(value=>!value)}>
      <Compass size={16}/>
      {showCrossroads?'Close Where Paths Cross':'Explore Where Paths Cross'}
    </button>
    {showCrossroads&&<EchoChronicleCrossroads
      entries={entries} featuredIds={featuredIds} month={month}
      onOpen={onOpen} onOpenParent={onOpenParent} onContinue={onContinue}
      onChooseMonth={onChooseMonth}
      onChooseReadingShelf={onChooseReadingShelf}
      autoOpenReadingShelf={autoOpenReadingShelf}/>}
   </section>}
  <footer><LockKeyhole size={13}/>
   A personal timeline, not proof of quest completion, friendship,
   combat results, or consent for public sharing.</footer>
 </section>;
}
