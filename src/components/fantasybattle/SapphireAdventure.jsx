import { useEffect, useRef, useState } from 'react';
import { FantasyBattleStage, UNITS } from './FantasyBattleStage.js';
import { GEAR, GEAR_SLOTS, gearFor, gearCount, equippedVisuals, gearMetadata, gearEligible, activeGearSet } from './core/equipmentCatalog.mjs';
import { companionAsset, visualFor } from './core/companionVisuals.mjs';
import { ACTIONS, ACTION_ORDER, actionsForClass } from './core/battleRules.mjs';
import {enemyPortrait} from './core/enemyVisuals.mjs';
import { enemyFormation, tacticFor } from './core/enemyCatalog.mjs';
import { UI_SCREENS, PAUSE_LINKS, HOTKEY_SCREENS, UNSUPPORTED } from './uiCatalog.mjs';
import { ITEMS, COMPANION, ROSTER, memberFor, activeRoster, partyNeedsRest, partyFor, recruitCompanion, configureParty, APPEARANCES, appearanceFor, selectAppearance, exportBackup, slotStamp, SAVE_KEY, SETTINGS_KEY, SLOT_IDS, STAT_KEYS, DEFAULT_SETTINGS, createProfile, readSlots, writeSlot, mostRecent, readSettings, updateWorld, rewardVictory, allocate, heroStats, levelFor, pointsFor, availableActions, learnedAt, acceptGroveQuest, claimGroveQuest, collectLoot, equipItem, equipGear, memberStats, gearComparison, buyItem, sellItem, enhanceWeapon, craftTonic, heal, travelTo, comparison } from './core/adventureState.mjs';
import './fantasybattle.css';
import './sapphireAdventure.css';
import { artFor, artUrl, templateUrl, stagedOriginalFor, ORIGINAL_SAVE_PLAQUE } from './sapphireArt.mjs';
import {isCurrentEncounter,currentSaveStamp} from './core/battleLifecycle.mjs';
import {encryptBackup,importTransfer,MAX_ENCRYPTED_BYTES} from './core/encryptedBackup.mjs';
import { ItemArt, SkillArt } from './SapphireIcons.jsx';
import { GROVE_STORY, groveStoryState } from './core/groveStory.mjs';
import { CAMPAIGN_QUESTS, campaignQuest, changeCampaignQuest, campaignPrompt, campaignServiceNote, campaignArc } from './core/campaignQuests.mjs';
function PaintedIllustration({name,variant=''}){return <img aria-hidden="true" alt="" className={'fa-painted-illustration '+variant} src={'/fantasybattle/sapphire/illustrations/'+name+'.webp'} decoding="async" onError={e=>{e.currentTarget.hidden=true;}}/>;}


// Reuse the actual existing archer portrait; tint locally instead of shipping four copies.
function ArcherPortrait({profile,small=false,companion=false}){
  const canvas=useRef(null),member=companion===true?COMPANION:companion,tint=member?member.tint:appearanceFor(profile).tint;
  useEffect(()=>{
    if(visualFor(member?.id))return;
    const image=new Image();let live=true;
    image.onload=()=>{const target=canvas.current;if(!live||!target)return;const ctx=target.getContext('2d');if(!ctx)return;target.width=image.naturalWidth;target.height=image.naturalHeight;ctx.drawImage(image,0,0);ctx.globalCompositeOperation='multiply';ctx.fillStyle='#'+tint.toString(16).padStart(6,'0');ctx.fillRect(0,0,target.width,target.height);ctx.globalCompositeOperation='destination-in';ctx.drawImage(image,0,0);ctx.globalCompositeOperation='source-over';};
    image.src='/fantasybattle/archer/portrait_long_hair.png';return()=>{live=false;};
  },[tint,member?.id]);
  if(visualFor(member?.id))return <img className={'fa-archer-portrait'+(small?' small':'')} src={companionAsset(member.id,'portrait')} alt={member.name+' portrait'} decoding="async"/>;
  return <canvas ref={canvas} width={179} height={285} className={'fa-archer-portrait'+(small?' small':'')} role="img" aria-label={(member?member.name:appearanceFor(profile).name)+' portrait'}/>;
}

const EMPTY={slots:[],error:null};
const fmt=(n)=>new Intl.NumberFormat('en-US').format(n);
const skillName=id=>ACTIONS[id]?.name||id;
const isWorldScreen=id=>id==='10'||id==='09';

// Onboarding only edits existing settings and a draft character; creation and save writes stay in their existing guarded flows.
function FirstTimeSetup({name,onName,appearance,onAppearance,settings,onSettings,validCount,saveError,original,layout,back,onCreate,onLoad,onSettingsPage,onTutorial}){
 const [section,setSection]=useState('profile');
 const selected=Object.hasOwn(APPEARANCES,appearance)?appearance:'silver';
 const sections=[['profile','Profile'],['display','Display'],['audio','Audio'],['controls','Controls'],['save','Local saves'],['confirm','Review']];
 const selectSection=key=>{setSection(key);document.getElementById('fa-setup-'+key)?.focus();};
 const nav=sections.map(([key,label])=><Btn key={key} primary={section===key} aria-current={section===key?'step':undefined} onClick={()=>selectSection(key)}>{label}</Btn>);
 const nameInput=<input aria-label="Adventurer name" placeholder="Enter character name" value={name} maxLength={40} autoComplete="off" onChange={e=>onName(e.target.value)}/>;
 const swatches=Object.entries(APPEARANCES).map(([key,a])=><Btn key={key} className="fa-setup-swatch" title={a.name} aria-label={a.name} aria-pressed={selected===key} onClick={()=>onAppearance(key)}><span style={{background:a.swatch}} aria-hidden="true"/></Btn>);
 const quality=<select aria-label="Graphics quality" value={settings.quality} onChange={e=>{const value=e.target.value;if(['performance','balanced','high','cinematic'].includes(value))onSettings({quality:value});}}>{['performance','balanced','high','cinematic'].map(q=><option value={q} key={q}>{q[0].toUpperCase()+q.slice(1)}</option>)}</select>;
 const mute=<label><span>Mute battle audio</span><input type="checkbox" checked={settings.muted} onChange={e=>onSettings({muted:e.target.checked})}/></label>;
 const motion=<label><span>Reduce UI and clothing motion</span><input type="checkbox" checked={settings.reducedMotion} onChange={e=>onSettings({reducedMotion:e.target.checked})}/></label>;
 const saveInfo=saveError?'Save storage could not be read. Review Settings before loading.':validCount?validCount+' valid local save'+(validCount===1?'':'s')+' available.':'No loadable saves on this browser.';
 const load=<Btn className="fa-setup-load" disabled={!validCount||Boolean(saveError)} onClick={onLoad}>Load Existing Save</Btn>;
 const create=<Btn primary className="fa-setup-begin" onClick={onCreate}>Continue to Character Creation</Btn>;
 if(original)return <div className="fa-original-setup">
  <h2 className="fa-setup-title">Fantasy Battle</h2><p className="fa-setup-subtitle">First-time setup · Welcome, adventurer</p>
  <nav className="fa-setup-nav" aria-label="Setup sections"><Btn primary onClick={()=>selectSection('profile')}>Setup</Btn>{nav}</nav>
  <h3 className="fa-setup-heading profile">Create your profile</h3><section id="fa-setup-profile" tabIndex={-1} className="fa-setup-profile" aria-label="Draft character profile">
   <div className="fa-setup-portrait"><ArcherPortrait profile={{appearance:selected}} small/></div><label className="fa-setup-name"><span>Adventurer name</span>{nameInput}</label><div className="fa-setup-appearance"><span>{APPEARANCES[selected].name}</span><div>{swatches}</div></div>
  </section>
  <h3 className="fa-setup-heading display">Display settings</h3><section id="fa-setup-display" tabIndex={-1} className="fa-setup-display"><label><span>Graphics quality</span>{quality}</label><div><span>Resolution</span><strong>Automatic</strong></div><div><span>Display mode</span><Btn onClick={onSettingsPage}>Settings</Btn></div><small>Renderer detected when the world loads.</small></section>
  <h3 className="fa-setup-heading audio">Audio settings</h3><section id="fa-setup-audio" tabIndex={-1} className="fa-setup-audio">{mute}<p>Battle audio is {settings.muted?'muted':'enabled'}.</p><small>Preferences save immediately in this browser. Individual volume sliders are not available.</small></section>
  <h3 className="fa-setup-heading controls">Control preferences</h3><section id="fa-setup-controls" tabIndex={-1} className="fa-setup-controls"><div><span>Input</span><strong>Keyboard / touch</strong></div><div><span>Control reference</span><Btn onClick={onTutorial}>Tutorial</Btn></div>{motion}</section>
  <h3 className="fa-setup-heading save">Local save setup</h3><section id="fa-setup-save" tabIndex={-1} className="fa-setup-save"><strong>Local save · This browser</strong>{load}</section><section id="fa-setup-confirm" tabIndex={-1} className="fa-setup-review" aria-label="Review setup"><p>No account required. Save to a slot in the game.</p><p role="status">{saveInfo}</p><p>Character creation reviews your draft before entering the world.</p></section>
  <Btn className="fa-setup-back" onClick={back}>Back</Btn>{create}
 </div>;
 return <><Panel rect={layout[0]}><h2>First-time setup</h2>{nav}<Btn onClick={back}>Back</Btn></Panel><Panel rect={layout[1]}><section id="fa-setup-profile" tabIndex={-1}><h2>Create your profile</h2><ArcherPortrait profile={{appearance:selected}} small/>{nameInput}{swatches}<p>{APPEARANCES[selected].name}</p></section></Panel><Panel rect={layout[2]}><section id="fa-setup-display" tabIndex={-1}><h3>Display</h3>{quality}<Btn onClick={onSettingsPage}>Settings</Btn></section><section id="fa-setup-audio" tabIndex={-1}>{mute}</section><section id="fa-setup-controls" tabIndex={-1}>{motion}<Btn onClick={onTutorial}>Tutorial</Btn></section><section id="fa-setup-save" tabIndex={-1}><p>No account required. Saves stay on this browser.</p><p role="status">{saveInfo}</p>{load}</section><section id="fa-setup-confirm" tabIndex={-1}>{create}</section></Panel></>;
}

function Panel({rect,children,className=''}) {
  if(!rect)return null;
  const [x,y,w,h]=rect;
  return <section className={'fa-panel '+className} style={{left:x*100+'%',top:y*100+'%',width:w*100+'%',height:h*100+'%'}}>{children}</section>;
}
function Btn({children,onClick,disabled=false,primary=false,className='',...props}){
  return <button type="button" className={'fa-button'+(primary?' primary':'')+(className?' '+className:'')} disabled={disabled} onClick={onClick} {...props}>{children}</button>;
}
// Preserve working controls while the individual original image loads; failed
// requests leave the existing interface available instead of a blank screen.
function useStagedOriginal(id){
  const entry=stagedOriginalFor(id);
  const [wide,setWide]=useState(false);
  useEffect(()=>{
    const query=window.matchMedia('(min-aspect-ratio: 4/3) and (min-height: 500px) and (min-width: 850px)');
    const sync=()=>setWide(query.matches);
    sync();query.addEventListener('change',sync);
    return()=>query.removeEventListener('change',sync);
  },[]);
  const url=entry&&(!entry.wideOnly||wide)?entry.url:null;
  const [loaded,setLoaded]=useState(null);
  useEffect(()=>{
    if(!url)return;
    let active=true;
    const img=new Image();
    img.onload=()=>{if(active)setLoaded(url);};
    img.onerror=()=>{if(active)setLoaded(null);};
    img.src=url;
    return()=>{active=false;img.onload=null;img.onerror=null;};
  },[url]);
  return url&&loaded===url?entry:null;
}
// The original picture is decoration only; draft palettes never change the live profile.
function Wardrobe({profile,encounter,original,back,chooseAppearance,layout}){
  const saved=Object.hasOwn(APPEARANCES,profile?.appearance)?profile.appearance:'silver';
  const [preview,setPreview]=useState(saved);
  const selected=APPEARANCES[preview];
  const locked=!profile||Boolean(encounter);
  const dirty=preview!==saved;
  const choices=Object.entries(APPEARANCES).map(([key,a])=><Btn key={key} primary={preview===key} aria-pressed={preview===key} disabled={locked} onClick={()=>setPreview(key)}><span className="fa-swatch" style={{background:a.swatch}} aria-hidden="true"/><span>{a.name}</span></Btn>);
  const portrait=profile?<ArcherPortrait profile={{...profile,appearance:preview}}/>:<p>No active character.</p>;
  const detail=<><strong>{selected.name}</strong><p>Cosmetic palette only. No changes to equipment or statistics.</p><small>{dirty?'Preview — not applied':'Current appearance'}</small></>;
  const apply=<Btn primary className="fa-wardrobe-apply" disabled={locked||!dirty} onClick={()=>chooseAppearance(preview)}>Apply</Btn>;
  const reset=<Btn className="fa-wardrobe-reset" disabled={locked||!dirty} onClick={()=>setPreview(saved)}>Reset</Btn>;
  if(original)return <div className="fa-original-wardrobe">
    <h2 className="fa-wardrobe-title">Appearance</h2>
    <section className="fa-wardrobe-categories" aria-label="Appearance options"><strong>Wardrobe</strong><p>Color palettes</p><small>Other cosmetic categories are not available in this build.</small></section>
    <div className="fa-wardrobe-viewer" aria-label="Character appearance preview">{portrait}</div>
    <div className="fa-wardrobe-name">{profile?.name||'No character'}</div>
    <h3 className="fa-wardrobe-grid-title">Available palettes</h3>
    <section className="fa-wardrobe-grid" aria-label="Available cosmetic palettes">{choices}</section>
    <section className="fa-wardrobe-details" aria-label="Selected appearance">{detail}</section>
    <section className="fa-wardrobe-current" aria-label="Applied appearance"><strong>Applied appearance</strong><span className="fa-large-swatch" style={{background:APPEARANCES[saved].swatch}}/><p>{APPEARANCES[saved].name}</p></section>
    <section className="fa-wardrobe-preview" aria-label="Preview color"><strong>Preview color</strong><span className="fa-large-swatch" style={{background:selected.swatch}}/><p>{selected.name}</p></section>
    <section className="fa-wardrobe-note"><strong>Customization</strong><p>Only palette tint is supported. Hairstyle, accessories, effects and mounts are not implemented.</p>{encounter&&<p>Customization is locked during combat.</p>}</section>
    {apply}{reset}<Btn className="fa-wardrobe-back" onClick={back}>Back</Btn>
  </div>;
  return <><Panel rect={layout[0]}><h2>Wardrobe</h2>{choices}</Panel><Panel rect={layout[1]}>{portrait}<small>Existing archer · palette preview</small></Panel><Panel rect={layout[2]}>{detail}<div className="fa-large-swatch" style={{background:selected.swatch}}/>{apply}{reset}</Panel><Panel rect={layout[3]}><Btn onClick={back}>Back</Btn></Panel></>;
}

// Original skillbook art is purely decorative: battleRules and adventureState
// are the only sources of real skills, requirements and Focus costs.
function Skillbook({profile,level,original,layout,go,back}){
  const [selectedId,setSelectedId]=useState(ACTION_ORDER[0]);
  const learned=profile?availableActions(level):[];
  const action=ACTIONS[selectedId];
  const unlocked=learned.includes(selectedId);
  const status=id=>learned.includes(id)?'Learned':'Level '+learnedAt[id]+' required';
  const choices=ACTION_ORDER.map(id=><Btn key={id} className="fa-skillbook-node" primary={selectedId===id} aria-pressed={selectedId===id} aria-label={ACTIONS[id].name+' · '+status(id)} onClick={()=>setSelectedId(id)}><SkillArt id={id}/><span>{ACTIONS[id].name}</span><small>{status(id)}</small></Btn>);
  const details=<><strong>{action.name}</strong><p>{action.summary}</p><p>{unlocked?'Learned':'Unlocks automatically at level '+learnedAt[selectedId]}</p><p>Hotkey: {action.hotkey} · Focus cost: {action.focusCost} · Gain: {action.focusGain}</p>{action.kind==='attack'?<p>Power {action.power} · Hits {action.hits} · Accuracy {Math.round(action.accuracy*100)}%</p>:<p>Damage reduction: {Math.round((1-action.guardFactor)*100)}% for this round.</p>}</>;
  if(original)return <div className="fa-original-skillbook">
    <h2 className="fa-skillbook-title">Skillbook</h2><span className="fa-skillbook-subtitle">Master your arts</span>
    <nav className="fa-skillbook-nav" aria-label="Character services"><Btn onClick={()=>go('05')}>Character</Btn><span aria-current="page">Skillbook</span><Btn onClick={()=>go('32')}>Attributes</Btn><Btn onClick={()=>go('06')}>Equipment</Btn><Btn onClick={back}>Back</Btn></nav>
    <h3 className="fa-skillbook-heading">Skill Progression</h3><span className="fa-skillbook-level">Level {profile?level:'—'}</span>
    <span className="fa-skillbook-filter">Archer abilities</span>
    <div className="fa-skillbook-active-label"><strong>Active skills</strong><small>Combat actions</small></div>
    <section className="fa-skillbook-nodes" aria-label="Archer combat skills">{choices}</section>
    <div className="fa-skillbook-passive-label"><strong>Passive skills</strong><small>Not available</small></div>
    <div className="fa-skillbook-ultimate-label"><strong>Ultimate skills</strong><small>Not available</small></div>
    <section className="fa-skillbook-progress"><h3>Progression</h3><p>{profile?learned.length+' / '+ACTION_ORDER.length+' learned':'No active character'}</p><p>Abilities unlock automatically as the character levels up.</p></section>
    <section className="fa-skillbook-rules"><h3>Battle rules</h3><p>Choose an action, then resolve the round. Focus is earned and spent in battle.</p></section>
    <div className="fa-skillbook-footer">{profile?.name||'No active character'} · Archer</div>
    <h3 className="fa-skillbook-selected-title">{action.name}</h3>
    <div className="fa-skillbook-icon"><SkillArt id={selectedId}/></div>
    <div className="fa-skillbook-status">{status(selectedId)}</div>
    <section className="fa-skillbook-description" aria-live="polite">{details}</section>
    <div className="fa-skillbook-requirement">Required level: {learnedAt[selectedId]}</div>
    <div className="fa-skillbook-materials"><strong>Upgrade materials</strong><p>Not required. No manual skill upgrades are implemented.</p></div>
    <Btn className="fa-skillbook-done" onClick={back}>Done</Btn>
  </div>;
  return <><Panel rect={layout[0]}><Btn onClick={()=>go('05')}>Character</Btn><Btn onClick={()=>go('32')}>Attributes</Btn><Btn onClick={back}>Back</Btn></Panel><Panel rect={layout[1]}><h2>Archer abilities</h2>{choices}</Panel><Panel rect={layout[2]}><h2>Progression</h2>{details}<p>Skills unlock automatically when the required level is reached.</p></Panel></>;
}

// Allocation is a local draft until confirmation; leaving the page discards it.
function Attributes({profile,level,locked,original,layout,onConfirm,back,unlockedIds}){
  const [draft,setDraft]=useState([]);
  const submitted=useRef(false);
  const budget=profile?pointsFor(profile):0;
  const preview=profile?draft.slice(0,budget).reduce((p,k)=>allocate(p,k),profile):null;
  const remaining=Math.max(0,budget-draft.length);
  const before=heroStats(profile),after=heroStats(preview);
  const rows=[['strength','Strength','Attack +2'],['defense','Defense','Defense +2'],['speed','Speed','Speed +1'],['vitality','Vitality','Maximum HP +10']];
  const change=(key,delta)=>setDraft(old=>{
    if(locked||!profile)return old;
    if(delta>0)return old.length<budget?[...old,key]:old;
    const i=old.lastIndexOf(key);return i<0?old:old.filter((_,j)=>j!==i);
  });
  const confirm=()=>{if(submitted.current||locked||!profile)return;submitted.current=true;if(!onConfirm(profile,draft))submitted.current=false;};
  const row=([key,label,benefit])=><div key={key} className={'fa-attr-row fa-attr-'+key}>
    <div className="fa-attr-row-label"><strong>{label}</strong><small>{benefit}</small></div>
    <span className="fa-attr-row-value">{profile?.attributes[key]??'—'} → {preview?.attributes[key]??'—'}</span>
    <Btn className="fa-attr-minus" disabled={locked||!draft.includes(key)} aria-label={'Remove one pending '+label+' point'} onClick={()=>change(key,-1)}><span>−</span></Btn>
    <Btn className="fa-attr-plus" disabled={locked||remaining===0} aria-label={'Add one '+label+' point'} onClick={()=>change(key,1)}><span>+</span></Btn>
  </div>;
  const comparison=[['Current HP',profile?.hp,preview?.hp],['Maximum HP',before.maxHp,after.maxHp],['Attack',before.atk,after.atk],['Defense',before.def,after.def],['Speed',before.spd,after.spd]];
  const stats=<>{comparison.map(([label,a,b])=><div key={label} className="fa-attr-stat"><span>{label}</span><span>{profile?a:'—'} → {profile?b:'—'}</span></div>)}</>;
  const skills=unlockedIds.filter(id=>ACTION_ORDER.includes(id)&&availableActions(level).includes(id));
  const actions=<><Btn className="fa-attr-reset" disabled={locked||!draft.length} onClick={()=>setDraft([])}>Reset</Btn><Btn primary className="fa-attr-confirm" disabled={locked||!profile} onClick={confirm}>Confirm allocation</Btn><Btn className="fa-attr-cancel" onClick={back}>Back</Btn></>;
  if(original)return <div className="fa-original-attributes">
    <h2 className="fa-attr-title">Attributes</h2><div className="fa-attr-level">Level {profile?level:'—'}</div>
    <div className="fa-attr-profile"><strong>{profile?.name||'No active character'}</strong><p>Archer · Level {profile?level:'—'}</p><p>Experience {profile?profile.xp%100:'—'} / 100</p><progress aria-label="Experience toward next level" max={100} value={profile?profile.xp%100:0}/></div>
    <h3 className="fa-attr-allocation-heading">Allocate attribute points</h3><div className="fa-attr-budget" aria-live="polite">{remaining} available · {draft.length} pending</div>
    {rows.map(row)}
    <div className="fa-attr-unused">No additional attribute available</div>
    <h3 className="fa-attr-stat-heading">Stat preview</h3><section className="fa-attr-comparison" aria-label="Current and projected statistics">{stats}</section>
    <h3 className="fa-attr-skills-heading">New skills</h3><section className="fa-attr-skills" aria-label="Newly unlocked abilities">{skills.length?skills.map(id=><div key={id}><SkillArt id={id}/><span>{ACTIONS[id].name}</span></div>):<p>No new abilities from this level.</p>}</section>
    {actions}
  </div>;
  return <><Panel rect={layout[0]}><h2>{profile?.name||'No character'}</h2><p>Level {level}</p><p>{remaining} available · {draft.length} pending</p></Panel><Panel rect={layout[1]}><h2>Stat preview</h2>{stats}{skills.map(id=><p key={id}>{ACTIONS[id].name} unlocked</p>)}</Panel><Panel rect={layout[2]}><h2>Allocate points</h2>{rows.map(row)}{actions}</Panel></>;
}

// Celebration art is not a skill icon or an award. Display only committed unlocks.
function SkillUnlocked({profile,result,level,original,layout,onContinue,onSkillbook}){
  const learned=profile?availableActions(level):[];
  const ids=Array.isArray(result?.unlocked)?[...new Set(result.unlocked)].filter(id=>ACTION_ORDER.includes(id)&&learned.includes(id)):[];
  const [index,setIndex]=useState(0);
  const selected=ids[Math.min(index,Math.max(0,ids.length-1))];
  const action=selected?ACTIONS[selected]:null;
  const detail=action?<><div className="fa-unlock-action"><SkillArt id={selected}/><strong>{action.name}</strong></div><p>{action.summary}</p><p>Learned at level {learnedAt[selected]} · Hotkey {action.hotkey}</p><p>Focus cost {action.focusCost} · Gain {action.focusGain}</p></>:<p>No newly unlocked abilities in this result.</p>;
  const paging=ids.length>1?<div className="fa-unlock-paging"><Btn disabled={index<=0} onClick={()=>setIndex(i=>Math.max(0,i-1))}>Previous</Btn><span>{Math.min(index+1,ids.length)} / {ids.length}</span><Btn disabled={index>=ids.length-1} onClick={()=>setIndex(i=>Math.min(ids.length-1,i+1))}>Next</Btn></div>:null;
  const controls=<><Btn className="fa-unlock-book" disabled={!profile} onClick={onSkillbook}>View Skillbook</Btn><Btn primary className="fa-unlock-continue" onClick={onContinue}>Continue</Btn></>;
  if(original)return <div className="fa-original-unlock">
    <h2 className="fa-unlock-title">{ids.length?'Skill Unlocked':'Skill Progression'}</h2>
    <p className="fa-unlock-subtitle">{profile?profile.name+' · Level '+level:'No active character'}</p>
    <h3 className="fa-unlock-name">{action?.name||'No new skill'}</h3>
    <div className="fa-unlock-type">{action?('Archer · '+(action.kind==='guard'?'Defense':'Attack')):'Progression'}</div>
    <section className="fa-unlock-details" aria-live="polite">{detail}{paging}</section>
    {controls}
  </div>;
  return <><Panel rect={layout[0]}><PaintedIllustration name="skill-unlocked"/></Panel><Panel rect={layout[1]}><h2>{ids.length?'Skill Unlocked':'Skill Progression'}</h2>{detail}{paging}{controls}</Panel></>;
}

// Party art is decorative. Only the existing roster, active flags and single
// designated frontline are authoritative; no sample formation bonuses.
function PartyFormation({profile,encounter,original,layout,transact,go,back,statPanel}){
  const party=partyFor(profile);
  const active=profile?activeRoster(profile):[];
  const roster=profile?[{id:'hero',name:profile.name,role:'Archer'},...ROSTER]:ROSTER;
  const [selectedId,setSelectedId]=useState('hero');
  const selected=roster.find(m=>m.id===selectedId)||roster[0];
  const hero=selected?.id==='hero';
  const state=hero?{recruited:Boolean(profile),active:Boolean(profile),hp:profile?.hp}:memberFor(profile,selected.id);
  const locked=!profile||Boolean(encounter);
  const status=m=>m.id==='hero'?(party.front==='hero'?'Frontline':'Active ally'):!memberFor(profile,m.id).recruited?'Locked':!memberFor(profile,m.id).active?'Reserve':party.front===m.id?'Frontline':'Active ally';
  const activeMembers=profile?roster.filter(m=>m.id==='hero'||active.some(a=>a.id===m.id)):[];
  const ordered=[...activeMembers].sort((a,b)=>Number(b.id===party.front)-Number(a.id===party.front));
  const reserve=ROSTER.filter(m=>!memberFor(profile,m.id).active);
  const selectedStats=profile?memberStats(profile,selected.id):null;
  const portrait=(m,small=false)=>m.id==='hero'?<ArcherPortrait profile={profile} small={small}/>:<ArcherPortrait companion={m} small={small}/>;
  const toggle=()=>{if(!locked&&!hero&&state.recruited)transact(p=>configureParty(p,{id:selected.id,active:!memberFor(p,selected.id).active}),'Formation updated');};
  const frontline=()=>{if(!locked&&state.active)transact(p=>configureParty(p,{id:selected.id==='hero'?COMPANION.id:selected.id,front:selected.id}),'Frontline updated');};
  const controls=<><Btn disabled={locked||hero||!state.recruited} onClick={toggle}>{state.active?'Move to reserve':'Add to party'}</Btn><Btn disabled={locked||!state.active||party.front===selected.id} onClick={frontline}>Set frontline</Btn></>;
  const skills=hero?(profile?availableActions(levelFor(profile.xp)):[]):actionsForClass(selected.combatClass).filter(id=>selected.combatClass||id!=='chargedShot');
  const detail=<><strong>{selected.name}</strong><p>{selected.role} · {status(selected)}</p>{selectedStats&&state.recruited&&<StatRows stats={{HP:state.hp+' / '+selectedStats.maxHp,Attack:selectedStats.atk,Defense:selectedStats.def,Speed:selectedStats.spd}}/>}{!state.recruited&&<p>Recruit this companion before adding them to the party.</p>}{controls}</>;
  if(original)return <div className="fa-original-party">
    <h2 className="fa-party-title">Party Formation</h2>
    <nav className="fa-party-nav" aria-label="Party services"><Btn onClick={()=>go('05')}>Character</Btn><span aria-current="page">Formation</span><Btn onClick={()=>go('26')}>Recruitment</Btn><Btn onClick={()=>go('06')}>Equipment</Btn><Btn onClick={()=>go('30')}>Bonds</Btn><Btn onClick={()=>go('12')}>Skillbook</Btn><Btn onClick={()=>go('03')}>Settings</Btn><Btn onClick={back}>Back</Btn></nav>
    <h3 className="fa-party-heading">Active party · {ordered.length} / 4</h3>
    <div className="fa-party-front-label">Frontline &amp; allies</div><div className="fa-party-back-label">Active allies</div>
    <section aria-label="Active party slots">{Array.from({length:4},(_,i)=>{const m=ordered[i];return <Btn key={i} className={'fa-party-slot slot-'+i} disabled={!m} primary={m?.id===selected.id} aria-pressed={m?.id===selected.id} onClick={()=>m&&setSelectedId(m.id)}>{m?portrait(m,true):<span className="fa-party-empty">Empty</span>}<span>{m?m.name:'Unoccupied'}</span>{m&&<small>{status(m)}</small>}</Btn>;})}</section>
    <h3 className="fa-party-reserve-title">Reserve &amp; recruitment</h3>
    <div className="fa-party-reserve" aria-label="Reserve and locked companions">{reserve.map(m=><Btn key={m.id} primary={selected.id===m.id} aria-label={m.name+' · '+status(m)} onClick={()=>setSelectedId(m.id)}>{portrait(m,true)}<small>{status(m)}</small></Btn>)}{!reserve.length&&<p>No reserve companions</p>}</div>
    <section className="fa-party-formation-info"><strong>Formation</strong><p>Choose one active member as the frontline. Enemy attacks target the first living member.</p></section>
    <section className="fa-party-rules-info"><strong>Party rules</strong><p>Up to four active members. Each chooses an action in combat. No formation stat bonuses are implemented.</p>{encounter&&<p>Changes are locked during combat.</p>}</section>
    <div className="fa-party-selected-portrait">{portrait(selected)}</div><div className="fa-party-selected-name">{selected.name}</div><div className="fa-party-selected-role">{selected.role}</div>
    <div className="fa-party-detail-heading">Member details</div><section className="fa-party-detail" aria-label="Selected member statistics">{detail}</section>
    <div className="fa-party-skill-title">Skills</div><section className="fa-party-skills" aria-label="Combat abilities">{skills.map(id=><div key={id}><SkillArt id={id}/><small>{ACTIONS[id].name}</small></div>)}</section>
    <section className="fa-party-selected-status"><strong>Party status</strong><p>{status(selected)}</p></section>
    <Btn className="fa-party-recruit" onClick={()=>go('26')}>Recruit</Btn><Btn primary className="fa-party-done" onClick={back}>Done</Btn>
  </div>;
  return <><Panel rect={layout[0]}><Btn onClick={()=>go('05')}>Character</Btn><Btn onClick={()=>go('26')}>Recruitment</Btn><Btn onClick={()=>go('30')}>Bonds</Btn><Btn onClick={back}>Back</Btn></Panel><Panel rect={layout[1]}><h2>Active party · {ordered.length}/4</h2>{[...ordered,...reserve].map(m=><Btn key={m.id} primary={selected.id===m.id} onClick={()=>setSelectedId(m.id)}>{portrait(m,true)}<strong>{m.name}</strong><small>{status(m)}</small></Btn>)}</Panel><Panel rect={layout[2]}>{detail}<p>One active frontline member. Changes save as they are applied.</p>{statPanel}</Panel></>;
}

// Original recruitment illustration is decorative, never the selected companion.
function Recruitment({profile,encounter,selected,member,onSelect,onRecruit,original,layout,go,back}){
  const eligible=Boolean(profile?.world.completedEncounters.includes(selected.requiredEncounter));
  const requirement=({'wilds_grove_01':'Whispering Grove Spirit','wilds_pilgrimage_02':'Ruined Arch Warden','wilds_waterfall_01':'Waterfall Mist Spirit'})[selected.requiredEncounter];
  const stats=memberStats(profile,selected.id);
  const status=m=>memberFor(profile,m.id).recruited?'Recruited':profile?.world.completedEncounters.includes(m.requiredEncounter)?'Available':'Locked';
  const skills=actionsForClass(selected.combatClass).filter(id=>selected.combatClass||id!=='chargedShot');
  const recruit=<Btn primary className="fa-recruit-confirm" disabled={!profile||member.recruited||Boolean(encounter)||!eligible} onClick={()=>onRecruit(selected)}>{member.recruited?'Recruited':'Recruit companion'}</Btn>;
  const list=ROSTER.map(m=><Btn key={m.id} primary={selected.id===m.id} aria-pressed={selected.id===m.id} onClick={()=>onSelect(m.id)}><ArcherPortrait companion={m} small/><span>{m.name}</span><small>{status(m)}</small></Btn>);
  const requirements=<><p>{eligible?'Completed':'Required'}: {requirement}</p><p>{profile?'Active character ready':'Create or load a character first'}</p>{encounter&&<p>Recruitment is locked during combat.</p>}<p>{member.recruited?'Already recruited':eligible?'Ready to recruit':'Defeat the required encounter to unlock'}</p>{eligible&&selected.id==='groveArcher'&&!member.recruited&&<p>{GROVE_STORY.recruit}</p>}{eligible&&selected.id==='pilgrimWarden'&&!member.recruited&&<p>The watch has fallen silent. Let me keep the next stretch of road safe.</p>}{eligible&&selected.id==='mistScout'&&!member.recruited&&<p>Listen to the water. The voice goes the wrong way. Something up the mountain is remembering us.</p>}</>;
  const abilities=skills.map(id=><div key={id} className="fa-recruit-skill"><SkillArt id={id}/><strong>{ACTIONS[id].name}</strong><small>{ACTIONS[id].summary}</small></div>);
  const attributes=<StatRows stats={{HP:stats.maxHp,Attack:stats.atk,Defense:stats.def,Speed:stats.spd}}/>;
  if(original)return <div className="fa-original-recruit">
    <h2 className="fa-recruit-title">Companion Recruitment</h2>
    <div className="fa-recruit-count">{ROSTER.filter(m=>memberFor(profile,m.id).recruited).length} / {ROSTER.length} recruited</div>
    <h3 className="fa-recruit-list-title">Companions</h3>
    <div className="fa-recruit-list" aria-label="Companion roster">{list}</div>
    <div className="fa-recruit-empty">No additional companions available in this build.</div>
    <div className="fa-recruit-art-label">Original recruitment illustration · decorative</div>
    <div className="fa-recruit-live-portrait"><ArcherPortrait companion={selected}/></div>
    <h3 className="fa-recruit-name">{selected.name}</h3><p className="fa-recruit-role">{selected.role} · {status(selected)}</p>
    <section className="fa-recruit-stats" aria-label="Selected companion statistics">{attributes}</section>
    <h3 className="fa-recruit-skill-heading">Combat abilities</h3><section className="fa-recruit-skills" aria-label="Companion combat abilities">{abilities}</section>
    <h3 className="fa-recruit-req-heading">Recruitment requirements</h3><section className="fa-recruit-requirements" aria-label="Recruitment requirements" aria-live="polite">{requirements}</section>
    {recruit}<Btn className="fa-recruit-party" onClick={()=>go('11')}>Party</Btn><Btn className="fa-recruit-back" onClick={back}>Back</Btn>
  </div>;
  return <><Panel rect={layout[0]}><h2>Companions</h2>{list}<Btn onClick={back}>Back</Btn></Panel><Panel rect={layout[1]}><ArcherPortrait companion={selected}/><h2>{selected.name}</h2><p>{selected.role}</p>{abilities}</Panel><Panel rect={layout[2]}>{attributes}{requirements}{recruit}<Btn onClick={()=>go('11')}>Party</Btn></Panel></>;
}

// Bond points are earned by the existing companionProgress victory transaction.
function CompanionBonds({profile,selectedId,onSelect,original,layout,go,back}){
  const [filter,setFilter]=useState('all');
  const visible=ROSTER.filter(m=>filter==='all'||(filter==='active'?memberFor(profile,m.id).active:memberFor(profile,m.id).recruited));
  const selected=visible.find(m=>m.id===selectedId)||visible[0];
  const state=selected?memberFor(profile,selected.id):null;
  const recruited=Boolean(profile&&state?.recruited);
  const bond=recruited?state.bond:0;
  const tier=!recruited?'Not recruited':bond>=75?'Trusted':bond>=25?'Familiar':'New companion';
  const next=bond<25?25:bond<75?75:100;
  const nextText=!recruited?'Recruit the companion first.':bond===100?'Maximum bond reached.':(next-bond)+' points to '+(next===25?'Familiar':next===75?'Trusted':'maximum bond');
  const status=m=>{const s=memberFor(profile,m.id);return !s.recruited?'Locked':s.active?'Active · '+s.bond+'/100':'Reserve · '+s.bond+'/100';};
  const filterControl=<label className="fa-bond-filter"><span className="fa-art-sr">Filter companions</span><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All companions</option><option value="recruited">Recruited</option><option value="active">Active party</option></select></label>;
  const choices=visible.map(m=><Btn key={m.id} primary={selected?.id===m.id} aria-pressed={selected?.id===m.id} onClick={()=>onSelect(m.id)}><ArcherPortrait companion={m} small/><strong>{m.name}</strong><small>{status(m)}</small></Btn>);
  const portrait=selected?<ArcherPortrait companion={selected}/>:<p>No companions match this filter.</p>;
  const progress=<progress aria-label="Earned companion bond" max={100} value={bond}/>;
  const explanation=<p>Gain 5 bond per first-time victory while the recruited companion is active. Practice and repeat victories do not count.</p>;
  const milestones=[[0,'New companion'],[25,'Familiar'],[75,'Trusted'],[100,'Maximum bond']];
  const milestoneRows=milestones.map(([threshold,label])=><div key={threshold} className="fa-bond-milestone"><span>{label} · {threshold}</span><small>{recruited&&bond>=threshold?'Reached':'Not reached'}</small></div>);
  const unavailable=<><p>No bond-based statistic bonuses or abilities are implemented.</p><small>Stories, gifts and dialogue are not available in this build.</small></>;
  if(original)return <div className="fa-original-bonds">
    <h2 className="fa-bond-title">Relationships &amp; Bonds</h2><span className="fa-bond-subtitle">Companion progression</span>
    {filterControl}<section className="fa-bond-list" aria-label="Companions">{choices}{!visible.length&&<p>No matching companions</p>}</section>
    <div className="fa-bond-list-note">{ROSTER.filter(m=>memberFor(profile,m.id).recruited).length} / {ROSTER.length} recruited</div>
    <div className="fa-bond-portrait">{portrait}</div><div className="fa-bond-name">{selected?.name||'No companion'}</div><div className="fa-bond-role">{selected?.role||'—'}</div>
    <div className="fa-bond-level">{recruited?bond:'—'}</div><h3 className="fa-bond-tier">{tier}</h3><div className="fa-bond-points">{recruited?bond+' / 100':'—'}</div>
    <div className="fa-bond-progress">{progress}</div><div className="fa-bond-next">{nextText}</div>
    <nav className="fa-bond-tabs" aria-label="Relationship categories"><span aria-current="page">Overview</span><Btn disabled>Stories</Btn><Btn disabled>Gifts</Btn><Btn disabled>Dialogue</Btn></nav>
    <h3 className="fa-bond-status-heading">Relationship status</h3><div className="fa-bond-status">{tier}</div><section className="fa-bond-explanation">{explanation}</section>
    <section className="fa-bond-earned"><strong>Earned bond</strong><p>{recruited?Math.floor(bond/5)+' bond increments':'Not recruited'}</p><small>Maximum 100</small></section>
    <h3 className="fa-bond-effect-title">Bond effects</h3><section className="fa-bond-effects">{unavailable}</section>
    <section className="fa-bond-advancement"><strong>Next milestone</strong><p>{nextText}</p></section>
    <h3 className="fa-bond-rewards-title">Bond milestones</h3><section className="fa-bond-milestones" aria-label="Bond milestones">{milestoneRows}<p>Milestones are descriptive; no rewards are claimable.</p></section>
    <Btn className="fa-bond-gift" disabled>Gifts unavailable</Btn><Btn className="fa-bond-talk" disabled>Dialogue unavailable</Btn>
    <div className="fa-bond-navigation"><Btn onClick={()=>go('26')}>Recruitment</Btn><Btn onClick={()=>go('11')}>Party</Btn><Btn onClick={back}>Back</Btn></div>
  </div>;
  return <><Panel rect={layout[0]}><h2>Companions</h2>{filterControl}{choices}{!visible.length&&<p>No matching companions</p>}</Panel><Panel rect={layout[1]}>{portrait}<h2>{selected?.name||'No companion'}</h2><p>{tier}</p></Panel><Panel rect={layout[2]}><h2>Bond</h2>{progress}<p>{recruited?bond+'/100':'Not recruited'} · {tier}</p><p>{nextText}</p>{explanation}{milestoneRows}{unavailable}</Panel><Panel rect={layout[3]}><Btn onClick={()=>go('26')}>Recruitment</Btn><Btn onClick={()=>go('11')}>Party</Btn><Btn onClick={back}>Back</Btn></Panel></>;
}

// The concept painting is decorative; the streamed region data is authoritative.
function WorldMap({world,profile,encounter,original,layout,go,back,onTravel}){
  const [mode,setMode]=useState('world');
  const regions=world?.regions||[];
  const visited=regions.filter(r=>profile?.world.visitedRegions.includes(r.id));
  const markers=world?.encounters||[];
  const [selectedId,setSelectedId]=useState(null);
  const selected=visited.find(r=>r.id===selectedId);
  const pos=world?.position||profile?.world.position;
  const markerList=<>{markers.length?markers.map(m=><div className="fa-worldmap-entry" key={m.id}><span>{m.label}</span><small>{m.completed?'Defeated':m.category||'Encounter'}</small></div>):<p>No encounters currently reported.</p>}</>;
  const regionList=<>{visited.length?visited.map(r=><Btn key={r.id} aria-pressed={selected?.id===r.id} primary={selected?.id===r.id} onClick={()=>setSelectedId(r.id)}>{r.name}</Btn>):<p>No discovered regions available.</p>}</>;
  const travel=<Btn className="fa-worldmap-travel" disabled={!profile||!selected||Boolean(encounter)} onClick={()=>onTravel(selected)}>Travel to selected region</Btn>;
  const position=<><p>{world?.region||'World not loaded'}</p><p>{pos?'X '+pos[0].toFixed(1)+' · Z '+pos[2].toFixed(1):'Position unavailable'}</p><p>{world?.nearby||'No nearby interaction'}</p><p>{visited.length} / {regions.length} reported regions discovered</p></>;
  const views=<><Btn primary={mode==='world'} aria-pressed={mode==='world'} onClick={()=>setMode('world')}>World map</Btn><Btn primary={mode==='encounters'} aria-pressed={mode==='encounters'} onClick={()=>setMode('encounters')}>Encounters</Btn><Btn primary={mode==='travel'} aria-pressed={mode==='travel'} onClick={()=>setMode('travel')}>Discovered regions</Btn><Btn onClick={()=>go('08')}>Quest journal</Btn><Btn onClick={()=>go('25')}>Fast travel</Btn></>;
  const content=mode==='world'?<RegionMap world={world} profile={profile}/>:mode==='encounters'?markerList:<>{regionList}{!original&&travel}</>;
  if(original)return <div className="fa-original-worldmap">
    <h2 className="fa-worldmap-title">World Map</h2><span className="fa-worldmap-tag">Explore the Sapphire Wilds</span>
    <nav className="fa-worldmap-nav" aria-label="Map views">{views}</nav>
    <div className="fa-worldmap-player">{profile&&<ArcherPortrait profile={profile} small/>}<div><strong>{profile?.name||'No character'}</strong><p>{profile?'Level '+levelFor(profile.xp):'Load a character'}</p></div></div>
    <h3 className="fa-worldmap-heading">{world?.region||'Sapphire Wilds'}</h3>
    <div className="fa-worldmap-live"><h3>{mode==='world'?'Live region map':mode==='encounters'?'Reported encounters':'Discovered regions'}</h3>{content}<small>Painted scenery is conceptual, not navigable geography.</small></div>
    <h3 className="fa-worldmap-data-title">Region data</h3><section className="fa-worldmap-data">{position}</section>
    <h3 className="fa-worldmap-discovered-title">Discovered regions</h3><section className="fa-worldmap-discovered">{regionList}</section>
    <h3 className="fa-worldmap-encounters-title">Reported encounters</h3><section className="fa-worldmap-encounters">{markerList}</section>
    <h3 className="fa-worldmap-legend-title">Map legend</h3><section className="fa-worldmap-legend"><p>Blue dot: player</p><p>Gold: encounter · Pink: boss</p><p>Green: defeated encounter</p><p>Blue region: discovered</p><p>Dark region: unexplored</p></section>
    <Btn className="fa-worldmap-center" onClick={()=>setMode('world')}>World map</Btn>{travel}<Btn className="fa-worldmap-back" onClick={back}>Back</Btn>
  </div>;
  return <><Panel rect={layout[0]}>{views}<Btn onClick={back}>Back</Btn></Panel><Panel rect={layout[1]}>{content}</Panel><Panel rect={layout[2]}><h2>Current position</h2>{position}<h3>Discovered regions</h3>{regionList}{mode!=='travel'&&travel}</Panel></>;
}

// Journal entries are sourced from the persisted quest state, not the painted sample list.
function QuestJournal({profile,encounter,original,layout,go,back,onClaim,onCampaignAction}){
  const [filter,setFilter]=useState('all'),[selected,setSelected]=useState('grove');
  const state=profile?.quests.grove;
  const defeated=Boolean(profile?.world.completedEncounters.includes('wilds_grove_01'));
  const status=({available:'Available',active:'Active',complete:'Ready to complete',claimed:'Completed'})[state]||'No active character';
  const matches=s=>filter==='all'||(filter==='completed'?(s==='complete'||s==='claimed'):filter===s);
  const groveVisible=Boolean(profile&&matches(state));
  const unlocked=CAMPAIGN_QUESTS.map(q=>({q,progress:campaignQuest(profile,q.id)})).filter(({progress})=>progress.state!=='locked');
  const entries=unlocked.filter(({progress})=>matches(progress.state));
  const campaignEntry=entries.find(({q})=>q.id===selected)||(!groveVisible?entries[0]:null);
  const visible=groveVisible||entries.length>0;
  const statusFor=s=>({available:'Available',active:'Active',complete:'Ready to complete',claimed:'Completed'})[s];
  const canAccept=Boolean(profile&&state==='available'&&!encounter);
  const canClaim=Boolean(profile&&state==='complete'&&!encounter);
  const filters=[['all','All quests'],['active','Active'],['available','Available'],['completed','Completed']];
  const filterButtons=filters.map(([key,label])=><Btn key={key} primary={filter===key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</Btn>);
  const questEntry=visible?<>{groveVisible&&<Btn className="fa-journal-entry" primary={!campaignEntry} aria-pressed={!campaignEntry} onClick={()=>setSelected('grove')}><strong>Whispering Grove Spirit</strong><small>{status}</small></Btn>}{entries.map(({q,progress})=><Btn key={q.id} className="fa-journal-entry" primary={campaignEntry?.q.id===q.id} aria-pressed={campaignEntry?.q.id===q.id} onClick={()=>setSelected(q.id)}><strong>{q.title}</strong><small>{q.optional?'Side quest · ':''}{statusFor(progress.state)}</small></Btn>)}</>:<p>No quests match this filter.</p>;
  const action=state==='available'?<Btn primary className="fa-journal-action" disabled={!canAccept} onClick={()=>go('43')}>View quest offer</Btn>:state==='complete'?<Btn primary className="fa-journal-action" disabled={!canClaim} onClick={onClaim}>Complete quest</Btn>:<Btn primary className="fa-journal-action" disabled={state!=='active'||Boolean(encounter)} onClick={()=>go('07')}>{state==='claimed'?'Completed':state==='active'?'View objective':'No quest'}</Btn>;
  const objective=<><p>Defeat the Grove Spirit in Whispering Grove.</p><p>{defeated?'Encounter defeated':'Encounter not yet defeated'} · {defeated?1:0}/1</p><progress aria-label="Grove Spirit objective" max={1} value={defeated?1:0}/><p>{state==='claimed'?'Quest recorded as completed.':state==='complete'?'Record quest completion.':state==='active'?'Win the encounter to advance the quest.':'Accept the quest to begin tracking it.'}</p></>;
  const reward=<><p>Experience, gold and loot are awarded by the first eligible battle victory.</p><p>No additional reward is granted for completing the journal entry.</p></>;
  const q=campaignEntry?.q,progress=campaignEntry?.progress;
  const title=q?.title||GROVE_STORY.title;
  const story=q?(progress.state==='claimed'?q.completion:progress.state==='available'?q.offer:q.description):GROVE_STORY.journal;
  const campaignObjective=progress?<>{progress.objectives.map(o=><p key={o.id}>{o.done?'Completed':'Pending'}: {o.label}</p>)}<progress aria-label={q.title+' objectives'} max={progress.total} value={progress.count}/><p>{progress.count}/{progress.total} objectives complete.</p></>:null;
  const campaignAction=progress?(progress.state==='available'||progress.state==='complete'?<Btn primary className="fa-journal-action" disabled={Boolean(encounter)} onClick={()=>onCampaignAction(q.id,progress.state==='available'?'accept':'claim')}>{progress.state==='available'?'Accept quest':'Complete quest'}</Btn>:<Btn primary className="fa-journal-action" disabled={Boolean(encounter)||progress.state==='claimed'} onClick={()=>go('07')}>{progress.state==='claimed'?'Completed':'View objective'}</Btn>):null;
  const shownAction=q?campaignAction:action;
  const arc=campaignArc(profile);
  const arcLabel=profile?'Main story '+arc.completed+'/'+arc.total+(arc.complete?' · Arc complete':''):'Quest log';
  if(original)return <div className={'fa-original-journal'+(unlocked.length?' fa-journal-expanded':'')}>
    <h2 className="fa-journal-title">Quest Journal</h2>
    <nav className="fa-journal-tabs" aria-label="Quest filters">{filterButtons}<Btn onClick={()=>go('07')}>Map</Btn><Btn onClick={back}>Back</Btn></nav>
    <nav className="fa-journal-nav" aria-label="Journal views">{filterButtons}<Btn onClick={()=>go('07')}>World map</Btn><Btn onClick={()=>go('24')}>Bestiary</Btn><Btn onClick={back}>Back</Btn></nav>
    <h3 className="fa-journal-list-title">{arcLabel}</h3><section className="fa-journal-list" aria-label="Quest list">{questEntry}</section>
    {!unlocked.length&&<div className="fa-journal-empty">No additional quests until the Grove quest is completed.</div>}
    {visible?<><h3 className="fa-journal-name">{title}</h3><div className="fa-journal-status">{q?statusFor(progress.state):status}</div><h3 className="fa-journal-objective-title">Objective</h3><section className="fa-journal-objective">{q?campaignObjective:objective}</section>
    <h3 className="fa-journal-description-title">Quest details</h3><section className="fa-journal-description"><p>{story}</p>{encounter&&<p>Quest actions are locked during combat.</p>}</section>
    <h3 className="fa-journal-reward-title">Rewards</h3><section className="fa-journal-rewards">{reward}</section></>:<section className="fa-journal-no-selection"><p>Select a filter with an available quest to view its objectives.</p></section>}
    <Btn className="fa-journal-map" onClick={()=>go('07')}>World map</Btn>{visible?shownAction:<Btn className="fa-journal-action" disabled>No quest selected</Btn>}<Btn className="fa-journal-back" onClick={back}>Back</Btn>
  </div>;
  return <><Panel rect={layout[0]}>{filterButtons}<Btn onClick={()=>go('07')}>Map</Btn><Btn onClick={back}>Back</Btn></Panel><Panel rect={layout[1]}><h2>{arcLabel}</h2>{questEntry}</Panel><Panel rect={layout[2]}>{visible?<><h2>{title}</h2><p>{q?statusFor(progress.state):status}</p><p>{story}</p>{q?campaignObjective:objective}{reward}{shownAction}</>:<p>No quest selected.</p>}</Panel></>;
}

// Travel choices use live streamed bounds and saved discoveries. The painting
// is decorative and never authorizes a destination, facility or travel route.
function FastTravel({profile,world,encounter,destination,onSelect,onTravel,original,layout,go,back}){
  const regions=(world?.regions||[]).filter(r=>Number.isFinite(r.minX)&&Number.isFinite(r.maxX)&&r.maxX>r.minX);
  const visited=regions.filter(r=>profile?.world.visitedRegions.includes(r.id));
  const selected=visited.find(r=>r.id===destination?.id);
  const canTravel=Boolean(profile&&selected&&!encounter);
  const choices=regions.map(r=>{const discovered=visited.some(v=>v.id===r.id);return <Btn key={r.id} primary={selected?.id===r.id} disabled={!discovered} aria-pressed={selected?.id===r.id} onClick={()=>onSelect(r)}><span>{r.name}</span><small>{discovered?'Discovered':'Undiscovered · Locked'}</small></Btn>;});
  const details=<><p>{selected?'Discovered destination':'Choose a discovered region.'}</p><p>{encounter?'Travel is unavailable during battle.':!profile?'Load a character before travelling.':'Confirm to move to a safe entry position in the selected region.'}</p></>;
  const route=<><p>Current region: {world?.region||'World not loaded'}</p><p>{visited.length} / {regions.length} reported regions discovered.</p><p>No currency charge is applied by the current travel system.</p></>;
  const travel=<Btn primary className="fa-fast-travel-confirm" disabled={!canTravel} onClick={()=>onTravel(selected)}>Travel</Btn>;
  if(original)return <div className="fa-original-fast-travel">
    <h2 className="fa-fast-travel-title">Fast Travel</h2><h3 className="fa-fast-travel-list-title">Destinations</h3>
    <section className="fa-fast-travel-list" aria-label="Region destinations">{choices.length?choices:<p>No region data loaded.</p>}</section>
    <div className="fa-fast-travel-map"><h3>Live region map</h3><RegionMap world={world} profile={profile}/><small>Original painted scenery is conceptual, not a travel route.</small></div>
    <div className="fa-fast-travel-art-label">Decorative destination artwork</div>
    <h3 className="fa-fast-travel-name">{selected?.name||'Select destination'}</h3>
    <section className="fa-fast-travel-details" aria-live="polite">{details}</section>
    <h3 className="fa-fast-travel-route-heading">Travel information</h3><section className="fa-fast-travel-route">{route}</section>
    <h3 className="fa-fast-travel-rules-heading">Requirements</h3><section className="fa-fast-travel-rules"><p>Discover the region first.</p><p>Travel outside combat.</p><p>Confirm your destination.</p></section>
    {travel}<div className="fa-fast-travel-navigation"><Btn onClick={()=>go('07')}>World map</Btn><Btn onClick={back}>Back</Btn></div>
  </div>;
  return <><Panel rect={layout[0]}><h2>Destinations</h2>{choices.length?choices:<p>No region data loaded.</p>}<Btn onClick={back}>Back</Btn></Panel><Panel rect={layout[1]}><RegionMap world={world} profile={profile}/></Panel><Panel rect={layout[2]}><h2>{selected?.name||'Choose a discovered region'}</h2>{details}{route}{travel}<Btn onClick={()=>go('07')}>World map</Btn></Panel></>;
}

// A discovery notification reports saved exploration; it never grants rewards.
function RegionDiscovery({discovery,world,profile,original,layout,onContinue,onMap}){
  const regions=world?.regions||[];
  const visited=profile?.world.visitedRegions||[];
  const found=discovery?.kind==='region'&&visited.includes(discovery.id);
  const landmark=discovery?.kind==='landmark'&&Boolean(profile?.world.discoveries.includes(discovery.id));
  const valid=found||landmark;
  const heading=found?'Region Discovered':landmark?'Landmark Discovered':'Exploration';
  const label=valid?discovery.label:'No new discovery';
  const message=found?'This region is now recorded in your exploration progress.':landmark?'This landmark is recorded in your exploration progress.':'Continue exploring to discover new locations.';
  const count=regions.filter(r=>visited.includes(r.id)).length;
  const info=<><p>{message}</p><p>{count} / {regions.length} reported regions discovered.</p><p>{found?'Discovered regions can be selected in Fast Travel.':'Open the World Map to view actual region data.'}</p></>;
  const controls=<><Btn primary className="fa-discovery-continue" onClick={onContinue}>Continue exploring</Btn><Btn className="fa-discovery-map" onClick={onMap}>World Map</Btn></>;
  if(original)return <div className="fa-original-discovery">
    <h2 className="fa-discovery-title">{heading}</h2>
    <section className="fa-discovery-regions" aria-label="Region discovery status">{regions.map(r=><div key={r.id} className={found&&r.id===discovery.id?'current':''}><span>{r.name}</span><small>{visited.includes(r.id)?'Discovered':'Unexplored'}</small></div>)}</section>
    <h3 className="fa-discovery-name">{label}</h3>
    <section className="fa-discovery-info" aria-live="polite">{info}</section>
    <div className="fa-discovery-summary">Exploration progress</div>
    <section className="fa-discovery-record" aria-label="Exploration progress"><span>{count} / {regions.length} regions</span><span>{profile?.world.discoveries.length||0} landmarks</span></section>
    {controls}
  </div>;
  return <><Panel rect={layout[0]}><h2>{heading}</h2><RegionMap world={world} profile={profile} small/></Panel><Panel rect={layout[1]}><h3>{label}</h3>{info}{controls}</Panel></>;
}

// The original transparent conversation plate frames the actual world.
 // Service labels and availability come from the current world interaction.
function NPCDialogue({profile,world,service,serviceAvailable,original,layout,go,back}){
  const [group,setGroup]=useState('services');
  const available=Boolean(profile&&serviceAvailable);
  const questAvailable=profile?.quests.grove==='available';
  const options=group==='services'?[['16','Merchant',true],['17','Blacksmith',true],['22','Crafting',true]]:[['33','Rest and recover',true],['43','View quest offer',questAvailable],['26','Companion recruitment',true]];
  const choices=options.map(([id,label,enabled])=><Btn key={id} disabled={!available||!enabled} onClick={()=>go(id)}>{label}{id==='43'&&!questAvailable?' · Unavailable':''}</Btn>);
  const navigation=<><Btn primary={group==='services'} aria-pressed={group==='services'} onClick={()=>setGroup('services')}>Services</Btn><Btn primary={group==='preparation'} aria-pressed={group==='preparation'} onClick={()=>setGroup('preparation')}>Preparation</Btn><Btn disabled={!profile} onClick={()=>go('30')}>Relationships</Btn><Btn disabled={!profile} onClick={()=>go('08')}>Quest journal</Btn><Btn onClick={back}>Leave</Btn></>;
  const message=!available?'Approach a gold service marker in the world to interact.':group==='services'?'Choose a service to trade, enhance equipment or craft supplies.':(campaignServiceNote(profile)||groveStoryState(profile)?.serviceNote||'Rest, review available quests or recruit companions before your next encounter.');
  if(original)return <div className="fa-original-dialogue">
    <h2 className="fa-dialogue-title">Conversation</h2>
    <div className="fa-dialogue-subtitle">World interaction</div>
    <nav className="fa-dialogue-nav" aria-label="Conversation navigation">{navigation}</nav>
    <div className="fa-dialogue-location">{world?.region||'World not loaded'}</div>
    <h3 className="fa-dialogue-speaker">{service?.label||'World interaction'}</h3>
    <section className="fa-dialogue-message" aria-live="polite"><p>{message}</p></section>
    <section className="fa-dialogue-options" aria-label="Available interaction choices">{choices}</section>
  </div>;
  return <Panel rect={layout[0]}><h2>{service?.label||'World interaction'}</h2><p>{world?.region||'World not loaded'}</p><p>{message}</p><div className="fa-dialogue-fallback-nav">{navigation}</div><div className="fa-dialogue-fallback-options">{choices}</div></Panel>;
}

// Original offer illustration is decorative; saved quest state is authoritative.
function QuestOffer({profile,encounter,original,layout,onAccept,back}){
  const state=profile?.quests.grove;
  const defeated=Boolean(profile?.world.completedEncounters.includes('wilds_grove_01'));
  const available=Boolean(profile&&state==='available'&&!encounter);
  const reason=!profile?'Load a character first.':encounter?'Quest acceptance is unavailable during combat.':state==='claimed'?'This quest has already been completed.':state==='complete'?'This quest is ready to complete in the journal.':state==='active'?'This quest is already active.':defeated?'You have already defeated the Grove Spirit. Accept to record the completed objective.':'Accept to begin tracking this quest.';
  const description=<><p>{GROVE_STORY.offer}</p><p>{reason}</p></>;
  const objective=<><p>Defeat the Grove Spirit · {defeated?1:0}/1</p><progress aria-label="Quest objective progress" max={1} value={defeated?1:0}/></>;
  const rewards=<><p>Experience, gold and loot are awarded on the first eligible victory.</p><p>Accepting or claiming this journal entry does not grant additional rewards.</p></>;
  const controls=<><Btn primary className="fa-offer-accept" disabled={!available} onClick={onAccept}>Accept Quest</Btn><Btn className="fa-offer-decline" onClick={back}>{state==='available'?'Decline':'Back'}</Btn></>;
  if(original)return <div className="fa-original-offer">
    <h2 className="fa-offer-title">Quest Offer</h2><h3 className="fa-offer-name">Whispering Grove Spirit</h3>
    <section className="fa-offer-description" aria-live="polite">{description}</section>
    <h3 className="fa-offer-objective-heading">Objective</h3><section className="fa-offer-objective">{objective}</section>
    <h3 className="fa-offer-reward-heading">Rewards</h3><section className="fa-offer-reward">{rewards}</section>{controls}
  </div>;
  return <><Panel rect={layout[0]}><PaintedIllustration name="quest-offer"/></Panel><Panel rect={layout[1]}><h2>Whispering Grove Spirit</h2>{description}<h3>Objective</h3>{objective}<h3>Rewards</h3>{rewards}{controls}</Panel></>;
}

// Completion is a read-only acknowledgement, never a reward transaction.
function QuestCompletion({profile,original,layout,onContinue,onJournal}){
  const state=profile?.quests.grove;
  const defeated=Boolean(profile?.world.completedEncounters.includes('wilds_grove_01'));
  const completed=state==='claimed'&&defeated;
  const heading=completed?'Quest Complete':'Quest Progress';
  const objective=<><p>Grove Spirit defeated: {defeated?'Yes':'No'}</p><p>Journal completion: {completed?'Recorded':state==='complete'?'Ready to complete':'Not recorded'}</p><progress aria-label="Quest objective progress" max={1} value={defeated?1:0}/></>;
  const reward=<><p>{completed?'Battle rewards were awarded when the encounter was first defeated.':'Rewards are handled by the battle system.'}</p><p>No additional experience, gold or loot is granted by this screen.</p><p>{completed?GROVE_STORY.completion:'Return to the journal to review the quest.'}</p></>;
  const controls=<><Btn primary className="fa-complete-continue" onClick={onContinue}>Continue</Btn><Btn className="fa-complete-journal" onClick={onJournal}>Quest Journal</Btn></>;
  if(original)return <div className="fa-original-completion">
    <h2 className="fa-complete-title">{heading}</h2><h3 className="fa-complete-name">Whispering Grove Spirit</h3>
    <h3 className="fa-complete-objective-title">Objectives</h3><section className="fa-complete-objectives" aria-label="Quest objectives">{objective}</section>
    <h3 className="fa-complete-reward-title">Reward record</h3><section className="fa-complete-rewards" aria-live="polite">{reward}</section>
    {controls}
  </div>;
  return <><PaintedIllustration name="quest-complete" variant="fa-event-side-art"/><Panel rect={layout[0]}><h2>{heading}</h2><h3>Whispering Grove Spirit</h3>{objective}{reward}{controls}</Panel></>;
}

// Original entrance frames are decorative. Preview the same formation BattleSurface uses.
function DungeonEntrance({profile,world,candidate,encounter,running,original,layout,onDetails,back}){
  const ready=Boolean(profile&&running&&candidate&&!encounter);
  const partySize=profile?1+activeRoster(profile).length:0;
  const enemies=ready?enemyFormation(candidate,partySize):[];
  const lead=enemies[0];
  const completed=Boolean(profile&&candidate&&profile.world.completedEncounters.includes(candidate.id));
  const category=candidate?.category||'—';
  const title=candidate?.label||'No encounter selected';
  const description=ready?(candidate.id==='wilds_grove_01'?GROVE_STORY.warning:candidate.id==='wilds_waterfall_01'?'Mist Scout: Listen to the water. The voice goes the wrong way.':candidate.id==='wilds_cave_01'?'An old signal echoes from within the cave.':candidate.id==='wilds_heights_01'?'The first relay is repeating an old warning.':candidate.id==='wilds_heights_02'?'The next relay points toward the sanctuary.':candidate.id==='wilds_heights_elite'?'Optional elite trial. Check your party and prepare before challenging the guardian.':candidate.id==='wilds_sanctuary_guard'?'The outer guard still obeys the ancient emergency order.':candidate.id==='wilds_sanctuary_boss'?'The Gatekeeper is protecting the failing shrine network. Review its three phases before entering.':candidate.id==='wilds_moonveil_01'?'The garden remembers the old rites. Find the path to the observatory.':candidate.id==='wilds_moonveil_elite'?'Optional Moonveil trial. The Keeper guards an older ritual.':candidate.id==='wilds_astral_01'?'An echo of the original signal lingers in the ruins.':candidate.id==='wilds_astral_elite'?'The Astral Vanguard guards the last unsent message. Prepare before entering.':'Review the enemy formation and tactics before entering battle.'):encounter?'An encounter is already active.':'Approach an encounter marker in the world.';
  const roster=<>{enemies.length?enemies.map(e=><div className="fa-entrance-enemy" key={e.id}><EnemyPortrait enemy={e}/><strong>{e.name}</strong><small>HP {e.maxHp}</small></div>):<p>No enemy formation available.</p>}</>;
  const stats=<StatRows stats={{'Encounter type':category,'Enemy HP':lead?.maxHp??'—','Enemy attack':lead?.atk??'—','Enemy defense':lead?.def??'—'}}/>;
  const details=<><p>{description}</p>{completed&&<p>Previously defeated. First-victory rewards cannot be earned again.</p>}</>;
  const rewards=<p>{completed?'First-victory rewards already recorded.':ready?'First victory may award XP, gold and loot. No reward is granted at entry.':'No rewards available to preview.'}</p>;
  const controls=<><Btn primary className="fa-entrance-confirm" disabled={!ready} onClick={onDetails}>Encounter Details</Btn><Btn className="fa-entrance-leave" onClick={back}>Leave</Btn></>;
  if(original)return <div className="fa-original-entrance">
    <h2 className="fa-entrance-title">Dungeon Entrance</h2>
    <section className="fa-entrance-list" aria-label="Current encounter"><strong>Current encounter</strong><div className="fa-entrance-selection">{title}</div><p>{world?.region||'World not loaded'}</p><p>{ready?'Available for preview':'Not available'}</p><small>Enter from a world encounter marker.</small></section>
    <section className="fa-entrance-preview" aria-label="Actual enemy formation">{roster}</section>
    <h3 className="fa-entrance-name">{title}</h3><div className="fa-entrance-category">{category} · Party {partySize}/4</div>
    <section className="fa-entrance-description">{details}</section>
    <div className="fa-entrance-mode">Encounter difficulty: {category} · Fixed by world encounter</div>
    <h3 className="fa-entrance-stats-title">Enemy information</h3><section className="fa-entrance-stats">{stats}</section>
    <h3 className="fa-entrance-rewards-title">Rewards</h3><section className="fa-entrance-rewards">{rewards}{lead&&<p>{tacticFor(lead.strategy,lead.archetype)}</p>}</section>
    {controls}
  </div>;
  return <><Panel rect={layout[0]}><h2>Current encounter</h2><p>{title}</p><p>{world?.region||'World not loaded'}</p><Btn onClick={back}>Leave</Btn></Panel><Panel rect={layout[1]}>{roster}</Panel><Panel rect={layout[2]}><h2>{title}</h2>{stats}{details}{rewards}{controls}</Panel></>;
}

// Boss introduction uses the real encounter and the same party-size scaling as battle.
function BossIntroduction({profile,candidate,encounter,running,original,layout,onEnter,back}){
  const ready=Boolean(profile&&running&&candidate&&!encounter);
  const partySize=profile?1+activeRoster(profile).length:0;
  const enemies=ready?enemyFormation(candidate,partySize):[];
  const lead=enemies[0];
  const completed=Boolean(profile&&candidate&&profile.world.completedEncounters.includes(candidate.id));
  const [selectedId,setSelectedId]=useState(null);
  const selected=enemies.find(e=>e.id===selectedId)||lead;
  const title=candidate?.label||'No encounter selected';
  const category=candidate?.category||'—';
  const sanctuaryIntro=ready&&candidate.id==='wilds_sanctuary_boss'?'The watch is not waiting for us. It is waiting for the light to return.':ready&&candidate.id==='wilds_astral_elite'?'A message was left unfinished. Find the truth behind the silence.':null;
  const roster=enemies.map(e=><Btn key={e.id} primary={selected?.id===e.id} aria-pressed={selected?.id===e.id} onClick={()=>setSelectedId(e.id)}><EnemyPortrait enemy={e} small/><strong>{e.name}</strong><small>HP {e.maxHp}</small></Btn>);
  const details=<StatRows stats={{HP:selected?.maxHp??'—',Attack:selected?.atk??'—',Defense:selected?.def??'—',Speed:selected?.spd??'—'}}/>;
  const tactics=<>{enemies.map(e=><div className="fa-boss-tactic" key={e.id}><EnemyPortrait enemy={e} small/><div><strong>{e.name}</strong><p>{tacticFor(e.strategy,e.archetype)}</p></div></div>)}{!enemies.length&&<p>No encounter data available.</p>}</>;
  const reward=completed?'First-victory rewards already recorded.':ready?'First eligible victory awards XP, gold and loot.':'No reward preview available.';
  const enter=<Btn primary className="fa-boss-enter" disabled={!ready} onClick={onEnter}>Enter Battle</Btn>;
  if(original)return <div className="fa-original-boss">
    <h2 className="fa-boss-title">{category==='Boss'?'Boss Introduction':'Encounter Introduction'}</h2>
    <h3 className="fa-boss-name">{title}</h3><div className="fa-boss-category">{category} encounter</div>
    <section className="fa-boss-description"><p>{sanctuaryIntro||(ready?'Review the enemy formation before entering.':'Approach an encounter marker to begin.')}</p>{completed&&<p>Previously defeated.</p>}</section>
    <div className="fa-boss-preview">{selected?<><EnemyPortrait enemy={selected}/><strong>{selected.name}</strong></>:<p>No enemy selected</p>}</div>
    <h3 className="fa-boss-stats-title">Enemy details</h3><section className="fa-boss-stats">{details}</section>
    <h3 className="fa-boss-tactics-title">Enemy mechanics</h3><section className="fa-boss-tactics" aria-label="Enemy mechanics">{tactics}</section>
    <h3 className="fa-boss-formation-title">Enemy formation</h3><section className="fa-boss-roster" aria-label="Select enemy to inspect">{roster}{!enemies.length&&<p>No enemies</p>}</section>
    <h3 className="fa-boss-rewards-title">Battle rewards</h3><section className="fa-boss-rewards"><p>{reward}</p><small>Party {partySize}/4 · Fixed encounter difficulty · No reward at entry</small></section>
    {enter}<Btn className="fa-boss-close" aria-label="Back to entrance" onClick={back}>×</Btn>
  </div>;
  return <><Panel rect={layout[0]}><h2>{title}</h2><p>{category} · Party {partySize}/4</p>{sanctuaryIntro&&<p>{sanctuaryIntro}</p>}{roster}{details}</Panel><Panel rect={layout[1]}><h2>Enemy mechanics</h2>{tactics}<p>{reward}</p>{enter}<Btn onClick={back}>Back</Btn></Panel></>;
}

// Transparent original HUD: the stage remains responsible for action legality,
// targeting, enemy intents, turn resolution and victory/defeat.
function OriginalCombatHud({hud,profile,encounter,onAction,onPause,onSkills}){
  const allies=hud?.units.filter(u=>u.team==='player')||[];
  const enemies=hud?.units.filter(u=>u.team==='enemy')||[];
  const actor=allies.find(u=>u.id===hud?.choosingUnit);
  const choosing=hud?.phase==='choose';
  return <div className="fa-original-combat">
    <div className="fa-combat-location">{encounter?.label||'Preparing combat'}</div>
    <div className="fa-combat-round">{hud?'Round '+hud.round:'Loading'}</div>
    <h2 className="fa-combat-order-title">Turn Order</h2>
    <section className="fa-combat-order" aria-label="Turn order">{hud?.order.map(o=><div className={o.active?'current':''} key={o.id} title={o.name+(o.action?' · '+o.action:'')}><span>{o.name}</span>{o.action&&<small>{o.action}</small>}</div>)}</section>
    <h3 className="fa-combat-enemies-title">Enemies</h3>
    <section className="fa-combat-enemies" aria-label="Enemy health and intent">{enemies.map(u=><div key={u.id} className={'fa-original-enemy'+(u.hp===0?' down':'')}><div><strong>{u.name}</strong><span>{u.hp}/{u.maxHp}</span></div><progress aria-label={u.name+' health'} value={u.hp} max={u.maxHp}/>{hud.intents?.filter(i=>i.unitId===u.id).map(i=><small key={i.unitId} title={i.summary}>{i.phaseName?i.phaseName+' · ':''}{i.name}{i.targetId?' · Frontline':''}</small>)}</div>)}</section>
    <section className="fa-combat-party" aria-label="Party health and Focus">{allies.map(u=><div key={u.id} className={'fa-original-ally'+(hud.choosingUnit===u.id?' choosing':'')+(u.hp===0?' down':'')}><div className="fa-combat-portrait">{u.id==='hero'?<ArcherPortrait profile={profile} small/>:<ArcherPortrait companion={ROSTER.find(m=>m.id===u.id)} small/>}</div><div className="fa-combat-ally-data"><strong>{u.name}{u.hp===0?' · Down':hud.pendingChoices?.[u.id]?' · Ready':''}</strong><div><progress aria-label={u.name+' health'} value={u.hp} max={u.maxHp}/><small>HP {u.hp}/{u.maxHp}</small></div><div><progress className="fa-combat-focus" aria-label={u.name+' Focus'} value={u.focus} max={u.maxFocus}/><small>Focus {u.focus}/{u.maxFocus}</small></div></div></div>)}</section>
    <div className="fa-combat-actor" aria-live="polite">{choosing?actor?.name||'Choose action':hud?'Resolving round':'Preparing battle'}</div>
    <section className="fa-original-action-list" aria-label="Available combat actions">{hud?.legal.map(a=><Btn key={a.id} disabled={!choosing||!a.enabled} className={'fa-original-action '+a.action.kind} title={a.reason||a.action.summary} aria-label={a.action.name+' — '+(a.reason||a.action.summary)} onClick={()=>onAction(a.id)}><SkillArt id={a.id}/><span><kbd>{a.action.hotkey}</kbd> {a.action.name}</span><small>{a.reason||a.action.summary}</small></Btn>)}</section>
    <div className="fa-combat-focus-circle" aria-label="Current actor Focus"><strong>{actor?actor.focus:'—'}</strong><small>{actor?'Focus / '+actor.maxFocus:'Focus'}</small></div>
    <div className="fa-combat-log" role="status">{hud?.log.at(-1)||'Waiting for battle'}</div>
    <nav className="fa-original-combat-nav" aria-label="Combat menu"><Btn onClick={onPause}>Pause · Esc</Btn><Btn onClick={onSkills}>Skills · K</Btn></nav>
  </div>;
}

// Original exploration plate is transparent; the iframe remains the live world.
function OriginalExplorationHud({profile,world,notifications,post,go,onPause,onFocus}){
  const [zoom,setZoom]=useState(1);
  const held=useRef(new Set()),send=useRef(post);send.current=post;
  const release=()=>{for(const key of held.current)send.current('move',{key,value:false});held.current.clear();};
  useEffect(()=>{window.addEventListener('blur',release);return()=>{window.removeEventListener('blur',release);release();};},[]);
  const members=profile?[{id:'hero',name:profile.name,hp:profile.hp,maxHp:heroStats(profile).maxHp},...activeRoster(profile).map(m=>({...m,hp:memberFor(profile,m.id).hp,maxHp:memberStats(profile,m.id).maxHp}))]:[];
  const quest=profile?.quests.grove;
  const objective=campaignPrompt(profile)||(quest==='active'?'Defeat the Grove Spirit':quest==='complete'?'Return to the journal to complete the quest':quest==='available'?'A quest is available':quest==='claimed'?'Whispering Grove Spirit completed':'No tracked quest');
  const moveButtons=[['left','←'],['right','→'],['in','↑'],['out','↓'],['run','Run']].map(([key,label])=><Btn key={key} aria-label={key==='run'?'Hold to run':'Hold to move '+key} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);held.current.add(key);send.current('move',{key,value:true});}} onPointerUp={()=>{held.current.delete(key);send.current('move',{key,value:false});}} onPointerCancel={()=>{held.current.delete(key);send.current('move',{key,value:false});}} onLostPointerCapture={()=>{held.current.delete(key);send.current('move',{key,value:false});}}>{label}</Btn>);
  return <div className="fa-original-explore">
    <h2 className="fa-explore-quest-title">Quest Journal</h2><button className="fa-explore-objective" onClick={()=>go('08')}>{objective}</button>
    <div className="fa-explore-region">{world?.region||'Loading world'}</div>
    <button className="fa-explore-minimap" aria-label="Open live world map" onClick={()=>go('07')}><div style={{transform:'scale('+zoom+')'}}><RegionMap world={world} profile={profile} small/></div></button>
    <Btn className="fa-explore-map-menu" onClick={onPause} aria-label="Open menu">☰</Btn><Btn className="fa-explore-map-journal" onClick={()=>go('08')} aria-label="Open quest journal">↗</Btn>
    <div className="fa-explore-zoom"><Btn aria-label="Zoom in on minimap" disabled={zoom>=2} onClick={()=>setZoom(x=>Math.min(2,x+.25))}>+</Btn><Btn aria-label="Zoom out on minimap" disabled={zoom<=1} onClick={()=>setZoom(x=>Math.max(1,x-.25))}>−</Btn></div>
    <section className="fa-explore-party" aria-label="Active party">{Array.from({length:4},(_,i)=>{const m=members[i];return <div className="fa-explore-member" key={m?.id||'empty'+i}><div className="fa-explore-portrait">{m&&(m.id==='hero'?<ArcherPortrait profile={profile} small/>:<ArcherPortrait companion={m} small/>)}</div><div className="fa-explore-member-data"><strong>{m?.name||'Empty slot'}</strong>{m?<><progress aria-label={m.name+' health'} max={m.maxHp} value={m.hp}/><small>HP {m.hp}/{m.maxHp}</small></>:<small>—</small>}</div></div>;})}</section>
    <section className="fa-explore-progress" aria-label="Character progression"><div className="fa-explore-profile-icon">{profile&&<ArcherPortrait profile={profile} small/>}</div><div><strong>{profile?'Level '+levelFor(profile.xp):'No character'}</strong><progress aria-label="Progress to next level" value={(profile?.xp||0)%100} max={100}/><small>{profile?.xp||0} XP · {profile?.gold||0} gold</small></div></section>
    <Btn className="fa-explore-interact" disabled={!world?.nearby} onClick={()=>post('interact')}>{world?.nearby?world.nearby+' · E':'No nearby interaction'}</Btn>
    <Btn className="fa-explore-primary" aria-label="Jump" onClick={()=>post('jump')}>Jump</Btn><Btn className="fa-explore-secondary" aria-label="Skillbook" onClick={()=>go('12')}>Skills</Btn><Btn className="fa-explore-item" aria-label="Recovery tonic" disabled={!profile?.inventory?.recoveryTonic} onClick={()=>go('46')}>+</Btn>
    <nav className="fa-explore-nav" aria-label="Exploration menu"><Btn onClick={onPause}>Menu</Btn><Btn onClick={()=>go('05')}>Character</Btn><Btn onClick={()=>go('06')}>Items</Btn><Btn onClick={()=>go('07')}>Map</Btn><Btn onClick={()=>go('08')}>Journal</Btn><Btn onClick={()=>go('12')}>Skills</Btn><Btn onClick={()=>go('37')}>Events</Btn></nav>
    <section className="fa-explore-move" aria-label="Movement controls">{moveButtons}<Btn onClick={onFocus}>WASD · Focus</Btn></section>
    {notifications?.length>0&&<button className="fa-explore-notice" onClick={()=>go('37')} aria-label="View latest gameplay events">{notifications[0].message}</button>}
  </div>;
}

// Victory is a read-only presentation of the actual resolved encounter.
function BattleVictory({profile,encounter,result,hud,original,layout,onContinue,onItems,onDetails}){
  const verified=Boolean(profile&&encounter&&result&&hud?.winner==='player');
  const xp=verified?result.xp||0:0,gold=verified?result.gold||0:0;
  const earned=verified?(result.loot||[]):[];
  const units=verified?(hud.units||[]):[];
  const allies=units.filter(u=>u.team==='player'),enemies=units.filter(u=>u.team==='enemy');
  const currentLevel=profile?levelFor(profile.xp):0,previousLevel=profile?levelFor(Math.max(0,profile.xp-xp)):0;
  const rows=allies.map(u=><div key={u.id} className="fa-victory-member"><div className="fa-victory-portrait">{u.id==='hero'?<ArcherPortrait profile={profile} small/>:<ArcherPortrait companion={ROSTER.find(m=>m.id===u.id)} small/>}</div><div className="fa-victory-member-data"><strong>{u.name}</strong><small>{u.id==='hero'?'Level '+previousLevel+(currentLevel>previousLevel?' → '+currentLevel+' · Level up':''):'Companion'} · {u.hp===0?'Down':'Survived'}</small><progress aria-label={u.name+' final health'} value={u.hp} max={u.maxHp}/><small>Final HP {u.hp}/{u.maxHp}{u.id==='hero'?' · +'+xp+' XP':''}</small></div></div>);
  const rewards=<><p>{!verified?'No confirmed victory result.':encounter.practice?'Practice battle · no progression rewards':xp===0?'Repeat victory · first-victory rewards already recorded':'First-victory rewards earned'}</p>{earned.length?earned.map(l=><div className="fa-victory-loot" key={l.id}><ItemArt id={l.id}/><span>{ITEMS[l.id]?.name||l.id} ×{l.count}</span></div>):<p>No items awarded.</p>}{verified&&result.leveled&&<p>Level {currentLevel} reached · {pointsFor(profile)} unspent points</p>}{verified&&result.unlocked?.length>0&&<p>New abilities: {result.unlocked.map(id=>ACTIONS[id]?.name||id).join(', ')}</p>}</>;
  const sanctuaryCleared=verified&&!encounter.practice&&encounter.id==='wilds_sanctuary_boss'&&profile.world.completedEncounters.includes('wilds_sanctuary_boss');
  const astralCleared=verified&&!encounter.practice&&encounter.id==='wilds_astral_elite'&&profile.world.completedEncounters.includes('wilds_astral_elite');
  const summary=<><p>Result: {verified?'Victory':'Unavailable'}</p>{astralCleared&&<p>The Vanguard has fallen. Review the journal to record the final chapter objectives.</p>}{sanctuaryCleared&&<p>The Gatekeeper has fallen silent. Review the journal to record the sanctuary objectives.</p>}<p>Rounds: {verified?hud.round:'—'}</p><p>Enemies defeated: {enemies.filter(u=>u.hp===0).length}/{enemies.length}</p><p>Allies standing: {allies.filter(u=>u.hp>0).length}/{allies.length}</p><p>Experience: +{xp}</p><p>Gold: +{gold}</p><small>Duration, damage totals and battle ranks are not tracked in this build.</small></>;
  const nextLabel=verified&&result.leveled?'Level Up':'Continue';
  const controls=<><Btn disabled={!verified} onClick={onDetails}>Details</Btn><Btn primary disabled={!verified} onClick={onContinue}>{nextLabel}</Btn><Btn disabled={!earned.length} onClick={onItems}>View Items</Btn></>;
  if(original)return <div className="fa-original-victory">
    <div className="fa-victory-encounter">{encounter?.label||'Encounter result'}</div>
    <div className="fa-victory-xp">Total XP gained: +{xp}</div><section className="fa-victory-party" aria-label="Party results">{rows}</section>
    <div className="fa-victory-gold">Gold gained: +{gold}</div><section className="fa-victory-rewards" aria-label="Earned rewards">{rewards}</section>
    <section id="fa-victory-details" tabIndex={-1} className="fa-victory-stats" aria-label="Battle statistics">{summary}</section>
    <Btn className="fa-victory-details-button" disabled={!verified} onClick={()=>document.getElementById('fa-victory-details')?.focus()}>Details</Btn><Btn primary className="fa-victory-continue" disabled={!verified} onClick={onContinue}>{nextLabel}</Btn><Btn className="fa-victory-items" disabled={!earned.length} onClick={onItems}>View Items</Btn>
  </div>;
  return <Panel rect={layout[0]}><h2>Victory</h2><p>{encounter?.label}</p>{rows}{rewards}{summary}{controls}</Panel>;
}

// A defeat screen only reads the resolved battle; recovery uses existing guarded callbacks.
function BattleDefeat({profile,encounter,result,hud,validSlots,original,layout,onRetry,onExplore,onLoad,onTitle}){
  const verified=Boolean(profile&&encounter&&result&&hud?.phase==='over'&&hud?.winner!=='player');
  const allies=verified?hud.units.filter(u=>u.team==='player'):[];
  const entries=[
    {label:'Retry Battle',description:'Restart the same encounter from its beginning.',enabled:verified,action:onRetry},
    {label:'Return to Exploration',description:'Restore your pre-battle world position and profile.',enabled:verified,action:onExplore},
    {label:'Load Game',description:validSlots.length?'Choose a valid saved game.':'No valid saved games on this browser.',enabled:validSlots.length>0,action:onLoad},
    {label:'Return to Title',description:'Leave the session after confirmation.',enabled:true,action:onTitle}
  ];
  const recovery=entries.map((e,i)=><Btn key={e.label} primary={i===0} className={'fa-defeat-choice choice-'+i} disabled={!e.enabled} onClick={e.action}>{e.label}</Btn>);
  const party=Array.from({length:4},(_,i)=>{const u=allies[i];return <div className="fa-defeat-member" key={u?.id||'empty'+i}><div className="fa-defeat-portrait">{u&&(u.id==='hero'?<ArcherPortrait profile={profile} small/>:<ArcherPortrait companion={ROSTER.find(m=>m.id===u.id)} small/>)}</div><div className="fa-defeat-member-data"><strong>{u?.name||'Empty'}</strong>{u?<><small>HP {u.hp}/{u.maxHp}</small><progress aria-label={u.name+' final health'} value={u.hp} max={u.maxHp}/><small>{u.hp===0?'Down':'Standing'}</small></>:<small>—</small>}</div></div>;});
  const description=verified?'No progression rewards were granted. Your pre-battle saved profile remains unchanged.':'No confirmed defeat result is available.';
  if(original)return <div className="fa-original-defeat">
    <h2 className="fa-defeat-title">{verified?'Defeat':'Battle Result'}</h2><div className="fa-defeat-subtitle">{encounter?.label||'No encounter'}</div>
    <nav className="fa-defeat-navigation" aria-label="Recovery options">{recovery}</nav>
    <h3 className="fa-defeat-headline">{verified?'Fallen':'Result unavailable'}</h3><div className="fa-defeat-description"><p>{description}</p><p>{verified?'Round '+hud.round+' · '+allies.filter(u=>u.hp===0).length+'/'+allies.length+' allies down':''}</p></div>
    <h3 className="fa-defeat-party-title">Party Condition</h3><section className="fa-defeat-party" aria-label="Final party condition">{party}</section>
    <h3 className="fa-defeat-options-title">Recovery Options</h3><section className="fa-defeat-options">{entries.map(e=><div key={e.label}><strong>{e.label}</strong><small>{e.description}</small></div>)}</section>
  </div>;
  return <Panel rect={layout[0]}><h2>{verified?'Defeat':'Battle Result'}</h2><p>{encounter?.label}</p><p>{description}</p>{allies.map(u=><div key={u.id}><strong>{u.name}</strong><p>HP {u.hp}/{u.maxHp}</p></div>)}{recovery}</Panel>;
}

// Reveal only the recorded discovery transaction; viewing it cannot award loot again.
function TreasureReveal({profile,discovery,loot,encounter,original,layout,onItems,onContinue}){
  const verified=Boolean(profile&&!encounter&&discovery?.kind==='landmark'&&profile.rewardedDiscoveries.includes(discovery.id));
  const earned=verified?loot.filter(l=>ITEMS[l.id]&&Number.isInteger(l.count)&&l.count>0):[];
  const total=earned.reduce((sum,l)=>sum+l.count,0);
  const cards=earned.map(l=><div className="fa-treasure-card" key={l.id}><ItemArt id={l.id}/><strong>{ITEMS[l.id].name}</strong><span>+{l.count}</span><small>Owned: {profile.inventory[l.id]||0}</small></div>);
  const description=earned.length?'Treasure recorded in your current inventory. No further claim is required.':'No newly awarded items to reveal.';
  const controls=<><Btn primary className="fa-treasure-items" disabled={!earned.length} onClick={onItems}>View Items</Btn><Btn className="fa-treasure-continue" onClick={onContinue}>Continue</Btn></>;
  if(original)return <div className="fa-original-treasure">
    <h2 className="fa-treasure-title">Treasure Discovered</h2>
    <h3 className="fa-treasure-name">{verified?discovery.label:'Discovery result'}</h3>
    <section className="fa-treasure-cards" aria-label="Recorded treasure rewards">{cards}{!earned.length&&<p>No items awarded</p>}</section>
    <section className="fa-treasure-record" aria-live="polite"><strong>{total} {total===1?'item':'items'} recorded</strong><span>{description}</span></section>
    {controls}
  </div>;
  return <Panel rect={layout[0]}><h2>Treasure Discovered</h2><p>{verified?discovery.label:'Discovery result'}</p>{cards}<p>{description}</p>{controls}</Panel>;
}

// Acquired items are read-only and tied to the originating reward screen.
function ItemAcquisition({profile,encounter,result,hud,discovery,loot,origin,original,layout,onInventory,onContinue}){
  const battle=Boolean(profile&&origin==='14'&&encounter&&!encounter.practice&&result&&hud?.winner==='player');
  const treasure=Boolean(profile&&origin==='31'&&!encounter&&discovery?.kind==='landmark'&&profile.rewardedDiscoveries.includes(discovery.id));
  const earned=(battle?(result.loot||[]):treasure?loot:[]).filter(l=>Object.hasOwn(ITEMS,l.id)&&Number.isInteger(l.count)&&l.count>0);
  const [selectedId,setSelectedId]=useState(null);
  const selected=earned.find(l=>l.id===selectedId)||earned[0];
  const item=selected?ITEMS[selected.id]:null;
  const cards=earned.map(l=><Btn key={l.id} className="fa-acquisition-card" primary={selected?.id===l.id} aria-pressed={selected?.id===l.id} onClick={()=>setSelectedId(l.id)}><ItemArt id={l.id}/><strong>{ITEMS[l.id].name}</strong><span>+{l.count}</span></Btn>);
  const details=item?<><div className="fa-acquisition-selected-icon"><ItemArt id={selected.id}/></div><div className="fa-acquisition-selected-name"><h3>{item.name}</h3><small>{item.kind}</small></div><div className="fa-acquisition-values"><p>Acquired: +{selected.count}</p><p>Currently owned: {profile.inventory[selected.id]||0}</p>{item.heal!=null&&<p>Restores up to {item.heal} HP</p>}{item.atk!=null&&<p>Attack: +{item.atk}</p>}{item.def!=null&&<p>Defense: +{item.def}</p>}{item.spd!=null&&<p>Speed: +{item.spd}</p>}{item.sell>0&&<p>Sell value: {item.sell} gold</p>}</div></>:<p className="fa-acquisition-empty-detail">No recorded items to inspect.</p>;
  const count=earned.reduce((sum,l)=>sum+l.count,0);
  const source=battle?encounter.label:treasure?discovery.label:'No reward event';
  const message=count?'Already added to inventory. No additional claim is required.':'No newly acquired items.';
  const controls=<><Btn className="fa-acquisition-inventory" disabled={!profile||Boolean(encounter)} onClick={onInventory}>Inventory</Btn><Btn primary className="fa-acquisition-continue" onClick={onContinue}>Continue</Btn></>;
  if(original)return <div className="fa-original-acquisition">
    <h2 className="fa-acquisition-title">Items Acquired</h2>
    <p className="fa-acquisition-source">{source}</p>
    <section className="fa-acquisition-cards" aria-label="Acquired items">{cards}{!earned.length&&<p>No items awarded</p>}</section>
    <section className="fa-acquisition-detail" aria-label="Selected item details">{details}<p className="fa-acquisition-detail-note">{message}</p></section>
    <div className="fa-acquisition-count" role="status">{count} {count===1?'item':'items'} recorded</div>{controls}
  </div>;
  return <><Panel rect={layout[0]}><h2>Items Acquired</h2><p>{source}</p></Panel><Panel rect={layout[1]}>{cards}{details}<p>{message}</p></Panel><Panel rect={layout[2]}>{controls}</Panel></>;
}

// Trade uses the actual catalog and existing atomic one-item transactions.
function MerchantShop({profile,service,serviceAvailable,original,layout,onTrade,back}){
  const [mode,setMode]=useState('buy'),[filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[pageIndex,setPageIndex]=useState(0),[selectedId,setSelectedId]=useState(null);
  const categories=[['all','All Goods'],['consumable','Consumables'],['material','Materials'],['weapon','Weapons'],['armor','Armor'],['mantle','Mantles']];
  const inv=profile?.inventory||{},ready=Boolean(profile&&serviceAvailable);
  const matches=Object.entries(ITEMS).filter(([id,item])=>(mode==='buy'?item.buy>0:item.sell>0&&inv[id]>0)&&(filter==='all'||item.kind===filter||item.slot===filter)&&item.name.toLowerCase().includes(query.trim().toLowerCase()));
  const pages=Math.max(1,Math.ceil(matches.length/12)),index=Math.min(pageIndex,pages-1),visible=matches.slice(index*12,index*12+12);
  const selected=visible.find(([id])=>id===selectedId)||visible[0],id=selected?.[0],item=selected?.[1],owned=inv[id]||0;
  const equipped=profile&&item?.kind==='gear'?gearCount(profile,id):profile?.equipped===id&&id?1:0;
  const price=item?.[mode]||0;
  const allowed=Boolean(ready&&price&&(mode==='buy'?profile.gold>=price&&owned<100000:owned>equipped));
  const reset=()=>{setPageIndex(0);setSelectedId(null);};
  const tabs=<>{['buy','sell'].map(m=><Btn key={m} primary={mode===m} aria-pressed={mode===m} onClick={()=>{setMode(m);reset();}}>{m==='buy'?'Buy':'Sell'}</Btn>)}</>;
  const filters=categories.map(([id,label])=><Btn key={id} primary={filter===id} aria-pressed={filter===id} onClick={()=>{setFilter(id);reset();}}>{label}</Btn>);
  const cards=visible.map(([key,i])=><Btn key={key} className="fa-merchant-card" primary={id===key} aria-pressed={id===key} onClick={()=>setSelectedId(key)}><ItemArt id={key}/><strong>{i.name}</strong><span>{i[mode]} gold</span><small>Owned: {inv[key]||0}</small></Btn>);
  const paging=<><Btn disabled={index===0} aria-label="Previous items" onClick={()=>setPageIndex(index-1)}>‹</Btn><span>{index+1} / {pages}</span><Btn disabled={index>=pages-1} aria-label="Next items" onClick={()=>setPageIndex(index+1)}>›</Btn></>;
  const reason=!ready?'Visit a service marker to trade.':!item?'Select an available item.':mode==='buy'&&profile.gold<price?'Insufficient gold.':mode==='buy'&&owned>=100000?'Inventory limit reached.':mode==='sell'&&owned<=equipped?'Equipped items cannot be sold.':'Confirm to trade one item.';
  const detail=item?<><p>Type: {item.kind}</p>{gearMetadata(id)&&<p>{gearMetadata(id)}</p>}<p>Owned: {owned} · Equipped: {equipped||0}</p>{item.heal!=null&&<p>Restores up to {item.heal} HP.</p>}{item.atk!=null&&<p>Attack: +{item.atk}</p>}{item.def!=null&&<p>Defense: +{item.def}</p>}{item.spd!=null&&<p>Speed: +{item.spd}</p>}<p>Buy: {item.buy||0} gold · Sell: {item.sell||0} gold</p></>:<p>No item selected.</p>;
  const trade=<Btn primary className="fa-merchant-trade" disabled={!allowed} onClick={()=>onTrade(mode,id)}>{mode==='buy'?'Purchase':'Sell Item'}</Btn>;
  if(original)return <div className="fa-original-merchant">
    <h2 className="fa-merchant-title">Merchant Shop</h2><div className="fa-merchant-gold">Gold: {profile?.gold||0}</div>
    <div className="fa-merchant-name">{service?.label||'Merchant'}</div><div className="fa-merchant-greeting">{ready?'Browse available goods or sell unused items.':'Approach a service marker to trade.'}</div>
    <nav className="fa-merchant-filters" aria-label="Item categories">{filters}</nav>
    <nav className="fa-merchant-tabs" aria-label="Trade mode">{tabs}</nav>
    <div className="fa-merchant-search"><input aria-label="Search merchant items" placeholder="Search items" value={query} onChange={e=>{setQuery(e.target.value);reset();}}/><span>{matches.length} items</span></div>
    <section className="fa-merchant-grid" aria-label="Merchant catalog">{cards}{!visible.length&&<p>No matching items</p>}</section>
    <div className="fa-merchant-pages">{paging}</div>
    <h3 className="fa-merchant-item-name">{item?.name||'Select an item'}</h3><div className="fa-merchant-item-art">{item&&<ItemArt id={id}/>}</div>
    <section className="fa-merchant-detail">{detail}</section><div className="fa-merchant-reason" role="status">{reason}</div><div className="fa-merchant-price">Quantity: 1 · {price} gold</div>{trade}<Btn className="fa-merchant-back" onClick={back}>Leave</Btn>
  </div>;
  return <><Panel rect={layout[0]}><h2>Merchant</h2><p>Gold: {profile?.gold||0}</p>{tabs}{filters}<input aria-label="Search merchant items" value={query} onChange={e=>{setQuery(e.target.value);reset();}}/><Btn onClick={back}>Leave</Btn></Panel><Panel rect={layout[1]}>{cards}{!visible.length&&<p>No matching items</p>}{paging}</Panel><Panel rect={layout[2]}><h2>{item?.name||'Select an item'}</h2>{detail}<p>{reason}</p>{trade}</Panel></>;
}

// Enhancement is a preview of the existing bow upgrade, never a new forging economy.
function BlacksmithShop({profile,serviceAvailable,original,layout,onEnhance,back,go}){
  const id=profile?.equipped,item=id&&ITEMS[id],level=profile?.enhancements?.[id]??0;
  const gold=profile?.gold||0,ore=profile?.inventory?.sapphireOre||0,cost=15+level*10;
  const ready=Boolean(profile&&item?.kind==='weapon'&&serviceAvailable);
  const allowed=ready&&level<5&&gold>=cost&&ore>=1;
  const stats=heroStats(profile),next=level<5?level+1:level;
  const reason=!ready?'Visit a service marker to enhance your equipped bow.':level>=5?'Maximum enhancement reached.':gold<cost?'Not enough gold.':ore<1?'Requires one Sapphire Ore.':'Ready to enhance one level.';
  const input=<><ItemArt id={id}/><strong>{item?.name||'No weapon'}</strong><small>+{level}</small></>;
  const catalyst=<><ItemArt id="sapphireOre"/><strong>Sapphire Ore</strong><small>{ore} owned · 1 required</small></>;
  const result=<><ItemArt id={id}/><strong>{item?.name||'No weapon'}</strong><small>+{next} {level>=5?'(Max)':'preview'}</small></>;
  const details=<><strong>{item?.name||'No equipped weapon'}</strong><p>Enhancement +{level} / 5</p><p>Character attack: {stats.atk} → {stats.atk+(level<5&&item?2:0)}</p><p>Defense: {stats.def} · Speed: {stats.spd}</p></>;
  const requirements=<><p>Gold: {gold} / {level<5?cost:'—'}</p><p>Sapphire Ore: {ore} / {level<5?1:'—'}</p><p>{level<5?'One enhancement per confirmation.':'No further enhancement available.'}</p></>;
  const trade=<Btn primary className="fa-smith-confirm" disabled={!allowed} onClick={()=>onEnhance(id,level,cost)}>Enhance</Btn>;
  if(original)return <div className="fa-original-smith">
    <h2 className="fa-smith-title">Weapon Enhancement</h2><p className="fa-smith-subtitle">Strengthen your equipped bow</p>
    <nav className="fa-smith-operations" aria-label="Blacksmith operations"><Btn primary aria-current="page" onClick={()=>document.getElementById('fa-smith-item-info')?.focus()}>Enhance</Btn>{['Combine','Ascend','Socket','Enchant'].map(label=><Btn key={label} disabled title="Not available in this build">{label}</Btn>)}<Btn onClick={()=>go('22')} disabled={!ready}>Crafting</Btn></nav>
    <div className="fa-smith-input">{input}</div><div className="fa-smith-catalyst">{catalyst}</div><div className="fa-smith-result">{result}</div>
    <div className="fa-smith-effect">Attack {stats.atk} → {stats.atk+(level<5&&item?2:0)}</div><div className="fa-smith-effect-other">Defense unchanged · Speed unchanged</div><div className="fa-smith-quantity">Quantity: 1</div>
    <nav className="fa-smith-tabs" aria-label="Enhancement details">{[['Item Info','fa-smith-item-info'],['Materials','fa-smith-materials'],['Upgrade','fa-smith-upgrade']].map(([label,target])=><Btn key={target} onClick={()=>document.getElementById(target)?.focus()}>{label}</Btn>)}</nav>
    <div className="fa-smith-side-icon"><ItemArt id={id}/></div><section id="fa-smith-item-info" tabIndex={-1} className="fa-smith-item-info">{details}</section>
    <div className="fa-smith-stats"><p>Current ATK: {stats.atk}</p><p>Next ATK: {stats.atk+(level<5&&item?2:0)}</p></div>
    <section id="fa-smith-upgrade" tabIndex={-1} className="fa-smith-upgrade"><strong>Enhancement effect</strong><p>{level<5?'+2 attack per enhancement':'Maximum +5 reached'}</p></section>
    <div className="fa-smith-status" role="status">{reason}</div><div className="fa-smith-status-note">No random failure in the current enhancement rules.</div>
    <section id="fa-smith-materials" tabIndex={-1} className="fa-smith-materials">{requirements}</section><div className="fa-smith-cost">{level<5?cost+' gold':'Max'}</div>
    <Btn className="fa-smith-back" onClick={back}>Back</Btn>{trade}<Btn className="fa-smith-craft" disabled={!ready} onClick={()=>go('22')}>Crafting</Btn>
  </div>;
  return <><Panel rect={layout[0]}><h2>Blacksmith</h2>{requirements}<p>{reason}</p><Btn onClick={back}>Back</Btn></Panel><Panel rect={layout[1]}>{input}{catalyst}{result}{details}</Panel><Panel rect={layout[2]}>{trade}<Btn disabled={!ready} onClick={()=>go('22')}>Crafting</Btn></Panel></>;
}

// Only the existing Recovery Tonic recipe is available; the painting is decorative.
function CraftingShop({profile,serviceAvailable,original,layout,onCraft,back}){
  const ore=profile?.inventory?.sapphireOre||0,tonics=profile?.inventory?.recoveryTonic||0,gold=profile?.gold||0;
  const ready=Boolean(profile&&serviceAvailable),allowed=ready&&ore>=2&&tonics<100000;
  const reason=!ready?'Approach a service marker to craft.':ore<2?'Requires 2 Sapphire Ore.':tonics>=100000?'Inventory limit reached.':'Ready to craft one Recovery Tonic.';
  const recipe=<Btn primary aria-current="true" className="fa-craft-recipe" onClick={()=>document.getElementById('fa-craft-requirements')?.focus()}><ItemArt id="recoveryTonic"/><span>{ITEMS.recoveryTonic.name}</span><small>1 recipe</small></Btn>;
  const requirements=<><div className="fa-craft-material"><ItemArt id="sapphireOre"/><div><strong>Sapphire Ore</strong><small>Required: 2 · Owned: {ore}</small></div><span>{ore>=2?'Ready':'Missing'}</span></div><p>No other ingredients required.</p><p>Gold cost: 0</p></>;
  const output=<><ItemArt id="recoveryTonic"/><div><strong>Recovery Tonic ×1</strong><p>Restores up to {ITEMS.recoveryTonic.heal} HP.</p><small>Owned: {tonics}{allowed?' → '+(tonics+1):''}</small></div></>;
  const confirm=<Btn primary className="fa-craft-confirm" disabled={!allowed} onClick={onCraft}>Craft</Btn>;
  if(original)return <div className="fa-original-craft">
    <h2 className="fa-craft-title">Crafting</h2><div className="fa-craft-gold">{gold} gold</div><div className="fa-craft-ore">{ore} ore</div><Btn className="fa-craft-back" aria-label="Leave crafting" onClick={back}>Back</Btn>
    <nav className="fa-craft-tabs" aria-label="Recipe categories"><Btn aria-current="page" primary onClick={()=>document.getElementById('fa-craft-requirements')?.focus()}>Consumables</Btn>{['Weapons','Armor','Accessories','Materials','Special'].map(label=><Btn key={label} disabled title="No recipes available">{label}</Btn>)}</nav>
    <h3 className="fa-craft-recipes-title">Available recipes</h3><div className="fa-craft-recipe-list">{recipe}<p>Additional recipes unavailable in this build.</p></div>
    <h3 className="fa-craft-output-name">Recovery Tonic</h3><div className="fa-craft-owned">Owned: {tonics}</div><div className="fa-craft-description">Restore up to {ITEMS.recoveryTonic.heal} HP. The original potion illustration represents this recipe.</div>
    <h3 className="fa-craft-requirements-title">Materials</h3><section id="fa-craft-requirements" tabIndex={-1} className="fa-craft-requirements" aria-label="Recipe requirements">{requirements}</section>
    <h3 className="fa-craft-result-title">Crafting result</h3><section className="fa-craft-output" aria-label="Crafted item preview">{output}</section>
    <div className="fa-craft-quantity">Quantity: 1 · Gold: 0</div><div className="fa-craft-status" role="status">{reason}</div>{confirm}
  </div>;
  return <><Panel rect={layout[0]}><h2>Crafting</h2><p>{gold} gold</p><Btn onClick={back}>Back</Btn></Panel><Panel rect={layout[1]}><h2>Recovery Tonic</h2>{requirements}{output}</Panel><Panel rect={layout[2]}><p>{reason}</p>{confirm}</Panel></>;
}

// Sanctuary uses the saved roster's base recovery limits, exactly as recoverParty does.
function SanctuaryRest({profile,service,serviceAvailable,encounter,original,layout,onRest,onSave,onLeave,onRecovery}){
  const max=heroStats(profile).maxHp;
  const companions=profile?ROSTER.filter(m=>memberFor(profile,m.id).recruited).map(m=>({...m,hp:memberFor(profile,m.id).hp,active:memberFor(profile,m.id).active})):[];
  const members=profile?[{id:'hero',name:profile.name,hp:profile.hp,maxHp:max,active:true},...companions]:[];
  const missing=members.reduce((sum,m)=>sum+Math.max(0,m.maxHp-m.hp),0);
  const ready=Boolean(profile&&serviceAvailable&&!encounter),allowed=ready&&(profile.hp<max||partyNeedsRest(profile));
  const reason=!ready?'Approach a registered service point.':allowed?'Rest to restore all recruited party members.':'The entire recruited party is at full health.';
  const cards=members.map(m=><div className="fa-sanctuary-card" key={m.id}><div className="fa-sanctuary-portrait">{m.id==='hero'?<ArcherPortrait profile={profile} small/>:<ArcherPortrait companion={m} small/>}</div><strong>{m.name}</strong><small>{m.active?'Active':'Reserve'}</small><progress aria-label={m.name+' health'} value={m.hp} max={m.maxHp}/><small>{m.hp}/{m.maxHp} → {m.maxHp}</small></div>);
  const rows=<><div><span>Leader recovery</span><strong>+{profile?Math.max(0,max-profile.hp):0} HP</strong></div><div><span>Companion recovery</span><strong>+{companions.reduce((sum,m)=>sum+Math.max(0,m.maxHp-m.hp),0)} HP</strong></div><div><span>Rest cost</span><strong>0 gold</strong></div><div><span>Recovery tonics consumed</span><strong>0</strong></div></>;
  const rest=<Btn primary className="fa-sanctuary-rest" disabled={!allowed} onClick={onRest}>Rest Now</Btn>;
  const save=<Btn disabled={!profile||Boolean(encounter)} onClick={onSave}>Save</Btn>;
  if(original)return <div className="fa-original-sanctuary">
    <h2 className="fa-sanctuary-title">Sanctuary</h2><div className="fa-sanctuary-gold">{profile?.gold||0} gold</div><div className="fa-sanctuary-place">{service?.label||'Not at a sanctuary'}</div>
    <nav className="fa-sanctuary-nav" aria-label="Sanctuary actions"><Btn disabled={!allowed} onClick={onRest}>Recover Party</Btn><Btn disabled={!profile||Boolean(encounter)||!profile.inventory.recoveryTonic} onClick={onRecovery}>Recovery Tonic</Btn>{save}<Btn onClick={onLeave}>Leave</Btn></nav>
    <h3 className="fa-sanctuary-overview">Rest &amp; Recovery</h3><p className="fa-sanctuary-description">{reason}</p><div className="fa-sanctuary-rows">{rows}</div>
    <h3 className="fa-sanctuary-total-title">Recovery preview</h3><div className="fa-sanctuary-summary"><div><strong>{missing} HP</strong><small>Total missing</small></div><div><strong>{members.length}</strong><small>Party &amp; reserves</small></div><div><strong>Free</strong><small>Rest cost</small></div></div>
    <h3 className="fa-sanctuary-party-title">Recruited party</h3><section className="fa-sanctuary-party" aria-label="Party recovery preview">{cards}{!members.length&&<p>No active profile</p>}</section>{rest}
  </div>;
  return <><Panel rect={layout[0]}><h2>Sanctuary</h2><p>{service?.label||'Not at a sanctuary'}</p></Panel><Panel rect={layout[1]}>{cards}</Panel><Panel rect={layout[2]}>{rows}<p>{reason}</p>{rest}{save}<Btn disabled={!profile||Boolean(encounter)||!profile.inventory.recoveryTonic} onClick={onRecovery}>Recovery Tonic</Btn></Panel><Panel rect={layout[3]}><Btn onClick={onLeave}>Leave</Btn></Panel></>;
}

// Consumable recovery uses the same item definition and heal transaction as inventory.
function ConsumableRecovery({profile,encounter,original,layout,onRecover,back}){
  const max=heroStats(profile).maxHp,hp=profile?.hp||0,owned=profile?.inventory?.recoveryTonic||0;
  const potency=ITEMS.recoveryTonic.heal,next=Math.min(max,hp+potency),amount=Math.max(0,next-hp);
  const allowed=Boolean(profile&&!encounter&&owned>0&&amount>0);
  const locked=useRef(false);
  const reason=!profile?'No active character.':encounter?'Recovery is not available during combat.':!owned?'No Recovery Tonics owned.':amount===0?'Health is already full.':'Ready to consume one Recovery Tonic.';
  const recover=()=>{if(!allowed||locked.current)return;locked.current=true;if(!onRecover(hp,owned))locked.current=false;};
  const preview=<><p>Current HP: {hp}/{max}</p><progress aria-label="Current health" value={hp} max={max}/><p>After recovery: {next}/{max}</p><progress aria-label="Health after one tonic" value={next} max={max}/><p>HP restored: +{amount}</p></>;
  const rows=[['Recovery Tonic','Owned: '+owned],['Health restoration','Up to '+potency+' HP'],['Consumption','1 tonic'],['Gold cost','0 gold'],['Recipient',profile?.name||'No character']];
  const confirm=<Btn primary className="fa-recovery-confirm" disabled={!allowed} onClick={recover}>Confirm Recovery</Btn>;
  if(original)return <div className="fa-original-recovery">
    <h2 className="fa-recovery-title">Healing &amp; Recovery</h2><div className="fa-recovery-kicker">Consumable recovery</div>
    <h3 className="fa-recovery-options-title">Recovery details</h3>
    <section className="fa-recovery-options" aria-label="Recovery details">{rows.map(([label,value],i)=><div key={label} className={i===0?'selected':''}><strong>{label}</strong><span>{value}</span></div>)}</section>
    <h3 className="fa-recovery-health-title">{profile?.name||'Current character'}</h3>
    <section className="fa-recovery-health">{preview}</section>
    <h3 className="fa-recovery-effects-title">Recovery preview</h3><section className="fa-recovery-effects"><div><span>HP restored</span><strong>+{amount}</strong></div><div><span>Tonics remaining</span><strong>{owned} → {allowed?owned-1:owned}</strong></div><div><span>Gold consumed</span><strong>0</strong></div></section>
    <h3 className="fa-recovery-status-title">Availability</h3><div className="fa-recovery-status" role="status">{reason}</div>
    {confirm}<Btn className="fa-recovery-back" onClick={back}>Back</Btn>
  </div>;
  return <><Panel rect={layout[0]}><h2>Current health</h2>{preview}</Panel><Panel rect={layout[1]}><h2>Recovery Tonic</h2><ItemArt id="recoveryTonic"/>{rows.map(([label,value])=><p key={label}>{label}: {value}</p>)}</Panel><Panel rect={layout[2]}><p>{reason}</p>{confirm}<Btn onClick={back}>Back</Btn></Panel></>;
}

// Compare only owned gear using the same equipment validation as the equip transaction.
function EquipmentComparison({profile,encounter,initialItem,initialWearer,original,layout,onEquip,back,go}){
 const [wearerId,setWearer]=useState(initialWearer||'hero'),[selectedId,setSelected]=useState(initialItem),[filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[pageIndex,setPage]=useState(0);
 const members=profile?[{id:'hero',name:profile.name},...ROSTER.filter(m=>memberFor(profile,m.id).recruited)]:[];
 const wearer=members.some(m=>m.id===wearerId)?wearerId:'hero',inv=profile?.inventory||{};
 const matches=Object.entries(ITEMS).filter(([id,i])=>inv[id]>0&&(i.kind==='gear'||(i.kind==='weapon'&&wearer==='hero'))&&(filter==='all'||i.kind===filter||i.slot===filter)&&i.name.toLowerCase().includes(query.trim().toLowerCase()));
 const pages=Math.max(1,Math.ceil(matches.length/12)),index=Math.min(pageIndex,pages-1),visible=matches.slice(index*12,index*12+12);
 const selected=visible.find(([id])=>id===selectedId)||visible[0],id=selected?.[0],item=selected?.[1];
 const slot=item?.kind==='gear'?item.slot:'weapon';
 const currentId=profile?(slot==='weapon'?(wearer==='hero'?profile.equipped:null):gearFor(profile,wearer)[slot]):null;
 const result=profile&&item?(item.kind==='gear'?gearComparison(profile,wearer,id):comparison(profile,id)):null;
 const before=profile?memberStats(profile,wearer):null,after=result?.candidate;
 const allowed=Boolean(profile&&!encounter&&result&&id!==currentId);
 const reason=!profile?'No active character.':encounter?'Equipment changes are disabled during battle.':!item?'Select owned equipment.':id===currentId?'Already equipped.':item.kind==='gear'&&!gearEligible(profile,id)?'Requires party level '+item.requiredLevel+'.':!result?'No available copy for this wearer.':'Equip the selected item.';
 const fields=[['Attack','atk'],['Defense','def'],['Speed','spd'],['Max HP','maxHp']];
 const stats=(values)=>fields.map(([label,key])=><div key={key}><span>{label}</span><strong>{values?.[key]??'—'}</strong></div>);
 const reset=()=>{setPage(0);setSelected(null);};
 const cards=visible.map(([key,i])=><Btn key={key} className="fa-compare-card" primary={key===id} aria-pressed={key===id} title={i.name+' · Owned '+inv[key]} aria-label={i.name+' · Owned '+inv[key]} onClick={()=>setSelected(key)}><ItemArt id={key}/><small>×{inv[key]}</small></Btn>);
 const filters=[['all','All'],['weapon','Weapons'],['armor','Armor'],['mantle','Mantles']].map(([key,label])=><Btn key={key} aria-pressed={filter===key} onClick={()=>{setFilter(key);reset();}}>{label}</Btn>);
 const pick=<select aria-label="Equipment wearer" value={wearer} onChange={e=>{setWearer(e.target.value);reset();}}>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>;
 const search=<input aria-label="Search owned equipment" placeholder="Search" value={query} onChange={e=>{setQuery(e.target.value);reset();}}/>;
 const paging=<><Btn disabled={!index} onClick={()=>setPage(index-1)} aria-label="Previous equipment">‹</Btn><span>{index+1}/{pages}</span><Btn disabled={index>=pages-1} onClick={()=>setPage(index+1)} aria-label="Next equipment">›</Btn></>;
 const deltas=fields.map(([label,key])=>{const delta=after&&before?after[key]-before[key]:null;return <div key={key}><span>{label}</span><strong className={delta>0?'up':delta<0?'down':''}>{delta==null?'—':delta>0?'+'+delta:delta}</strong></div>;});
 const equip=<Btn primary className="fa-compare-equip" disabled={!allowed} onClick={()=>onEquip(wearer,id,currentId)}>Equip</Btn>;
 if(original)return <div className="fa-original-compare">
  <h2 className="fa-compare-title">Equipment Comparison</h2><div className="fa-compare-gold">{profile?.gold||0}</div>
  <div className="fa-compare-wearer">{pick}</div><div className="fa-compare-search">{search}</div><nav className="fa-compare-filters" aria-label="Equipment filters">{filters}</nav>
  <section className="fa-compare-grid" aria-label="Owned equipment">{cards}{!visible.length&&<p>No matching gear</p>}</section><div className="fa-compare-pages">{paging}</div>
  <h3 className="fa-compare-current-label">Equipped</h3><h3 className="fa-compare-candidate-label">Selected</h3>
  <div className="fa-compare-current-icon">{currentId&&<ItemArt id={currentId}/>}</div><div className="fa-compare-current-name"><strong>{ITEMS[currentId]?.name||'Empty slot'}</strong>{slot==='weapon'&&currentId&&<small>Enhancement +{profile?.enhancements?.[currentId]||0}</small>}</div>
  <div className="fa-compare-candidate-icon">{id&&<ItemArt id={id}/>}</div><div className="fa-compare-candidate-name"><strong>{item?.name||'Select gear'}</strong>{slot==='weapon'&&id&&<small>Enhancement +{profile?.enhancements?.[id]||0}</small>}</div>
  <section className="fa-compare-current-stats" aria-label="Current character statistics">{stats(before)}</section><section className="fa-compare-candidate-stats" aria-label="Projected character statistics">{stats(after)}</section>
  <div className="fa-compare-current-detail"><p>Wearer: {members.find(m=>m.id===wearer)?.name||'—'}</p><p>Slot: {slot}</p><p>Current equipment remains equipped until confirmed.</p>{activeGearSet(profile,wearer)&&<p>Active set: {activeGearSet(profile,wearer).name}</p>}</div>
  <div className="fa-compare-candidate-detail"><p>Owned: {inv[id]||0}</p>{gearMetadata(id)&&<p>{gearMetadata(id)}</p>}{item?.kind==='gear'&&<p>Equipped copies: {profile?gearCount(profile,id):0}</p>}<p>{reason}</p></div>
  <h3 className="fa-compare-delta-title">Stat changes</h3><section className="fa-compare-deltas" aria-label="Stat differences">{deltas}</section>
  {equip}<Btn className="fa-compare-back" onClick={back}>Back</Btn><Btn className="fa-compare-inventory" onClick={()=>go('06')}>Equipment</Btn><Btn className="fa-compare-items" onClick={()=>go('21')}>Items</Btn>
 </div>;
 return <><Panel rect={layout[0]}>{pick}{search}{filters}{cards}{paging}</Panel><Panel rect={layout[1]}><h2>Equipped</h2><p>{ITEMS[currentId]?.name||'Empty slot'}</p>{stats(before)}</Panel><Panel rect={layout[2]}><h2>Selected</h2><p>{item?.name||'Select gear'}</p>{gearMetadata(id)&&<p>{gearMetadata(id)}</p>}{stats(after)}</Panel><Panel rect={layout[3]}>{deltas}<p>{reason}</p>{equip}<Btn onClick={back}>Back</Btn></Panel></>;
}

// Inventory is a read-only catalog of owned items; use and equip delegate to their guarded screens.
function ItemInventory({profile,encounter,serviceAvailable,original,layout,initialItem,onSelect,go,back}){
  const [selectedId,setSelected]=useState(initialItem),[filter,setFilter]=useState('all'),[sort,setSort]=useState('name'),[query,setQuery]=useState(''),[pageIndex,setPage]=useState(0);
  const inv=profile?.inventory||{}, categories=[['all','All items'],['consumable','Consumables'],['material','Materials'],['weapon','Weapons'],['armor','Armor'],['mantle','Mantles']];
  const owned=Object.entries(ITEMS).filter(([key])=>(inv[key]||0)>0);
  const matches=owned.filter(([key,i])=>(filter==='all'||i.kind===filter||i.slot===filter)&&i.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>sort==='count'?inv[b[0]]-inv[a[0]]||a[1].name.localeCompare(b[1].name):a[1].name.localeCompare(b[1].name));
  const pages=Math.max(1,Math.ceil(matches.length/20)),index=Math.min(pageIndex,pages-1),visible=matches.slice(index*20,index*20+20),selected=visible.find(([key])=>key===selectedId)||visible[0],id=selected?.[0],item=selected?.[1];
  const reset=()=>{setPage(0);setSelected(null);};
  const choose=key=>{setSelected(key);onSelect(key);};
  const changeFilter=key=>{setFilter(key);reset();};
  const filters=categories.map(([key,label])=><Btn key={key} aria-pressed={filter===key} primary={filter===key} onClick={()=>changeFilter(key)}>{label}</Btn>);
  const cards=visible.map(([key,i])=><Btn key={key} className="fa-item-inv-card" primary={key===id} aria-pressed={key===id} title={i.name+' ×'+inv[key]} aria-label={i.name+' ×'+inv[key]} onClick={()=>choose(key)}><ItemArt id={key}/><small>×{inv[key]}</small></Btn>);
  const paging=<><Btn disabled={index===0} aria-label="Previous items" onClick={()=>setPage(index-1)}>‹</Btn><span>{index+1} / {pages}</span><Btn disabled={index>=pages-1} aria-label="Next items" onClick={()=>setPage(index+1)}>›</Btn></>;
  const category=<select aria-label="Item category" value={filter} onChange={e=>changeFilter(e.target.value)}>{categories.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>;
  const sorting=<select aria-label="Sort items" value={sort} onChange={e=>{setSort(e.target.value);reset();}}><option value="name">Name</option><option value="count">Quantity</option></select>;
  const search=<input aria-label="Search owned items" placeholder="Search items" value={query} onChange={e=>{setQuery(e.target.value);reset();}}/>;
  const equipment=item?.kind==='weapon'||item?.kind==='gear',tonic=id==='recoveryTonic',material=item?.kind==='material',hpMax=heroStats(profile).maxHp;
  const enabled=Boolean(profile&&!encounter&&item&&(equipment||(tonic&&profile.hp<hpMax)||(material&&serviceAvailable)));
  const reason=!item?'Select an owned item.':encounter?'Item use and equipment changes are disabled during battle.':tonic&&profile.hp>=hpMax?'Health is already full.':material&&!serviceAvailable?'Visit a service marker to craft.':equipment?'Inspect the equipment comparison before equipping.':tonic?'Review recovery before consuming one tonic.':material?'View available recipes.':'No available action.';
  const use=()=>{if(!enabled)return;onSelect(id);go(tonic?'46':equipment?'39':'22');};
  const details=item?<><p>Category: {item.kind==='gear'?item.slot:item.kind}</p>{gearMetadata(id)&&<p>{gearMetadata(id)}</p>}<p>Owned: {inv[id]}</p>{item.heal!=null&&<p>Restores up to {item.heal} HP</p>}{item.atk!=null&&<p>Attack: +{item.atk}</p>}{item.def!=null&&<p>Defense: +{item.def}</p>}{item.spd!=null&&<p>Speed: +{item.spd}</p>}<p>Sell value: {item.sell||0} gold</p></>:<p>No item selected.</p>;
  const action=<Btn primary className="fa-item-inv-use" disabled={!enabled} onClick={use}>{tonic?'Use Tonic':equipment?'Compare':material?'Crafting':'Use Item'}</Btn>;
  if(original)return <div className="fa-original-item-inv">
    <h2 className="fa-item-inv-title">Inventory</h2>
    <nav className="fa-item-inv-top" aria-label="Inventory navigation"><Btn onClick={()=>go('16')} aria-label="Merchant" disabled={!serviceAvailable}>Merchant</Btn><Btn onClick={()=>go('11')}>Party</Btn><Btn onClick={()=>go('08')}>Journal</Btn><Btn onClick={()=>go('03')}>Settings</Btn><Btn onClick={back} aria-label="Close inventory">×</Btn></nav>
    <nav className="fa-item-inv-tabs" aria-label="Item categories">{filters}</nav>
    <h3 className="fa-item-inv-filter-title">Categories</h3><nav className="fa-item-inv-filters" aria-label="Filter owned items">{filters}<Btn onClick={()=>go('06')}>Equipment</Btn></nav>
    <div className="fa-item-inv-category">{category}</div><div className="fa-item-inv-sort">{sorting}</div><div className="fa-item-inv-search">{search}</div>
    <section className="fa-item-inv-grid" aria-label="Owned items">{cards}{!visible.length&&<p>No matching owned items</p>}</section><div className="fa-item-inv-pages">{paging}</div>
    <h3 className="fa-item-inv-detail-title">Selected Item</h3><div className="fa-item-inv-art">{id&&<ItemArt id={id}/>}</div><div className="fa-item-inv-name"><strong>{item?.name||'No item selected'}</strong><small>{item?'Owned ×'+inv[id]:''}</small></div>
    <section className="fa-item-inv-details" aria-label="Item properties">{details}</section>
    <div className="fa-item-inv-status" role="status">{reason}</div><div className="fa-item-inv-total">{owned.length} item types · {profile?.gold||0} gold</div>
    {action}<Btn className="fa-item-inv-back" onClick={back}>Back</Btn>
  </div>;
  return <><Panel rect={layout[0]}><h2>Inventory</h2>{category}{sorting}{search}{filters}<Btn onClick={()=>go('06')}>Equipment</Btn><Btn onClick={back}>Back</Btn></Panel><Panel rect={layout[1]}>{cards}{!visible.length&&<p>No matching owned items</p>}{paging}</Panel><Panel rect={layout[2]}><h2>{item?.name||'Select an item'}</h2>{details}<p>{reason}</p>{action}</Panel></>;
}

// Bestiary lists actual world encounter records. Original wolf artwork is decorative, not an enemy record.
function Bestiary({profile,world,original,layout,go,back}){
  const [filter,setFilter]=useState('all'),[selectedId,setSelected]=useState(null),[pageIndex,setPage]=useState(0);
  const completed=profile?.world.completedEncounters||[];
  const entries=(world?.encounters||[]).filter(e=>e&&typeof e.id==='string'&&typeof e.label==='string');
  const defeated=e=>Boolean(e.completed||completed.includes(e.id));
  const matches=entries.filter(e=>filter==='all'||(filter==='defeated'?defeated(e):filter==='remaining'?!defeated(e):e.category===filter));
  const pages=Math.max(1,Math.ceil(matches.length/12)),index=Math.min(pageIndex,pages-1),visible=matches.slice(index*12,index*12+12);
  const selected=visible.find(e=>e.id===selectedId)||visible[0];
  const lead=selected?enemyFormation(selected,1)[0]:null;
  const categories=[['all','All encounters'],['Normal','Normal'],['Elite','Elite'],['Boss','Bosses'],['defeated','Defeated'],['remaining','Remaining']];
  const filters=categories.map(([key,label])=><Btn key={key} primary={filter===key} aria-pressed={filter===key} onClick={()=>{setFilter(key);setPage(0);setSelected(null);}}>{label}</Btn>);
  const cards=visible.map(e=>{const unit=enemyFormation(e,1)[0];return <Btn key={e.id} className="fa-bestiary-card" primary={selected?.id===e.id} aria-pressed={selected?.id===e.id} aria-label={e.label+' · '+(defeated(e)?'Defeated':'Not defeated')} title={e.label} onClick={()=>setSelected(e.id)}><EnemyPortrait enemy={unit} small/><span>{e.label}</span>{defeated(e)&&<small>✓</small>}</Btn>;});
  const paging=<><Btn disabled={!index} onClick={()=>setPage(index-1)} aria-label="Previous enemies">‹</Btn><span>{index+1} / {pages}</span><Btn disabled={index>=pages-1} onClick={()=>setPage(index+1)} aria-label="Next enemies">›</Btn></>;
  const stats=lead?[['HP',lead.maxHp],['Attack',lead.atk],['Defense',lead.def],['Speed',lead.spd]]:[];
  const statsRows=stats.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>);
  const tactic=lead?tacticFor(lead.strategy,lead.archetype):'Explore the world to view encounter records.';
  const status=selected?(defeated(selected)?'Defeated':'Not yet defeated'):'No selected encounter';
  const activeSize=profile?1+activeRoster(profile).length:1;
  const formation=selected?enemyFormation(selected,activeSize):[];
  const formationRows=formation.map(unit=><div className="fa-bestiary-formation-member" key={unit.id}><EnemyPortrait enemy={unit} small/><span>{unit.name}</span></div>);
  const navigation=<><Btn onClick={()=>go('29')}>World Codex</Btn><Btn onClick={back}>Back</Btn></>;
  if(original)return <div className="fa-original-bestiary">
    <h2 className="fa-bestiary-title">Bestiary</h2>
    <nav className="fa-bestiary-nav" aria-label="Encounter filters and navigation">{filters}{navigation}</nav>
    <div className="fa-bestiary-count">{matches.length} encounters</div>
    <section className="fa-bestiary-grid" aria-label="World encounters">{cards}{!visible.length&&<p>No matching encounters</p>}</section>
    <div className="fa-bestiary-pages">{paging}</div>
    <span className="fa-bestiary-cover-label">Original cover illustration</span>
    <h3 className="fa-bestiary-notes-title">Combat notes</h3><div className="fa-bestiary-notes"><p>{tactic}</p><small>Base stats are for one party member; actual formation scales with party size.</small></div>
    <div className="fa-bestiary-detail-title"><h3>{selected?.label||'Select an encounter'}</h3><small>{selected?.category||'—'} · {status}</small></div>
    <div className="fa-bestiary-portrait">{lead&&<EnemyPortrait enemy={lead}/>}</div><div className="fa-bestiary-record"><span>{lead?'Recorded enemy profile':'No enemy selected'}</span><small>{status}</small></div>
    <h3 className="fa-bestiary-stats-title">Base statistics</h3><section className="fa-bestiary-stats" aria-label="Base enemy statistics">{statsRows}</section>
    <div className="fa-bestiary-type"><span>{selected?.category||'—'}</span><span>{lead?.archetype||'—'}</span></div>
    <h3 className="fa-bestiary-tactic-title">Tactics</h3><div className="fa-bestiary-tactic">{lead?.strategy||'—'}</div>
    <h3 className="fa-bestiary-status-title">Progress</h3><div className="fa-bestiary-status">{status}</div>
    <h3 className="fa-bestiary-formation-title">Formation preview</h3><section className="fa-bestiary-formation" aria-label="Enemy formation preview">{formationRows}</section>
    <p className="fa-bestiary-disclaimer">No drop tables or elemental weaknesses are defined here.</p>
  </div>;
  return <><Panel rect={layout[0]}><h2>Bestiary</h2>{filters}{navigation}</Panel><Panel rect={layout[1]}>{cards}{!visible.length&&<p>No matching encounters.</p>}{paging}</Panel><Panel rect={layout[2]}><h2>{selected?.label||'Select an encounter'}</h2><p>{status}</p>{lead&&<EnemyPortrait enemy={lead}/>}<section>{statsRows}</section><p>{tactic}</p><p>Base stats; formation scales with party size.</p>{formationRows}<small>No drop tables or elemental weaknesses are defined here.</small></Panel></>;
}

// Read-only milestones derived from saved progression; no claimable rewards or new save fields.
function Achievements({profile,original,layout,go,back}){
  const [category,setCategory]=useState('all'),[pageIndex,setPage]=useState(0);
  const regions=profile?.world.visitedRegions.length||0,defeated=profile?.world.completedEncounters.length||0,discoveries=profile?.world.discoveries.length||0;
  const recruited=profile?ROSTER.filter(m=>memberFor(profile,m.id).recruited).length:0;
  const level=profile?levelFor(profile.xp):0,enhanced=Math.max(0,...Object.values(profile?.enhancements||{}));
  const quest=profile?.quests.grove==='claimed'||profile?.quests.grove==='complete'?1:0;
  const records=[
    ['firstVictory','Combat','First Victory','Complete one encounter',defeated,1],
    ['threeVictories','Combat','Battle Tested','Complete three distinct encounters',defeated,3],
    ['groveQuest','Story','Grove Quest','Complete the Grove quest',quest,1],
    ['firstRegion','Exploration','First Steps','Discover one region',regions,1],
    ['threeRegions','Exploration','Pathfinder','Discover three regions',regions,3],
    ['firstDiscovery','Exploration','Curious Traveler','Record one hidden discovery',discoveries,1],
    ['firstCompanion','Characters','A New Ally','Recruit one companion',recruited,1],
    ['secondLevel','Characters','Growing Stronger','Reach character level two',level,2],
    ['firstEnhancement','Crafting & Gear','First Enhancement','Enhance a weapon to +1',enhanced,1],
    ['maxEnhancement','Crafting & Gear','Masterwork','Enhance a weapon to +5',enhanced,5]
  ];
  const done=records.filter(r=>r[4]>=r[5]).length;
  const filtered=records.filter(r=>category==='all'||r[1]===category),pages=Math.max(1,Math.ceil(filtered.length/6)),index=Math.min(pageIndex,pages-1);
  const visible=filtered.slice(index*6,index*6+6);
  const filters=[['all','All milestones'],['Combat','Combat'],['Story','Story'],['Exploration','Exploration'],['Characters','Characters'],['Crafting & Gear','Crafting & Gear']].map(([key,label])=><Btn key={key} primary={category===key} aria-pressed={category===key} onClick={()=>{setCategory(key);setPage(0);}}>{label}</Btn>);
  const navigation=<><Btn onClick={()=>go('24')}>Bestiary</Btn><Btn onClick={()=>go('29')}>World Codex</Btn><Btn onClick={()=>go('05')}>Character</Btn><Btn onClick={back}>Back</Btn></>;
  const rows=visible.map(([id,group,title,description,value,target])=><div className="fa-achievement-row" key={id}><strong className="fa-achievement-name">{title}</strong><div className="fa-achievement-task"><span>{description}</span><progress aria-label={title+' progress'} value={Math.min(value,target)} max={target}/></div><strong className="fa-achievement-value">{Math.min(value,target)}/{target}</strong><span className={'fa-achievement-state '+(value>=target?'complete':'')}>{value>=target?'Complete':'In progress'}</span></div>);
  const pager=<><Btn disabled={index===0} onClick={()=>setPage(index-1)} aria-label="Previous milestones">‹</Btn><span>{index+1} / {pages}</span><Btn disabled={index>=pages-1} onClick={()=>setPage(index+1)} aria-label="Next milestones">›</Btn></>;
  const summary=[['Regions visited',regions],['Encounters cleared',defeated],['Hidden discoveries',discoveries],['Recruited companions',recruited],['Character level',level||'—'],['Best enhancement','+'+enhanced]];
  const summaries=summary.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>);
  const overview=<><strong>{done} / {records.length}</strong><progress aria-label="Overall milestone completion" value={done} max={records.length}/><span>{Math.round(done/records.length*100)}%</span></>;
  if(original)return <div className="fa-original-achievements">
    <h2 className="fa-art-sr">Achievements</h2><nav className="fa-achievement-nav" aria-label="Milestone categories and navigation">{filters}{navigation}</nav>
    <div className="fa-achievement-overall">{overview}</div>
    <section className="fa-achievement-rows" aria-label="Milestone progress">{rows}{!profile&&<p className="fa-art-sr">No active character. Start or load a game to track milestones.</p>}</section>
    <div className="fa-achievement-pages">{pager}</div>
    <h3 className="fa-achievement-summary-title">Saved progression</h3><section className="fa-achievement-summary" aria-label="Saved progression">{summaries}</section>
    <p className="fa-achievement-note">Milestone tracking only. No claimable rewards.</p>
  </div>;
  return <><Panel rect={layout[0]}><h2>Achievements</h2>{filters}{navigation}</Panel><Panel rect={layout[1]}>{overview}{rows}{pager}</Panel><Panel rect={layout[2]}><h2>Saved progression</h2>{summaries}<p>Milestone tracking only. No claimable rewards.</p></Panel></>;
}

// Codex is a read-only archive of known world and saved character records; artwork is illustrative.
function WorldCodex({profile,world,original,layout,go,back}){
  const [category,setCategory]=useState('regions'),[query,setQuery]=useState(''),[selectedId,setSelected]=useState(null),[pageIndex,setPage]=useState(0);
  const visited=profile?.world.visitedRegions||[],completed=profile?.world.completedEncounters||[];
  const regions=(world?.regions||[]).filter(r=>visited.includes(r.id));
  const defeated=(world?.encounters||[]).filter(e=>completed.includes(e.id));
  const companions=profile?ROSTER.filter(m=>memberFor(profile,m.id).recruited):[];
  const inv=profile?.inventory||{};
  const categories=[['regions','Regions'],['factions','Factions'],['creatures','Creatures'],['history','History'],['people','People'],['artifacts','Artifacts'],['mythology','Mythology']];
  const entries={
    regions:regions.map(r=>({id:r.id,name:r.name,summary:'Discovered region recorded in your exploration progress.',details:[['Discovery','Visited'],['World range',Number.isFinite(r.minX)&&Number.isFinite(r.maxX)?r.minX+' – '+r.maxX:'Unavailable'],['Current region',world?.region===r.name?'Yes':'Not confirmed']],note:'This entry is derived from the live world map and saved discoveries.'})),
    factions:[],
    creatures:defeated.map(e=>({id:e.id,name:e.label,summary:'Encounter completed and recorded in your saved progress.',details:[['Category',e.category||'Encounter'],['Status','Defeated']],note:'See the Bestiary for current encounter statistics and combat tactics.'})),
    history:[...(profile&&['active','complete','claimed'].includes(profile.quests.grove)?[{id:'grove',name:'Whispering Grove Spirit',summary:groveStoryState(profile)?.history||'A recorded quest in your journey.',details:[['Quest status',({active:'Active',complete:'Ready to complete',claimed:'Completed'})[profile.quests.grove]],['Encounter',completed.includes('wilds_grove_01')?'Defeated':'Not yet defeated']],note:'See the Quest Journal for the current objective.'}]:[]),...CAMPAIGN_QUESTS.flatMap(q=>{const progress=campaignQuest(profile,q.id);return ['active','complete','claimed'].includes(progress.state)?[{id:q.id,name:q.title,summary:progress.state==='claimed'?q.completion:q.description,details:[['Quest status',({active:'Active',complete:'Ready to complete',claimed:'Completed'})[progress.state]],['Objectives',progress.count+' / '+progress.total]],note:'See the Quest Journal for the current objective.'}]:[];})],
    people:companions.map(m=>({id:m.id,name:m.name,summary:'A recruited companion recorded in your party.',details:[['Recruitment','Recruited'],['Saved health',memberFor(profile,m.id).hp+' / '+m.maxHp]],note:'Manage active companions in Party Formation.'})),
    artifacts:Object.entries(ITEMS).filter(([id,i])=>inv[id]>0&&(i.kind==='gear'||i.kind==='weapon')).map(([id,i])=>({id,name:i.name,summary:'An owned equipment record from your inventory.',details:[['Type',i.slot||i.kind],['Owned',inv[id]],['Sell value',i.sell||0]],note:'Use Inventory or Equipment Comparison for item management.'})),
    mythology:[]
  };
  const matches=entries[category].filter(e=>e.name.toLowerCase().includes(query.trim().toLowerCase()));
  const pages=Math.max(1,Math.ceil(matches.length/8)),index=Math.min(pageIndex,pages-1),visible=matches.slice(index*8,index*8+8);
  const selected=visible.find(e=>e.id===selectedId)||visible[0];
  const selectCategory=key=>{setCategory(key);setQuery('');setPage(0);setSelected(null);};
  const tabs=categories.map(([key,label])=><Btn key={key} primary={category===key} aria-pressed={category===key} onClick={()=>selectCategory(key)}><span className={original&&key!=='regions'?'fa-art-sr':''}>{label}</span></Btn>);
  const search=<input aria-label="Search codex records" placeholder="Search records..." value={query} onChange={e=>{setQuery(e.target.value);setPage(0);setSelected(null);}}/>;
  const list=visible.map(e=><Btn key={e.id} primary={selected?.id===e.id} aria-pressed={selected?.id===e.id} onClick={()=>setSelected(e.id)}>{e.name}</Btn>);
  const pager=<><Btn aria-label="Previous records" disabled={index===0} onClick={()=>setPage(index-1)}>‹</Btn><span>{index+1}/{pages}</span><Btn aria-label="Next records" disabled={index>=pages-1} onClick={()=>setPage(index+1)}>›</Btn></>;
  const summary=selected?.summary||(!profile?'Start or load a character to see your records.':category==='factions'||category==='mythology'?'No authored entries available in this category.':query?'No records match your search.':'No records available in this category yet.');
  const details=selected?.details.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>);
  const note=selected?.note||'Story and lore entries will appear when authored. No new lore has been inferred.';
  const navigation=[['07','World Map'],['24','Bestiary'],['08','Quest Journal']];
  const related=navigation.map(([id,label])=><Btn key={id} onClick={()=>go(id)}>{label}</Btn>);
  if(original)return <div className="fa-original-codex">
    <h2 className="fa-art-sr">World Codex</h2><Btn className="fa-codex-back" aria-label="Back" onClick={back}><span className="fa-art-sr">Back</span></Btn>
    <nav className="fa-codex-tabs" aria-label="Codex categories">{tabs}</nav>
    <div className="fa-codex-search">{search}</div><section className="fa-codex-list" aria-label="Known records">{list}{!visible.length&&<p>No records</p>}</section>
    <div className="fa-codex-pager">{pager}</div>
    <div className="fa-codex-title"><strong>{selected?.name||categories.find(c=>c[0]===category)?.[1]}</strong><small>{matches.length} known records</small></div>
    <span className="fa-codex-art-label">Original world illustration · not a live location view</span>
    <div className="fa-codex-overview">{summary}</div><section className="fa-codex-details" aria-label="Record details">{details}</section>
    <div className="fa-codex-note">{note}</div><div className="fa-codex-counts"><span>{visited.length} visited</span><span>{completed.length} cleared</span></div>
    <nav className="fa-codex-related" aria-label="Related game screens">{related}</nav>
  </div>;
  return <><Panel rect={layout[0]}><h2>World Codex</h2>{tabs}<Btn onClick={back}>Back</Btn></Panel><Panel rect={layout[1]}>{search}{list}{!visible.length&&<p>No records</p>}{pager}</Panel><Panel rect={layout[2]}><h2>{selected?.name||'No record selected'}</h2><p>{summary}</p>{details}<p>{note}</p>{related}</Panel></>;
}

// Tutorial describes implemented controls and launches the existing non-reward practice encounter.
const TUTORIAL_LESSONS=[
 {name:'Getting Started',intro:'Create or load a local character, then explore.',steps:[['Create a character','Choose a name and appearance in Character Creation.'],['Enter the world','Select the character and enter the exploration area.'],['Follow the journal','Open the quest journal to review the Grove objective.'],['Save your progress','Open Save Game to choose a local save slot.']],controls:['C — Character','L — Quest Journal','Esc — Pause / back'],tips:['Your guest save is stored locally.','Practice does not award progression.']},
 {name:'Movement & Exploration',intro:'Explore using keyboard or on-screen movement controls.',steps:[['Move','Use W, A, S, D or the on-screen movement controls.'],['Sprint','Hold Shift or the Run control.'],['Jump','Press Space or the Jump control.'],['Interact','Approach a service marker and press E.']],controls:['W A S D — Move','Shift — Sprint','Space — Jump','E — Interact','M — World Map'],tips:['Discovered regions are recorded in your save.','Fast travel requires a discovered destination.']},
 {name:'Combat Basics',intro:'Choose actions for living allies, then watch the round resolve.',steps:[['Read enemy intent','Check the displayed enemy intentions before choosing an action.'],['Choose a legal action','Use the combat buttons or the displayed hotkeys.'],['Resolve the round','Once all living allies have chosen, actions resolve by priority and speed.'],['Review the outcome','Watch health, Focus and the next round’s legal actions.']],controls:['1 — Quick Shot','2 — Radiant Shot','3 — Triple Volley','4 / G — Guard'],tips:['Focus and learned abilities determine legal actions.','Enemy and ally health determine victory or defeat.']},
 {name:'Skills & Arts',intro:'Build and spend Focus using actual archer abilities.',steps:[['Quick Shot',ACTIONS.quickShot.summary],['Radiant Shot',ACTIONS.chargedShot.summary],['Triple Volley',ACTIONS.volley.summary],['Guard',ACTIONS.guard.summary]],controls:['K — Skillbook','1–4 — Combat actions','G — Guard'],tips:['The practice encounter exposes the archer action set.','Normal battles use learned abilities.']},
 {name:'Party & Formation',intro:'Manage recruited companions outside battle.',steps:[['Recruit a companion','Use the recruitment screen when the required encounter is complete.'],['Open Party Formation','Review recruited members and their active or reserve status.'],['Choose your formation','Configure available members before the next encounter.'],['Read ally actions','Each living active ally chooses its legal action during combat.']],controls:['Pause → Party','Party → Recruitment','Esc — Back'],tips:['Reserve companions are not active fighters.','Enemy formations can scale with party size.']},
 {name:'Enemy Tactics',intro:'Use enemy information instead of unsupported elemental affinities.',steps:[['Read the Bestiary','Review actual encounter records and tactics.'],['Inspect enemy category','Normal, Elite and Boss encounters use different attributes.'],['Check the intent','Read the enemy’s displayed intention before selecting an action.'],['Adjust your defense','Use Guard when a heavy attack is expected.']],controls:['Pause → Bestiary','Combat HUD — Enemy intent','4 / G — Guard'],tips:['Boss tactics can change with health.','Elemental affinity rules are not implemented in this build.']},
 {name:'Health & Guard',intro:'Manage health and defensive actions.',steps:[['Check health','Use the live HP bar to monitor remaining health.'],['Build Focus safely',ACTIONS.guard.summary],['Use stronger attacks','Spend Focus only when the action is available.'],['Recover outside battle','Use a tonic or rest at a sanctuary to restore health.']],controls:['4 / G — Guard','Pause → Items','Esc — Back'],tips:['Guard applies for the current round.','The item recovery screen is disabled during combat.']},
 {name:'Items & Recovery',intro:'Use owned items and visit available services.',steps:[['Inspect inventory','Open Items to review owned quantities and item properties.'],['Use a Recovery Tonic','Preview capped health restoration before confirming one tonic.'],['Craft a tonic','At a service point, use two Sapphire Ore to craft one tonic.'],['Rest at a sanctuary','Restore the recruited party without consuming a tonic.']],controls:['I — Equipment','Pause → Items','E — Service interaction'],tips:['Equipment comparison previews actual stats.','Full-health characters cannot waste a recovery tonic.']},
 {name:'Tips & Progression',intro:'Track real progression and prepare for tougher encounters.',steps:[['Review attributes','Open Character to see earned attribute points.'],['Check abilities','Use Skillbook to review available skills.'],['Improve equipment','Use the Blacksmith to enhance your equipped bow up to +5.'],['Review progress','Achievements and the Codex display recorded milestones.']],controls:['C — Character','K — Skillbook','I — Equipment','M — Map'],tips:['Practice awards no XP, gold or items.','Save before challenging a difficult encounter.']}
];
function InteractiveTutorial({profile,running,encounter,lesson,onLesson,original,layout,onPractice,back}){
 const index=Math.max(0,Math.min(TUTORIAL_LESSONS.length-1,lesson||0)),entry=TUTORIAL_LESSONS[index];
 const allowed=Boolean(profile&&running&&!encounter);
 const links=TUTORIAL_LESSONS.map((l,i)=><Btn key={l.name} primary={i===index} aria-pressed={i===index} onClick={()=>onLesson(i)}>{l.name}</Btn>);
 const steps=entry.steps.map(([name,description],i)=><div key={name} className="fa-tutorial-step"><strong>{name}</strong><p>{description}</p></div>);
 const controls=entry.controls.map(c=><p key={c}>{c}</p>),tips=entry.tips.map(t=><p key={t}>{t}</p>);
 const reason=allowed?'Practice uses the existing battle system with no progression rewards.':encounter?'Finish the current encounter before practicing.':'Enter the world with a character to unlock practice.';
 const practice=<Btn primary className="fa-tutorial-practice" disabled={!allowed} title={reason} onClick={onPractice}>Practice Combat</Btn>;
 const previous=<Btn className="fa-tutorial-prev" onClick={()=>onLesson(index-1)} disabled={index===0}>Previous</Btn>;
 const next=<Btn className="fa-tutorial-next" onClick={()=>onLesson(index+1)} disabled={index===TUTORIAL_LESSONS.length-1}>Next</Btn>;
 if(original)return <div className="fa-original-tutorial">
   <h2 className="fa-tutorial-title">Tutorial</h2><div className="fa-tutorial-tagline">Learn the essentials of your adventure.</div>
   <nav className="fa-tutorial-nav" aria-label="Tutorial lessons">{links}</nav>
   <h3 className="fa-tutorial-lesson">{entry.name}</h3><p className="fa-tutorial-intro">{entry.intro}</p>
   <section className="fa-tutorial-steps" aria-label="Lesson steps">{steps}</section>
   <h3 className="fa-tutorial-controls-title">Controls</h3><section className="fa-tutorial-controls" aria-label="Lesson controls">{controls}</section>
   <h3 className="fa-tutorial-tips-title">Quick Tips</h3><section className="fa-tutorial-tips" aria-label="Lesson tips">{tips}<p role="status">{reason}</p></section>
   {practice}{previous}{next}<span className="fa-tutorial-progress">{index+1} / {TUTORIAL_LESSONS.length}</span><Btn className="fa-tutorial-close" onClick={back}>Close</Btn>
 </div>;
 return <><Panel rect={layout[0]}><h2>Tutorial</h2>{links}<Btn onClick={back}>Close</Btn></Panel><Panel rect={layout[1]}><h2>{entry.name}</h2><p>{entry.intro}</p>{steps}</Panel><Panel rect={layout[2]}><h3>Controls</h3>{controls}<h3>Quick Tips</h3>{tips}<p>{reason}</p>{practice}</Panel><Panel rect={layout[3]}>{previous}<span>{index+1} / {TUTORIAL_LESSONS.length}</span>{next}</Panel></>;
}

// Local session history: no server feed, simulated multiplayer activity or persisted messages.
const NOTICE_CATEGORIES=[['all','All Notifications','✦'],['exploration','Exploration','◇'],['combat','Combat','⚔'],['activity','Player Activity','●'],['system','System','⚙'],['rewards','Rewards','✧']];
function GlobalNotifications({notifications,original,layout,back}){
 const [filter,setFilter]=useState('all'),[pageIndex,setPage]=useState(0);
 const matches=notifications.filter(n=>filter==='all'||(n.category||'system')===filter),pages=Math.max(1,Math.ceil(matches.length/5)),index=Math.min(pageIndex,pages-1),visible=matches.slice(index*5,index*5+5);
 const nav=NOTICE_CATEGORIES.map(([key,label])=><Btn key={key} primary={key===filter} aria-pressed={key===filter} onClick={()=>{setFilter(key);setPage(0);}}>{label}</Btn>);
 const rows=visible.map((n,i)=>{const category=NOTICE_CATEGORIES.find(c=>c[0]===(n.category||'system'))||NOTICE_CATEGORIES[4];return <article key={n.time+'-'+i} className="fa-notification-row"><span className="fa-notification-icon" aria-hidden="true">{category[2]}</span><div className="fa-notification-message"><strong>{category[1]}</strong><p>{n.message}</p></div><time dateTime={new Date(n.time).toISOString()}>{new Date(n.time).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</time></article>;});
 const paging=<><Btn disabled={index===0} aria-label="Previous notifications" onClick={()=>setPage(index-1)}>‹</Btn><span>{index+1}/{pages}</span><Btn disabled={index>=pages-1} aria-label="Next notifications" onClick={()=>setPage(index+1)}>›</Btn></>;
 if(original)return <div className="fa-original-notifications"><h2 className="fa-art-sr">Global Notifications</h2><p className="fa-notification-scope">Local session events</p><nav className="fa-notification-nav" aria-label="Event categories">{nav}</nav><div className="fa-notification-count">{matches.length} events · latest 40 retained</div><section className="fa-notification-list" aria-label="Recent gameplay events">{rows}{!visible.length&&<p className="fa-notification-empty">No matching notifications.</p>}</section><div className="fa-notification-pages">{paging}</div><Btn className="fa-notification-back" onClick={back}>Back</Btn></div>;
 return <><Panel rect={layout[0]}><h2>Global Notifications</h2><p>Local session events</p>{nav}<Btn onClick={back}>Back</Btn></Panel><Panel rect={layout[1]}>{rows}{!visible.length&&<p>No matching notifications.</p>}{paging}</Panel><Panel rect={layout[2]}><p>{matches.length} events · latest 40 retained.</p><p>Only events from this local session are shown. No online feed is connected.</p></Panel></>;
}

function SaveToast({status}){
  const [ready,setReady]=useState(false);
  return <aside className={'fa-save-plaque'+(ready?' is-ready':'')} role="status" aria-live="polite">
    <img src={ORIGINAL_SAVE_PLAQUE} alt="" aria-hidden="true" decoding="async" onLoad={()=>setReady(true)} onError={()=>setReady(false)}/>
    <span>{status}</span>
  </aside>;
}
function StatRows({stats}){return <dl className="fa-stats">{Object.entries(stats).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{typeof v==='number'?fmt(v):v}</dd></div>)}</dl>;}
function RegionMap({world,profile,small=false}){
  const regions=world?.regions||[];
  const min=regions.length?Math.min(...regions.map(r=>r.minX)):0;
  const max=regions.length?Math.max(...regions.map(r=>r.maxX)):1;
  const px=x=>30+740*(x-min)/Math.max(1,max-min);
  const pos=world?.position||profile?.world.position;
  const markers=world?.encounters||[];
  return <div className="fa-map">
    {regions.length===0?<p>Map data is available when the world loads.</p>:<svg viewBox="0 0 800 190" role="img" aria-label="Live Sapphire Wilds map">
      {regions.map((r,i)=><g key={r.id}><rect x={px(r.minX)} y="48" width={Math.max(1,px(r.maxX)-px(r.minX)-2)} height="86" rx="6" fill={profile?.world.visitedRegions.includes(r.id)?'#2859b8':'#18274d'} stroke="#d1b784"/>{!small&&<text x={(px(r.minX)+px(r.maxX))/2} y="77" fill="#edf2f6" textAnchor="middle" fontSize="14">{i+1}</text>}</g>)}
      <path d="M30 105 H770" stroke="#78c9ed" strokeDasharray="6 5"/>
      {markers.map(m=><g key={m.id}><circle cx={px(m.position[0])} cy="105" r="6" fill={m.completed?'#84c5a0':m.category==='Boss'?'#e87a90':'#ebd6a6'}/><title>{m.label}</title></g>)}
      {pos&&<g><path d={'M'+px(pos[0])+' 86 l-8 -15 h16Z'} fill="#fff8ec" stroke="#78c9ed"/><circle cx={px(pos[0])} cy="105" r="8" fill="#78c9ed" stroke="white"/></g>}
    </svg>}
    {!small&&regions.map((r,i)=><div key={r.id} className="fa-map-row"><span>{i+1}. {r.name.replace(/^\d+\. /,'')}</span><span>{profile?.world.visitedRegions.includes(r.id)?'Discovered':'Unexplored'}</span></div>)}
    {pos&&<small>{world?.region||'Sapphire Wilds'} · X {pos[0].toFixed(1)} · Z {pos[2].toFixed(1)}</small>}
  </div>;
}
function EnemyPortrait({enemy,small=false}){const src=enemyPortrait(enemy?.visualId);return src?<img className={'fa-archer-portrait'+(small?' small':'')} src={src} alt={enemy.name+' portrait'} decoding="async"/>:null;}
function BattleSurface({profile,encounter,paused,muted,reducedMotion,quality,onHud,onError,stageRef}){
  const mount=useRef(null), callback=useRef({onHud,onError});callback.current={onHud,onError};
  useEffect(()=>{
    const stats=heroStats(profile);
    const party=partyFor(profile);
    const hero={...UNITS[0],...stats,tint:appearanceFor(profile).tint,hp:encounter.practice?stats.maxHp:profile.hp,name:profile.name,gearVisuals:equippedVisuals(profile,'hero'),weaponId:profile.equipped};
    const allies=[hero,...activeRoster(profile).map(m=>({...m,...memberStats(profile,m.id),gearVisuals:equippedVisuals(profile,m.id),team:'player',hp:encounter.practice?m.maxHp:memberFor(profile,m.id).hp,actions:m.combatClass?actionsForClass(m.combatClass):['quickShot','guard','volley']}))];
    allies.sort((a,b)=>Number(b.id===party.front)-Number(a.id===party.front));
    const units=[...allies,...enemyFormation(encounter,allies.length)];
    const stage=new FantasyBattleStage(mount.current,{units,availableActions:encounter.practice?ACTION_ORDER:availableActions(levelFor(profile.xp)),transparentBackdrop:true,onHud:state=>callback.current.onHud(state,encounter.token),onError:e=>callback.current.onError(String(e?.message||e),encounter.token)});
    stageRef.current=stage;
    stage.setSettings({secondaryMotion:reducedMotion?0:quality==='performance'?.45:1});
    stage.init().catch(e=>{if(!stage.disposed)callback.current.onError(String(e?.message||e),encounter.token);});
    return()=>{stage.dispose();if(stageRef.current===stage)stageRef.current=null;};
    // A battle is one immutable encounter; changes to the profile apply next encounter.
  },[encounter.token,stageRef]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(stageRef.current){stageRef.current.paused=paused;stageRef.current.setMuted(muted);stageRef.current.setSettings({secondaryMotion:reducedMotion?0:quality==='performance'?.45:1});}},[paused,muted,reducedMotion,quality,stageRef]);
  return <div className="fa-battle-stage" ref={mount}/>;
}
export default function SapphireAdventure(){
  const [stack,setStack]=useState(['01']),[slots,setSlots]=useState(EMPTY),[settings,setSettings]=useState(DEFAULT_SETTINGS);
  const [profile,setProfile]=useState(null),[slot,setSlot]=useState(null),[world,setWorld]=useState(null),[running,setRunning]=useState(false);
  const [creationAppearance,setCreationAppearance]=useState('silver');
  const [name,setName]=useState(''),[selected,setSelected]=useState(null),[encounter,setEncounter]=useState(null),[arenaReady,setArenaReady]=useState(false);
  const [hud,setHud]=useState(null),[result,setResult]=useState(null),[notice,setNotice]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(null);
  const [itemId,setItemId]=useState('starterBow'),[loot,setLoot]=useState([]),[service,setService]=useState(null),[candidate,setCandidate]=useState(null),[destination,setDestination]=useState(null);
  const [gearWearer,setGearWearer]=useState('hero');
  const [equipmentFilter,setEquipmentFilter]=useState('all');
  const [companionId,setCompanionId]=useState(COMPANION.id);
  const [importSlot,setImportSlot]=useState('1'),[backupError,setBackupError]=useState(''),[backupPass,setBackupPass]=useState(''),[backupBusy,setBackupBusy]=useState(false);
  const backupLock=useRef(false),saveBaseline=useRef(null);
  const [notifications,setNotifications]=useState([]),[lesson,setLesson]=useState(0),[discovery,setDiscovery]=useState(null),[saveStatus,setSaveStatus]=useState('');
  const frame=useRef(null),stageRef=useRef(null),current=useRef({}),processed=useRef(null),startReady=useRef(false),saveTimer=useRef(null),focusRef=useRef(null),timeoutRef=useRef(null),startTimer=useRef(null),restorePending=useRef(false),battleTimer=useRef(null),failedLoad=useRef(false);
  const id=stack[stack.length-1],screen=UI_SCREENS[id];
  current.current={id,stack,profile,slot,settings,world,encounter,result,running,service,candidate};
  const replaceProfile=p=>{current.current.profile=p;setProfile(p);};
  const go=target=>{if(UI_SCREENS[target])setStack(old=>old[old.length-1]===target?old:[...old,target]);};
  const back=()=>setStack(old=>old.length>1?old.slice(0,-1):old);
  const root=target=>setStack([target]);
  const post=(type,data)=>frame.current?.contentWindow?.postMessage({channel:'fantasy-host',type,data},location.origin);
  const notify=(message,category='system')=>{setNotifications(old=>[{message,category,time:Date.now()},...old].slice(0,40));setNotice(message);};
  const fail=message=>{clearTimeout(timeoutRef.current);clearTimeout(battleTimer.current);failedLoad.current=true;setError(message);go('47');};
  const transact=(operation,success)=>{const p=current.current.profile;if(!p||current.current.encounter){notify('This action is available only outside battle.');return false;}try{const next=operation(p);replaceProfile(next);autosave(next);notify(success,'activity');return true;}catch(e){notify(e.message);return false;}};
  const reloadSlots=()=>{const s=readSlots(localStorage);setSlots(s);return s;};
  useEffect(()=>{reloadSlots();setSettings(readSettings(localStorage));const changed=e=>{if(e.key===SAVE_KEY||e.key===null){reloadSlots();}};window.addEventListener('storage',changed);return()=>{window.removeEventListener('storage',changed);clearTimeout(saveTimer.current);clearTimeout(timeoutRef.current);clearTimeout(startTimer.current);clearTimeout(battleTimer.current);};},[]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(t);},[notice]);
  useEffect(()=>{if(id==='10'&&running)frame.current?.focus();else if(!isWorldScreen(id)&&id!=='35')focusRef.current?.focus();},[id,running]);
  useEffect(()=>{post('pause',id!=='10');if(stageRef.current)stageRef.current.paused=id!=='09';},[id]);
  useEffect(()=>{if(running){post('quality',settings.quality);}if(stageRef.current)stageRef.current.setMuted(settings.muted);},[running,settings]);
  const applySettings=patch=>{const next={...current.current.settings,...patch};setSettings(next);try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(next));}catch(e){fail('Settings could not be saved: '+e.message);}};
  const save=(target,overwrite=false,p=current.current.profile,expectedStamp)=>{
    if(!p||!target)return false;
    setSaveStatus('Saving…');
    try{const record=writeSlot(localStorage,target,p,{overwrite,expectedStamp});saveBaseline.current={slot:target,stamp:slotStamp(record)};setSlot(target);current.current.slot=target;reloadSlots();setSaveStatus('Progress saved');clearTimeout(saveTimer.current);saveTimer.current=setTimeout(()=>setSaveStatus(''),3000);return true;}
    catch(e){setSaveStatus('');notify('Save failed: '+e.message+' Your current session is unchanged. Export a backup or choose a different slot.');reloadSlots();return false;}
  };
  const autosave=p=>{const s=current.current.slot;if(!s)return;const baseline=saveBaseline.current;if(!baseline||baseline.slot!==s){notify('Autosave paused: reload the slot or save manually.');return;}const record=readSlots(localStorage);if(record.error){notify('Autosave paused: '+record.error);return;}const latest=record.slots.find(x=>x.id===s);if(latest?.status==='corrupt'||(latest?.stamp??null)!==baseline.stamp||(latest?.profile&&latest.profile.id!==p.id)){notify('Autosave paused: another tab changed this slot. Save manually or export a backup.');reloadSlots();return;}save(s,Boolean(latest),p,baseline.stamp);};
  const downloadBackup=async(p,encrypted=false)=>{if(backupLock.current)return;backupLock.current=true;setBackupBusy(true);setBackupError('');const pass=backupPass;setBackupPass('');try{const raw=encrypted?await encryptBackup(p,pass):exportBackup(p);const blob=new Blob([raw],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=encrypted?'fantasy-battle-encrypted-save.json':'fantasy-battle-save.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify(encrypted?'Encrypted backup exported':'Unencrypted backup exported');}catch(e){setBackupError(e.message);notify(e.message);}finally{backupLock.current=false;setBackupBusy(false);}};
  const importBackup=async file=>{if(!file||current.current.running||backupLock.current)return;backupLock.current=true;setBackupBusy(true);setBackupError('');const pass=backupPass,target=importSlot;setBackupPass('');try{if(file.size>MAX_ENCRYPTED_BYTES)throw Error('Save backup is too large.');const p=await importTransfer(await file.text(),pass);if(current.current.running||current.current.id!=='03')return;const before=readSlots(localStorage);if(before.error)throw Error(before.error);const previous=before.slots.find(s=>s.id===target);const occupied=Boolean(previous);requestConfirm('Import '+p.name+' into slot '+target+(occupied?' and replace the existing save?':'?'),()=>{try{if(current.current.running)throw Error('Return to title before importing.');writeSlot(localStorage,target,p,{overwrite:occupied,expectedStamp:previous?.stamp??null});reloadSlots();notify('Save imported into slot '+target);}catch(e){setBackupError(e.message);notify(e.message);}});}catch(e){setBackupError(e.message);}finally{backupLock.current=false;setBackupBusy(false);}};
  const begin=(p,saveSlot=null,stamp=saveSlot?currentSaveStamp(slots.slots,saveSlot,p):null)=>{
    clearTimeout(timeoutRef.current);clearTimeout(startTimer.current);restorePending.current=false;startReady.current=false;processed.current=null;failedLoad.current=false;clearTimeout(battleTimer.current);
    saveBaseline.current=saveSlot&&stamp!==undefined?{slot:saveSlot,stamp}:null;
    replaceProfile(p);setSlot(saveSlot);current.current.slot=saveSlot;setWorld(null);setEncounter(null);setArenaReady(false);setHud(null);setResult(null);
    setService(null);setCandidate(null);setLoot([]);setRunning(false);root('35');
    // Remount even if loading from an active session.
    startTimer.current=setTimeout(()=>{setRunning(true);timeoutRef.current=setTimeout(()=>{if(!startReady.current)fail('The 3D world did not become ready. Check your graphics device and retry.');},30000);},0);
  };
  const startNew=()=>{try{const p=selectAppearance(createProfile(name),creationAppearance);replaceProfile(p);go('20');}catch(e){setNotice(e.message);}};
  const enterNew=()=>{const p=current.current.profile;if(!p)return;const empty=SLOT_IDS.find(s=>!slots.slots.some(x=>x.id===s));begin(p,empty||null,null);};
  const leaveTitle=()=>{saveBaseline.current=null;setBackupPass('');clearTimeout(startTimer.current);clearTimeout(timeoutRef.current);restorePending.current=false;failedLoad.current=true;clearTimeout(battleTimer.current);setRunning(false);setEncounter(null);setArenaReady(false);setHud(null);setResult(null);replaceProfile(null);setWorld(null);setPending(null);root('01');reloadSlots();};
  const requestConfirm=(message,action)=>{setPending({message,action});go('40');};
  const chooseAppearance=key=>{if(transact(p=>selectAppearance(p,key),'Appearance applied'))post('appearance',appearanceFor(current.current.profile).tint);};
  const openPause=()=>{if(isWorldScreen(current.current.id))go('04');};
  const onKey=code=>{
    const s=current.current.id;
    if(code==='Escape'){if(s==='47')return;if(s==='40')setPending(null);if(isWorldScreen(s))openPause();else if(s!=='35'&&s!=='01')back();return;}
    const target=HOTKEY_SCREENS[code];
    if(target&&current.current.running&&(isWorldScreen(s)||s==='04'||s===target)){if(s===target)back();else go(target);}
  };
  const startBattle=(e)=>{
    if(current.current.encounter)return;
    const next={...e,token:crypto.randomUUID()};
    current.current.encounter=next;setEncounter(next);processed.current=null;setHud(null);setResult(null);setArenaReady(false);failedLoad.current=false;root('35');post('battle',{id:next.id,token:next.token});clearTimeout(battleTimer.current);battleTimer.current=setTimeout(()=>fail('The battleground did not become ready. Retry from your exploration checkpoint.'),30000);
  };
  const resumeWorld=(p=current.current.profile)=>{
    const e=current.current.encounter;
    setEncounter(null);current.current.encounter=null;setArenaReady(false);setHud(null);setResult(null);
    post('restore',p.world);if(e&&!e.practice)post('finish',{id:e.id,won:p.world.completedEncounters.includes(e.id)});
    post('pause',false);root('10');setTimeout(()=>frame.current?.focus(),0);
  };
  const retryBattle=()=>{const e=current.current.encounter;if(!e)return;const next={...e,token:crypto.randomUUID()};current.current.encounter=next;failedLoad.current=false;clearTimeout(battleTimer.current);processed.current=null;setHud(null);setResult(null);setArenaReady(false);setEncounter(next);root('35');post('battle',{id:next.id,token:next.token});battleTimer.current=setTimeout(()=>fail('Combat renderer did not become ready.'),30000);};
  const handleBattleHud=(state,token)=>{
    if(failedLoad.current||!isCurrentEncounter(current.current.encounter,token))return;
    setHud(state);if(state.phase!=='loading')clearTimeout(battleTimer.current);
    const e=current.current.encounter,p=current.current.profile;
    if(state.phase!=='over'||!e||!p||processed.current===e.token)return;
    processed.current=e.token;
    const won=state.winner==='player';
    if(won&&!e.practice){const r=rewardVictory(p,e,state.units.find(u=>u.id==='hero')?.hp,state.units);replaceProfile(r.profile);setResult(r);setLoot(r.loot);notify('Victory · +'+r.xp+' XP · +'+r.gold+' gold','combat');autosave(r.profile);}
    else{setResult({profile:p,xp:0,gold:0,loot:[],leveled:false,unlocked:[]});setLoot([]);}
    root(won?'14':'15');
  };
  const victoryContinue=()=>{const r=current.current.result,p=current.current.profile;if(r?.leveled){go('32');return;}resumeWorld(p);};
  const finishLevel=()=>{if(current.current.encounter&&current.current.result?.unlocked?.length){go('45');return;}if(current.current.encounter&&current.current.result?.leveled)resumeWorld();else back();};
  const eventHandler=useRef(null);
  eventHandler.current=e=>{
    const s=current.current,p=s.profile;
    if(e.type==='ready'&&p&&!failedLoad.current){
      if(startReady.current||restorePending.current)return;
      restorePending.current=true;post('quality',s.settings.quality);post('appearance',appearanceFor(p).tint);post('restore',p.world);return;
    }
    if(e.type==='restored'&&p&&!s.encounter&&!failedLoad.current){
      const updated=updateWorld(p,e.world);replaceProfile(updated);setWorld(e.world);
      if(!startReady.current){startReady.current=true;restorePending.current=false;clearTimeout(timeoutRef.current);post('pause',false);root('10');autosave(updated);}return;
    }
    if(e.type==='world'&&p&&startReady.current&&!s.encounter&&!failedLoad.current){
      const updated=updateWorld(p,e.world);setWorld(e.world);replaceProfile(updated);
      const newRegion=updated.world.visitedRegions.find(x=>!p.world.visitedRegions.includes(x));
      if(newRegion&&s.id==='10'){const item=e.world.regions.find(x=>x.id===newRegion);if(p.world.visitedRegions.length){setDiscovery({kind:'region',id:newRegion,label:item?.name||e.world.region});go('42');notify('New region: '+(item?.name||e.world.region),'exploration');}autosave(updated);}
      return;
    }
    if(e.type==='encounter'&&p&&s.id==='10'&&!s.encounter){
      const updated=updateWorld(p,e.world);replaceProfile(updated);setWorld(e.world);if(e.encounter.category==='Normal')startBattle(e.encounter);else{setCandidate(e.encounter);go('23');}return;
    }
    if(e.type==='discovery'&&p&&!s.encounter){const updated=updateWorld(p,e.world);const awarded=collectLoot(updated,e.id);replaceProfile(awarded.profile);setWorld(e.world);setDiscovery({kind:'landmark',id:e.id,label:e.label});setLoot(awarded.loot);notify(e.label,awarded.loot.length?'rewards':'exploration');autosave(awarded.profile);go(awarded.loot.length?'31':'42');return;}
    if(e.type==='service'&&p&&s.id==='10'&&!s.encounter){setService(e.service);setWorld(e.world);replaceProfile(updateWorld(p,e.world));go('13');return;}
    if(e.type==='battleReady'&&isCurrentEncounter(s.encounter,e.token)&&!failedLoad.current){setArenaReady(true);root('09');return;}
    if(e.type==='error')fail(e.message||'World error');
    if(e.type==='key')onKey(e.code);
  };
  useEffect(()=>{
    const receive=e=>{if(e.origin===location.origin&&e.source===frame.current?.contentWindow&&e.data?.channel==='fantasy-world')eventHandler.current(e.data);};
    const key=e=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||''))return;const s=current.current.id;if(e.code==='Escape'||HOTKEY_SCREENS[e.code]){e.preventDefault();eventHandler.current({type:'key',code:e.code});}else if(s==='09'&&stageRef.current?.handleKey(e.key))e.preventDefault();};
    window.addEventListener('message',receive);window.addEventListener('keydown',key);return()=>{window.removeEventListener('message',receive);window.removeEventListener('keydown',key);};
  },[]);
  const selectedCompanion=ROSTER.find(m=>m.id===companionId)||COMPANION, member=memberFor(profile,selectedCompanion.id);
  const backupField=<label>Backup passphrase (encrypted transfers only)<input type="password" autoComplete="off" value={backupPass} maxLength={256} onChange={e=>setBackupPass(e.target.value)} placeholder="12 or more characters"/></label>;
  const recent=mostRecent(slots.slots),level=profile?levelFor(profile.xp):1,stats=heroStats(profile);
  const serviceAvailable=Boolean(service&&world?.nearbyService===service.id&&!encounter);
  const inv=profile?.inventory||{};const selectedItem=ITEMS[itemId];const compare=profile?comparison(profile,itemId):null;
  const gearMembers=[{id:'hero',name:profile?.name||'Leader'},...ROSTER.filter(m=>memberFor(profile,m.id).recruited)];
  const wearer=gearMembers.some(m=>m.id===gearWearer)?gearWearer:'hero',worn=gearFor(profile,wearer),gearCompare=profile?gearComparison(profile,wearer,itemId):null;
  const listItems=(filter=()=>true)=>Object.entries(ITEMS).filter(([k,item])=>filter(item,k)).map(([k,item])=><Btn key={k} className="fa-item-row" primary={itemId===k} aria-pressed={itemId===k} onClick={()=>setItemId(k)}><ItemArt id={k}/><span className="fa-item-label"><strong>{item.name}</strong><small>{item.kind==='gear'?(item.slot==='armor'?'Armor':'Mantle'):item.kind==='weapon'?'Weapon':item.kind==='consumable'?'Consumable':'Material'}</small></span><span className="fa-item-count">×{inv[k]||0}</span></Btn>);
  const validSlots=slots.slots.filter(s=>s.status==='valid');
  const selectedSave=validSlots.find(s=>s.id===selected);
  const statPanel=<StatRows stats={{Level:level,Experience:profile?profile.xp%100+' / 100':'—','Current HP':profile?.hp??'—','Maximum HP':stats.maxHp,Attack:stats.atk,Defense:stats.def,Speed:stats.spd,'Unspent points':profile?pointsFor(profile):0}}/>;
  const nav=(targets)=>targets.map(t=><Btn key={t} onClick={()=>go(t)}>{UI_SCREENS[t].name}{UNSUPPORTED.has(t)?' · Not available':''}</Btn>);
  const buttons=(...children)=><div className="fa-buttons">{children}</div>;
  const pane=(i,content,cls)=> <Panel key={i} rect={screen.layout[i]} className={cls}>{content}</Panel>;
  const original=useStagedOriginal(id);
  const manualSave=()=>{const previous=slots.slots.find(x=>x.id===selected),occupied=Boolean(previous);const perform=()=>save(selected,occupied,current.current.profile,previous?.stamp??null);if(occupied)requestConfirm('Overwrite slot '+selected+'? Existing progress in this slot will be replaced.',perform);else perform();};
  let content;
  switch(id){
    case '01':content=original?<div className="fa-original-menu">
      <h1 className="fa-art-sr">Fantasy Battle — Sapphire Sumi</h1>
      <p className="fa-menu-subtitle">Fantasy Battle</p>
      <Btn className="fa-painted-button fa-menu-start" primary onClick={()=>go('48')}><span className="fa-art-sr">Start New Game</span></Btn>
      <Btn className="fa-painted-button fa-menu-continue" disabled={!recent} onClick={()=>begin(recent.profile,recent.id,recent.stamp)}><span className="fa-art-sr">Continue</span></Btn>
      <Btn className="fa-painted-button fa-menu-load" disabled={!validSlots.length} onClick={()=>{setSelected(recent?.id||null);go('02');}}><span className="fa-art-sr">Load Game</span></Btn>
      <Btn className="fa-painted-button fa-menu-settings" onClick={()=>go('03')}><span className="fa-art-sr">Settings</span></Btn>
      <a className="fa-button fa-painted-button fa-menu-exit" href="/">Back to Games</a>
      {recent&&<div className="fa-menu-portrait"><ArcherPortrait profile={recent.profile}/></div>}
      <div className="fa-menu-save">{recent?<><strong>{recent.profile.name}</strong><small>Level {levelFor(recent.profile.xp)}</small></>:<span>No saved game</span>}</div>
      {slots.error&&<small className="fa-menu-error" role="alert">{slots.error}</small>}
    </div>:pane(0,<><div className="fa-title-mark" aria-hidden="true">✧</div><h1>Fantasy Battle</h1><p className="fa-title-subtitle">A Sapphire Sumi adventure</p><div className="fa-title-divider" aria-hidden="true"/><Btn primary onClick={()=>go('48')}>Start New Game</Btn><Btn disabled={!recent} onClick={()=>begin(recent.profile,recent.id,recent.stamp)}>Continue</Btn><Btn disabled={!validSlots.length} onClick={()=>{setSelected(recent?.id||null);go('02');}}>Load Game</Btn><Btn onClick={()=>go('03')}>Settings</Btn><a className="fa-button" href="/">Back to Games</a>{slots.error&&<small role="alert">{slots.error}</small>}</>);break;
    case '48':content=<FirstTimeSetup name={name} onName={setName} appearance={creationAppearance} onAppearance={setCreationAppearance} settings={settings} onSettings={applySettings} validCount={validSlots.length} saveError={slots.error} original={original} layout={screen.layout} back={back} onCreate={()=>{const s=current.current;if(s.id==='48'&&!s.running&&!s.encounter)go('19');}} onLoad={()=>{const s=current.current;if(s.id!=='48'||s.running||s.encounter)return;const fresh=reloadSlots(),latest=mostRecent(fresh.slots);if(fresh.error||!latest){notify('No loadable saves on this browser.');return;}setSelected(latest.id);go('02');}} onSettingsPage={()=>go('03')} onTutorial={()=>{setLesson(0);go('34');}}/>;break;
    case '19':content=original?<div className="fa-original-creation">
      <section className="fa-creation-appearances" aria-label="Supported appearance presets"><p>Choose your archer appearance.</p>{Object.entries(APPEARANCES).map(([key,a])=><Btn key={key} primary={creationAppearance===key} aria-pressed={creationAppearance===key} onClick={()=>setCreationAppearance(key)}><span className="fa-swatch" style={{backgroundColor:a.swatch}} aria-hidden="true"/><span>{a.name}</span></Btn>)}<small>More customization options may be added in future updates.</small></section>
      <div className="fa-creation-viewer"><ArcherPortrait profile={{appearance:creationAppearance}}/></div>
      <label className="fa-creation-name"><span className="fa-art-sr">Character name</span><input maxLength={40} value={name} onChange={e=>setName(e.target.value)} placeholder="Enter character name" autoComplete="off"/></label>
      <div className="fa-creation-class"><strong>Archer</strong><span>Ranged combat · Bow</span></div>
      <section className="fa-creation-class-info"><h2>Starting class</h2><p>Begin as the playable Archer. Unlock additional abilities through progression and recruit companions during your journey.</p><small>Appearance presets change the actual character tint.</small></section>
      <div className="fa-creation-description"><strong>{APPEARANCES[creationAppearance].name}</strong><span>Selected appearance</span></div>
      <Btn className="fa-painted-button fa-creation-back" onClick={back}><span className="fa-art-sr">Back</span></Btn>
      <Btn className="fa-painted-button fa-creation-start" primary disabled={!name.trim()} onClick={startNew}><span className="fa-art-sr">Create character and start journey</span></Btn>
    </div>:<>{pane(0,<><Btn onClick={back}>Back</Btn></>)}{pane(1,<><h2>Silver Archer</h2><ArcherPortrait/><p>The existing playable bow class.</p></>)}{pane(2,<><label>Adventurer name<input value={name} maxLength={40} onChange={e=>setName(e.target.value)} placeholder="Enter name"/></label><Btn primary disabled={!name.trim()} onClick={startNew}>Create</Btn></>)}</>;break;
    case '20':content=original?<div className="fa-original-selection">
      <section className="fa-selection-character">{profile&&<><ArcherPortrait profile={profile} small/><strong>{profile.name}</strong><span>{appearanceFor(profile).name}</span></>}</section>
      <section className="fa-selection-extra"><p>{profile?'Your new adventurer is ready.':'Create a character or load a saved game.'}</p><Btn onClick={back}>Back</Btn></section>
      <div className="fa-selection-viewer">{profile&&<ArcherPortrait profile={profile}/>}</div>
      <div className="fa-selection-portrait">{profile&&<ArcherPortrait profile={profile}/>}</div>
      <section className="fa-selection-stats">{profile&&<><strong>Level {level}</strong><StatRows stats={{HP:profile.hp+' / '+stats.maxHp,Attack:stats.atk,Defense:stats.def,Speed:stats.spd}}/></>}</section>
      <div className="fa-selection-skills" aria-label="Learned abilities">{profile&&availableActions(level).slice(0,4).map(k=><div key={k} title={ACTIONS[k]?.name}><SkillArt id={k}/><span className="fa-art-sr">{ACTIONS[k]?.name}</span></div>)}</div>
      <div className="fa-selection-saves" aria-label="Existing save profiles">{SLOT_IDS.map(s=>{const record=slots.slots.find(x=>x.id===s),valid=record?.status==='valid';return <Btn key={s} className="fa-painted-button fa-selection-save" disabled={!valid} onClick={()=>{setSelected(s);go('02');}}><span className="fa-selection-save-portrait">{valid&&<ArcherPortrait profile={record.profile}/>}</span><span className="fa-selection-save-label"><strong>Slot {s} · {valid?record.profile.name:record?'Damaged':'Empty'}</strong>{valid&&<small>Level {levelFor(record.profile.xp)}</small>}</span></Btn>;})}</div>
      <Btn className="fa-painted-button fa-selection-start" primary disabled={!profile} onClick={enterNew}><span className="fa-art-sr">Enter world</span></Btn>
      <Btn className="fa-painted-button fa-selection-new" onClick={()=>go('19')}><span className="fa-art-sr">New character</span></Btn>
      <Btn className="fa-painted-button fa-selection-load" disabled={!validSlots.length} onClick={()=>{setSelected(recent?.id||null);go('02');}}><span className="fa-art-sr">Load game</span></Btn>
    </div>:<>{pane(0,<>{profile&&<p>{profile.name}</p>}<Btn onClick={()=>go('19')}>Create Character</Btn></>)}{pane(1,<ArcherPortrait profile={profile}/>)}{pane(2,<>{statPanel}<Btn primary disabled={!profile} onClick={enterNew}>Enter World</Btn><Btn onClick={back}>Back</Btn></>)}</>;break;
    case '02':content=original?<div className="fa-original-load">
      <div className="fa-load-rows" aria-label="Save slots">
        {SLOT_IDS.map(s=>{const record=slots.slots.find(x=>x.id===s),valid=record?.status==='valid';return <Btn key={s} className="fa-painted-button fa-load-row" primary={valid&&selected===s} aria-pressed={valid&&selected===s} disabled={!valid} onClick={()=>setSelected(s)}>
          <span className="fa-load-row-portrait">{valid&&<ArcherPortrait profile={record.profile}/>}</span>
          <span className="fa-load-row-data"><strong>Slot {s} · {valid?record.profile.name:record?'Damaged':'Empty'}</strong>{valid&&<small>Level {levelFor(record.profile.xp)}</small>}</span>
        </Btn>;})}
      </div>
      <div className="fa-load-preview">{selectedSave?<ArcherPortrait profile={selectedSave.profile}/>:<p>No save selected</p>}</div>
      <div className="fa-load-name"><strong>{selectedSave?.profile.name||'Select a save'}</strong>{selectedSave&&<span>Level {levelFor(selectedSave.profile.xp)}</span>}</div>
      <div className="fa-load-metadata">{selectedSave?<><p>Position X {selectedSave.profile.world.position[0].toFixed(1)}</p><p>Last save {new Date(selectedSave.savedAt).toLocaleString('en-US')}</p><p>Saved locally on this browser.</p></>:<p>{validSlots.length?'Choose a valid save slot.':'No loadable saves on this browser.'}</p>}{slots.error&&<small role="alert">{slots.error}</small>}</div>
      <div className="fa-load-backup">{backupField}<Btn disabled={!selectedSave||backupBusy||backupPass.length<12} onClick={()=>downloadBackup(selectedSave.profile,true)}>Export encrypted backup</Btn>{backupError&&<small role="alert">{backupError}</small>}</div>
      <Btn className="fa-painted-button fa-load-confirm" primary disabled={!selectedSave} onClick={()=>begin(selectedSave.profile,selectedSave.id,selectedSave.stamp)}><span className="fa-art-sr">Load Game</span></Btn>
      <Btn className="fa-painted-button fa-load-export" disabled={!selectedSave||backupBusy} onClick={()=>downloadBackup(selectedSave.profile)}>Export</Btn>
      <Btn className="fa-painted-button fa-load-back" onClick={back}>Back</Btn>
    </div>:<>{pane(0,<>{validSlots.map(s=><Btn primary={selected===s.id} key={s.id} onClick={()=>setSelected(s.id)}>Slot {s.id} · {s.profile.name}</Btn>)}{!validSlots.length&&<p>No loadable saves on this browser.</p>}{slots.slots.filter(s=>s.status==='corrupt').map(s=><p key={s.id}>Slot {s.id} is damaged.</p>)}<Btn onClick={back}>Back</Btn></>)}{pane(1,<><h2>{selectedSave?.profile.name||'Select a save'}</h2>{selectedSave&&<p>Level {levelFor(selectedSave.profile.xp)} · X {selectedSave.profile.world.position[0].toFixed(1)} · {new Date(selectedSave.savedAt).toLocaleString('en-US')}</p>}</>)}{pane(2,<><Btn primary disabled={!selectedSave} onClick={()=>begin(selectedSave.profile,selectedSave.id,selectedSave.stamp)}>Load Game</Btn><Btn disabled={!selectedSave||backupBusy} onClick={()=>downloadBackup(selectedSave.profile)}>Export unencrypted backup</Btn>{backupField}<Btn disabled={!selectedSave||backupBusy||backupPass.length<12} onClick={()=>downloadBackup(selectedSave.profile,true)}>Export encrypted backup</Btn>{backupError&&<small role="alert">{backupError}</small>}</>)}</>;break;
    case '03':content=original?<div className="fa-original-settings">
      <nav className="fa-art-side-nav fa-settings-nav" aria-label="Settings navigation">
        <Btn className="fa-painted-button" onClick={()=>document.getElementById('fa-quality')?.focus()}><span className="fa-art-sr">Graphics</span></Btn>
        <Btn className="fa-painted-button" onClick={()=>document.getElementById('fa-mute')?.focus()}><span className="fa-art-sr">Audio</span></Btn>
        <Btn className="fa-painted-button" onClick={()=>{setLesson(1);go('34');}}><span className="fa-art-sr">Gameplay tutorial</span></Btn>
        <Btn className="fa-painted-button" onClick={()=>{setLesson(0);go('34');}}><span className="fa-art-sr">Controls tutorial</span></Btn>
        <Btn className="fa-painted-button" onClick={()=>document.getElementById('fa-motion')?.focus()}><span className="fa-art-sr">Accessibility</span></Btn>
        <Btn className="fa-painted-button" onClick={()=>document.getElementById('fa-fullscreen')?.focus()}><span className="fa-art-sr">Interface</span></Btn>
      </nav>
      <section className="fa-settings-graphics" aria-label="Graphics settings">
        <label className="fa-setting-line">Graphics quality<select id="fa-quality" value={settings.quality} onChange={e=>applySettings({quality:e.target.value})}>{['performance','balanced','high','cinematic'].map(q=><option key={q}>{q}</option>)}</select></label>
        <div className="fa-setting-line"><span>Renderer</span><small>{world?.renderer||'Detected when world loads'}</small></div>
        <Btn id="fa-fullscreen" onClick={()=>{if(document.fullscreenElement)document.exitFullscreen().catch(e=>setNotice(e.message));else document.documentElement.requestFullscreen?.().catch(e=>setNotice(e.message));}}>Toggle fullscreen</Btn>
      </section>
      <section className="fa-settings-audio" aria-label="Audio settings"><label className="fa-setting-line"><span>Mute battle audio</span><input id="fa-mute" type="checkbox" checked={settings.muted} onChange={e=>applySettings({muted:e.target.checked})}/></label><small>Changes are saved immediately on this browser.</small></section>
      <section className="fa-settings-gameplay" aria-label="Gameplay and backup settings">
        <label className="fa-setting-line"><span>Reduce UI and clothing motion</span><input id="fa-motion" type="checkbox" checked={settings.reducedMotion} onChange={e=>applySettings({reducedMotion:e.target.checked})}/></label>
        {!running&&<><strong>Portable Save Backup</strong><p>Import plain or encrypted JSON locally. Keep your encryption passphrase separately; it cannot be recovered.</p>{backupField}<label>Destination slot<select value={importSlot} onChange={e=>setImportSlot(e.target.value)}>{SLOT_IDS.map(s=><option key={s} value={s}>Slot {s}</option>)}</select></label><label>Choose save backup<input disabled={backupBusy} type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)importBackup(file);}}/></label>{backupError&&<p role="alert">{backupError}</p>}</>}
      </section>
      <Btn className="fa-painted-button fa-settings-back" onClick={back}><span className="fa-art-sr">Back</span></Btn>
      <Btn className="fa-painted-button fa-settings-done" primary onClick={back}><span className="fa-art-sr">Apply changes and close settings</span></Btn>
    </div>:<>{pane(0,<><h2>Settings</h2><Btn onClick={back}>Back</Btn></>)}{pane(1,<><label>Graphics quality<select value={settings.quality} onChange={e=>applySettings({quality:e.target.value})}>{['performance','balanced','high','cinematic'].map(q=><option key={q}>{q}</option>)}</select></label><label><input type="checkbox" checked={settings.muted} onChange={e=>applySettings({muted:e.target.checked})}/> Mute battle audio</label><label><input type="checkbox" checked={settings.reducedMotion} onChange={e=>applySettings({reducedMotion:e.target.checked})}/> Reduce UI and clothing motion</label><p>Renderer: {world?.renderer||'Detected when world loads'}</p><Btn onClick={()=>{if(document.fullscreenElement)document.exitFullscreen().catch(e=>setNotice(e.message));else document.documentElement.requestFullscreen?.().catch(e=>setNotice(e.message));}}>Toggle fullscreen</Btn>{!running&&<><h2>Portable Save Backup</h2><p>Import a plain or encrypted JSON backup. For encrypted files, enter the original passphrase before choosing the file. Files and passphrases are never sent to a server. Keep the passphrase separately; it cannot be recovered.</p>{backupField}<label>Destination slot<select value={importSlot} onChange={e=>setImportSlot(e.target.value)}>{SLOT_IDS.map(s=><option key={s} value={s}>Slot {s}</option>)}</select></label><label>Choose save backup<input disabled={backupBusy} type="file" accept=".json,application/json" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)importBackup(f);}}/></label>{backupError&&<p role="alert">{backupError}</p>}</>}<Btn primary onClick={back}>Done</Btn></>)}</>;break;
    case '04':content=original?<div className="fa-original-pause">
      <nav className="fa-pause-nav" aria-label="Pause navigation">
        <Btn className="fa-painted-button" onClick={back}><span className="fa-art-sr">Resume</span></Btn>
        {['05','06','07','08','18','03'].map(target=><Btn key={target} className="fa-painted-button" onClick={()=>go(target)}><span className="fa-art-sr">{UI_SCREENS[target].name}</span></Btn>)}
        <Btn className="fa-painted-button" onClick={()=>requestConfirm('Return to the title? Unsaved progress may be lost.',leaveTitle)}><span className="fa-art-sr">Return to Title</span></Btn>
      </nav>
      <div className="fa-pause-region-map"><RegionMap world={world} profile={profile} small/></div>
      <div className="fa-pause-region-name"><strong>{world?.region||'Sapphire Wilds'}</strong><p>Current exploration</p></div>
      <div className="fa-pause-portrait">{profile&&<ArcherPortrait profile={profile}/>}</div>
      <div className="fa-pause-profile"><strong>{profile?.name||'No character'}</strong><span>Level {level}</span>{profile&&<progress aria-label="Level progress" value={profile.xp%100} max={100}/>}</div>
      <div className="fa-pause-details">{profile&&<><p>Position X {profile.world.position[0].toFixed(1)} · Z {profile.world.position[2].toFixed(1)}</p><p>Regions visited: {profile.world.visitedRegions.length}</p><p>Encounters completed: {profile.world.completedEncounters.length}</p></>}</div>
      <div className="fa-pause-party" aria-label="Active party">{profile&&<><div><ArcherPortrait profile={profile}/></div>{activeRoster(profile).slice(0,3).map(m=><div key={m.id}><ArcherPortrait companion={m}/></div>)}</>}</div>
      <div className="fa-pause-status"><StatRows stats={{HP:profile?profile.hp+' / '+stats.maxHp:'—',Attack:stats.atk,Defense:stats.def,Speed:stats.spd}}/></div>
      <div className="fa-pause-resources"><p>Gold: {fmt(profile?.gold??0)}</p><p>XP: {fmt(profile?.xp??0)}</p><p>Points: {profile?pointsFor(profile):0}</p></div>
      <label className="fa-pause-more"><span>More services</span><select aria-label="More services" value="" onChange={e=>{if(e.target.value)go(e.target.value);}}><option value="">Choose…</option>{PAUSE_LINKS.filter(t=>!['05','06','07','08','18','03'].includes(t)).map(t=><option key={t} value={t}>{UI_SCREENS[t].name}</option>)}</select></label>
    </div>:<>{pane(0,<><Btn primary onClick={back}>Resume</Btn>{nav(PAUSE_LINKS)}<Btn onClick={()=>requestConfirm('Return to the title? Unsaved progress may be lost.',leaveTitle)}>Return to Title</Btn></>)}{pane(1,<><h2>{profile?.name}</h2><p>{world?.region||'Sapphire Wilds'} · Level {level}</p></>)}{pane(2,statPanel)}</>;break;
    case '05':content=original?<div className="fa-original-character">
      <h2 className="fa-character-title">Character</h2>
      <nav className="fa-character-nav" aria-label="Character services">
        <Btn className="fa-character-current" aria-current="page">Overview</Btn>
        <Btn onClick={()=>go('32')}>Attributes</Btn><Btn onClick={()=>go('12')}>Skills</Btn><Btn onClick={()=>go('06')}>Equipment</Btn><Btn onClick={()=>go('27')}>Appearance</Btn>
      </nav>
      <div className="fa-character-portrait">{profile&&<ArcherPortrait profile={profile}/>}</div>
      <section className="fa-character-statistics" aria-label="Current character statistics">
        <h2>{profile?.name||'No character'}</h2><p>Archer · Level {level}</p>
        {profile&&<><label>Experience <progress value={profile.xp%100} max={100}/><span>{profile.xp%100} / 100</span></label>
        <label>Health <progress value={profile.hp} max={stats.maxHp}/><span>{profile.hp} / {stats.maxHp}</span></label>
        <StatRows stats={{Attack:stats.atk,Defense:stats.def,Speed:stats.spd,'Unspent points':pointsFor(profile)}}/></>}
      </section>
      <section className="fa-character-lower fa-character-appearance"><h3>Appearance</h3><p>{profile?appearanceFor(profile).name:'No character'}</p><Btn disabled={!profile||Boolean(encounter)} onClick={()=>go('27')}>Wardrobe</Btn></section>
      <section className="fa-character-lower fa-character-gear"><h3>Equipment</h3>{profile&&<><p>Bow: {ITEMS[profile.equipped]?.name||'None'}</p>{GEAR_SLOTS.map(s=><p key={s}>{s==='armor'?'Armor':'Mantle'}: {GEAR[gearFor(profile,'hero')[s]]?.name||'None'}</p>)}{activeGearSet(profile,'hero')&&<p>Active set: {activeGearSet(profile,'hero').name}</p>}</>}</section>
      <section className="fa-character-lower fa-character-skills"><h3>Learned skills</h3>{profile&&availableActions(level).map(k=><p key={k}>{skillName(k)}</p>)}</section>
      <Btn className="fa-character-back" onClick={back}>Back</Btn><Btn className="fa-character-done" primary onClick={back}>Done</Btn>
    </div>:<>{pane(0,nav(['06','12','32','27']))}{pane(1,<><h2>{profile?.name||'No character'}</h2><ArcherPortrait profile={profile}/><p>Archer · Level {level}</p></>)}{pane(2,statPanel)}</>;break;
    case '06':{
      const ownedEquipment=Object.entries(ITEMS).filter(([k,item])=>inv[k]>0&&(item.kind==='gear'||(wearer==='hero'&&item.kind==='weapon')));
      const visibleEquipment=ownedEquipment.filter(([,item])=>equipmentFilter==='all'||item.kind===equipmentFilter);
      const selectedOwned=ownedEquipment.some(([k])=>k===itemId);
      const liveCompare=selectedOwned?(selectedItem?.kind==='gear'?gearCompare:compare):null;
      const canEquip=Boolean(profile&&selectedOwned&&liveCompare&&!encounter&&(selectedItem.kind==='gear'?worn[selectedItem.slot]!==itemId:wearer==='hero'&&profile.equipped!==itemId));
      const canRemove=Boolean(profile&&!encounter&&selectedOwned&&selectedItem?.kind==='gear'&&worn[selectedItem.slot]===itemId);
      const slotsForWearer=[{label:'Bow',key:wearer==='hero'?profile?.equipped:null},...GEAR_SLOTS.map(s=>({label:s==='armor'?'Armor':'Mantle',key:worn[s]}))];
      content=original?<div className="fa-original-equipment">
        <h2 className="fa-eq-title">Equipment</h2>
        <nav className="fa-eq-nav" aria-label="Equipment categories">
          <Btn aria-pressed={equipmentFilter==='weapon'} onClick={()=>setEquipmentFilter('weapon')}>Weapons</Btn>
          <Btn aria-pressed={equipmentFilter==='gear'} onClick={()=>setEquipmentFilter('gear')}>Armor &amp; Mantles</Btn>
          <Btn aria-pressed={equipmentFilter==='all'} onClick={()=>setEquipmentFilter('all')}>All Equipment</Btn>
          <Btn onClick={()=>go('21')}>Consumables</Btn><Btn onClick={()=>go('27')}>Appearance</Btn>
        </nav>
        <div className="fa-eq-profile"><strong>{profile?.name||'No character'}</strong><span>Level {level} · Gold {profile?.gold||0}</span></div>
        <div className="fa-eq-portrait">{profile&&<ArcherPortrait profile={profile} companion={wearer==='hero'?false:ROSTER.find(m=>m.id===wearer)}/>}</div>
        <section className="fa-eq-slots" aria-label="Current equipment">{slotsForWearer.map((s,i)=><Btn key={s.label} className={'fa-eq-slot slot-'+i} disabled={!s.key} onClick={()=>setItemId(s.key)}><small>{s.label}</small>{s.key?<><ItemArt id={s.key}/><span>{ITEMS[s.key]?.name||GEAR[s.key]?.name||'Equipped'}</span></>:<span>Empty</span>}</Btn>)}</section>
        <label className="fa-eq-wearer"><span className="fa-art-sr">Wearer</span><select value={wearer} onChange={e=>{setGearWearer(e.target.value);setEquipmentFilter('all');}}>{gearMembers.map(m=><option value={m.id} key={m.id}>{m.name}</option>)}</select></label>
        <div className="fa-eq-inventory-title">Inventory · {visibleEquipment.length} types</div>
        <nav className="fa-eq-shortcuts" aria-label="Equipment services"><Btn onClick={()=>setEquipmentFilter('all')}>All</Btn><Btn onClick={()=>setEquipmentFilter('weapon')}>Bows</Btn><Btn onClick={()=>setEquipmentFilter('gear')}>Gear</Btn><Btn onClick={()=>go('17')}>Forge</Btn><Btn onClick={()=>go('21')}>Items</Btn></nav>
        <section className="fa-eq-grid" aria-label="Owned equipment">{visibleEquipment.map(([k,item])=><Btn key={k} primary={k===itemId} aria-pressed={k===itemId} aria-label={item.name+' ×'+inv[k]} title={item.name} onClick={()=>setItemId(k)}><ItemArt id={k}/><span>×{inv[k]}</span></Btn>)}{!visibleEquipment.length&&<p>No owned equipment in this category.</p>}</section>
        <section className="fa-eq-detail" aria-label="Selected item">{selectedOwned?<><ItemArt id={itemId}/><div><strong>{selectedItem.name}</strong>{gearMetadata(itemId)&&<small>{gearMetadata(itemId)}</small>}<p>{selectedItem.kind==='gear'?'Available: '+Math.max(0,(inv[itemId]||0)-gearCount(profile,itemId)):'Owned: '+inv[itemId]}</p><small>{selectedItem.kind==='gear'?(worn[selectedItem.slot]===itemId?'Equipped on this character':'Gear'):(profile.equipped===itemId?'Equipped bow':'Bow')}</small></div></>:<p>Select an owned item.</p>}</section>
        <section className="fa-eq-compare" aria-label="Equipment statistic comparison"><strong>Current → After equipping</strong>{profile&&Object.entries(memberStats(profile,wearer)).filter(([k])=>['maxHp','atk','def','spd'].includes(k)).map(([k,v])=>{const next=liveCompare?.candidate?.[k];return <div key={k}><span>{{maxHp:'Maximum HP',atk:'Attack',def:'Defense',spd:'Speed'}[k]}</span><span>{v}</span><span>{next??'—'}</span><span>{next==null?'—':(next-v>0?'+':'')+(next-v)}</span></div>;})}</section>
        <Btn primary className="fa-eq-equip" disabled={!canEquip} onClick={()=>selectedItem.kind==='gear'?transact(p=>equipGear(p,wearer,selectedItem.slot,itemId),'Gear equipped'):transact(p=>equipItem(p,itemId),'Weapon equipped')}>Equip</Btn>
        <Btn className="fa-eq-remove" disabled={!canRemove} onClick={()=>transact(p=>equipGear(p,wearer,selectedItem.slot,null),'Gear removed')}>Remove</Btn><Btn className="fa-eq-back" onClick={back}>Back</Btn>
      </div>:<>{pane(0,<>{nav(['21','17','39'])}<h2>Wearer</h2>{gearMembers.map(m=><Btn key={m.id} primary={m.id===wearer} onClick={()=>setGearWearer(m.id)}>{m.name}</Btn>)}</>)}{pane(1,<><h2>{gearMembers.find(m=>m.id===wearer)?.name}</h2>{wearer==='hero'&&<p>Bow: {ITEMS[profile?.equipped]?.name||'None'} +{profile?.enhancements?.[profile?.equipped]||0}</p>}{GEAR_SLOTS.map(slot=><div className="fa-party-card" key={slot}><strong>{slot==='armor'?'Armor':'Mantle'}</strong><ItemArt id={worn[slot]}/><p>{GEAR[worn[slot]]?.name||'None'}</p><Btn disabled={!worn[slot]||Boolean(encounter)} onClick={()=>transact(p=>equipGear(p,wearer,slot,null),'Gear removed')}>Unequip</Btn></div>)}<p>Gold: {profile?.gold||0}</p></>)}{pane(2,<>{listItems((item,k)=>(item.kind==='gear'||(wearer==='hero'&&item.kind==='weapon'))&&inv[k]>0)}{selectedItem?.kind==='gear'?<><p>Available: {Math.max(0,(inv[itemId]||0)-gearCount(profile,itemId))}</p><Btn disabled={!gearCompare||worn[selectedItem.slot]===itemId||Boolean(encounter)} onClick={()=>transact(p=>equipGear(p,wearer,selectedItem.slot,itemId),'Gear equipped')}>Equip selected gear</Btn></>:<Btn disabled={wearer!=='hero'||!compare||Boolean(encounter)} onClick={()=>go('39')}>Compare selected bow</Btn>}</>)}{pane(3,<>{profile&&<StatRows stats={memberStats(profile,wearer)}/>} {gearCompare&&<><h2>After equipping</h2><StatRows stats={gearCompare.candidate}/></>}</>)}</>;break;}
    case '07':content=<WorldMap world={world} profile={profile} encounter={encounter} original={original} layout={screen.layout} go={go} back={back} onTravel={region=>{setDestination(region);go('25');}}/>;break;
    case '08':content=<QuestJournal key={profile?.id||'guest'} profile={profile} encounter={encounter} original={original} layout={screen.layout} go={go} back={back} onCampaignAction={(questId,action)=>transact(p=>changeCampaignQuest(p,questId,action),action==='accept'?'Quest accepted':'Quest completed')} onClaim={()=>{if(transact(p=>{if(p.quests.grove!=='complete')throw Error('Quest is not ready to complete.');return claimGroveQuest(p);},'Quest completed'))go('44');}}/>;break;
    case '09':content=original?<OriginalCombatHud hud={hud} profile={profile} encounter={encounter} onAction={id=>{const s=current.current;if(s.id==='09'&&s.encounter)stageRef.current?.chooseAction(id);}} onPause={openPause} onSkills={()=>go('12')}/>:<>{pane(0,<><h2>{hud?'Round '+hud.round:'Preparing combat…'}</h2><div className="fa-turns">{hud?.order.map(o=><span className={o.active?'active':''} key={o.id}>{o.name}{o.action?' · '+o.action:''}</span>)}</div></>)}{pane(1,<>{hud?.units.filter(u=>u.team==='player').map(u=><div className={'fa-party-hud-row'+(hud.choosingUnit===u.id?' choosing':'')} key={u.id}>{u.id==='hero'?<ArcherPortrait profile={profile} small/>:<ArcherPortrait companion={ROSTER.find(m=>m.id===u.id)} small/>}<strong>{u.name}</strong><progress aria-label={u.name+' health'} value={u.hp} max={u.maxHp}/><small>HP {u.hp}/{u.maxHp} · Focus {u.focus}/{u.maxFocus}{u.hp===0?' · Down':hud.pendingChoices?.[u.id]?' · Ready':''}</small></div>)}<small aria-live="polite">{hud?.log.at(-1)}</small></>)}{pane(2,<><small>{hud?.phase==='choose'?'Choose: '+(hud.units.find(u=>u.id===hud.choosingUnit)?.name||''):'Resolving round'}</small><div className="fa-combat-actions">{hud?.legal.map(a=><Btn key={a.id} className={'fa-action '+a.action.kind} disabled={!a.enabled} title={a.reason||a.action.summary} aria-label={a.action.name+' — '+(a.reason||a.action.summary)} onClick={()=>stageRef.current?.chooseAction(a.id)}><SkillArt id={a.id}/><span className="fa-action-label"><kbd>{a.action.hotkey}</kbd> {a.action.name}</span><small>{a.reason||a.action.summary}</small></Btn>)}</div></>)}{pane(3,<>{hud?.units.filter(u=>u.team==='enemy').map(u=><div key={u.id} className={'fa-enemy-hud'+(u.hp===0?' down':'')}><strong>{u.name}</strong><progress aria-label={u.name+' health'} value={u.hp} max={u.maxHp}/><small>HP {u.hp}/{u.maxHp}</small>{hud.intents?.filter(i=>i.unitId===u.id).map(i=><div key={i.unitId} className={'fa-enemy-intent '+i.kind}><SkillArt id={i.actionId}/><div>{i.phaseName&&<small className="fa-boss-phase">{i.phaseName}</small>}<strong>{i.name}</strong><small>{i.summary}{i.targetId?' · Targets current frontline':''}</small></div></div>)}</div>)}</>)}<div className="fa-hud-top"><Btn onClick={openPause}>Pause · Esc</Btn><Btn onClick={()=>go('12')}>Skills · K</Btn></div></>;break;
    case '10':content=original?<OriginalExplorationHud profile={profile} world={world} notifications={notifications} post={post} go={go} onPause={openPause} onFocus={()=>frame.current?.focus()}/>:<>{pane(0,<><strong>{profile?.name}</strong><p>Level {level}</p><progress value={profile?.xp%100||0} max={100}/><small>{profile?.xp||0} total XP</small><progress value={profile?.hp||0} max={stats.maxHp}/><small>HP {profile?.hp||0}/{stats.maxHp} · Gold {profile?.gold||0}</small></>)}{pane(1,<button className="fa-map-button" onClick={()=>go('07')}><RegionMap world={world} profile={profile} small/></button>)}{pane(2,<><small>{world?.region}</small>{world?.nearby&&<Btn primary onClick={()=>post('interact')}>{world.nearby} · E</Btn>}{(campaignPrompt(profile)||profile?.quests.grove==='active')&&<p>Quest: {campaignPrompt(profile)||'Defeat the Grove Spirit'}</p>}</>)}{pane(3,<div className="fa-hud-buttons"><Btn onClick={openPause}>Menu</Btn><Btn onClick={()=>go('07')}>Map</Btn><Btn onClick={()=>go('08')}>Journal</Btn><Btn onClick={()=>go('12')}>Skills</Btn></div>)}<div className="fa-touch">{[['left','←'],['right','→'],['in','↑'],['out','↓'],['run','Run']].map(([k,label])=><Btn key={k} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);post('move',{key:k,value:true});}} onPointerUp={()=>post('move',{key:k,value:false})} onPointerCancel={()=>post('move',{key:k,value:false})} onLostPointerCapture={()=>post('move',{key:k,value:false})}>{label}</Btn>)}<Btn onClick={()=>post('jump')}>Jump</Btn></div><div className="fa-hud-top"><Btn onClick={()=>frame.current?.focus()}>Focus world · WASD · Shift run</Btn></div></>;break;
    case '11':content=<PartyFormation key={profile?.id||'guest'} profile={profile} encounter={encounter} original={original} layout={screen.layout} transact={transact} go={go} back={back} statPanel={statPanel}/>;break;
    case '12':content=<Skillbook key={profile?.id||'guest'} profile={profile} level={level} original={original} layout={screen.layout} go={go} back={back}/>;break;
    case '14':content=<BattleVictory profile={profile} encounter={encounter} result={result} hud={hud} original={original} layout={screen.layout} onContinue={victoryContinue} onItems={()=>go('38')} onDetails={()=>go('37')}/>;break;
    case '15':content=<BattleDefeat profile={profile} encounter={encounter} result={result} hud={hud} validSlots={validSlots} original={original} layout={screen.layout} onRetry={()=>{const s=current.current;if(s.id==='15'&&s.encounter&&s.profile)retryBattle();}} onExplore={()=>{const s=current.current;if(s.id==='15'&&s.encounter&&s.profile)resumeWorld(s.profile);}} onLoad={()=>{reloadSlots();go('02');}} onTitle={()=>requestConfirm('Return to the title?',leaveTitle)}/>;break;
    case '18':content=original?<div className="fa-original-save">
      <nav className="fa-art-side-nav fa-save-nav" aria-label="Save game navigation">
        <Btn className="fa-painted-button" onClick={()=>{if(running)root(encounter?'09':'10');else back();}}><span className="fa-art-sr">Resume</span></Btn>
        {['05','06','07','08'].map(target=><Btn key={target} className="fa-painted-button" disabled={!profile} onClick={()=>go(target)}><span className="fa-art-sr">{UI_SCREENS[target].name}</span></Btn>)}
        <Btn className="fa-painted-button" aria-current="page" onClick={()=>document.getElementById('fa-save-first')?.focus()}><span className="fa-art-sr">Save slots</span></Btn>
        <Btn className="fa-painted-button" onClick={()=>go('03')}><span className="fa-art-sr">Settings</span></Btn>
        <Btn className="fa-painted-button" onClick={()=>requestConfirm('Return to the title? Unsaved progress may be lost.',leaveTitle)}><span className="fa-art-sr">Return to Title</span></Btn>
      </nav>
      <span className="fa-save-slot-count">{SLOT_IDS.length} local slots</span>
      <div className="fa-save-rows" aria-label="Save slots">
        {SLOT_IDS.map((s,i)=>{const record=slots.slots.find(x=>x.id===s),valid=record?.status==='valid';return <Btn key={s} id={i===0?'fa-save-first':undefined} className="fa-painted-button fa-save-row" primary={selected===s} aria-pressed={selected===s} onClick={()=>setSelected(s)}>
          <span className="fa-save-row-portrait">{valid&&<ArcherPortrait profile={record.profile}/>}</span>
          <span className="fa-save-row-data"><strong>Slot {s} · {valid?record.profile.name:record?'Damaged':'Empty'}</strong>{valid&&<small>Level {levelFor(record.profile.xp)}</small>}</span>
        </Btn>;})}
      </div>
      <section className="fa-save-backup" aria-label="Portable backup"><strong>Portable Save Backup</strong><p>Save the current session to the selected slot. Exports contain the current profile and do not overwrite slots.</p>{backupField}{backupError&&<p role="alert">{backupError}</p>}{encounter&&<p>Manual saves and exports are disabled during combat.</p>}{slots.error&&<p role="alert">{slots.error}</p>}</section>
      <div className="fa-save-preview">{profile&&<RegionMap world={world} profile={profile} small/>}</div>
      <div className="fa-save-title"><strong>{profile?.name||'No active character'}</strong>{profile&&<span>Level {level}</span>}</div>
      <section className="fa-save-world-data" aria-label="World data">{profile&&<><p>{world?.region||'Current exploration'}</p><p>X {profile.world.position[0].toFixed(1)} · Z {profile.world.position[2].toFixed(1)}</p><p>Selected slot: {selected||'None'}</p><p>{selectedSave?'Last save: '+new Date(selectedSave.savedAt).toLocaleString('en-US'):'No valid save in selected slot'}</p></>}</section>
      <section className="fa-save-exploration" aria-label="Exploration progress">{profile&&<><p>Regions visited: {profile.world.visitedRegions.length}</p><p>Encounters completed: {profile.world.completedEncounters.length}</p></>}</section>
      <div className="fa-save-party" aria-label="Current party">{profile&&<><div><ArcherPortrait profile={profile}/></div>{activeRoster(profile).slice(0,3).map(m=><div key={m.id}><ArcherPortrait companion={m}/></div>)}</>}</div>
      <section className="fa-save-resources" aria-label="Current resources">{profile&&<><p>Gold: {fmt(profile.gold)}</p><p>HP: {profile.hp}/{stats.maxHp}</p><p>Experience: {fmt(profile.xp)}</p></>}</section>
      <Btn className="fa-painted-button fa-save-confirm" primary disabled={!profile||!selected||Boolean(encounter)} onClick={manualSave}><span className="fa-art-sr">Save Game</span></Btn>
      <Btn className="fa-painted-button fa-save-export" disabled={!profile||Boolean(encounter)||backupBusy} onClick={()=>downloadBackup(profile)}>Export</Btn>
      <Btn className="fa-painted-button fa-save-encrypted" disabled={!profile||Boolean(encounter)||backupBusy||backupPass.length<12} onClick={()=>downloadBackup(profile,true)}>Encrypted</Btn>
      <Btn className="fa-painted-button fa-save-back" onClick={back}><span className="fa-art-sr">Back</span></Btn>
    </div>:<>{pane(0,<><h2>Save</h2><p>Save your current exploration position.</p></>)}{pane(1,<>{SLOT_IDS.map(s=>{const r=slots.slots.find(x=>x.id===s);return <Btn key={s} onClick={()=>setSelected(s)} primary={selected===s}>Slot {s} · {r?.status==='valid'?r.profile.name:r?'Damaged':'Empty'}</Btn>;})}</>)}{pane(2,<>{statPanel}<Btn primary disabled={!profile||!selected||Boolean(encounter)} onClick={manualSave}>Save Game</Btn><Btn disabled={!profile||Boolean(encounter)||backupBusy} onClick={()=>downloadBackup(profile)}>Export unencrypted backup</Btn>{backupField}<Btn disabled={!profile||Boolean(encounter)||backupBusy||backupPass.length<12} onClick={()=>downloadBackup(profile,true)}>Export encrypted backup</Btn>{backupError&&<small role="alert">{backupError}</small>}{encounter&&<p>Manual saves are disabled during combat.</p>}</>)}</>;break;
    case '13':content=<NPCDialogue key={service?.id||'none'} profile={profile} world={world} service={service} serviceAvailable={serviceAvailable} original={original} layout={screen.layout} go={go} back={back}/>;break;
    case '16':content=<MerchantShop profile={profile} service={service} serviceAvailable={serviceAvailable} original={original} layout={screen.layout} back={back} onTrade={(mode,id)=>{const item=ITEMS[id];if(!Object.hasOwn(ITEMS,id)||!['buy','sell'].includes(mode)||!item[mode])return;requestConfirm((mode==='buy'?'Buy ':'Sell ')+item.name+' for '+item[mode]+' gold?',()=>transact(p=>{const s=current.current;if(!s.service||s.world?.nearbyService!==s.service.id||s.encounter)throw Error('Visit a service marker to trade.');return mode==='buy'?buyItem(p,id):sellItem(p,id);},mode==='buy'?'Item purchased':'Item sold'));}}/>;break;
    case '17':content=<BlacksmithShop profile={profile} serviceAvailable={serviceAvailable} original={original} layout={screen.layout} back={back} go={go} onEnhance={(weapon,level,cost)=>{if(!Object.hasOwn(ITEMS,weapon)||ITEMS[weapon].kind!=='weapon')return;requestConfirm('Enhance '+ITEMS[weapon].name+' to +'+(level+1)+' for '+cost+' gold and 1 Sapphire Ore?',()=>transact(p=>{const s=current.current;if(!s.service||s.world?.nearbyService!==s.service.id||s.encounter)throw Error('Visit a service marker to enhance.');if(p.equipped!==weapon||p.enhancements[weapon]!==level||cost!==15+level*10)throw Error('Equipment changed. Review the new enhancement preview.');return enhanceWeapon(p);},'Weapon enhanced'));}}/>;break;
    case '21':content=<ItemInventory key={profile?.id||'guest'} profile={profile} encounter={encounter} serviceAvailable={serviceAvailable} original={original} layout={screen.layout} initialItem={itemId} onSelect={setItemId} go={go} back={back}/>;break;
    case '22':content=<CraftingShop profile={profile} serviceAvailable={serviceAvailable} original={original} layout={screen.layout} back={back} onCraft={()=>requestConfirm('Craft 1 Recovery Tonic using 2 Sapphire Ore?',()=>transact(p=>{const s=current.current;if(!s.service||s.world?.nearbyService!==s.service.id||s.encounter)throw Error('Visit a service marker to craft.');if(p.inventory.recoveryTonic>=100000)throw Error('Inventory limit reached.');return craftTonic(p);},'Recovery Tonic crafted'))}/>;break;
    case '23':content=<DungeonEntrance profile={profile} world={world} candidate={candidate} encounter={encounter} running={running} original={original} layout={screen.layout} back={back} onDetails={()=>{const s=current.current;if(s.profile&&s.running&&s.candidate?.id===candidate?.id&&candidate&&!s.encounter)go('36');}}/>;break;
    case '24':content=<Bestiary key={profile?.id||'guest'} profile={profile} world={world} original={original} layout={screen.layout} go={go} back={back}/>;break;
    case '25':content=<FastTravel profile={profile} world={world} encounter={encounter} destination={destination} onSelect={setDestination} original={original} layout={screen.layout} go={go} back={back} onTravel={region=>{const profileId=current.current.profile?.id;if(!profileId||!region)return;requestConfirm('Travel to '+region.name+'?',()=>{if(transact(p=>{if(p.id!==profileId)throw Error('Active character changed. Select a destination again.');const liveRegion=current.current.world?.regions.find(r=>r.id===region.id);if(!liveRegion||!Number.isFinite(liveRegion.minX)||!Number.isFinite(liveRegion.maxX)||liveRegion.maxX<=liveRegion.minX)throw Error('Destination is no longer available.');return travelTo(p,liveRegion);},'Arrived at '+region.name)){post('restore',current.current.profile.world);post('pause',false);root('10');}});}}/>;break;
    case '26':content=<Recruitment profile={profile} encounter={encounter} selected={selectedCompanion} member={member} onSelect={setCompanionId} onRecruit={m=>requestConfirm('Recruit '+m.name+'?',()=>transact(p=>recruitCompanion(p,m.id),m.name+' joined'))} original={original} layout={screen.layout} go={go} back={back}/>;break;
     case '27':content=<Wardrobe key={profile?.id||'guest'} profile={profile} encounter={encounter} original={original} back={back} chooseAppearance={chooseAppearance} layout={screen.layout}/>;break;
    case '28':content=<Achievements key={profile?.id||'guest'} profile={profile} original={original} layout={screen.layout} go={go} back={back}/>;break;
    case '29':content=<WorldCodex key={profile?.id||'guest'} profile={profile} world={world} original={original} layout={screen.layout} go={go} back={back}/>;break;
    case '30':content=<CompanionBonds profile={profile} selectedId={companionId} onSelect={setCompanionId} original={original} layout={screen.layout} go={go} back={back}/>;break;
    case '31':content=<TreasureReveal profile={profile} discovery={discovery} loot={loot} encounter={encounter} original={original} layout={screen.layout} onItems={()=>go('38')} onContinue={back}/>;break;
    case '32':content=<Attributes key={profile?.id||'guest'} profile={profile} level={level} locked={!profile||Boolean(encounter&&hud?.phase!=='over')} original={original} layout={screen.layout} unlockedIds={result?.unlocked||[]} back={back} onConfirm={(base,draft)=>{const live=current.current.profile;if(!live||live!==base||(current.current.encounter&&hud?.phase!=='over')||!Array.isArray(draft)||draft.length>pointsFor(live)||draft.some(k=>!STAT_KEYS.includes(k)))return false;const next=draft.reduce((p,k)=>allocate(p,k),live);replaceProfile(next);autosave(next);finishLevel();return true;}}/>;break;
    case '33':content=<SanctuaryRest profile={profile} service={service} serviceAvailable={serviceAvailable} encounter={encounter} original={original} layout={screen.layout} onRest={()=>requestConfirm('Rest and recover all recruited party members?',()=>transact(p=>{const s=current.current;if(!s.service||s.world?.nearbyService!==s.service.id||s.encounter)throw Error('Visit a service marker to rest.');return heal(p,{sanctuary:true});},'Health restored'))} onSave={()=>go('18')} onLeave={()=>root('10')} onRecovery={()=>go('46')}/>;break;
    case '34':content=<InteractiveTutorial profile={profile} running={running} encounter={encounter} lesson={lesson} onLesson={setLesson} original={original} layout={screen.layout} back={back} onPractice={()=>{const s=current.current;if(s.id==='34'&&s.profile&&s.running&&!s.encounter)startBattle({id:'practice',label:'Practice Archer',category:'Normal',practice:true});}}/>;break;
    case '35':content=pane(0,<><h2>{encounter?'Preparing the battleground…':'Loading the world…'}</h2><progress aria-label="Loading world"/><p>{encounter?'Waiting for the regional battleground and combat renderer.':'Waiting for the 3D renderer and saved world position.'}</p><Btn onClick={leaveTitle}>Cancel</Btn></>);break;
    case '36':content=<BossIntroduction key={candidate?.id||'none'} profile={profile} candidate={candidate} encounter={encounter} running={running} original={original} layout={screen.layout} back={back} onEnter={()=>{const s=current.current;if(s.profile&&s.running&&!s.encounter&&s.candidate&&s.candidate.id===candidate?.id&&s.id==='36')startBattle(s.candidate);}}/>;break;
    case '37':content=<GlobalNotifications notifications={notifications} original={original} layout={screen.layout} back={back}/>;break;
    case '38':content=<ItemAcquisition profile={profile} encounter={encounter} result={result} hud={hud} discovery={discovery} loot={loot} origin={stack[stack.length-2]} original={original} layout={screen.layout} onInventory={()=>{if(current.current.profile&&!current.current.encounter)go('06');}} onContinue={back}/>;break;
    case '39':content=<EquipmentComparison key={profile?.id||'guest'} profile={profile} encounter={encounter} initialItem={itemId} initialWearer={wearer} original={original} layout={screen.layout} go={go} back={back} onEquip={(member,key,expected)=>{const s=current.current;if(s.id!=='39'||!s.profile||s.encounter||!Object.hasOwn(ITEMS,key))return;const item=ITEMS[key];const ok=transact(p=>{if(!p.inventory[key])throw Error('You do not own this item.');if(member!=='hero'&&!ROSTER.some(m=>m.id===member&&memberFor(p,m.id).recruited))throw Error('Wearer unavailable.');if(item.kind==='weapon'&&member==='hero'){if(p.equipped!==expected||p.equipped===key)throw Error('Equipped weapon changed. Review comparison.');return equipItem(p,key);}if(item.kind==='gear'){const equipped=gearFor(p,member)[item.slot];if(equipped!==expected||equipped===key)throw Error('Equipped gear changed. Review comparison.');return equipGear(p,member,item.slot,key);}throw Error('Unsupported equipment.');},'Equipment updated');if(ok)back();}}/>;break;
    case '40':content=pane(0,<><h2>Confirmation</h2><p>{pending?.message||'No pending action.'}</p>{buttons(<Btn primary disabled={!pending} onClick={()=>{const f=pending?.action;setPending(null);back();f?.();}}>Confirm</Btn>,<Btn onClick={()=>{setPending(null);back();}}>Cancel</Btn>)}</>);break;
    case '41':content=pane(0,<p role="status">{saveStatus||'No save operation in progress.'}</p>);break;
    case '42':content=<RegionDiscovery discovery={discovery} world={world} profile={profile} original={original} layout={screen.layout} onContinue={back} onMap={()=>{back();go('07');}}/>;break;
    case '43':content=<QuestOffer profile={profile} encounter={encounter} original={original} layout={screen.layout} back={back} onAccept={()=>{if(transact(p=>{if(p.quests.grove!=='available')throw Error('Quest is no longer available.');return acceptGroveQuest(p);},'Quest accepted')){root('10');go('08');}}}/>;break;
    case '44':content=<QuestCompletion profile={profile} original={original} layout={screen.layout} onContinue={()=>root('10')} onJournal={()=>{root('10');go('08');}}/>;break;
    case '45':content=<SkillUnlocked key={profile?.id||'guest'} profile={profile} result={result} level={level} original={original} layout={screen.layout} onContinue={()=>{if(current.current.profile)resumeWorld();else back();}} onSkillbook={()=>{if(current.current.profile){resumeWorld();go('12');}else back();}}/>;break;
    case '46':content=<ConsumableRecovery key={profile?.id||'guest'} profile={profile} encounter={encounter} original={original} layout={screen.layout} back={back} onRecover={(hp,owned)=>{const s=current.current;if(s.id!=='46'||!s.profile||s.encounter)return false;const ok=transact(p=>{if(p.hp!==hp||p.inventory.recoveryTonic!==owned)throw Error('Recovery preview changed. Review the current values.');return heal(p);},'Health restored');if(ok)back();return ok;}}/>;break;
    case '47':content=original?<div className="fa-original-error">
      <h2>Unable to continue</h2><p role="alert">{error}</p>
      <Btn primary className="fa-painted-button fa-error-retry" onClick={()=>{if(current.current.encounter)retryBattle();else if(profile)begin(profile,slot,saveBaseline.current?.slot===slot?saveBaseline.current.stamp:undefined);else leaveTitle();}}><span className="fa-art-sr">Retry</span></Btn>
      <Btn className="fa-painted-button fa-error-return" onClick={leaveTitle}><span className="fa-art-sr">Return to Title</span></Btn>
    </div>:pane(0,<><h2>Unable to continue</h2><p role="alert">{error}</p><Btn primary onClick={()=>{if(current.current.encounter)retryBattle();else if(profile)begin(profile,slot,saveBaseline.current?.slot===slot?saveBaseline.current.stamp:undefined);else leaveTitle();}}>Retry</Btn><Btn onClick={leaveTitle}>Return to Title</Btn></>);break;
    default:content=<>{pane(0,<><h2>{screen.name}</h2><p>This screen is reserved for the corresponding gameplay service. No items, currencies, rewards or transactions are simulated.</p><Btn onClick={back}>Back</Btn></>)}{screen.layout.length>1&&pane(screen.layout.length-1,<p>Gameplay service not available in the current archer prototype.</p>)}</>;break;
  }
  const template=original?.url||templateUrl(id);
  const artwork=original?{mode:'original-full',asset:null}:artFor(id,running);
  const artworkUrl=artUrl(artwork.asset);
  return <main className={'fa-root'+(settings.reducedMotion?' reduced-motion':'')}>
    {running?<iframe className="fa-world" ref={frame} src="/fantasy-battle-world" title="Sapphire Wilds 3D world" tabIndex={id==='10'?0:-1} style={{pointerEvents:id==='10'?'auto':'none'}}/>:<div className="fa-title-art"/>}
    {encounter&&arenaReady&&profile&&<BattleSurface key={encounter.token} encounter={encounter} profile={profile} paused={id!=='09'} muted={settings.muted} reducedMotion={settings.reducedMotion} quality={settings.quality} stageRef={stageRef} onHud={handleBattleHud} onError={(message,token)=>{if(isCurrentEncounter(current.current.encounter,token))fail(message);}}/>}
    {artwork.mode==='cinematic'&&<div className={'fa-cinematic-art'+(artwork.asset==='title-original'?' title-original':'')} aria-hidden="true" style={{'--fa-scene-art':'url("'+artworkUrl+'")'}}/>}
    <div className={'fa-ui '+(isWorldScreen(id)?'hud':'page')} key={id} data-screen={id} data-art-mode={artwork.mode} data-staged-original={original?'true':undefined}>
      <div aria-hidden="true" className="fa-template" style={{backgroundImage:'url("'+template+'")'}}/>
      {!isWorldScreen(id)&&id!=='01'&&<header className="fa-header"><div className="fa-heading"><span className="fa-heading-kicker" aria-hidden="true">Sapphire Sumi</span><h1 tabIndex={-1} ref={focusRef}>{screen.name}</h1></div>{!['35','14','15','40','47','45'].includes(id)&&<Btn onClick={back}>Back · Esc</Btn>}</header>}
      {original&&id==='35'&&<span className="fa-original-subtitle" aria-hidden="true">Fantasy Battle</span>}
      {content}
    </div>
    {saveStatus?<SaveToast status={saveStatus}/>:notice&&<aside className="fa-notice" role="status">{notice}</aside>}
  </main>;
}
