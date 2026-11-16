import { useMemo, useState } from 'react';
import { BookOpen, ChevronRight, Search, Shield, Sparkles, Swords, Wind } from 'lucide-react';
import { getAllSkills, scaleStat } from '../../skills/skillRegistry';
import { SKILL_TYPE } from '../../skills/skillTypes';
import { selectUniversalSkills } from './AXEUniversalSkillModel.mjs';
import { getSkillMastery } from '../../skills/skillMasteryStore';
import { isWeaponSkillUnlocked } from '../../skills/weaponSkillPointsStore';
import './AXESkillCollections.css';

const fmt=(number,key)=>/_pct$|^reflect_chance$|^crit_resist_pct$/.test(key)
  ?(Number(number)*100).toFixed(1)+'%':Number(number).toFixed(1);
const label=value=>String(value||'').replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
export function buildUniversalSkills(allSkills=getAllSkills()) {
  return selectUniversalSkills(allSkills);
}
export default function AXEUniversalSkillHub({
  passiveOnly=false, activeIds=[], passiveIds=[], onEquip, onSelected,
}) {
  const [kind,setKind]=useState(passiveOnly?'passives':'all');
  const [query,setQuery]=useState('');
  const [selectedId,setSelectedId]=useState(null);
  const catalog=useMemo(()=>buildUniversalSkills(),[]);
  const filtered=catalog.filter(skill=>{
    if(passiveOnly&&skill.skill_type!==SKILL_TYPE.PASSIVE)return false;
    if(kind==='passives'&&skill.skill_type!==SKILL_TYPE.PASSIVE)return false;
    if(kind==='buffs'&&skill.skill_type!==SKILL_TYPE.ACTIVE_BUFF)return false;
    return !query||[skill.skill_name,skill.description,skill.skill_id]
      .join(' ').toLowerCase().includes(query.trim().toLowerCase());
  });
  const selected=filtered.find(skill=>skill.skill_id===selectedId)||filtered[0]||null;
  const mastery=selected?getSkillMastery(selected.skill_id):null;
  const equipped=selected&&(activeIds.includes(selected.skill_id)||passiveIds.includes(selected.skill_id));
  return <section className="axe-sk-hub" data-skill-hub="universal" aria-label="Universal mastery">
    <header className="axe-sk-hero">
      <div className="axe-sk-hero-symbol"><Sparkles size={29}/></div>
      <div><small>Weapon independent · Live skill registry</small>
        <h2>{passiveOnly?'Passive Mastery':'Universal Mastery'}</h2>
        <p>Equip confirmed buffs and passives for your character. Mastery is earned during gameplay.</p></div>
      <span>{catalog.length} registered</span>
    </header>
    <div className="axe-sk-toolbar">
      <div className="axe-sk-filters" aria-label="Universal skill filters">
        {(passiveOnly?[['passives','Passives']]:
          [['all','All'],['buffs','Buffs'],['passives','Passives']]).map(([id,title])=>
          <button type="button" key={id} aria-pressed={kind===id} onClick={()=>setKind(id)}>{title}</button>)}
      </div>
      <label className="axe-sk-search"><Search size={16}/><input aria-label="Search universal skills"
        placeholder="Search skill" type="search" value={query}
        onChange={event=>setQuery(event.target.value)}/></label>
    </div>
    <div className="axe-sk-columns">
      <div className="axe-sk-skill-list" role="list" aria-label="Actual universal abilities">
        {filtered.map(skill=>{
          const isPassive=skill.skill_type===SKILL_TYPE.PASSIVE;
          const chosen=selected?.skill_id===skill.skill_id;
          const isEquipped=activeIds.includes(skill.skill_id)||passiveIds.includes(skill.skill_id);
          return <button role="listitem" type="button" key={skill.skill_id}
            aria-pressed={chosen}
            className={'axe-sk-skill'+(chosen?' axe-sk-skill--selected':'')}
            onClick={()=>{setSelectedId(skill.skill_id);onSelected?.(skill);}}
            onDoubleClick={()=>onEquip?.(skill)}
            onContextMenu={event=>{event.preventDefault();onEquip?.(skill);}}
            title="Select to inspect; double-click or right-click to equip">
            <span className="axe-sk-skill-mark">{isPassive?<Wind size={27}/>:<Shield size={27}/>}</span>
            <span><strong>{skill.skill_name}</strong>
              <small>{isPassive?'Passive mastery':'Active buff'} · {skill.cooldown||0}s cooldown</small></span>
            <span className="axe-sk-skill-end">{isEquipped?'Equipped':<ChevronRight size={16}/>}</span>
          </button>;
        })}
        {!filtered.length&&<p className="axe-sk-empty">No registered skills match these filters.</p>}
      </div>
      <aside className="axe-sk-inspector" aria-label="Universal skill details">
        {selected?<><div className="axe-sk-inspector-kicker">{selected.skill_type===SKILL_TYPE.PASSIVE?'Passive':'Active Buff'}</div>
          <h3>{selected.skill_name}</h3>
          <p>{selected.description}</p>
          <div className="axe-sk-metrics">
            <span>Mastery <strong>Lv. {mastery?.level||1} / {selected.max_level}</strong></span>
            <span>Duration <strong>{selected.duration?selected.duration+'s':'Passive'}</strong></span>
            <span>Cooldown <strong>{selected.cooldown||0}s</strong></span>
            <span>Status <strong>{equipped?'Equipped':'Not equipped'}</strong></span>
          </div>
          <h4><BookOpen size={17}/> Current / next mastery</h4>
          {Object.keys(selected.scaling||{}).map(stat=>{
            const now=scaleStat(selected,stat,mastery?.level||1);
            const next=scaleStat(selected,stat,Math.min(selected.max_level,(mastery?.level||1)+1));
            return <div className="axe-sk-stat" key={stat}>
              <span>{label(stat)}</span><strong>{fmt(now,stat)} → {fmt(next,stat)}</strong>
            </div>;
          })}
          <button type="button" className="axe-sk-equip"
            disabled={!!equipped||!isWeaponSkillUnlocked(selected.skill_id)}
            onClick={()=>onEquip?.(selected)}>
            <Swords size={17}/>{equipped?'Already Equipped':selected.skill_type===SKILL_TYPE.PASSIVE?'Equip to Passive Slot':'Equip to Free Skill Slot'}
          </button>
          <p className="axe-sk-caption">Uses the character’s existing active/passive loadouts. No separate Universal progression currency.</p>
        </>:<p className="axe-sk-empty">There are no registered Universal skills for this character.</p>}
      </aside>
    </div>
  </section>;
}
