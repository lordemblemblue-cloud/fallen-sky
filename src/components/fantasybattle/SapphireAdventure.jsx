import { useEffect, useRef, useState } from 'react';
import { FantasyBattleStage, UNITS } from './FantasyBattleStage.js';
import { GEAR, GEAR_SLOTS, gearFor, gearCount, equippedVisuals } from './core/equipmentCatalog.mjs';
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
  const requirements=<><p>{eligible?'Completed':'Required'}: {requirement}</p><p>{profile?'Active character ready':'Create or load a character first'}</p>{encounter&&<p>Recruitment is locked during combat.</p>}<p>{member.recruited?'Already recruited':eligible?'Ready to recruit':'Defeat the required encounter to unlock'}</p></>;
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
function QuestJournal({profile,encounter,original,layout,go,back,onClaim}){
  const [filter,setFilter]=useState('all');
  const state=profile?.quests.grove;
  const defeated=Boolean(profile?.world.completedEncounters.includes('wilds_grove_01'));
  const status=({available:'Available',active:'Active',complete:'Ready to complete',claimed:'Completed'})[state]||'No active character';
  const visible=Boolean(profile&&(filter==='all'||(filter==='completed'?(state==='complete'||state==='claimed'):filter===state)));
  const canAccept=Boolean(profile&&state==='available'&&!encounter);
  const canClaim=Boolean(profile&&state==='complete'&&!encounter);
  const filters=[['all','All quests'],['active','Active'],['available','Available'],['completed','Completed']];
  const filterButtons=filters.map(([key,label])=><Btn key={key} primary={filter===key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</Btn>);
  const questEntry=visible?<div className="fa-journal-entry"><strong>Whispering Grove Spirit</strong><small>{status}</small></div>:<p>No quests match this filter.</p>;
  const action=state==='available'?<Btn primary className="fa-journal-action" disabled={!canAccept} onClick={()=>go('43')}>View quest offer</Btn>:state==='complete'?<Btn primary className="fa-journal-action" disabled={!canClaim} onClick={onClaim}>Complete quest</Btn>:<Btn primary className="fa-journal-action" disabled={state!=='active'||Boolean(encounter)} onClick={()=>go('07')}>{state==='claimed'?'Completed':state==='active'?'View objective':'No quest'}</Btn>;
  const objective=<><p>Defeat the Grove Spirit in Whispering Grove.</p><p>{defeated?'Encounter defeated':'Encounter not yet defeated'} · {defeated?1:0}/1</p><progress aria-label="Grove Spirit objective" max={1} value={defeated?1:0}/><p>{state==='claimed'?'Quest recorded as completed.':state==='complete'?'Record quest completion.':state==='active'?'Win the encounter to advance the quest.':'Accept the quest to begin tracking it.'}</p></>;
  const reward=<><p>Experience, gold and loot are awarded by the first eligible battle victory.</p><p>No additional reward is granted for completing the journal entry.</p></>;
  if(original)return <div className="fa-original-journal">
    <h2 className="fa-journal-title">Quest Journal</h2>
    <nav className="fa-journal-tabs" aria-label="Quest filters">{filterButtons}<Btn onClick={()=>go('07')}>Map</Btn><Btn onClick={back}>Back</Btn></nav>
    <nav className="fa-journal-nav" aria-label="Journal views">{filterButtons}<Btn onClick={()=>go('07')}>World map</Btn><Btn onClick={()=>go('24')}>Bestiary</Btn><Btn onClick={back}>Back</Btn></nav>
    <h3 className="fa-journal-list-title">Quest log</h3><section className="fa-journal-list" aria-label="Quest list">{questEntry}</section>
    <div className="fa-journal-empty">No additional quests available in this build.</div>
    {visible?<><h3 className="fa-journal-name">Whispering Grove Spirit</h3><div className="fa-journal-status">{status}</div><h3 className="fa-journal-objective-title">Objective</h3><section className="fa-journal-objective">{objective}</section>
    <h3 className="fa-journal-description-title">Quest details</h3><section className="fa-journal-description"><p>Locate the encounter in Whispering Grove and defeat the spirit. Progress is recorded in the active character's saved profile.</p>{encounter&&<p>Quest actions are locked during combat.</p>}</section>
    <h3 className="fa-journal-reward-title">Rewards</h3><section className="fa-journal-rewards">{reward}</section></>:<section className="fa-journal-no-selection"><p>Select a filter with an available quest to view its objectives.</p></section>}
    <Btn className="fa-journal-map" onClick={()=>go('07')}>World map</Btn>{visible?action:<Btn className="fa-journal-action" disabled>No quest selected</Btn>}<Btn className="fa-journal-back" onClick={back}>Back</Btn>
  </div>;
  return <><Panel rect={layout[0]}>{filterButtons}<Btn onClick={()=>go('07')}>Map</Btn><Btn onClick={back}>Back</Btn></Panel><Panel rect={layout[1]}><h2>Quest log</h2>{questEntry}</Panel><Panel rect={layout[2]}>{visible?<><h2>Whispering Grove Spirit</h2><p>{status}</p>{objective}{reward}{action}</>:<p>No quest selected.</p>}</Panel></>;
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
  const message=!available?'Approach a gold service marker in the world to interact.':group==='services'?'Choose a service to trade, enhance equipment or craft supplies.':'Rest, review available quests or recruit companions before your next encounter.';
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
  const description=<><p>Defeat the Grove Spirit in the first exploration region, Whispering Grove.</p><p>{reason}</p></>;
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
  const reward=<><p>{completed?'Battle rewards were awarded when the encounter was first defeated.':'Rewards are handled by the battle system.'}</p><p>No additional experience, gold or loot is granted by this screen.</p><p>{completed?'Quest completion is recorded in your active profile.':'Return to the journal to review the quest.'}</p></>;
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
  const description=ready?'Review the enemy formation and tactics before entering battle.':encounter?'An encounter is already active.':'Approach an encounter marker in the world.';
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
  const roster=enemies.map(e=><Btn key={e.id} primary={selected?.id===e.id} aria-pressed={selected?.id===e.id} onClick={()=>setSelectedId(e.id)}><EnemyPortrait enemy={e} small/><strong>{e.name}</strong><small>HP {e.maxHp}</small></Btn>);
  const details=<StatRows stats={{HP:selected?.maxHp??'—',Attack:selected?.atk??'—',Defense:selected?.def??'—',Speed:selected?.spd??'—'}}/>;
  const tactics=<>{enemies.map(e=><div className="fa-boss-tactic" key={e.id}><EnemyPortrait enemy={e} small/><div><strong>{e.name}</strong><p>{tacticFor(e.strategy,e.archetype)}</p></div></div>)}{!enemies.length&&<p>No encounter data available.</p>}</>;
  const reward=completed?'First-victory rewards already recorded.':ready?'First eligible victory awards XP, gold and loot.':'No reward preview available.';
  const enter=<Btn primary className="fa-boss-enter" disabled={!ready} onClick={onEnter}>Enter Battle</Btn>;
  if(original)return <div className="fa-original-boss">
    <h2 className="fa-boss-title">{category==='Boss'?'Boss Introduction':'Encounter Introduction'}</h2>
    <h3 className="fa-boss-name">{title}</h3><div className="fa-boss-category">{category} encounter</div>
    <section className="fa-boss-description"><p>{ready?'Review the enemy formation before entering.':'Approach an encounter marker to begin.'}</p>{completed&&<p>Previously defeated.</p>}</section>
    <div className="fa-boss-preview">{selected?<><EnemyPortrait enemy={selected}/><strong>{selected.name}</strong></>:<p>No enemy selected</p>}</div>
    <h3 className="fa-boss-stats-title">Enemy details</h3><section className="fa-boss-stats">{details}</section>
    <h3 className="fa-boss-tactics-title">Enemy mechanics</h3><section className="fa-boss-tactics" aria-label="Enemy mechanics">{tactics}</section>
    <h3 className="fa-boss-formation-title">Enemy formation</h3><section className="fa-boss-roster" aria-label="Select enemy to inspect">{roster}{!enemies.length&&<p>No enemies</p>}</section>
    <h3 className="fa-boss-rewards-title">Battle rewards</h3><section className="fa-boss-rewards"><p>{reward}</p><small>Party {partySize}/4 · Fixed encounter difficulty · No reward at entry</small></section>
    {enter}<Btn className="fa-boss-close" aria-label="Back to entrance" onClick={back}>×</Btn>
  </div>;
  return <><Panel rect={layout[0]}><h2>{title}</h2><p>{category} · Party {partySize}/4</p>{roster}{details}</Panel><Panel rect={layout[1]}><h2>Enemy mechanics</h2>{tactics}<p>{reward}</p>{enter}<Btn onClick={back}>Back</Btn></Panel></>;
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
  const [companionId,setCompanionId]=useState(COMPANION.id),[enemyId,setEnemyId]=useState(null);
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
  const notify=message=>{setNotifications(old=>[{message,time:Date.now()},...old].slice(0,40));setNotice(message);};
  const fail=message=>{clearTimeout(timeoutRef.current);clearTimeout(battleTimer.current);failedLoad.current=true;setError(message);go('47');};
  const transact=(operation,success)=>{const p=current.current.profile;if(!p||current.current.encounter){notify('This action is available only outside battle.');return false;}try{const next=operation(p);replaceProfile(next);autosave(next);notify(success);return true;}catch(e){notify(e.message);return false;}};
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
    if(won&&!e.practice){const r=rewardVictory(p,e,state.units.find(u=>u.id==='hero')?.hp,state.units);replaceProfile(r.profile);setResult(r);setLoot(r.loot);notify('Victory · +'+r.xp+' XP · +'+r.gold+' gold');autosave(r.profile);}
    else setResult({profile:p,xp:0,leveled:false,unlocked:[]});
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
      if(newRegion&&s.id==='10'){const item=e.world.regions.find(x=>x.id===newRegion);if(p.world.visitedRegions.length){setDiscovery({kind:'region',id:newRegion,label:item?.name||e.world.region});go('42');notify('New region: '+(item?.name||e.world.region));}autosave(updated);}
      return;
    }
    if(e.type==='encounter'&&p&&s.id==='10'&&!s.encounter){
      const updated=updateWorld(p,e.world);replaceProfile(updated);setWorld(e.world);if(e.encounter.category==='Normal')startBattle(e.encounter);else{setCandidate(e.encounter);go('23');}return;
    }
    if(e.type==='discovery'&&p&&!s.encounter){const updated=updateWorld(p,e.world);const awarded=collectLoot(updated,e.id);replaceProfile(awarded.profile);setWorld(e.world);setDiscovery({kind:'landmark',id:e.id,label:e.label});setLoot(awarded.loot);notify(e.label);autosave(awarded.profile);go(awarded.loot.length?'31':'42');return;}
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
  const seenEnemy=world?.encounters?.find(e=>e.id===enemyId)||world?.encounters?.[0];
  const backupField=<label>Backup passphrase (encrypted transfers only)<input type="password" autoComplete="off" value={backupPass} maxLength={256} onChange={e=>setBackupPass(e.target.value)} placeholder="12 or more characters"/></label>;
  const recent=mostRecent(slots.slots),level=profile?levelFor(profile.xp):1,stats=heroStats(profile);
  const serviceAvailable=Boolean(service&&world?.nearbyService===service.id&&!encounter);
  const inv=profile?.inventory||{};const selectedItem=ITEMS[itemId];const compare=profile?comparison(profile,itemId):null;
  const gearMembers=[{id:'hero',name:profile?.name||'Leader'},...ROSTER.filter(m=>memberFor(profile,m.id).recruited)];
  const wearer=gearMembers.some(m=>m.id===gearWearer)?gearWearer:'hero',worn=gearFor(profile,wearer),gearCompare=profile?gearComparison(profile,wearer,itemId):null;
  const listItems=(filter=()=>true)=>Object.entries(ITEMS).filter(([k,item])=>filter(item,k)).map(([k,item])=><Btn key={k} className="fa-item-row" primary={itemId===k} aria-pressed={itemId===k} onClick={()=>setItemId(k)}><ItemArt id={k}/><span className="fa-item-label"><strong>{item.name}</strong><small>{item.kind==='gear'?(item.slot==='armor'?'Armor':'Mantle'):item.kind==='weapon'?'Weapon':item.kind==='consumable'?'Consumable':'Material'}</small></span><span className="fa-item-count">×{inv[k]||0}</span></Btn>);
  const lootList=loot.length?loot.map(l=><div className="fa-loot-row" key={l.id}><ItemArt id={l.id}/><span>{ITEMS[l.id]?.name||l.id} ×{l.count}</span></div>):<p>No items awarded.</p>;
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
    case '48':content=<>{pane(0,<>{nav(['03','34'])}<Btn onClick={back}>Back</Btn></>)}{pane(2,<><h2>Welcome, adventurer</h2><p>Guest progress is stored on this browser. No account is required. Choose your settings before beginning.</p><Btn primary onClick={()=>go('19')}>Create Character</Btn><Btn onClick={()=>go('03')}>Graphics and Audio</Btn><Btn onClick={()=>go('34')}>Tutorial</Btn></>)}</>;break;
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
      <section className="fa-character-lower fa-character-gear"><h3>Equipment</h3>{profile&&<><p>Bow: {ITEMS[profile.equipped]?.name||'None'}</p>{GEAR_SLOTS.map(s=><p key={s}>{s==='armor'?'Armor':'Mantle'}: {GEAR[gearFor(profile,'hero')[s]]?.name||'None'}</p>)}</>}</section>
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
        <section className="fa-eq-detail" aria-label="Selected item">{selectedOwned?<><ItemArt id={itemId}/><div><strong>{selectedItem.name}</strong><p>{selectedItem.kind==='gear'?'Available: '+Math.max(0,(inv[itemId]||0)-gearCount(profile,itemId)):'Owned: '+inv[itemId]}</p><small>{selectedItem.kind==='gear'?(worn[selectedItem.slot]===itemId?'Equipped on this character':'Gear'):(profile.equipped===itemId?'Equipped bow':'Bow')}</small></div></>:<p>Select an owned item.</p>}</section>
        <section className="fa-eq-compare" aria-label="Equipment statistic comparison"><strong>Current → After equipping</strong>{profile&&Object.entries(memberStats(profile,wearer)).filter(([k])=>['maxHp','atk','def','spd'].includes(k)).map(([k,v])=>{const next=liveCompare?.candidate?.[k];return <div key={k}><span>{{maxHp:'Maximum HP',atk:'Attack',def:'Defense',spd:'Speed'}[k]}</span><span>{v}</span><span>{next??'—'}</span><span>{next==null?'—':(next-v>0?'+':'')+(next-v)}</span></div>;})}</section>
        <Btn primary className="fa-eq-equip" disabled={!canEquip} onClick={()=>selectedItem.kind==='gear'?transact(p=>equipGear(p,wearer,selectedItem.slot,itemId),'Gear equipped'):transact(p=>equipItem(p,itemId),'Weapon equipped')}>Equip</Btn>
        <Btn className="fa-eq-remove" disabled={!canRemove} onClick={()=>transact(p=>equipGear(p,wearer,selectedItem.slot,null),'Gear removed')}>Remove</Btn><Btn className="fa-eq-back" onClick={back}>Back</Btn>
      </div>:<>{pane(0,<>{nav(['21','17','39'])}<h2>Wearer</h2>{gearMembers.map(m=><Btn key={m.id} primary={m.id===wearer} onClick={()=>setGearWearer(m.id)}>{m.name}</Btn>)}</>)}{pane(1,<><h2>{gearMembers.find(m=>m.id===wearer)?.name}</h2>{wearer==='hero'&&<p>Bow: {ITEMS[profile?.equipped]?.name||'None'} +{profile?.enhancements?.[profile?.equipped]||0}</p>}{GEAR_SLOTS.map(slot=><div className="fa-party-card" key={slot}><strong>{slot==='armor'?'Armor':'Mantle'}</strong><ItemArt id={worn[slot]}/><p>{GEAR[worn[slot]]?.name||'None'}</p><Btn disabled={!worn[slot]||Boolean(encounter)} onClick={()=>transact(p=>equipGear(p,wearer,slot,null),'Gear removed')}>Unequip</Btn></div>)}<p>Gold: {profile?.gold||0}</p></>)}{pane(2,<>{listItems((item,k)=>(item.kind==='gear'||(wearer==='hero'&&item.kind==='weapon'))&&inv[k]>0)}{selectedItem?.kind==='gear'?<><p>Available: {Math.max(0,(inv[itemId]||0)-gearCount(profile,itemId))}</p><Btn disabled={!gearCompare||worn[selectedItem.slot]===itemId||Boolean(encounter)} onClick={()=>transact(p=>equipGear(p,wearer,selectedItem.slot,itemId),'Gear equipped')}>Equip selected gear</Btn></>:<Btn disabled={wearer!=='hero'||!compare||Boolean(encounter)} onClick={()=>go('39')}>Compare selected bow</Btn>}</>)}{pane(3,<>{profile&&<StatRows stats={memberStats(profile,wearer)}/>} {gearCompare&&<><h2>After equipping</h2><StatRows stats={gearCompare.candidate}/></>}</>)}</>;break;}
    case '07':content=<WorldMap world={world} profile={profile} encounter={encounter} original={original} layout={screen.layout} go={go} back={back} onTravel={region=>{setDestination(region);go('25');}}/>;break;
    case '08':content=<QuestJournal key={profile?.id||'guest'} profile={profile} encounter={encounter} original={original} layout={screen.layout} go={go} back={back} onClaim={()=>{if(transact(p=>{if(p.quests.grove!=='complete')throw Error('Quest is not ready to complete.');return claimGroveQuest(p);},'Quest completed'))go('44');}}/>;break;
    case '09':content=original?<OriginalCombatHud hud={hud} profile={profile} encounter={encounter} onAction={id=>{const s=current.current;if(s.id==='09'&&s.encounter)stageRef.current?.chooseAction(id);}} onPause={openPause} onSkills={()=>go('12')}/>:<>{pane(0,<><h2>{hud?'Round '+hud.round:'Preparing combat…'}</h2><div className="fa-turns">{hud?.order.map(o=><span className={o.active?'active':''} key={o.id}>{o.name}{o.action?' · '+o.action:''}</span>)}</div></>)}{pane(1,<>{hud?.units.filter(u=>u.team==='player').map(u=><div className={'fa-party-hud-row'+(hud.choosingUnit===u.id?' choosing':'')} key={u.id}>{u.id==='hero'?<ArcherPortrait profile={profile} small/>:<ArcherPortrait companion={ROSTER.find(m=>m.id===u.id)} small/>}<strong>{u.name}</strong><progress aria-label={u.name+' health'} value={u.hp} max={u.maxHp}/><small>HP {u.hp}/{u.maxHp} · Focus {u.focus}/{u.maxFocus}{u.hp===0?' · Down':hud.pendingChoices?.[u.id]?' · Ready':''}</small></div>)}<small aria-live="polite">{hud?.log.at(-1)}</small></>)}{pane(2,<><small>{hud?.phase==='choose'?'Choose: '+(hud.units.find(u=>u.id===hud.choosingUnit)?.name||''):'Resolving round'}</small><div className="fa-combat-actions">{hud?.legal.map(a=><Btn key={a.id} className={'fa-action '+a.action.kind} disabled={!a.enabled} title={a.reason||a.action.summary} aria-label={a.action.name+' — '+(a.reason||a.action.summary)} onClick={()=>stageRef.current?.chooseAction(a.id)}><SkillArt id={a.id}/><span className="fa-action-label"><kbd>{a.action.hotkey}</kbd> {a.action.name}</span><small>{a.reason||a.action.summary}</small></Btn>)}</div></>)}{pane(3,<>{hud?.units.filter(u=>u.team==='enemy').map(u=><div key={u.id} className={'fa-enemy-hud'+(u.hp===0?' down':'')}><strong>{u.name}</strong><progress aria-label={u.name+' health'} value={u.hp} max={u.maxHp}/><small>HP {u.hp}/{u.maxHp}</small>{hud.intents?.filter(i=>i.unitId===u.id).map(i=><div key={i.unitId} className={'fa-enemy-intent '+i.kind}><SkillArt id={i.actionId}/><div>{i.phaseName&&<small className="fa-boss-phase">{i.phaseName}</small>}<strong>{i.name}</strong><small>{i.summary}{i.targetId?' · Targets current frontline':''}</small></div></div>)}</div>)}</>)}<div className="fa-hud-top"><Btn onClick={openPause}>Pause · Esc</Btn><Btn onClick={()=>go('12')}>Skills · K</Btn></div></>;break;
    case '10':content=<>{pane(0,<><strong>{profile?.name}</strong><p>Level {level}</p><progress value={profile?.xp%100||0} max={100}/><small>{profile?.xp||0} total XP</small><progress value={profile?.hp||0} max={stats.maxHp}/><small>HP {profile?.hp||0}/{stats.maxHp} · Gold {profile?.gold||0}</small></>)}{pane(1,<button className="fa-map-button" onClick={()=>go('07')}><RegionMap world={world} profile={profile} small/></button>)}{pane(2,<><small>{world?.region}</small>{world?.nearby&&<Btn primary onClick={()=>post('interact')}>{world.nearby} · E</Btn>}{profile?.quests.grove==='active'&&<p>Quest: Defeat the Grove Spirit</p>}</>)}{pane(3,<div className="fa-hud-buttons"><Btn onClick={openPause}>Menu</Btn><Btn onClick={()=>go('07')}>Map</Btn><Btn onClick={()=>go('08')}>Journal</Btn><Btn onClick={()=>go('12')}>Skills</Btn></div>)}<div className="fa-touch">{[['left','←'],['right','→'],['in','↑'],['out','↓'],['run','Run']].map(([k,label])=><Btn key={k} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);post('move',{key:k,value:true});}} onPointerUp={()=>post('move',{key:k,value:false})} onPointerCancel={()=>post('move',{key:k,value:false})} onLostPointerCapture={()=>post('move',{key:k,value:false})}>{label}</Btn>)}<Btn onClick={()=>post('jump')}>Jump</Btn></div><div className="fa-hud-top"><Btn onClick={()=>frame.current?.focus()}>Focus world · WASD · Shift run</Btn></div></>;break;
    case '11':content=<PartyFormation key={profile?.id||'guest'} profile={profile} encounter={encounter} original={original} layout={screen.layout} transact={transact} go={go} back={back} statPanel={statPanel}/>;break;
    case '12':content=<Skillbook key={profile?.id||'guest'} profile={profile} level={level} original={original} layout={screen.layout} go={go} back={back}/>;break;
    case '14':content=pane(0,<><h2>Victory</h2><p>{encounter?.label}</p><p>Experience earned: +{result?.xp||0} · Gold +{result?.gold||0}</p>{lootList}{loot.length>0&&<Btn onClick={()=>go('38')}>View Acquired Items</Btn>}{result?.leveled&&<p>Level {level} reached! {pointsFor(profile)} unspent points.</p>}<Btn primary onClick={victoryContinue}>{result?.leveled?'Level Up':'Continue'}</Btn></>);break;
    case '15':content=pane(0,<><h2>Defeat</h2><p>No rewards were granted.</p><Btn primary onClick={retryBattle}>Retry</Btn><Btn onClick={()=>resumeWorld()}>Return to Exploration</Btn><Btn disabled={!validSlots.length} onClick={()=>go('02')}>Load Game</Btn><Btn onClick={()=>requestConfirm('Return to the title?',leaveTitle)}>Title</Btn></>);break;
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
    case '16':content=<>{pane(0,<><h2>Merchant</h2><p>Gold: {profile?.gold||0}</p>{!serviceAvailable&&<p>Visit a service marker to trade.</p>}</>)}{pane(1,listItems((item)=>item.buy>0))}{pane(2,<><h2>{selectedItem?.name}</h2><p>Buy: {selectedItem?.buy||0} gold · Sell: {selectedItem?.sell||0} gold</p>{selectedItem?.kind==='gear'&&<><ItemArt id={itemId}/><StatRows stats={{Attack:selectedItem.atk,Defense:selectedItem.def,Speed:selectedItem.spd}}/><p>Equipped copies: {gearCount(profile,itemId)}</p></>}<Btn disabled={!serviceAvailable||!selectedItem?.buy||profile.gold<selectedItem.buy} onClick={()=>requestConfirm('Buy '+selectedItem.name+'?',()=>transact(p=>buyItem(p,itemId),'Item purchased'))}>Buy</Btn><Btn disabled={!serviceAvailable||!selectedItem?.sell||!inv[itemId]||(selectedItem.kind==='gear'&&inv[itemId]<=gearCount(profile,itemId))||(profile?.equipped===itemId&&inv[itemId]===1)} onClick={()=>requestConfirm('Sell '+selectedItem.name+'?',()=>transact(p=>sellItem(p,itemId),'Item sold'))}>Sell</Btn></>)}</>;break;
    case '17':content=<>{pane(0,<><h2>Blacksmith</h2><p>Gold: {profile?.gold||0} · Ore: {inv.sapphireOre||0}</p>{!serviceAvailable&&<p>Visit a service marker.</p>}</>)}{pane(1,<><h2>{ITEMS[profile?.equipped]?.name}</h2><p>Enhancement +{profile?.enhancements?.[profile?.equipped]||0} / 5</p><p>Cost: {15+(profile?.enhancements?.[profile?.equipped]||0)*10} gold and 1 ore.</p></>)}{pane(2,<><p>Attack after enhancement: {stats.atk+2}</p><Btn disabled={!serviceAvailable||!inv.sapphireOre||(profile?.enhancements?.[profile?.equipped]||0)>=5} onClick={()=>requestConfirm('Enhance equipped bow?',()=>transact(enhanceWeapon,'Weapon enhanced'))}>Enhance</Btn></>)}</>;break;
    case '21':content=<>{pane(0,nav(['06','22']))}{pane(1,listItems((item,k)=>item.kind!=='weapon'&&inv[k]>0))}{pane(2,<><h2>{selectedItem?.name}</h2><p>Owned: {inv[itemId]||0}</p>{itemId==='recoveryTonic'&&<Btn disabled={!inv.recoveryTonic||Boolean(encounter)} onClick={()=>go('46')}>Use Tonic</Btn>}</>)}</>;break;
    case '22':content=<>{pane(0,<h2>Crafting</h2>)}{pane(1,<><h2>Recovery Tonic</h2><p>Requires 2 Sapphire Ore · Owned {inv.sapphireOre||0}</p></>)}{pane(2,<Btn disabled={!serviceAvailable||inv.sapphireOre<2} onClick={()=>requestConfirm('Craft Recovery Tonic?',()=>transact(craftTonic,'Recovery Tonic crafted'))}>Craft</Btn>)}</>;break;
    case '23':content=<DungeonEntrance profile={profile} world={world} candidate={candidate} encounter={encounter} running={running} original={original} layout={screen.layout} back={back} onDetails={()=>{const s=current.current;if(s.profile&&s.running&&s.candidate?.id===candidate?.id&&candidate&&!s.encounter)go('36');}}/>;break;
    case '24':content=<>{pane(0,nav(['29']))}{pane(1,<>{world?.encounters?.length?world.encounters.map(e=><Btn key={e.id} primary={seenEnemy?.id===e.id} onClick={()=>setEnemyId(e.id)}>{e.label} · {e.completed?'Defeated':'Discovered'}</Btn>):<p>No enemies discovered.</p>}</>)}{pane(2,seenEnemy?<><h2>{seenEnemy.label}</h2>{enemyFormation(seenEnemy,1).map(e=><div key={e.id}><EnemyPortrait enemy={e}/><StatRows stats={{HP:e.maxHp,Attack:e.atk,Defense:e.def,Speed:e.spd}}/><p>{tacticFor(e.strategy,e.archetype)}</p></div>)}<small>Base stats; formation scales with party size.</small></>:<p>Explore to discover enemy entries.</p>)}</>;break;
    case '25':content=<FastTravel profile={profile} world={world} encounter={encounter} destination={destination} onSelect={setDestination} original={original} layout={screen.layout} go={go} back={back} onTravel={region=>{const profileId=current.current.profile?.id;if(!profileId||!region)return;requestConfirm('Travel to '+region.name+'?',()=>{if(transact(p=>{if(p.id!==profileId)throw Error('Active character changed. Select a destination again.');const liveRegion=current.current.world?.regions.find(r=>r.id===region.id);if(!liveRegion||!Number.isFinite(liveRegion.minX)||!Number.isFinite(liveRegion.maxX)||liveRegion.maxX<=liveRegion.minX)throw Error('Destination is no longer available.');return travelTo(p,liveRegion);},'Arrived at '+region.name)){post('restore',current.current.profile.world);post('pause',false);root('10');}});}}/>;break;
    case '26':content=<Recruitment profile={profile} encounter={encounter} selected={selectedCompanion} member={member} onSelect={setCompanionId} onRecruit={m=>requestConfirm('Recruit '+m.name+'?',()=>transact(p=>recruitCompanion(p,m.id),m.name+' joined'))} original={original} layout={screen.layout} go={go} back={back}/>;break;
     case '27':content=<Wardrobe key={profile?.id||'guest'} profile={profile} encounter={encounter} original={original} back={back} chooseAppearance={chooseAppearance} layout={screen.layout}/>;break;
    case '28':content=<>{pane(0,nav(['24','29']))}{pane(1,<StatRows stats={{'Regions discovered':profile?.world.visitedRegions.length||0,'Encounters defeated':profile?.world.completedEncounters.length||0,'Hidden discoveries':profile?.world.discoveries.length||0}}/>)}{pane(2,<p>Milestone tracking is live. Achievement rewards have not been defined.</p>)}</>;break;
    case '29':content=<>{pane(0,nav(['24','07']))}{pane(1,<>{world?.regions.filter(r=>profile?.world.visitedRegions.includes(r.id)).map(r=><p key={r.id}>{r.name}</p>)||<p>No discoveries.</p>}</>)}{pane(2,<p>Only discovered map regions are shown. Story and lore records will appear when authored.</p>)}</>;break;
    case '30':content=<CompanionBonds profile={profile} selectedId={companionId} onSelect={setCompanionId} original={original} layout={screen.layout} go={go} back={back}/>;break;
    case '31':content=pane(0,<><h2>Treasure Discovered</h2><p>{discovery?.label}</p>{lootList}<p>These items were recorded once in your inventory.</p><Btn primary onClick={()=>go('38')}>View Items</Btn><Btn onClick={back}>Continue</Btn></>);break;
    case '32':content=<Attributes key={profile?.id||'guest'} profile={profile} level={level} locked={!profile||Boolean(encounter&&hud?.phase!=='over')} original={original} layout={screen.layout} unlockedIds={result?.unlocked||[]} back={back} onConfirm={(base,draft)=>{const live=current.current.profile;if(!live||live!==base||(current.current.encounter&&hud?.phase!=='over')||!Array.isArray(draft)||draft.length>pointsFor(live)||draft.some(k=>!STAT_KEYS.includes(k)))return false;const next=draft.reduce((p,k)=>allocate(p,k),live);replaceProfile(next);autosave(next);finishLevel();return true;}}/>;break;
    case '33':content=<>{pane(0,<><h2>Rest Point</h2><p>{service?.label||'Not at a sanctuary'}</p></>)}{pane(1,statPanel)}{pane(2,<><p>Restore the leader and all recruited companions at a registered service point.</p><Btn disabled={!serviceAvailable||(profile.hp>=stats.maxHp&&!partyNeedsRest(profile))} onClick={()=>requestConfirm('Rest and recover?',()=>transact(p=>heal(p,{sanctuary:true}),'Health restored'))}>Rest</Btn><Btn onClick={()=>go('18')}>Save</Btn></>)}{pane(3,<Btn onClick={()=>root('10')}>Leave</Btn>)}</>;break;
    case '34':{const lessons=['Explore with WASD or the on-screen movement controls. Hold Shift or Run to sprint; Space or Jump to jump. Approach a marker and press E.','Choose a legal combat action. Quick Shot and Guard generate Focus; stronger skills spend it.','Open Character with C, Skillbook with K, Map with M, Journal with L, Equipment with I; Escape returns one level.'];content=<>{pane(0,<>{lessons.map((_,i)=><Btn key={i} primary={lesson===i} onClick={()=>setLesson(i)}>Lesson {i+1}</Btn>)}</>)}{pane(1,<><h2>Lesson {lesson+1}</h2><p>{lessons[lesson]}</p></>)}{pane(2,<Btn disabled={!running||Boolean(encounter)} onClick={()=>startBattle({id:'practice',label:'Practice Archer',category:'Normal',practice:true})}>Practice Battle</Btn>)}{pane(3,buttons(<Btn onClick={()=>setLesson(Math.max(0,lesson-1))}>Previous</Btn>,<Btn onClick={()=>setLesson(Math.min(lessons.length-1,lesson+1))}>Next</Btn>))}</>;break;}
    case '35':content=pane(0,<><h2>{encounter?'Preparing the battleground…':'Loading the world…'}</h2><progress aria-label="Loading world"/><p>{encounter?'Waiting for the regional battleground and combat renderer.':'Waiting for the 3D renderer and saved world position.'}</p><Btn onClick={leaveTitle}>Cancel</Btn></>);break;
    case '36':content=<BossIntroduction key={candidate?.id||'none'} profile={profile} candidate={candidate} encounter={encounter} running={running} original={original} layout={screen.layout} back={back} onEnter={()=>{const s=current.current;if(s.profile&&s.running&&!s.encounter&&s.candidate&&s.candidate.id===candidate?.id&&s.id==='36')startBattle(s.candidate);}}/>;break;
    case '37':content=<>{pane(0,<h2>Local gameplay events</h2>)}{pane(1,<>{notifications.length?notifications.map((n,i)=><p key={n.time+'-'+i}>{n.message}</p>):<p>No notifications.</p>}</>)}{pane(2,<p>Notifications are generated by actual game events.</p>)}</>;break;
    case '38':content=<>{pane(0,<><h2>Items Acquired</h2><PaintedIllustration name="item-acquired"/></>)}{pane(1,<>{lootList}<p>Already added to your inventory.</p></>)}{pane(2,<>{!encounter&&<Btn onClick={()=>go('06')}>Inventory</Btn>}<Btn primary onClick={back}>Continue</Btn></>)}</>;break;
    case '39':content=<>{pane(0,listItems((item,k)=>item.kind==='weapon'&&inv[k]>0))}{pane(1,<><h2>Equipped</h2><p>{ITEMS[profile?.equipped]?.name}</p>{compare&&<StatRows stats={compare.current}/>}</>)}{pane(2,<><h2>Selected</h2><p>{selectedItem?.name}</p>{compare&&<StatRows stats={compare.candidate}/>}</>)}{pane(3,<><p>Attack difference: {compare?compare.candidate.atk-compare.current.atk:'—'}</p><Btn primary disabled={!compare||Boolean(encounter)} onClick={()=>{if(transact(p=>equipItem(p,itemId),'Weapon equipped'))back();}}>Equip</Btn></>)}</>;break;
    case '40':content=pane(0,<><h2>Confirmation</h2><p>{pending?.message||'No pending action.'}</p>{buttons(<Btn primary disabled={!pending} onClick={()=>{const f=pending?.action;setPending(null);back();f?.();}}>Confirm</Btn>,<Btn onClick={()=>{setPending(null);back();}}>Cancel</Btn>)}</>);break;
    case '41':content=pane(0,<p role="status">{saveStatus||'No save operation in progress.'}</p>);break;
    case '42':content=<RegionDiscovery discovery={discovery} world={world} profile={profile} original={original} layout={screen.layout} onContinue={back} onMap={()=>{back();go('07');}}/>;break;
    case '43':content=<QuestOffer profile={profile} encounter={encounter} original={original} layout={screen.layout} back={back} onAccept={()=>{if(transact(p=>{if(p.quests.grove!=='available')throw Error('Quest is no longer available.');return acceptGroveQuest(p);},'Quest accepted')){root('10');go('08');}}}/>;break;
    case '44':content=<QuestCompletion profile={profile} original={original} layout={screen.layout} onContinue={()=>root('10')} onJournal={()=>{root('10');go('08');}}/>;break;
    case '45':content=<SkillUnlocked key={profile?.id||'guest'} profile={profile} result={result} level={level} original={original} layout={screen.layout} onContinue={()=>{if(current.current.profile)resumeWorld();else back();}} onSkillbook={()=>{if(current.current.profile){resumeWorld();go('12');}else back();}}/>;break;
    case '46':content=<>{pane(0,statPanel)}{pane(1,<><h2>Recovery Tonic</h2><p>Restore up to 40 HP. Owned: {inv.recoveryTonic||0}</p></>)}{pane(2,<><p>HP: {profile?.hp} → {Math.min(stats.maxHp,(profile?.hp||0)+40)}</p><Btn primary disabled={!profile||Boolean(encounter)||!inv.recoveryTonic||profile.hp>=stats.maxHp} onClick={()=>{if(transact(p=>heal(p),'Health restored'))back();}}>Confirm Recovery</Btn></>)}</>;break;
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
