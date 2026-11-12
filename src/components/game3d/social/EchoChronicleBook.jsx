import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Bookmark, CalendarDays, ChevronRight, Clock3, MapPin,
  MessageSquareText, Search, ScrollText, Sparkles, X, Heart,
  Camera, Compass, Swords, Users, Home, Layers3, Orbit, Star, MoonStar,
} from 'lucide-react';
import { updateEchoMemoryAnnotation } from './echoChronicleStore';
import EchoChronicleConstellation from './EchoChronicleConstellation';
import EchoChronicleMonthArchive from './EchoChronicleMonthArchive';
import {
 getFeaturedEchoStarIds,subscribeFeaturedEchoStarIds,toggleFeaturedEchoStar,
 moveFeaturedEchoStar,clearUnavailableFeaturedEchoStars,
} from './echoChronicleFeaturedStars';
import {
 getFeaturedEchoMonthCounts,projectFeaturedEchoStars,
} from './echoChronicleCurationModel';
import {inspectFeaturedEchoSelection} from './echoChronicleSkyJourney';
import {findEchoSkyChapter} from './echoChronicleSkyChapters';
import {
 getEchoSkyChapters,subscribeEchoSkyChapters,
 writeEchoSkyChapter,deleteEchoSkyChapter,
} from './echoChronicleSkyChapterStore';
import {
 ECHO_ALL_MONTHS,getEchoChronicleMonthBuckets,filterEchoChronicleByMonth,
} from './echoChronicleMonthlySky';
import {
  getEchoJournalEntries,subscribeEchoJournalEntries,
  createEchoJournalEntry,updateEchoJournalEntry,removeEchoJournalEntry,
} from './echoChronicleJournal';
import {readChroniclePhoto,isChroniclePhoto} from './echoChroniclePhoto';
import {getStorageUser,getActiveId,subscribeCharacterChange} from '../characterStorage';
import {echoChronicleRelatedPages} from './echoChronicleGraph';
import {sameEchoChroniclePrivateScope} from './echoChroniclePrivateScope';
import './EchoChronicleBook.css';
import './EchoChronicleCosmic.css';
import './EchoChronicleBranches.css';
import './EchoChronicleMonthlySky.css';
import './EchoChronicleCuration.css';
import './EchoChronicleSkyJourney.css';
import './EchoChronicleSkyChapters.css';
import './EchoChronicleSkyAtlas.css';
import './EchoChronicleJourneyTrail.css';
import './EchoChronicleJourneyDiscovery.css';
import './EchoChronicleCrossroads.css';
import './EchoChronicleStoryThreads.css';
import './EchoChronicleThreadExplorer.css';
import './EchoChronicleThreadReader.css';
import './EchoChronicleReadingShelf.css';
import './EchoChronicleNextMemoryQueue.css';

const chapterName = (entry) => entry.source === 'personal'
  ? (entry.context === 'training' ? 'Personal training journal' :
    entry.context === 'exploration' ? 'Exploration journal' :
      entry.context === 'quest' ? 'Quest reflection · personal' : 'Private reflection')
  : entry.previousEncounters > 0
  ? 'Crossed paths again'
  : entry.context === 'boss' ? 'At the edge of a battle'
  : entry.context === 'exploration' ? 'An encounter on the road'
  : 'A chance encounter';

const formatMoment = (value) => {
  if (!value) return 'Time not recorded';
  const moment = new Date(value);
  return Number.isNaN(moment.getTime()) ? 'Time not recorded' :
    moment.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};
const formatTime = (value) => {
  if (!value) return 'Time not recorded';
  const moment = new Date(value);
  return Number.isNaN(moment.getTime()) ? 'Time not recorded' :
    moment.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};
const formatDate = (value) => {
  if (!value) return 'Undated';
  const moment = new Date(value);
  return Number.isNaN(moment.getTime()) ? 'Undated' :
    moment.toLocaleDateString(undefined, { dateStyle: 'medium' });
};
const formatRegion = (region) => region === 'wolfveil' ? 'Wolfveil'
  : region === 'forest' ? 'The Forest' :
    String(region || '').trim().replace(/_/g, ' ') || 'Location not recorded';
const kindDescription = (entry) => entry.source === 'personal'
  ? 'Written by you on this device. Not a verified quest completion or a shared encounter.'
  : entry.context === 'boss' ?
  'An exchange near a battle. No victory or outcome is implied.' :
  entry.context === 'exploration' ? 'A conversation while exploring the world.' :
    'A meeting that both travelers chose to remember.';
const FILTERS = [
  { id: 'all', label: 'All Records' },
  { id: 'exploration', label: 'Exploration' },
  { id: 'boss', label: 'Near Battles' },
  { id: 'chance', label: 'Chance' },
  { id: 'bookmarked', label: 'Bookmarks' },
  { id: 'training', label: 'Training' },
  { id: 'quest', label: 'Quest Reflections' },
];

/**
 * Echo Chronicle is a character-local, factual, opt-in encounter memory book.
 * QUESTS remain in the separate Services → Quest Logbook. Never synthesize
 * missing encounters, dialogue timestamps, completions, or relationship status.
 */
const currentChronicleScope=()=>JSON.stringify([getStorageUser(),getActiveId()]);
export default function EchoChronicleBook({ memories = [], onClose, onOpenQuestLogbook }) {
  const [scopeKey,setScopeKey]=useState(currentChronicleScope);
  useEffect(()=>subscribeCharacterChange(()=>setScopeKey(currentChronicleScope())),[]);
  const [query, setQuery] = useState('');
  const [activeTab,setActiveTab] = useState('timeline');
  const [selectedMonth,setSelectedMonth] = useState(ECHO_ALL_MONTHS);
  const [category,setCategory] = useState('all');
  const [journal,setJournal] = useState(getEchoJournalEntries);
  useEffect(()=>subscribeEchoJournalEntries(setJournal),[]);
  const allRecords=useMemo(()=>[...memories,...journal],[memories,journal]);
  const [featuredIds,setFeaturedIds]=useState(getFeaturedEchoStarIds);
  useEffect(()=>subscribeFeaturedEchoStarIds(setFeaturedIds),[]);
  const [skyChapters,setSkyChapters]=useState(getEchoSkyChapters);
  useEffect(()=>subscribeEchoSkyChapters(setSkyChapters),[]);
  const skyChapter=useMemo(()=>
    findEchoSkyChapter(skyChapters,selectedMonth),
    [skyChapters,selectedMonth]);
  const featuredCounts=useMemo(()=>
    getFeaturedEchoMonthCounts(allRecords,featuredIds),[allRecords,featuredIds]);
  const featuredRecords=useMemo(()=>
    projectFeaturedEchoStars(allRecords,featuredIds,selectedMonth),
    [allRecords,featuredIds,selectedMonth]);
  const featuredStatus=useMemo(()=>
    inspectFeaturedEchoSelection(allRecords,featuredIds),
    [allRecords,featuredIds]);
  const monthBuckets=useMemo(()=>getEchoChronicleMonthBuckets(allRecords),[allRecords]);
  const monthRecords=useMemo(()=>activeTab==='monthly'
    ?filterEchoChronicleByMonth(allRecords,selectedMonth):allRecords,
    [allRecords,activeTab,selectedMonth]);
  const [recordOpen,setRecordOpen] = useState(false);
  const [focusContinuedDraft,setFocusContinuedDraft]=useState(false);
  const draftTitleInput=useRef(null);
  useEffect(()=>{
    if(!recordOpen||!focusContinuedDraft)return;
    draftTitleInput.current?.focus({preventScroll:true});
    draftTitleInput.current?.scrollIntoView?.({block:'center',behavior:'auto'});
    setFocusContinuedDraft(false);
  },[recordOpen,focusContinuedDraft]);
  const [recordError,setRecordError] = useState('');
  const [draftTitle,setDraftTitle] = useState('');
  const [draftContext,setDraftContext] = useState('training');
  const [draftRegion,setDraftRegion] = useState('');
  const [draftReflection,setDraftReflection] = useState('');
  const [draftParent,setDraftParent] = useState('');
  const [photoError,setPhotoError] = useState('');
  const [annotationError,setAnnotationError] = useState('');
  const [featuredError,setFeaturedError] = useState('');
  const [photoBusy,setPhotoBusy] = useState(false);
  const photoCount=allRecords.filter((entry)=>!!entry.photoDataUri).length;
  const changeTab=(tab)=>{
    setActiveTab(tab);
    setCategory('all');setFilter('all');
    if(tab!=='monthly')setSelectedMonth(ECHO_ALL_MONTHS);
  };
  const chooseMonth=(month)=>{
    setSelectedMonth(month);
    setActiveTab('monthly');setCategory('all');
    setFilter('all');setQuery('');
  };
  const chooseCategory=(id)=>{
    setCategory(id);setFilter('all');
    if(id==='rivals')setFilter('boss');
    if(id==='world')setFilter('exploration');
    if(id==='training')setFilter('training');
  };
  const annotate=(id,patch)=>{
    const saved=journal.some(entry=>entry.id===id)
      ?updateEchoJournalEntry(id,patch)
      :updateEchoMemoryAnnotation(id,patch);
    setAnnotationError(saved?'':'Unable to save this edit on the current character. Check browser storage.');
    return saved;
  };
  const toggleFeatured=(id)=>{
    const result=toggleFeaturedEchoStar(id,allRecords);
    setFeaturedError(result.ok?'':result.reason==='month-full'?
      'This month already has six chosen stars. Remove one before adding another.':
      result.reason==='sky-full'?
      'Your private sky has reached its 60-star limit. Remove a star first.':
      result.reason==='storage-unavailable'?
      'Your browser could not save this star. No change was made.':
      'Only existing saved memories can become stars.');
  };
  const moveFeatured=(id,direction)=>{
    const result=moveFeaturedEchoStar(id,direction,allRecords);
    setFeaturedError(result.ok?'':result.reason==='edge'?
      'This star is already at the edge of its month.':
      result.reason==='storage-unavailable'?
      'Your browser could not save the new star order. Nothing changed.':
      'Only an available chosen star can be rearranged.');
  };
  const saveSkyChapter=input=>
    scopeKey!==currentChronicleScope()
      ?{ok:false,reason:'character-changed'}
      :writeEchoSkyChapter({...input,entries:allRecords,featuredIds});
  const removeSkyChapter=month=>
    scopeKey!==currentChronicleScope()
      ?{ok:false,reason:'character-changed'}
      :deleteEchoSkyChapter(month);
  const clearUnavailableFeatured=()=>{
    if(!window.confirm('Remove the unavailable star selections from this character? '+
      'Memories may simply not have loaded yet. This cannot be undone.'))return;
    const result=clearUnavailableFeaturedEchoStars(allRecords);
    setFeaturedError(result.ok?'':result.reason==='storage-unavailable'?
      'Unable to save the cleanup. No stars were removed.':
      'There are no unavailable selections to remove.');
  };
  const openFeatured=(id)=>{
    if(!featuredRecords.some(entry=>entry.id===id))return;
    setQuery('');setFilter('all');setCategory('all');
    setSelectedId(id);
  };
  const openRecorded=(id)=>{
    if(!allRecords.some(entry=>entry.id===id))return;
    setQuery('');setFilter('all');setCategory('all');
    setActiveTab('timeline');setSelectedId(id);
  };
  const continueRecorded=(id)=>{
    if(scopeKey!==currentChronicleScope()||!allRecords.some(entry=>entry.id===id))return;
    setRecordError('');setRecordOpen(true);setDraftParent(id);
    setFocusContinuedDraft(true);
    setDraftTitle('');setDraftReflection('');setDraftRegion('');
    setQuery('');setFilter('all');setCategory('all');setActiveTab('timeline');
  };
  const attachPhoto=async(event)=>{
    const file=event.target.files?.[0];
    event.target.value='';
    if(!file || !selected)return;
    const targetId=selected.id;
    // 48.7: never resume a pending canvas upload into a different signed-in
    // account/character, even when that user has an identically named record.
    const scopeAtStart={userId:getStorageUser(),characterId:getActiveId()};
    setPhotoBusy(true);setPhotoError('');
    try{
      const photoDataUri=await readChroniclePhoto(file);
      if(!sameEchoChroniclePrivateScope(scopeAtStart,
        {userId:getStorageUser(),characterId:getActiveId()}))
        throw Error('Character changed before the photograph was saved. Please select it again.');
      if(!annotate(targetId,{photoDataUri}))
        throw Error('Could not save this photograph on this character/device.');
    }catch(error){setPhotoError(error?.message || 'Photograph could not be saved.');}
    finally{setPhotoBusy(false)}
  };
  const [filter, setFilter] = useState('all');
  const [order, setOrder] = useState('latest');
  const [selectedId, setSelectedId] = useState(null);
  const entries = useMemo(() => monthRecords.filter((entry) => {
    if(category==='shared'&&entry.source==='personal')return false;
    if(activeTab==='bonds' && !(entry.previousEncounters>0 || entry.agreedAdventure))return false;
    if(activeTab==='arcs' && !(entry.agreedAdventure||entry.parentId||
      allRecords.some(candidate=>candidate.parentId===entry.id)))return false;
    if(activeTab==='photos' && !entry.photoDataUri)return false;
    if(filter==='training' && entry.context!=='training')return false;
    if (filter === 'bookmarked' && !entry.bookmarked) return false;
    if (filter !== 'all' && filter !== 'bookmarked' && entry.context !== filter) return false;
    const needle = query.trim().toLowerCase();
    return !needle || [entry.title, entry.partnerName, entry.region, entry.reflection,
      entry.context, ...(entry.lines || []).map((line) => line.text)].some((value) =>
      String(value || '').toLowerCase().includes(needle));
  }).sort((a, b) => {
    const difference = (Date.parse(a.date) || 0) - (Date.parse(b.date) || 0);
    return order === 'oldest' ? difference : -difference;
  }), [allRecords, monthRecords, filter, query, order,activeTab,category]);
  const selected = entries.find((entry) => entry.id === selectedId) || entries[0] || null;
  const related=echoChronicleRelatedPages(allRecords,selected?.id);
  const recordMoment=(event)=>{
    event.preventDefault();
    setRecordError('');
    const id=createEchoJournalEntry({
      title:draftTitle,reflection:draftReflection,context:draftContext,
      region:draftRegion,parentId:draftParent||null,
    });
    if(!id){
      setRecordError('Could not save this personal journal entry. Add a title and check local storage space.');
      return;
    }
    setFilter('all');setQuery('');setActiveTab('timeline');setCategory('all');
    setSelectedId(id);setRecordOpen(false);
    setDraftTitle('');setDraftReflection('');setDraftParent('');setDraftRegion('');
  };

  return <div className="axe-echo-chronicle-backdrop" role="presentation">
    <section role="dialog" aria-modal="true" aria-label="Echo Chronicle memory book"
      className="axe-echo-chronicle-shell"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') onClose?.();
      }}
      onKeyUp={(event) => event.stopPropagation()}>
      <header className="axe-echo-chronicle-header">
        <div className="axe-echo-chronicle-mark" aria-hidden="true">
          <Orbit size={37}/><Star className="axe-echo-chronicle-sigil-star" size={15}/>
        </div>
        <div className="axe-echo-chronicle-heading">
          <span className="axe-echo-chronicle-overline"><BookOpen size={17}/> THE CHRONICLES OF ATOM X EVE</span>
          <h2>Echo Chronicle</h2>
          <p>Your personal memory book — a living chronicle of your journey, people, choices and the worlds you've shaped.</p>
        </div>
        <div className="axe-echo-chronicle-header-actions">
          <span className="axe-echo-chronicle-count">{memories.length} saved encounters · {journal.length} private journal pages</span>
          <button className="axe-echo-chronicle-icon-button" type="button"
            onClick={onClose} aria-label="Close Echo Chronicle"><X size={20}/></button>
        </div>
      </header>
      <nav className="axe-echo-chronicle-primary-tabs" aria-label="Echo Chronicle sections">
        <button type="button" aria-pressed={activeTab==='timeline'}
          onClick={()=>changeTab('timeline')}><Orbit size={19}/> Timeline</button>
        <button type="button" aria-pressed={activeTab==='memories'}
          onClick={()=>changeTab('memories')}><BookOpen size={19}/> Memories</button>
        <button type="button" aria-pressed={activeTab==='bonds'}
          onClick={()=>changeTab('bonds')}><Heart size={19}/> Bonds</button>
        <button type="button" aria-pressed={activeTab==='photos'}
          onClick={()=>changeTab('photos')}><Camera size={19}/> Photos {photoCount>0&&<small>{photoCount}</small>}</button>
        <button type="button" aria-pressed={activeTab==='monthly'}
          onClick={()=>changeTab('monthly')}><MoonStar size={19}/> Monthly Skies</button>
        {onOpenQuestLogbook && <button type="button" onClick={onOpenQuestLogbook}
          title="Go to the real Services Quest Logbook"><ScrollText size={19}/> Quest Logbook</button>}
      </nav>
      <div className="axe-echo-chronicle-stage">
        <nav className="axe-echo-chronicle-side-rail" aria-label="Chronicle navigation">
          <div className="axe-echo-rail-emblem" aria-hidden="true"><Orbit size={44}/></div>
          <button type="button" aria-current={activeTab==='timeline'?'page':undefined}
            onClick={()=>changeTab('timeline')}><BookOpen size={17}/> Echo Chronicle</button>
          {onOpenQuestLogbook && <button type="button" onClick={onOpenQuestLogbook}>
            <ScrollText size={17}/> Quest Logbook</button>}
          <button type="button" onClick={()=>changeTab('memories')}><BookOpen size={17}/> Memories</button>
          <button type="button" onClick={()=>changeTab('timeline')}><Orbit size={17}/> Echoes</button>
          <button type="button" onClick={()=>changeTab('monthly')}><MoonStar size={17}/> Monthly Skies</button>
          <button type="button" onClick={()=>changeTab('arcs')}><Layers3 size={17}/> Story Arcs</button>
          <button type="button" onClick={()=>{changeTab('timeline');setFilter('boss')}}>
            <Swords size={17}/> World Events</button>
          <button type="button" onClick={()=>{changeTab('memories');setOrder('latest')}}>
            <Star size={17}/> Character Log</button>
          <button type="button" onClick={()=>changeTab('bonds')}><Users size={17}/> Relationships</button>
          <div className="axe-echo-rail-caption">Lore Archive · Future chapter</div>
        </nav>
        <div className="axe-echo-chronicle-book-wrap">
      <div className="axe-echo-chronicle-toolbar">
        <button type="button" className="axe-echo-record-open" aria-expanded={recordOpen}
          onClick={()=>{setRecordOpen(value=>!value);setRecordError('')}}>
          <BookOpen size={16}/> Record a moment
        </button>
        <label className="axe-echo-chronicle-search">
          <Search size={17}/>
          <input type="search" aria-label="Search memories" value={query}
            placeholder="Search names, places, conversations…"
            onChange={(event) => setQuery(event.target.value)}/>
        </label>
        <div role="group" aria-label="Memory filters" className="axe-echo-chronicle-filters">
          {FILTERS.map((item) => <button key={item.id} type="button"
            aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
            {item.label}
          </button>)}
        </div>
        <label className="axe-echo-chronicle-sort">Sort
          <select aria-label="Memory order" value={order}
            onChange={(event) => setOrder(event.target.value)}>
            <option value="latest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
      </div>
      {activeTab==='monthly'&&<EchoChronicleMonthArchive
        buckets={monthBuckets} selected={selectedMonth} onChoose={chooseMonth}
        featuredCounts={featuredCounts} featuredRecords={featuredRecords}
        unavailableCount={featuredStatus.unavailableCount}
        onOpenFeatured={openFeatured}
        onOpenSaved={openRecorded}
        onContinueSaved={continueRecorded}
        onMoveFeatured={moveFeatured}
        onRemoveFeatured={toggleFeatured}
        onClearUnavailable={clearUnavailableFeatured}
        featuredError={featuredError}
        skyChapter={skyChapter} skyChapters={skyChapters}
        scopeKey={scopeKey}
        allRecords={allRecords} featuredIds={featuredIds}
        onSaveSkyChapter={saveSkyChapter}
        onDeleteSkyChapter={removeSkyChapter}/>}
      <div className="axe-echo-chronicle-spread">
        <div className="axe-echo-chronicle-left-page">
          <div className="axe-echo-chronicle-page-kicker">
            <ScrollText size={17}/> ENCOUNTER INDEX <span>{entries.length} entries</span>
          </div>
          <p className="axe-echo-chronicle-page-intro">
            {activeTab==='monthly'&&<strong>Monthly sky: {selectedMonth===ECHO_ALL_MONTHS?
              'all recorded months':monthBuckets.find(bucket=>bucket.key===selectedMonth)?.label||
              'no matching month'}. </strong>}
            Shared encounters require both travelers' consent. You can also write private
            training, exploration and quest reflections — never an invented victory.
          </p>
          {recordOpen&&<form className="axe-echo-record-form" onSubmit={recordMoment}
            aria-label="Record a private moment">
            <h3><BookOpen size={17}/> Record a personal moment</h3>
            <p>This is your own journal entry, dated when you write it. It does not
              complete a quest or claim another traveler was present.</p>
            <label>Moment title
              <input ref={draftTitleInput} required maxLength={80} value={draftTitle}
                placeholder="A training session by the ruins"
                onChange={event=>setDraftTitle(event.target.value)}/></label>
            <div className="axe-echo-record-fields">
              <label>Category
                <select value={draftContext} onChange={event=>setDraftContext(event.target.value)}>
                  <option value="training">Training</option>
                  <option value="exploration">Exploration</option>
                  <option value="quest">Quest reflection</option>
                  <option value="reflection">Personal reflection</option>
                </select></label>
              <label>Place (optional)
                <input maxLength={60} value={draftRegion} placeholder="Where you remember being"
                  onChange={event=>setDraftRegion(event.target.value)}/></label>
            </div>
            <label>Continue a previous memory (optional)
              <select value={draftParent} onChange={event=>setDraftParent(event.target.value)}>
                <option value="">New independent star</option>
                {allRecords.map(entry=><option key={entry.id} value={entry.id}>
                  {(entry.title||entry.partnerName||'Recorded encounter').slice(0,70)}
                </option>)}
              </select></label>
            <label>What happened? (private)
              <textarea value={draftReflection} maxLength={2000} rows={3}
                placeholder="Write what you actually experienced…"
                onChange={event=>setDraftReflection(event.target.value)}/></label>
            {recordError&&<p role="alert" className="axe-echo-record-error">{recordError}</p>}
            <div className="axe-echo-record-actions">
              <button type="submit"><Star size={15}/> Save to Chronicle</button>
              <button type="button" onClick={()=>setRecordOpen(false)}>Cancel</button>
            </div>
          </form>}
          <div className="axe-echo-chronicle-left-content">
           <section className="axe-echo-chronicle-chapter-rail" aria-label="Recorded memory chapters">
            <h3><Star size={17}/> Saved Chapters</h3>
          <nav className="axe-echo-chronicle-index" aria-label="Dated encounter index">
            {entries.length === 0 && <div className="axe-echo-chronicle-empty">
              <BookOpen size={32}/>
              <h3>{allRecords.length ? 'No matching chapters' : 'Your story awaits'}</h3>
              <p>{allRecords.length ? 'Try another search or filter.' :
                'Record a personal moment or mutually save an encounter to begin your dated Chronicle.'}</p>
            </div>}
            {entries.map((entry, index) => <button type="button" key={entry.id}
              className={'axe-echo-chronicle-index-entry ' +
                (entry.id === selected?.id ? 'is-active' : '')}
              aria-current={entry.id === selected?.id ? 'page' : undefined}
              onClick={() => setSelectedId(entry.id)}>
              <span className="axe-echo-chronicle-index-num">{String(index + 1).padStart(2, '0')}</span>
              <span className="axe-echo-chronicle-index-copy">
                <strong>{entry.title || entry.partnerName || 'Recorded moment'}</strong>
                <small>{chapterName(entry)}</small>
                <span><CalendarDays size={12}/>{formatDate(entry.date)} <Clock3 size={12}/> {formatTime(entry.date)}</span>
                <em>{entry.source==='personal'?'Personal entry · device time':'Shared encounter'} · {formatRegion(entry.region)}</em>
              </span>
              {entry.bookmarked && <Bookmark size={15} fill="currentColor" aria-label="Bookmarked"/>}
              <ChevronRight size={16}/>
            </button>)}
          </nav>
           </section>
           <EchoChronicleConstellation entries={entries} selectedId={selected?.id}
             onSelect={setSelectedId}/>
          </div>
          <footer className="axe-echo-chronicle-page-footer">I • JOURNEY THROUGH THE STARS</footer>
        </div>

        <div className="axe-echo-chronicle-book-spine" aria-hidden="true"/>
        <article className="axe-echo-chronicle-right-page" aria-label="Selected encounter">
          <div className="axe-echo-chronicle-right-layout">
            <div className="axe-echo-chronicle-memory-content">
          {selected ? <>
            <div className="axe-echo-chronicle-page-kicker">
              <Sparkles size={17}/> {selected.source==='personal'?'PERSONAL JOURNAL':'SHARED ENCOUNTER'}
              <button type="button" className="axe-echo-star-pin"
                aria-pressed={featuredIds.includes(selected.id)}
                title="Choose this saved memory for your private Monthly Sky"
                onClick={()=>toggleFeatured(selected.id)}>
                <Star size={15} fill={featuredIds.includes(selected.id)?
                  'currentColor':'none'}/>
                {featuredIds.includes(selected.id)?'In My Sky':'Add to My Sky'}
              </button>
              <button type="button" className="axe-echo-chronicle-bookmark"
                title={selected.bookmarked ? 'Remove bookmark' : 'Bookmark this memory'}
                aria-label={selected.bookmarked ? 'Remove bookmark' : 'Bookmark memory'}
                aria-pressed={!!selected.bookmarked}
                onClick={() => annotate(selected.id, { bookmarked: !selected.bookmarked })}>
                <Bookmark size={16} fill={selected.bookmarked ? 'currentColor' : 'none'}/>
                {selected.bookmarked ? 'Bookmarked' : 'Bookmark'}
              </button>
            </div>
            <div className="axe-echo-chronicle-entry-heading">
              <p>{chapterName(selected)}</p>
              <h3>{selected.title || selected.partnerName || 'Recorded moment'}</h3>
              <span>{kindDescription(selected)}</span>
            </div>
            {selected.source==='personal'&&<label className="axe-echo-journal-title">
              Edit your chapter title
              <input key={selected.id} defaultValue={selected.title||''}
                maxLength={80} onBlur={event=>{
                  if(event.target.value.trim())annotate(selected.id,{title:event.target.value});
                }}/>
            </label>}
            <div className="axe-echo-chronicle-metadata">
              <div><CalendarDays size={16}/><span>
                {selected.source==='personal'?'Journal written · device time':'First encounter'}
                <strong>{formatMoment(selected.date)}</strong></span></div>
              <div><Clock3 size={16}/><span>
                {selected.source==='personal'?'Private record':'Saved to Chronicle'}
                <strong>{selected.source==='personal'?'Only on this character/device':formatMoment(selected.rememberedAt)}</strong></span></div>
              <div><MapPin size={16}/><span>Location<strong>{formatRegion(selected.region)}</strong></span></div>
              <div><MessageSquareText size={16}/><span>
                {selected.source==='personal'?'Entry type':'Recorded exchange'}
                <strong>{selected.source==='personal'?chapterName(selected):
                  (selected.lines || []).length+' lines'}</strong></span></div>
            </div>
            <section className="axe-echo-branch-navigation"
              aria-label="Recorded story connections">
              <header><Star size={16}/> Story connections</header>
              <p>These are saved memories or your own chosen continuations.
                They do not imply a completed quest or relationship.</p>
              <div className="axe-echo-branch-actions">
                <button type="button" onClick={()=>continueRecorded(selected.id)}>
                  <BookOpen size={15}/> Continue from this memory
                </button>
                {related.parent&&<button type="button"
                  onClick={()=>openRecorded(related.parent.id)}>
                  <ChevronRight size={14}/> Earlier branch: {related.parent.title||
                    related.parent.partnerName||'Saved moment'}
                </button>}
              </div>
              {related.children.length>0&&<div className="axe-echo-branch-children">
                <strong>{related.children.length} saved continuation
                  {related.children.length===1?'':'s'}</strong>
                {related.children.slice(0,12).map(child=><button key={child.id}
                  type="button" onClick={()=>openRecorded(child.id)}>
                  <Star size={13}/>{child.title||child.partnerName||'Saved moment'}
                  <span>{formatDate(child.date)}</span>
                </button>)}
              </div>}
            </section>
            {selected.source==='personal'&&selected.parentId&&
              <p className="axe-echo-chronicle-previous">
                <Star size={14}/> Chosen branch from: <strong>
                  {allRecords.find(entry=>entry.id===selected.parentId)?.title||
                   allRecords.find(entry=>entry.id===selected.parentId)?.partnerName||
                   'An earlier memory'}
                </strong>. This link is your own journal choice.
              </p>}
            {selected.previousEncounters > 0 && <p className="axe-echo-chronicle-previous">
              You had crossed paths before ({selected.previousEncounters} earlier saved
              {selected.previousEncounters === 1 ? ' encounter' : ' encounters'}).
              {selected.previousMetAt && <> Previous memory: {formatMoment(selected.previousMetAt)}.</>}
            </p>}
            {selected.agreedAdventure && <div className="axe-echo-chronicle-adventure">
              You both agreed to consider <strong>{selected.agreedAdventure === 'echo_branch_hidden_echo'
                ? 'The Hidden Echo' : 'The Broken Road'}</strong> together.
              This is a remembered plan, not a completed quest.
            </div>}
            <section className="axe-echo-chronicle-memory-photo" aria-label="Encounter photograph">
              {isChroniclePhoto(selected.photoDataUri) ?
                <img src={selected.photoDataUri} alt={'Locally saved Chronicle photo: ' +
                  (selected.title || selected.partnerName || 'a saved memory')}/> :
                <div className="axe-echo-chronicle-no-photo">
                  <Camera size={32}/>
                  <span>No photograph saved for this memory</span>
                </div>}
              <div className="axe-echo-chronicle-photo-actions">
                <label className="axe-echo-chronicle-photo-upload">
                  <Camera size={14}/>{photoBusy?'Preparing photo…':'Attach a screenshot'}
                  <input type="file" accept="image/jpeg,image/png,image/webp"
                    disabled={photoBusy} onChange={attachPhoto}/>
                </label>
                {isChroniclePhoto(selected.photoDataUri)&&<button type="button"
                  onClick={()=>annotate(selected.id,{photoDataUri:''})}>
                  Remove photo
                </button>}
                <small>Private to this character and device</small>
              </div>
              {photoError&&<p className="axe-echo-chronicle-photo-error" role="alert">
                {photoError}</p>}
            </section>
            <section className="axe-echo-chronicle-transcript" aria-label="Recorded dialogue and gestures">
              <h4><MessageSquareText size={16}/>
                {selected.source==='personal'?'Personal chapter':'The exchange'}</h4>
              {(selected.lines || []).length ? (selected.lines || []).map((line, index) =>
                <div key={index} className={'axe-echo-chronicle-line ' +
                  (line.kind === 'gesture' ? 'is-gesture' : '')}>
                  <div><strong>{line.name || 'Traveler'}</strong>
                    <time>{formatMoment(line.at)}</time></div>
                  <p>{line.text}</p>
                </div>) : <p className="axe-echo-chronicle-no-lines">
                  {selected.source==='personal'?
                   'This is your personal journal. No other player was recorded in this moment.':
                   'No dialogue was recorded for this encounter.'}
                </p>}
            </section>
            {featuredError&&<p className="axe-echo-annotation-error" role="alert">
              {featuredError}</p>}
            {annotationError&&<p className="axe-echo-annotation-error" role="alert">
              {annotationError}</p>}
            <label className="axe-echo-chronicle-reflection">
              <span><Sparkles size={15}/> Your private reflection <small>Not shared</small></span>
              <textarea value={selected.reflection || ''} rows={3}
                maxLength={selected.source==='personal'?2000:500}
                placeholder={selected.source==='personal'?
                  'Describe what you experienced…':'Write what this encounter meant to you…'}
                onChange={(event) => annotate(selected.id,
                  { reflection: event.target.value })}/>
            </label>
            {selected.source==='personal'&&<div className="axe-echo-personal-controls">
              <span>Private journal entry · device-recorded time</span>
              <button type="button" onClick={()=>{
                if(window.confirm('Delete this private Chronicle page? This cannot be undone.')){
                  if(!removeEchoJournalEntry(selected.id))
                    setPhotoError('Could not delete the page from local storage.');
                  else setSelectedId(null);
                }
              }}>Delete personal page</button>
            </div>}
          </> : <div className="axe-echo-chronicle-empty axe-echo-chronicle-empty--right">
            <BookOpen size={40}/><h3>A living chronicle</h3>
            <p>Select a saved encounter to open its original dated record. Your Quest Logbook is available separately through Services.</p>
          </div>}
            </div>
            <aside className="axe-echo-chronicle-categories" aria-label="Memory categories">
              <h3><Star size={16}/> Memory Categories</h3>
              <button type="button" aria-pressed={category==='shared'}
                onClick={()=>{changeTab('timeline');chooseCategory('shared')}}>
                <Users size={21}/><span><strong>Shared Memories</strong>
                <small>Journeys and moments with other travelers</small></span></button>
              <button type="button" disabled title="Planned for a future relationship system">
                <Heart size={21}/><span><strong>Partner / Marriage</strong>
                <small>Future update</small></span></button>
              <button type="button" disabled title="Planned for future player housing">
                <Home size={21}/><span><strong>Home &amp; Housing</strong>
                <small>Future update</small></span></button>
              <button type="button" aria-pressed={category==='rivals'}
                onClick={()=>{changeTab('timeline');chooseCategory('rivals')}}>
                <Swords size={21}/><span><strong>Battle Encounters</strong>
                <small>Recorded meetings near battles</small></span></button>
              <button type="button" aria-pressed={category==='training'}
                onClick={()=>{changeTab('timeline');chooseCategory('training')}}>
                <Star size={21}/><span><strong>Training &amp; Growth</strong>
                <small>Only recorded training memories</small></span></button>
              <button type="button" aria-pressed={category==='world'}
                onClick={()=>{changeTab('timeline');chooseCategory('world')}}>
                <Compass size={21}/><span><strong>World &amp; Exploration</strong>
                <small>Memories made while exploring</small></span></button>
              <p><Sparkles size={15}/> Future story branches will appear as they are recorded.</p>
            </aside>
          </div>
          <footer className="axe-echo-chronicle-page-footer">II • THE LIVING MEMORY</footer>
        </article>
      </div>
        </div>
      </div>
    </section>
  </div>;
}
