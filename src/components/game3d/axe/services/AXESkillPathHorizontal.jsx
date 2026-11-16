import { useEffect, useRef, useState } from 'react';
import { ArrowUp, BookOpen, Shield, Sparkles } from 'lucide-react';
import { getSkillById, scaleStat } from '../../skills/skillRegistry';
import { getSkillMastery, subscribeSkillMastery } from '../../skills/skillMasteryStore';
import {
  getWeaponSkillPoints, investWeaponSkillPoint, subscribeWeaponSkillPoints,
  isWeaponSkillUnlocked,
} from '../../skills/weaponSkillPointsStore';
import {
  WEAPON_SKILL_TIERS, weaponSkillTierForId, weaponTierUnlocked,
} from '../../../../../base44/shared/weaponSkillPoints.mjs';
import './AXESkillPathHorizontal.css';
import { horizontalSkillWheelOffset } from './AXESkillWheel.mjs';

const PATH_ORDER = ['single', 'three', 'aerial'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const WEAPON_LABELS = { damage:'Sword', range:'Bow', defense:'Guardian' };
const formatValue = (skill,key,level) => {
  const value=scaleStat(skill,key,level);
  return /pct|chance|reflect/.test(key) ? (value*100).toFixed(1)+'%'
    : Number(value).toFixed(1);
};
const prettyKey = value => String(value).replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
const skillIcon = (kind,size=34) => <svg viewBox="0 0 64 64" width={size} height={size}
    fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" className={'axe-hp-glyph axe-hp-glyph--'+kind}>
    {kind==='single'&&<><path d="M12 51Q31 34 52 8" strokeWidth="4"/>
      <path d="M15 46Q31 22 52 8L38 35Z" fill="currentColor" opacity=".22"/></>}
    {kind==='triple'&&<><path d="M9 46L28 12M26 52L45 16M43 55L58 28" strokeWidth="5"/></>}
    {kind==='aerial'&&<><ellipse cx="32" cy="47" rx="26" ry="8" strokeWidth="3"/>
      <path d="M32 9L26 34 32 29 38 34 32 9Z" fill="currentColor" opacity=".55"/>
      <path d="M14 20L17 39M50 20L47 39M7 35L22 42M57 35L42 42" strokeWidth="3"/></>}
    {kind==='precision'&&<><circle cx="32" cy="32" r="18" strokeWidth="3"/>
      <circle cx="32" cy="32" r="7" strokeWidth="3"/><path d="M32 3V17M32 47V61M3 32H17M47 32H61" strokeWidth="3"/></>}
    {kind==='momentum'&&<><path d="M7 19L24 32 7 45M25 19L42 32 25 45M43 19L59 32 43 45" strokeWidth="4"/></>}
    {kind==='aerial-passive'&&<><ellipse cx="32" cy="47" rx="24" ry="7" strokeWidth="3"/>
      <path d="M32 42V8M18 22L32 8 46 22" strokeWidth="3"/></>}
    {kind==='passive'&&<><path d="M10 48Q20 20 53 11Q47 43 18 54Z" strokeWidth="3"/>
      <path d="M16 52Q33 30 46 21" strokeWidth="3"/></>}
  </svg>;

function BranchCard({ icon, title, subtitle, locked=false, selected=false, equipped=false,
  onClick, onDoubleClick, onContextMenu, className='' }) {
  return <button type="button" className={['axe-hp-node',className,selected?'axe-hp-node--selected':'',
    locked?'axe-hp-node--locked':''].join(' ')} aria-pressed={selected}
    aria-label={title+(locked?' — locked':'')} title={title+(onDoubleClick?' — Double-click or right-click to equip':'')}
    onClick={onClick} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}>
    <span className="axe-hp-node-glyph">{skillIcon(icon,34)}</span>
    <strong>{title}</strong>
    <small>{subtitle}</small>
    {equipped&&<span className="axe-hp-equipped-tag">Equipped</span>}
    {locked&&<span className="axe-hp-locked-mark">◇ Locked</span>}
  </button>;
}

export default function AXESkillPathHorizontal({
  category, paths, activePathId, onChangePath, selected, onSelect, activeIds=[],
  onFeedback, onEquipSkill, onActivateWeapon, activeMode,
}) {
  const [points,setPoints]=useState(getWeaponSkillPoints);
  const sharedScrollRef=useRef(null);
  const [,setMasteryRevision]=useState(0);
  useEffect(()=>subscribeWeaponSkillPoints(setPoints),[]);
  useEffect(()=>subscribeSkillMastery(()=>setMasteryRevision(v=>v+1)),[]);
  const path=paths.find(item=>item.id===activePathId)||paths[0];
  // A single scroll viewport owns BOTH progression rows. The scrollbar is
  // invisible, but horizontal dragging/swiping and keyboard access still work.
  useEffect(()=>{
    const viewport=sharedScrollRef.current;
    if(!viewport)return undefined;
    const onWheel=event=>{
      const offset=horizontalSkillWheelOffset(event.deltaY,event.deltaX);
      if(!offset || viewport.scrollWidth<=viewport.clientWidth)return;
      event.preventDefault();
      viewport.scrollLeft+=offset;
    };
    viewport.addEventListener('wheel',onWheel,{passive:false});
    return ()=>viewport.removeEventListener('wheel',onWheel);
  },[path?.id,category]);
  useEffect(()=>{
    const viewport=sharedScrollRef.current;
    if(viewport)viewport.scrollLeft=Math.max(0,(viewport.scrollWidth-viewport.clientWidth)/2);
  },[path?.id,category]);
  if(!path)return null;
  const select=(kind,id,tier,stageIndex=null)=>{
    onSelect({kind,id,tier,stageIndex,lane:path.id,category});
  };
  const node=selected?.lane===path.id?selected:
    {kind:'skill',id:path.active[0],tier:1,lane:path.id,category};
  const root=getSkillById(path.active[0]);
  const nodeSkill=node.kind==='skill'?getSkillById(node.id):null;
  const activeSkill=nodeSkill||root;
  const selectedPassive=path.passives.find(p=>p.id===node.id);
  const nodeStageIndex=node.kind==='stage'?node.stageIndex:
    node.kind==='passive'?Math.min(4,Math.max(0,(node.tier||1)-1)):
    (weaponSkillTierForId(activeSkill?.skill_id)?.tierIndex??0);
  const stageIndex=Math.max(0,Math.min(WEAPON_SKILL_TIERS.length-1,nodeStageIndex||0));
  const cap=WEAPON_SKILL_TIERS[stageIndex];
  const spent=points.save?.nodes?.[category]?.[stageIndex]||0;
  const stageAvailable=weaponTierUnlocked(points.save,category,stageIndex);
  const canUpgrade=stageAvailable&&spent<cap&&points.available>0;
  const nodeLevel=activeSkill?getSkillMastery(activeSkill.skill_id):null;
  const nodeIndex=path.active.indexOf(node.id);
  const displayTitle=node.kind==='stage'?'Charge Focus '+ROMAN[stageIndex]:
    node.kind==='passive'?selectedPassive?.label||'Linked Passive':
    path.titles?.[nodeIndex]||activeSkill?.skill_name||'Select a skill';
  const description=node.kind==='stage'
    ? 'Existing weapon skill point stage '+(stageIndex+1)+'. Completing the preceding stage unlocks the next paired skills and free charged-strike passive.'
    :node.kind==='passive'
      ? 'Linked passive display for the existing weapon-point system. Each newly unlocked paid stage grants +1% charged-strike damage across this weapon path.'
      :activeSkill?.description||'Select a registered ability to view its details.';
  const level=node.kind==='skill'?nodeLevel:null;
  const effectKeys=node.kind==='skill'&&activeSkill?Object.keys(activeSkill.scaling||{}):[];
  const unlockedStageCount=WEAPON_SKILL_TIERS.reduce((count,_,i)=>
    count+(weaponTierUnlocked(points.save,category,i)?1:0),0);
  const handleUpgrade=()=>{
    if(!canUpgrade)return;
    try {
      const result=investWeaponSkillPoint(category,stageIndex,1);
      onFeedback?.(result.ok
        ? 'Allocated one weapon skill point to '+WEAPON_LABELS[category]+' stage '+(stageIndex+1)+'.'
        : ({NOT_ENOUGH_SKILL_POINTS:'Earn more skill points through character levels.',
          PREVIOUS_TIER_LOCKED:'Complete the preceding weapon stage first.',
          TIER_CAPPED:'This stage is already complete.'})[result.reason]||'Unable to invest skill points.');
    } catch(error) {
      console.error('[Game3D/SkillTree] Weapon point upgrade failed:',error);
      onFeedback?.('Could not upgrade this stage. Your saved skill points were not changed by this screen.');
    }
  };
  const choosePath=index=>{
    const id=PATH_ORDER[(index+PATH_ORDER.length)%PATH_ORDER.length];
    onChangePath(id);
  };
  const currentIndex=PATH_ORDER.indexOf(path.id);
  // Canonical source is the registered weapon attacks; the paired free
  // passives belong exclusively to the lower progression row. Never present
  // a paid progression stage as an independently castable attack.
  const topCards=path.active.map((skillId,i)=>({
    skillId,title:path.titles[i],icon:path.icon,tier:i+1,
  }));
  return <div className="axe-hp-workspace">
    <nav className="axe-hp-wheel" aria-label="Single, Multi and Aerial paths"
      tabIndex={0}
      onKeyDown={event=>{
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){
          event.preventDefault();
          choosePath(currentIndex+(event.key==='ArrowDown'?1:-1));
        }
      }}>
      {paths.map(entry=><button type="button" key={entry.id}
        className={entry.id===path.id?'axe-hp-wheel-current':''}
        aria-pressed={entry.id===path.id}
        onClick={()=>onChangePath(entry.id)}
        aria-label={'Show '+(entry.id==='three'?'Multi':entry.id==='single'?'Single':'Aerial')+' skill path'}>
        {skillIcon(entry.icon,34)}
        <span>{entry.id==='three'?'Multi':entry.id==='single'?'Single':'Aerial'}</span>
      </button>)}
    </nav>
    <div className="axe-hp-stage">
      <header className="axe-hp-feature">
        <span className="axe-hp-feature-symbol">{skillIcon(path.icon,58)}</span>
        <div className="axe-hp-feature-copy">
          <h2>{path.id==='three'?'Multi':path.id==='single'?'Single':'Aerial'} / {WEAPON_LABELS[category]}</h2>
          <p>{path.label} path — {description}</p>
          <button type="button" className="axe-hp-activate-bar"
            onClick={()=>onActivateWeapon?.(category)}
            title="Switch to this weapon's saved skill bar">
            {activeMode?.id===category?'Active ':'Activate '}{WEAPON_LABELS[category]} Bar
          </button>
        </div>
        <div className="axe-hp-feature-selected">
          <div><strong>{displayTitle}</strong>
            {level&&<span>Lv. {level.level} / {level.maxLevel}</span>}</div>
          <p>{node.kind==='skill'&&activeSkill
            ? 'Cooldown: '+activeSkill.cooldown+' sec · Hits: '+activeSkill.hit_count
            : 'Stage '+(stageIndex+1)+' · '+spent+'/'+cap+' points invested'}</p>
          <div className="axe-hp-upgrade-controls">
            <small>{points.available} skill points available</small>
            <button type="button" disabled={!canUpgrade} onClick={handleUpgrade}
              title={canUpgrade?'Spend one earned weapon skill point':stageAvailable?'No points available or stage complete':'Previous stage must be completed'}>
              <ArrowUp size={18}/> Upgrade
            </button>
          </div>
        </div>
      </header>
      <div className="axe-hp-lanes-layout">
        <section className="axe-hp-fork-tree" aria-label={path.label+' active and passive skill branches'}>
          <div className="axe-hp-tree-root">
            <BranchCard icon={path.icon} title={path.titles[0]}
              subtitle={root?'Lv. '+getSkillMastery(root.skill_id).level+' / '+getSkillMastery(root.skill_id).maxLevel:'Registered skill'}
              selected={node.kind==='skill'&&node.id===path.active[0]}
              equipped={activeIds.includes(path.active[0])}
              onClick={()=>select('skill',path.active[0],1)}
              onDoubleClick={()=>onEquipSkill?.(path.active[0])}
              onContextMenu={event=>{event.preventDefault();onEquipSkill?.(path.active[0]);}}/>
            <span className="axe-hp-root-label">Base skill</span>
          </div>
          <svg className="axe-hp-fork-lines" viewBox="0 0 68 300" preserveAspectRatio="none"
            aria-hidden="true" fill="none" stroke="#f1c77f" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M0 150H25Q34 150 34 137V80Q34 69 45 69H66"/>
            <path d="M0 150H25Q34 150 34 163V228Q34 237 45 237H66"/>
            <path d="M58 63L67 69 58 75M58 231L67 237 58 243"/>
          </svg>
          <div ref={sharedScrollRef} className="axe-hp-tree-branches" tabIndex={0}
            aria-label="Shared horizontal skill progression; scroll down to move left and up to move right"
            onKeyDown={event=>{
              if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
                event.preventDefault();
                if(sharedScrollRef.current)sharedScrollRef.current.scrollLeft+=
                  event.key==='ArrowLeft'?-120:120;
              }
            }}>
            <div className="axe-hp-tree-track" role="list" aria-label="Active skills for the selected combat path">
              <span className="axe-hp-track-caption">Skills · {path.label}</span>
              {topCards.map((card,i)=>{
                const skill=card.skillId?getSkillById(card.skillId):null;
                const id=card.skillId;
                const locked=skill?!isWeaponSkillUnlocked(skill.skill_id):true;
                const name=card.title||skill?.skill_name||'Unknown skill';
                const sub=skill
                  ? 'Lv. '+getSkillMastery(skill.skill_id).level+' / '+getSkillMastery(skill.skill_id).maxLevel
                  : 'Unavailable in registry';
                return <div role="listitem" className="axe-hp-track-item" key={id}>
                  <BranchCard icon={card.icon} title={name} subtitle={sub}
                    locked={locked} selected={node.id===id}
                    equipped={activeIds.includes(id)}
                    onClick={()=>select('skill',id,card.tier)}
                    onDoubleClick={skill?()=>onEquipSkill?.(skill.skill_id):undefined}
                    onContextMenu={skill?event=>{event.preventDefault();onEquipSkill?.(skill.skill_id);}:undefined}/>
                  {i<topCards.length-1&&<span className="axe-hp-track-arrow" aria-hidden="true">➜</span>}
                </div>;
              })}
            </div>
            <div className="axe-hp-tree-track axe-hp-track-passive" role="list"
              aria-label={path.label+' automatic passive progression'}>
              <span className="axe-hp-track-caption">Passives · {path.label} (automatic)</span>
              {WEAPON_SKILL_TIERS.map((cost,i)=>{
                const unlocked=weaponTierUnlocked(points.save,category,i);
                const allocated=points.save?.nodes?.[category]?.[i]||0;
                const id='stage_'+category+'_'+i;
                return <div role="listitem" className="axe-hp-track-item" key={id}>
                  <BranchCard icon={i%2?'precision':'passive'}
                    title={'Charge Focus '+ROMAN[i]}
                    subtitle={unlocked?'+1% charged · '+allocated+'/'+cost+' pts':'Unlock previous stage'}
                    locked={!unlocked} selected={node.id===id}
                    onClick={()=>select('stage',id,i+1,i)}/>
                  {i<WEAPON_SKILL_TIERS.length-1&&
                    <span className="axe-hp-track-arrow" aria-hidden="true">➜</span>}
                </div>;
              })}
            </div>
          </div>
        </section>
        <aside className="axe-hp-info" aria-label="Selected skill information">
          <h3><BookOpen size={17}/> Skill Information</h3>
          <dl>
            <div><dt>Skill Type</dt><dd>{node.kind==='skill'?'Active':node.kind==='stage'?'Passive Stage':'Linked Passive'}</dd></div>
            <div><dt>Hits</dt><dd>{node.kind==='skill'?(activeSkill?.hit_count??'—'):'—'}</dd></div>
            <div><dt>Cooldown</dt><dd>{node.kind==='skill'&&activeSkill?activeSkill.cooldown+' sec':'—'}</dd></div>
            <div><dt>Stage</dt><dd>{stageIndex+1} / {WEAPON_SKILL_TIERS.length}</dd></div>
            <div><dt>Points</dt><dd>{spent} / {cap}</dd></div>
          </dl>
          <h3><Sparkles size={17}/> Passive Gain (Path)</h3>
          <p>+{unlockedStageCount}% charged-strike damage from {unlockedStageCount} unlocked weapon stages.</p>
          <div className="axe-hp-info-progress">
            <span style={{width:Math.min(100,100*spent/cap)+'%'}}/>
          </div>
          <h3><ArrowUp size={17}/> Next Level</h3>
          {effectKeys.length>0&&activeSkill&&<dl>
            {effectKeys.slice(0,2).map(key=><div key={key}>
              <dt>{prettyKey(key)}</dt>
              <dd>{formatValue(activeSkill,key,level?.level||1)} → {formatValue(activeSkill,key,Math.min(activeSkill.max_level,(level?.level||1)+1))}</dd>
            </div>)}
          </dl>}
          <p className="axe-hp-xp-copy">{node.kind==='skill'&&level?.nextLevelXp!=null
            ? Math.max(0,Math.ceil(level.nextLevelXp-level.xp)).toLocaleString()+' mastery XP to next level'
            : node.kind==='skill'&&level?'Mastery maxed':'Mastery XP is earned through confirmed combat use.'}</p>
        </aside>
      </div>
    </div>
  </div>;
}
