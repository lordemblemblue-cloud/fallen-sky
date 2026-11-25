/* Reference-art-backed Duelist Adventure panels.
 * Uploaded template images are visual layers ONLY. All controls, labels,
 * class XP, missions, graphics, and preferences come from the real app.
 */
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Accessibility, ArrowLeft, ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight,
  CircleHelp, Film, Gamepad2, GitBranch, Keyboard, List, LockKeyhole, Monitor,
  Play, Settings, Shield, SlidersHorizontal, Sparkles, Star, Swords, Target,
  Trophy, UserRound, Users, Volume2, X, Zap
} from 'lucide-react';
import DuelistHangarStage from './DuelistHangarStage.jsx';
import { KeyBindings } from './MenuPages.jsx';
import GraphicsRuntimePanel from '../../shared/GraphicsRuntimePanel';
import { BODIES } from '../client/assets.mjs';
import { CLASSES, CLASS_IDS } from '../core/classes.mjs';
import { classProgressOf } from '../client/prefs.mjs';
import { LEVEL_CAP, XP_CAP, levelFromXp, masteryAt, masteryReward } from '../core/progression.mjs';
import { STORY_MISSIONS } from './missions.js';
import { LEVELS } from './modes.js';
import './duelistReferenceMenus.css';

const fmt = n => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString();
const FIGHTER_NOTE = {
  maskedWarrior: 'A disciplined close-range combatant.',
  huntress: 'A swift fighter built for precision.',
  female: 'Eve — original Fallen Sky fighter.',
  male: 'Adam — original Fallen Sky fighter.',
};
const CLASS_ICONS = { warrior: Shield, duelist: Swords, assassin: Target, healer: Sparkles };
const STORY_TABS = [
  { id:'operations', label:'OPERATIONS', Icon:BookOpen },
  { id:'stages', label:'OBJECTIVES', Icon:GitBranch },
  { id:'crew', label:'CREW', Icon:Swords },
  { id:'briefing', label:'BRIEFING', Icon:Star },
  { id:'guide', label:'CONTROLS', Icon:Film },
];
const SETTINGS_TABS = [
  { id:'system', label:'SYSTEM', Icon:Settings },
  { id:'graphics', label:'GRAPHICS', Icon:Monitor },
  { id:'audio', label:'AUDIO', Icon:Volume2 },
  { id:'controls', label:'CONTROLS', Icon:Gamepad2 },
  { id:'keys', label:'KEYBINDINGS', Icon:Keyboard },
  { id:'accessibility', label:'ACCESSIBILITY', Icon:Accessibility },
];
const audioFromStorage = () => {
  try {
    const value = JSON.parse(window.localStorage.getItem('duelist.audio') || '{}');
    return { volume: 0.8, muted: false, ...(value && typeof value === 'object' ? value : {}) };
  } catch { return { volume: 0.8, muted: false }; }
};

function CloseControl({ onClose, name }) {
  return <button type="button" className="dxr-close" onClick={onClose} aria-label={'Close ' + name}><X size={19} /></button>;
}
function LabelledAction({ children, onClick, Icon, primary = false, disabled = false, title }) {
  return <button type="button" title={title} disabled={disabled} className={'dxr-action' + (primary ? ' dxr-action--gold' : '')}
    onClick={onClick}>{Icon && <Icon aria-hidden="true" size={19}/>}<span>{children}</span></button>;
}

export function CharacterReferenceMenu({ prefs, onPrefs, close }) {
  const [tab, setTab] = useState('progression');
  const [classFilter, setClassFilter] = useState('all');
  const fighter = BODIES[prefs.fighter] || BODIES.maskedWarrior;
  const classId = CLASS_IDS.includes(prefs.classId) ? prefs.classId : 'duelist';
  const combat = CLASSES[classId];
  const xp = Math.min(XP_CAP, Number(classProgressOf(prefs)[classId]) || 0);
  const mastery = levelFromXp(xp);
  const ranks = masteryAt(mastery.level);
  const next = mastery.capped ? null : masteryReward(mastery.level + 1);
  const fighters = Object.entries(BODIES);
  return <section className="dxr-art dxr-art--character" id="duelist-character-panel" aria-label="Character selection and progression">
    <CloseControl onClose={close} name="Character"/>
    <aside className="dxr-character-left" aria-label="Character roster">
      <nav className="dxr-character-filters" aria-label="Combat classes">
        <button type="button" className={classFilter === 'all' ? 'dxr-on' : ''} onClick={() => setClassFilter('all')} aria-pressed={classFilter === 'all'} aria-label="Show all fighters">ALL</button>
        {CLASS_IDS.map(id => { const Icon=CLASS_ICONS[id]; return <button type="button" key={id} className={classFilter === id ? 'dxr-on' : ''}
          title={CLASSES[id].name} aria-label={'Choose ' + CLASSES[id].name + ' class'} aria-pressed={classFilter === id}
          onClick={() => { setClassFilter(id); onPrefs({classId:id}); }}><Icon aria-hidden="true" size={18}/></button>; })}
      </nav>
      <div className="dxr-character-roster" role="group" aria-label="Available 3D fighters">
        {Array.from({length:15},(_,i)=>{
          const entry=fighters[i]; if (!entry) return <span className="dxr-character-empty" key={'blank'+i} aria-hidden="true"/>;
          const [id, body]=entry;
          return <button type="button" key={id} className="dxr-character-avatar" data-active={prefs.fighter === id}
            aria-pressed={prefs.fighter === id} onClick={()=>onPrefs({fighter:id})}>
            <UserRound size={27} aria-hidden="true"/><span>{body.name}</span></button>;
        })}
      </div>
      <span className="dxr-character-owned">{fighters.length} available fighters</span>
    </aside>
    <div className="dxr-character-stage" aria-label="Live 3D fighter preview">
      <DuelistHangarStage fighter={prefs.fighter}/>
      <div className="dxr-character-identity"><span>{combat.role} / {combat.name}</span>
        <h2>{fighter.name}</h2><p>{FIGHTER_NOTE[prefs.fighter]}</p></div>
    </div>
    <div className="dxr-character-skins" aria-label="Available character skins">
      <button type="button" className="dxr-skin-selected" aria-pressed="true" title="Default appearance">DEFAULT</button>
      {[1,2,3,4].map(index=><span key={index} className="dxr-skin-unavailable" aria-label="Skin unavailable"/>) }
    </div>
    <aside className="dxr-character-right" aria-label="Character details">
      <div className="dxr-character-tabs" role="group" aria-label="Character detail tabs">
        {['progression','abilities','customize'].map(id=><button type="button" key={id} data-selected={tab===id}
          aria-pressed={tab===id} onClick={()=>setTab(id)}>{id.toUpperCase()}</button>)}
      </div>
      <div className="dxr-character-details">
        {tab==='progression' && <>
          <div className="dxr-level">
            <span>CLASS MASTERY / {combat.name}</span>
            <h3>LV. <strong>{mastery.level}</strong> / {LEVEL_CAP}</h3>
            <div className="dxr-xp-numbers"><span>{mastery.capped ? 'MAX LEVEL' : `${fmt(mastery.into)} / ${fmt(mastery.need)} XP`}</span>
              <span>{fmt(xp)} TOTAL XP</span></div>
            <div className="dxr-xp" role="progressbar" aria-label="Class mastery XP" aria-valuemin={0}
              aria-valuemax={mastery.need || 1} aria-valuenow={mastery.capped ? 1 : mastery.into}>
              <span style={{width:Math.round(mastery.progress * 100)+'%'}} /></div>
          </div>
          <div className="dxr-next"><span>NEXT LEVEL</span><strong>{next ? next.kind==='ultimate'
            ? `LEVEL ${next.level} — ULTIMATE +1` : `LEVEL ${next.level} — ${combat.abilities[next.abilityIndex]?.name} +1`
            : 'MAX MASTERY REACHED'}</strong></div>
          <h4>ULTIMATE / EVERY 5 LEVELS</h4>
          <div className="dxr-milestones">{[5,10,15,20,25].map(lvl=><div key={lvl} data-earned={mastery.level >= lvl}>
            <small>LV. {lvl}</small><Trophy size={17} aria-hidden="true"/><strong>ULT +1</strong></div>)}</div>
          <h4>ABILITY PROGRESSION</h4>
          <div className="dxr-abilities">{combat.abilities.map((a,i)=><div key={a.id}><Swords size={16} aria-hidden="true"/>
            <span>{a.name}</span><strong>{ranks.abilityRanks[i]} / 6</strong></div>)}
            <div><Zap size={16} aria-hidden="true"/><span>{combat.special.name}</span><strong>ULT {ranks.ultimateRank} / 6</strong></div>
          </div>
        </>}
        {tab==='abilities' && <div className="dxr-descriptions"><h3>{combat.name} ability kit</h3>
          {combat.abilities.map((a,i)=><section key={a.id}><strong>{a.name} · LV {ranks.abilityRanks[i]}</strong><p>{a.text}</p></section>)}
          <section><strong>{combat.special.name} · ULT {ranks.ultimateRank}</strong><p>{combat.special.text}</p></section>
        </div>}
        {tab==='customize' && <div className="dxr-descriptions"><h3>Appearance</h3><p>The selected model is used when entering a match.</p>
          <p>Current fighter: <strong>{fighter.name}</strong></p><p>Only the default appearance is currently available.</p>
          <label>Combat class<select value={classId} onChange={e=>onPrefs({classId:e.target.value})}>
            {CLASS_IDS.map(id=><option key={id} value={id}>{CLASSES[id].name}</option>)}</select></label>
        </div>}
      </div>
      <div className="dxr-character-confirm"><LabelledAction onClick={close} Icon={Check} primary>CONFIRM CHARACTER</LabelledAction></div>
    </aside>
  </section>;
}

export function StoryReferenceMenu({ lobby, prefs, close }) {
  const navigate=useNavigate();
  const [tab,setTab]=useState('operations');
  const [missionIndex,setMissionIndex]=useState(0);
  const [typed,setTyped]=useState('');
  const mission=STORY_MISSIONS[missionIndex] || STORY_MISSIONS[0];
  const room=typed.toUpperCase().replace(/[^A-HJ-NP-Z]/g,'').slice(0,5);
  const launch=search=>navigate({to:'/duelist-next/play',search:{mode:'story',mission:mission.id,...search}});
  const crews=(lobby.matches||[]).filter(m=>m.mode==='story' && m.mission===mission.id && m.open);
  const changeMission=delta=>setMissionIndex(index=>(index+delta+STORY_MISSIONS.length)%STORY_MISSIONS.length);
  return <section className="dxr-art dxr-art--story" id="duelist-story-panel" aria-label="Story campaign">
    <CloseControl onClose={close} name="Story"/>
    <nav className="dxr-story-tabs" aria-label="Story categories">{STORY_TABS.map(item=><button type="button" key={item.id}
      aria-pressed={tab===item.id} data-selected={tab===item.id} onClick={()=>setTab(item.id)}>
      <span>{item.label}</span></button>)}</nav>
    <div className="dxr-story-scene" aria-label="Selected operation">
      <div className="dxr-story-scene-label"><small>OPERATION {String(mission.number).padStart(2,'0')} / {STORY_MISSIONS.length}</small>
        <h2>{mission.title}</h2><p>{mission.tagline}</p></div>
      <button type="button" className="dxr-mission-prev" onClick={()=>changeMission(-1)} aria-label="Previous operation"><ChevronLeft/></button>
      <button type="button" className="dxr-mission-next" onClick={()=>changeMission(1)} aria-label="Next operation"><ChevronRight/></button>
    </div>
    <nav className="dxr-story-timeline" aria-label="Operation objectives">
      {mission.parts.map(([title],i)=><button type="button" key={title} data-current={i===0} onClick={()=>setTab('stages')}
        aria-label={'Objective ' + (i+1)+': '+title} title={title}><span>{i+1}</span><small>{title}</small></button>)}
    </nav>
    <aside className="dxr-story-details" aria-label="Story details">
      <div className="dxr-story-title"><BookOpen size={19}/><span>{mission.title}</span></div>
      {tab==='operations' && <><h3>{mission.tagline}</h3><p>{mission.line}</p>
        <div className="dxr-story-mission-list">{STORY_MISSIONS.map((m,i)=><button type="button" key={m.id} aria-pressed={i===missionIndex}
          data-selected={i===missionIndex} onClick={()=>setMissionIndex(i)}>{String(m.number).padStart(2,'0')} · {m.title}</button>)}</div>
      </>}
      {tab==='stages' && <><h3>Objectives</h3><ol className="dxr-story-stage-list">{mission.parts.map(([title,line])=><li key={title}>
        <strong>{title}</strong><span>{line}</span></li>)}</ol></>}
      {tab==='crew' && <><h3>Play with a crew</h3><p>Use a five-character code to join friends, or create an online operation.</p>
        <label>ROOM CODE<input type="text" maxLength={5} value={room} onChange={e=>setTyped(e.target.value)} placeholder="ABCDE"/></label>
        <LabelledAction Icon={Users} onClick={()=>launch({online:1,room})} disabled={!lobby.online || room.length!==5}>JOIN CREW</LabelledAction>
        {!lobby.online && <small role="status">Match server offline — solo play is available.</small>}
      </>}
      {tab==='briefing' && <><h3>Mission briefing</h3><p>{mission.line}</p>
        <p>Each operation supports one to four players. Your active fighter is {BODIES[prefs.fighter]?.name || 'Duelist'}.</p>
        <p>Continue through the objectives in order.</p></>}
      {tab==='guide' && <><h3>How to play</h3><p>Guard or roll out of incoming fire, then interact with consoles and mission objects.</p>
        <p>Hold F to use crates, cores and mission mechanisms. Crew members can cooperate to clear objectives.</p></>}
      <div className="dxr-story-availability">{lobby.online ? `${crews.length} open crew(s) for this operation` : 'Offline / Solo mission available'}</div>
    </aside>
    <div className="dxr-story-actions" aria-label="Story actions">
      <LabelledAction Icon={List} onClick={()=>setTab('operations')}>MISSIONS</LabelledAction>
      <LabelledAction Icon={Play} primary onClick={()=>launch({online:0})}>PLAY SOLO</LabelledAction>
      <LabelledAction Icon={Users} disabled={!lobby.online} title="Online match server required"
        onClick={()=>launch({online:1,room:'new'})}>CREATE CREW</LabelledAction>
    </div>
  </section>;
}

export function SettingsReferenceMenu({ prefs, onPrefs, close }) {
  const [tab,setTab]=useState('system');
  const [draft,setDraft]=useState(()=>({...prefs,keys:{...(prefs.keys||{})}}));
  const [audio,setAudio]=useState(audioFromStorage);
  const [message,setMessage]=useState('');
  const patch=obj=>{setDraft(prev=>({...prev,...obj}));setMessage('Unsaved changes');};
  const patchAudio=obj=>{setAudio(prev=>({...prev,...obj}));setMessage('Unsaved changes');};
  const apply=()=>{
    onPrefs({sensitivity:Number(draft.sensitivity), level:draft.level, bots:Number(draft.bots),
      keys:draft.keys,voices:draft.voices!==false});
    try {window.localStorage.setItem('duelist.audio',JSON.stringify(audio));} catch { /* session-only fallback */ }
    setMessage('Settings saved. New actions and matches use your selected preferences.');
  };
  const revert=()=>{setDraft({...prefs,keys:{...(prefs.keys||{})}});setAudio(audioFromStorage());setMessage('Changes discarded.');};
  return <section className="dxr-art dxr-art--settings dxr-settings-glass" id="duelist-settings-panel" aria-label="Duelist settings">
    <CloseControl onClose={close} name="Settings"/>
    <header className="dxr-settings-heading"><span>EMBLEM BLUE · DUELIST ADVENTURE</span><h1>Settings</h1></header>
    <nav className="dxr-settings-tabs" aria-label="Settings categories">{SETTINGS_TABS.map(({id,label,Icon})=><button type="button"
      key={id} aria-pressed={tab===id} data-selected={tab===id} onClick={()=>setTab(id)}>
      <Icon size={18} aria-hidden="true"/><span>{label}</span></button>)}</nav>
    <div className="dxr-settings-divider" aria-hidden="true"/>
    <div className="dxr-settings-controls" aria-labelledby="duelist-settings-active-title" key={tab}>
      <h2 id="duelist-settings-active-title">{SETTINGS_TABS.find(t=>t.id===tab)?.label}</h2>
      <p className="dxr-settings-description">{tab==='graphics'?'Review detected graphics capabilities and renderer preferences.'
        : tab==='keys'?'Custom bindings are saved when you apply changes.'
        : tab==='audio'?'Sound preferences apply after saving.'
        : tab==='controls'?'Adjust camera response and offline practice options.'
        : tab==='accessibility'?'Adjust available accessibility preferences.'
        : 'Configure your local game preferences.'}</p>
      {tab==='system' && <div className="dxr-settings-rows"><p>Adjust your Duelist Adventure preferences. Changes are stored in this browser.</p>
        <p><Monitor size={16}/> Graphics runtime information and auto-detection are available in the Graphics tab.</p>
        <p><Volume2 size={16}/> Sound, sensitivity, bot practice and keybinding options are adjustable.</p>
        <p><CircleHelp size={16}/> Gameplay settings do not change the server-owned rules for competitive matches.</p>
      </div>}
      {tab==='graphics' && <div className="dxr-settings-diagnostics"><GraphicsRuntimePanel sceneId="duelist-adventure"/></div>}
      {tab==='audio' && <div className="dxr-settings-rows">
        <label><span>Master volume <strong>{Math.round(Number(audio.volume)*100)}%</strong></span>
          <input type="range" min="0" max="1" step=".05" value={audio.volume} onChange={e=>patchAudio({volume:Number(e.target.value)})}/></label>
        <label><span>Sound enabled</span><input type="checkbox" checked={!audio.muted} onChange={e=>patchAudio({muted:!e.target.checked})}/></label>
        <label><span>Spoken comms</span><input type="checkbox" checked={draft.voices!==false} onChange={e=>patch({voices:e.target.checked})}/></label>
      </div>}
      {tab==='controls' && <div className="dxr-settings-rows">
        <label><span>Mouse sensitivity <strong>{Number(draft.sensitivity).toFixed(2)}×</strong></span>
          <input type="range" min=".3" max="2.5" step=".05" value={draft.sensitivity} onChange={e=>patch({sensitivity:Number(e.target.value)})}/></label>
        <label><span>AI difficulty</span><select value={draft.level} onChange={e=>patch({level:e.target.value})}>
          {LEVELS.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
        <label><span>Practice bots</span><select value={String(draft.bots)} onChange={e=>patch({bots:Number(e.target.value)})}>
          {[1,2,3].map(n=><option key={n} value={n}>{n} bot{n>1?'s':''}</option>)}</select></label>
      </div>}
      {tab==='keys' && <div className="dxr-settings-keys"><p>Click a binding, then press a key or mouse button. Escape cancels rebinding.</p>
        <KeyBindings keys={draft.keys||{}} onChange={keys=>patch({keys})}/></div>}
      {tab==='accessibility' && <div className="dxr-settings-rows">
        <label><span>Spoken radio dialogue</span><input type="checkbox" checked={draft.voices!==false}
          onChange={e=>patch({voices:e.target.checked})}/></label>
        <p>Story dialogue stays visible even when spoken comms are disabled.</p>
        <p>Keyboard bindings are available in Keybindings. Reduced-motion rendering follows your device preference.</p>
      </div>}
    </div>
    <div className="dxr-settings-actions" aria-label="Settings actions">
      <p className="dxr-settings-status" role="status">{message || 'Local preferences · graphics settings use their own controls.'}</p>
      <LabelledAction Icon={ArrowLeft} onClick={revert}>REVERT</LabelledAction>
      <LabelledAction Icon={Check} primary onClick={apply}>APPLY</LabelledAction>
      <LabelledAction Icon={X} onClick={close}>CLOSE</LabelledAction>
    </div>
  </section>;
}
