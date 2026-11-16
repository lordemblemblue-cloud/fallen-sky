import {useEffect, useMemo, useState} from 'react';
import {
  ArrowUpRight, BookOpen, Check, ChevronRight, Clock, LockKeyhole,
  Save, Search, Shield, Sparkles, Swords, Target, X,
} from 'lucide-react';
import {getAllSkills, getSkillById, scaleStat} from '../../skills/skillRegistry';
import {SKILL_TYPE, WEAPON_TYPE} from '../../skills/skillTypes';
import {getSkillMastery, subscribeSkillMastery} from '../../skills/skillMasteryStore';
import {getAllCompanionSkills, getCompanionSkillById} from '../../skills/companionSkillRegistry';
import {getWeaponForSkillBookMode} from './SkillBookWeaponModes.mjs';
import {formatSkillStat,skillMarkedLocked,skillLabelType,skillBelongsToCategory,skillMatchesBookFilter} from './AXESkillBookModel.mjs';
import './AXESkillBookRedesign.css';

// Only registered skills are displayed. No concept-art dummy skills, fabricated
// damage values, invented skill points or client-side mastery transactions.
const CHARACTER_CATEGORIES = Object.freeze([
  {id:'sword', name:'Sword', icon:'⚔️', weapon:WEAPON_TYPE.SWORD, mode:'damage'},
  {id:'bow', name:'Bow', icon:'🏹', weapon:WEAPON_TYPE.RANGED, mode:'range'},
  {id:'defense', name:'Defense', icon:'🛡️', weapon:WEAPON_TYPE.GUARDIAN, mode:'defense'},
  {id:'universal', name:'Universal', icon:'✦', weapon:null},
  {id:'passive', name:'Passive', icon:'✧', passive:true},
]);
const FILTERS = Object.freeze([
  {id:'all',label:'All'}, {id:'active',label:'Active'},
  {id:'passive',label:'Passive'}, {id:'buff',label:'Buff'},
  {id:'locked',label:'Locked'},
]);
const legacyCategory = id => ({damage:'sword',range:'bow',defense:'defense'})[id]||'sword';
const levelFor = (skill, companion) => companion ? null : getSkillMastery(skill.skill_id);
function useMasteryRefresh() {
  const [,setRevision]=useState(0);
  useEffect(()=>subscribeSkillMastery(()=>setRevision(n=>n+1)),[]);
}
function requirementsOf(skill) {
  if (!skill) return [];
  const result=[];
  if (skill.required_level!=null) result.push('Character level '+skill.required_level);
  if (skill.unlock_requirement) result.push(String(skill.unlock_requirement));
  if (typeof skill.requirements==='string') result.push(skill.requirements);
  if (Array.isArray(skill.requirements)) result.push(...skill.requirements.map(String));
  return result;
}
function SkillInspector({skill,companion,onEquip,equipped}) {
  const [nextPreview,setNextPreview]=useState(true);
  useEffect(()=>setNextPreview(true),[skill?.skill_id]);
  if(!skill)return <div className="axe-tome-inspector-empty">
    <BookOpen size={40}/><h3>Select a skill</h3>
    <p>Choose a registered skill to inspect its effects and progression.</p>
  </div>;
  const mastery=levelFor(skill,companion);
  const level=mastery?.level??1, max=mastery?.maxLevel??skill.max_level??null;
  const next=max!=null?Math.min(max,level+1):null;
  const locked=skillMarkedLocked(skill), requirements=requirementsOf(skill);
  const scalings=Object.keys(skill.scaling||{});
  const stats=[
    ...scalings.map(key=>({key, label:titleize(key), current:formatSkillStat(key,scaleStat(skill,key,level)),
      upcoming:next!=null && level<max?formatSkillStat(key,scaleStat(skill,key,next)):null})),
    ...(Number.isFinite(Number(skill.cooldown))?[{key:'cooldown',label:'Cooldown',current:skill.cooldown+' sec'}]:[]),
    ...(Number(skill.duration)>0?[{key:'duration',label:'Duration',current:skill.duration+' sec'}]:[]),
    ...(Number(skill.hit_count)>0?[{key:'hits',label:'Hits',current:String(skill.hit_count)}]:[]),
    ...(Number(skill.aoe_radius)>0?[{key:'radius',label:'AOE Radius',current:skill.aoe_radius+' m'}]:[]),
    ...(Number.isFinite(Number(skill.range))?[{key:'range',label:'Range',current:skill.range+' m'}]:[]),
    ...(Number.isFinite(Number(skill.will_cost))?[{key:'will',label:'Will Cost',current:String(skill.will_cost)}]:[]),
    ...(Number.isFinite(Number(skill.stamina_cost))?[{key:'stamina',label:'Stamina Cost',current:String(skill.stamina_cost)}]:[]),
  ];
  const progress=mastery?Math.max(0,Math.min(100,(Number(mastery.progress)||0)*100)):0;
  return <div className="axe-tome-inspector" key={skill.skill_id}>
    <div className="axe-tome-inspector-hero">
      <div className="axe-tome-inspector-icon" aria-hidden="true">{skill.icon||'✦'}</div>
      <div className="axe-tome-inspector-identity">
        <span className="axe-tome-kicker">Skill progression</span>
        <h3>{skill.skill_name}</h3>
        <div className="axe-tome-pills"><span>{skillLabelType(skill)}</span>
          <span>{max!=null?'Lv. '+level+' / '+max:'Mastery not configured'}</span>
          {equipped && <span className="axe-tome-equipped-label"><Check size={12}/> Equipped</span>}
        </div>
      </div>
    </div>
    <section className="axe-tome-info-block">
      <h4><BookOpen size={16}/> Description</h4>
      <p>{skill.description||'No description has been registered for this ability.'}</p>
    </section>
    <section className="axe-tome-info-block">
      <div className="axe-tome-block-heading"><h4><Swords size={16}/> Skill stats</h4>
        {mastery&&next!=null&&next>level&&<button type="button" aria-pressed={nextPreview}
          onClick={()=>setNextPreview(v=>!v)}>
          {nextPreview?'Hide next level':'Compare next level'}</button>}
      </div>
      <div className="axe-tome-stat-head"><span>Attribute</span><span>Current</span>
        <span>{nextPreview&&next!=null&&next>level?'Next level':' '}</span></div>
      <div className="axe-tome-stat-rows">
        {stats.length?stats.map(row=><div key={row.key} className="axe-tome-stat-row">
          <span>{row.label}</span><strong>{row.current}</strong>
          <em>{nextPreview&&row.upcoming ? '→ '+row.upcoming : '—'}</em>
        </div>):<p className="axe-tome-data-note">No numeric scaling is registered for this skill.</p>}
      </div>
    </section>
    <div className="axe-tome-inspector-bottom">
      <section className="axe-tome-info-block axe-tome-progression">
        <h4><Sparkles size={15}/> Level progression</h4>
        {mastery?<><strong>Lv. {level} / {max} · {mastery.rank?.label||'Base'}</strong>
          <div className="axe-tome-meter" role="progressbar" aria-label="Skill mastery progress"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
            <span style={{width:progress+'%'}}/></div>
          <small>{mastery.nextLevelXp==null?'Max mastery reached':Math.max(0,Math.round(mastery.nextLevelXp-mastery.xp)).toLocaleString()+' XP to next level'}</small>
        </>:<p className="axe-tome-data-note">Companion mastery levels are not configured.</p>}
      </section>
      <section className="axe-tome-info-block axe-tome-requirements">
        <h4><Shield size={15}/> Requirements</h4>
        {requirements.length ? requirements.map(item=><p key={item}><LockKeyhole size={14}/>{item}</p>)
          : <p><Check size={14}/> No unlock requirements recorded</p>}
        {skill.weapon_type&&<p><Target size={14}/> {titleize(skill.weapon_type)} weapon required to cast</p>}
      </section>
    </div>
    <div className="axe-tome-inspector-action">
      <button type="button" disabled={locked} onClick={()=>onEquip(skill)}>
        <ArrowUpRight size={20}/> {locked?'Skill Locked':'Equip to Free Slot'}</button>
      <p>{companion?'Companion ability loadout uses existing equip rules.':
        'Mastery increases through confirmed combat use — no skill points are charged here.'}</p>
    </div>
  </div>;
}
export default function AXESkillBookRedesign({
  companion,currentPage,onPageChange,view,onChangeView,selected,onSelect,
  ownedWeapons,activeMode,activeIds,passiveIds,onQuickEquip,
  onEquipActive,onRemoveActive,onRemovePassive,onSavePreset,onActivateWeapon,status,onClose,
}) {
  useMasteryRefresh();
  const [category,setCategory]=useState(()=>legacyCategory(activeMode?.id));
  const [filter,setFilter]=useState('all');
  const [search,setSearch]=useState('');
  const all=useMemo(()=>companion?getAllCompanionSkills():getAllSkills(),[companion]);
  const categories=useMemo(()=>companion
    ? [...new Set(all.map(s=>s.category).filter(Boolean))].map(id=>({id,name:titleize(id),icon:'✧'}))
    : CHARACTER_CATEGORIES,[companion,all]);
  useEffect(()=>{setCategory(companion?categories[0]?.id||'combat':legacyCategory(activeMode?.id));
    setSearch('');setFilter('all');},[companion,activeMode?.id]);
  const related=useMemo(()=>all.filter(skill=>{
    return skillBelongsToCategory(skill,category,companion);
  }),[all,companion,category]);
  const listed=useMemo(()=>related.filter(skill=>
    skillMatchesBookFilter(skill,{view,filter,search,companion})),
    [related,view,filter,search,companion]);
  useEffect(()=>{
    if(!listed.length){if(selected)onSelect(null);return;}
    if(!selected||!listed.some(skill=>skill.skill_id===selected.skill_id))
      onSelect(listed[0]);
  },[listed,selected?.skill_id,onSelect]);
  const current=selected&&(companion?getCompanionSkillById(selected.skill_id):getSkillById(selected.skill_id));
  const currentCategory=categories.find(x=>x.id===category);
  const categoryCount=id=>all.filter(skill=>skillBelongsToCategory(skill,id,companion)).length;
  const equipMode=currentCategory?.mode;
  const weapon=equipMode?getWeaponForSkillBookMode(ownedWeapons,equipMode):null;
  const allEquipped=[...activeIds,...passiveIds];
  return <div className="axe-tome" data-progression-panel={currentPage}>
    <header className="axe-tome-header">
      <div className="axe-tome-brand"><BookOpen size={36}/><div><h2>Skill Book</h2>
        <p>Learn, equip and master your combat skills</p></div></div>
      <div className="axe-tome-head-note"><Sparkles size={18}/> Live skill mastery · Game 3D</div>
      {onClose&&<button type="button" data-service-close className="axe-tome-close"
        aria-label="Close Skill Book" onClick={onClose}><X size={22}/></button>}
    </header>
    <div className="axe-tome-toolbar">
      <nav className="axe-tome-tabset" aria-label="Skill Book character">
        {[['skills_character','Character'],['skills_companion','Companion']].map(([id,label])=>
          <button type="button" key={id} aria-pressed={currentPage===id} onClick={()=>onPageChange(id)}>{label}</button>)}
      </nav>
      <nav className="axe-tome-tabset axe-tome-main-tabs" aria-label="Skill Book pages">
        {[['skills','Skills'],['buffs','Buffs'],['advance','Advance']].map(([id,label])=>
          <button type="button" key={id} aria-pressed={view===id} onClick={()=>{onChangeView(id);if(id==='buffs'&&!companion)setCategory('universal');setFilter('all');}}>{label}</button>)}
      </nav>
      <label className="axe-tome-search"><Search size={18}/><input type="search" value={search}
        onChange={e=>setSearch(e.target.value)} placeholder="Search skills…" aria-label="Search skills"/></label>
    </div>
    <div className="axe-tome-columns">
      <aside className="axe-tome-rail" aria-label={companion?'Companion categories':'Weapons and categories'}>
        <h3>{companion?'Companion':'Weapon / Category'}</h3>
        <div className="axe-tome-category-list">
          {categories.map(item=>{
            const count=categoryCount(item.id);
            const realWeapon=item.mode?getWeaponForSkillBookMode(ownedWeapons,item.mode):null;
            return <button key={item.id} type="button" aria-pressed={category===item.id}
              onClick={()=>{setCategory(item.id);onChangeView('skills');setFilter('all');setSearch('');onSelect(null);}}>
              <span className="axe-tome-category-symbol" aria-hidden="true">{item.icon}</span>
              <span><strong>{item.name}</strong><small>{realWeapon?.name||(companion?'Companion skills':item.mode?'Weapon skills':'Combat skills')}</small></span>
              <em>{count}</em><ChevronRight size={15}/>
            </button>;
          })}
        </div>
        <div className="axe-tome-rail-foot"><span>Registered abilities</span>
          <strong>{all.length}</strong><small>Skill data from Game 3D</small></div>
      </aside>
      <section className="axe-tome-library" aria-label="Skills for selected weapon">
        <div className="axe-tome-library-head">
          <div className="axe-tome-library-title"><span aria-hidden="true">{currentCategory?.icon||'✧'}</span>
            <div><h3>{currentCategory?.name||'Skills'} {view==='buffs'?'Buffs':view==='advance'?'Mastery':'Skills'}</h3>
              <small>{related.length} registered · {related.filter(s=>allEquipped.includes(s.skill_id)).length} equipped</small></div>
          </div>
          <button type="button" className="axe-tome-save" onClick={onSavePreset}
            title="Save the current equipped skill bar"><Save size={15}/> Save bar</button>
        </div>
        {equipMode&&<div className="axe-tome-equipped-weapon">
          <span>{weapon?.name||'No owned '+currentCategory.name.toLowerCase()+' weapon selected'}</span>
          <small>{weapon?.equipped?'Equipped weapon':'Browsing only — does not change your weapon'}</small>
          <button type="button" onClick={()=>onActivateWeapon(equipMode)}>Activate {currentCategory.name} bar</button>
        </div>}
        <nav className="axe-tome-filters" aria-label="Skill filters">{FILTERS.filter(item=>!companion||['all','locked'].includes(item.id)).map(item=>
          <button type="button" key={item.id} aria-pressed={filter===item.id}
            onClick={()=>setFilter(item.id)}>{item.label}</button>)}</nav>
        <div className="axe-tome-card-scroll">
          {listed.length?<div className="axe-tome-card-grid">{listed.map(skill=>{
            const mastery=levelFor(skill,companion),isEquipped=allEquipped.includes(skill.skill_id);
            const locked=skillMarkedLocked(skill);
            return <button type="button" className="axe-tome-card" key={skill.skill_id}
              aria-pressed={current?.skill_id===skill.skill_id} onClick={()=>onSelect(skill)}
              title={skill.description||skill.skill_name}>
              <span className="axe-tome-card-icon" aria-hidden="true">{skill.icon||'✦'}</span>
              <span className="axe-tome-card-body"><strong>{skill.skill_name}</strong>
                <small>{mastery?'Lv. '+mastery.level+' / '+mastery.maxLevel
                  :skill.max_level?'Max Lv. '+skill.max_level:'Mastery not configured'}</small>
                <span className="axe-tome-card-subtitle">{skillLabelType(skill)}</span></span>
              <span className={'axe-tome-card-status'+(locked?' is-locked':'')}>
                {locked?<LockKeyhole size={13}/>:isEquipped?<Check size={13}/>:null}
                {locked?'Locked':isEquipped?'Equipped':'Available'}
              </span>
            </button>;
          })}</div>:<div className="axe-tome-empty"><Search size={27}/>
            <h4>No matching skills</h4><p>{filter==='locked'
              ?'No locked skills are marked in this registry category.'
              :'Try another category, page or search term.'}</p></div>}
        </div>
        <div className="axe-tome-bar" aria-label="Equipped active skill slots">
          <div className="axe-tome-bar-heading"><span>Equipped skills</span><small>Select a skill, then choose a slot</small></div>
          <div className="axe-tome-slots">{activeIds.map((id,i)=>{
            const skill=id&&(companion?getCompanionSkillById(id):getSkillById(id));
            return <div className="axe-tome-slot" key={i}>
              <button type="button" title={skill?skill.skill_name:'Equip selected skill'}
                onClick={()=>{if(current&&current.skill_type!==SKILL_TYPE.PASSIVE)onEquipActive(i,current);
                  else if(skill)onSelect(skill);}}
                aria-label={'Slot '+(i+1)+': '+(skill?.skill_name||'Empty')}>
                <span>{skill?.icon||'✦'}</span><small>{i===9?'0':i+1}</small>
              </button>
              {skill&&<button type="button" className="axe-tome-slot-clear"
                onClick={()=>onRemoveActive(i)} aria-label={'Unequip '+skill.skill_name}><X size={10}/></button>}
            </div>;
          })}</div>
        </div>
      </section>
      <section className="axe-tome-details" aria-label="Selected skill details">
        <SkillInspector skill={current} companion={companion} equipped={allEquipped.includes(current?.skill_id)}
          onEquip={onQuickEquip}/>
        {!companion&&passiveIds.some(Boolean)&&<div className="axe-tome-passives">
          <strong>Equipped passives</strong>
          {passiveIds.map((id,i)=>id&&<button type="button" key={i} onClick={()=>onRemovePassive(i)}
            title="Remove equipped passive">{getSkillById(id)?.skill_name||id}<X size={12}/></button>)}
        </div>}
      </section>
    </div>
    <footer className="axe-tome-footer"><span role="status">{status||'Choose a weapon, inspect its skills, and equip through the existing loadout.'}</span>
      <span><Clock size={13}/> Mastery is earned through gameplay</span></footer>
  </div>;
}
