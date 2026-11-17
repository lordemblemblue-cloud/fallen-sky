import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronRight, Search, Shield, Sparkles, Swords, Wind, X } from 'lucide-react';
import { getAllSkills, scaleStat } from '../../skills/skillRegistry';
import { SKILL_TYPE } from '../../skills/skillTypes';
import { selectUniversalSkills } from './AXEUniversalSkillModel.mjs';
import { getSkillMastery, subscribeSkillMastery } from '../../skills/skillMasteryStore';
import { isWeaponSkillUnlocked } from '../../skills/weaponSkillPointsStore';
import './AXESkillCollections.css';

const fmt=(number,key)=>/_pct$|^reflect_chance$|^crit_resist_pct$/.test(key)
  ?(Number(number)*100).toFixed(1)+'%':Number(number).toFixed(1);
const label=value=>String(value||'').replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
export function buildUniversalSkills(allSkills=getAllSkills()) {
  return selectUniversalSkills(allSkills);
}

function UniversalSkillsColumn({ title, kind, icon: Icon, skills, equippedIds, selectedId, onSelect, onEquip }) {
  return <section className="axe-sk-universal-column" aria-label={title+' skills'}>
    <div className="axe-sk-universal-section-head">
      <Icon size={20} aria-hidden="true"/>
      <h3>{title}</h3>
      <small>{skills.length} registered</small>
    </div>
    <div className="axe-sk-universal-list" role="list" aria-label={'Registered '+title.toLowerCase()}>
      {skills.map(skill=>{
        const selected=skill.skill_id===selectedId;
        const equipped=equippedIds.includes(skill.skill_id);
        return <button key={skill.skill_id} role="listitem" type="button"
          className={'axe-sk-skill'+(selected?' axe-sk-skill--selected':'')}
          aria-pressed={selected}
          title="Click for skill details; double-click or right-click to equip"
          onClick={()=>onSelect(skill)}
          onDoubleClick={()=>onEquip?.(skill)}
          onContextMenu={event=>{event.preventDefault();onEquip?.(skill);}}>
          <span className="axe-sk-skill-mark"><Icon size={25} aria-hidden="true"/></span>
          <span><strong>{skill.skill_name}</strong>
            <small>{kind==='passives'?'Automatically active when equipped':'Active buff · '+(skill.cooldown||0)+'s cooldown'}</small></span>
          <span className="axe-sk-skill-end">{equipped?'Equipped':<ChevronRight size={16}/>}</span>
        </button>;
      })}
      {!skills.length&&<p className="axe-sk-empty">No registered {title.toLowerCase()} match the search.</p>}
    </div>
  </section>;
}

export default function AXEUniversalSkillHub({
  activeIds=[], passiveIds=[], onEquip, onSelected,
}) {
  const [query,setQuery]=useState('');
  const [selectedId,setSelectedId]=useState(null);
  const [detailOpen,setDetailOpen]=useState(false);
  const [,setMasteryRevision]=useState(0);
  const catalog=useMemo(()=>buildUniversalSkills(),[]);
  useEffect(()=>subscribeSkillMastery(()=>setMasteryRevision(n=>n+1)),[]);
  const search=query.trim().toLowerCase();
  const matching=catalog.filter(skill=>!search||
    [skill.skill_name,skill.description,skill.skill_id].filter(Boolean).join(' ').toLowerCase().includes(search));
  const buffs=matching.filter(skill=>skill.skill_type===SKILL_TYPE.ACTIVE_BUFF);
  const passives=matching.filter(skill=>skill.skill_type===SKILL_TYPE.PASSIVE);
  const selected=catalog.find(skill=>skill.skill_id===selectedId)||null;
  const mastery=selected?getSkillMastery(selected.skill_id):null;
  const equipped=selected&&(activeIds.includes(selected.skill_id)||passiveIds.includes(selected.skill_id));
  const select=skill=>{setSelectedId(skill.skill_id);setDetailOpen(true);onSelected?.(skill);};
  return <section className="axe-sk-universal-hub" data-skill-hub="universal"
    aria-label="Universal skills — buffs and passives">
    <div className="axe-sk-universal-toolbar">
      <span><Sparkles size={19} aria-hidden="true"/> Universal <small>Buffs &amp; Passives</small></span>
      <label className="axe-sk-search"><Search size={16} aria-hidden="true"/>
        <input aria-label="Search universal skills" placeholder="Search both groups" type="search"
          value={query} onChange={event=>setQuery(event.target.value)}/></label>
    </div>
    <div className="axe-sk-universal-columns">
      <UniversalSkillsColumn title="Buffs" kind="buffs" icon={Shield}
        skills={buffs} equippedIds={activeIds} selectedId={selectedId}
        onSelect={select} onEquip={onEquip}/>
      <UniversalSkillsColumn title="Passives" kind="passives" icon={Wind}
        skills={passives} equippedIds={passiveIds} selectedId={selectedId}
        onSelect={select} onEquip={onEquip}/>
    </div>
    {detailOpen&&selected&&<aside className="axe-sk-universal-detail" aria-label="Selected universal skill details">
      <div className="axe-sk-universal-detail-head">
        <div><small>{selected.skill_type===SKILL_TYPE.PASSIVE?'PASSIVE':'ACTIVE BUFF'} ·
          Lv. {mastery?.level||1} / {selected.max_level||mastery?.maxLevel||1}</small>
          <h3>{selected.skill_name}</h3></div>
        <button type="button" aria-label="Close skill details" onClick={()=>setDetailOpen(false)}><X size={19}/></button>
      </div>
      <p>{selected.description}</p>
      <div className="axe-sk-universal-stats">
        {Object.keys(selected.scaling||{}).map(stat=>{
          const level=mastery?.level||1;
          const now=scaleStat(selected,stat,level);
          const next=scaleStat(selected,stat,Math.min(selected.max_level||level,level+1));
          return <div key={stat}><span>{label(stat)}</span>
            <strong>{fmt(now,stat)} → {fmt(next,stat)}</strong></div>;
        })}
        <div><span>Cooldown</span><strong>{selected.cooldown||0}s</strong></div>
        <div><span>Status</span><strong>{equipped?'Equipped':'Available'}</strong></div>
      </div>
      <button type="button" className="axe-sk-equip"
        disabled={!!equipped||!isWeaponSkillUnlocked(selected.skill_id)}
        onClick={()=>onEquip?.(selected)}>
        <Swords size={16}/>{equipped?'Already Equipped':
          selected.skill_type===SKILL_TYPE.PASSIVE?'Equip to Passive Slot':'Equip to Free Skill Slot'}
      </button>
      <p className="axe-sk-caption"><BookOpen size={13}/> Skill mastery progresses through gameplay.
        Buffs use active slots; passives use the existing passive loadout.</p>
    </aside>}
  </section>;
}
