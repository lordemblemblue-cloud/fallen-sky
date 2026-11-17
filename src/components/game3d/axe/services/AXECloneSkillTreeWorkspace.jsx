import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Search, Shield, Sparkles, Swords, X } from 'lucide-react';
import { CAST_TYPE, SKILL_TYPE } from '../../skills/skillTypes';
import { getAllSkills, getSkillById, scaleStat } from '../../skills/skillRegistry';
import { getAllCompanionSkills, getCompanionSkillById } from '../../skills/companionSkillRegistry';
import { COMPANION_SLOT_KEYS } from '../../skills/companionLoadoutStore';
import { getWeaponForSkillBookMode } from './SkillBookWeaponModes.mjs';
import { getSkillMastery, subscribeSkillMastery } from '../../skills/skillMasteryStore';
import { isWeaponSkillUnlocked, getWeaponSkillChargeBonusPct, subscribeWeaponSkillPoints } from '../../skills/weaponSkillPointsStore';
import AXEWeaponSkillPointsPanel from './AXEWeaponSkillPointsPanel';
import AXESkillPathHorizontal from './AXESkillPathHorizontal';
import AXEUniversalSkillHub from './AXEUniversalSkillHub';
import AXECompanionSkillHub from './AXECompanionSkillHub';
import AXESkillTreeErrorBoundary from './AXESkillTreeErrorBoundary';
import {
  CLONE_SKILL_TREE_CATEGORIES, createCloneSkillTreePaths, resolveCloneSkillTreeTier,
  cloneSkillTreeIsAvailable,
} from '../skills/AXECloneSkillTreeModel.mjs';
import './AXECloneSkillTree.css';

const formatStatName = name => name.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const valueAt = (skill, stat, level) => {
  const amount = scaleStat(skill, stat, level);
  return stat.includes('pct') || stat.includes('chance') || stat.includes('reflect')
    ? (amount * 100).toFixed(1) + '%' : Number(amount).toFixed(2);
};
const classify = skill => skill?.aerial || Number(skill?.aoe_radius) > 0 ? 'Aerial Effect'
  : Number(skill?.hit_count) > 1 || [CAST_TYPE.RANGED_DOUBLE, CAST_TYPE.RANGED_BARRAGE].includes(skill?.cast_type)
    ? 'Multi-Hit' : 'Single-Hit';

function TreeIcon({ kind = 'single', size = 48 }) {
  return <svg className={'axe-ct-glyph axe-ct-glyph--' + kind} width={size} height={size}
    viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true">
    {kind === 'single' && <><path d="M13 51 Q34 41 51 9 Q39 26 17 32 Q30 36 13 51Z" fill="currentColor" opacity=".35"/>
      <path d="M13 51Q31 37 51 9" strokeWidth="4"/></>}
    {(kind === 'triple' || kind === 'momentum') && (kind === 'triple'
      ? <><path d="M9 44L29 12" strokeWidth="5"/><path d="M25 52L46 17" strokeWidth="5"/><path d="M42 55L58 29" strokeWidth="5"/></>
      : <><path d="M5 22L22 32 5 42" strokeWidth="4"/><path d="M24 22L41 32 24 42" strokeWidth="4"/><path d="M42 22L58 32 42 42" strokeWidth="4"/></>)}
    {kind === 'aerial' && <>
      <ellipse cx="32" cy="46" rx="25" ry="8" strokeWidth="3"/>
      <path d="M32 11L26 35 32 30 38 35 32 11Z" fill="currentColor" opacity=".65"/>
      <path d="M16 18L18 39M49 18L46 40M9 36L22 42M55 36L43 42" strokeWidth="3"/>
      <path d="M25 40L29 23M39 40L35 23" strokeWidth="2.5"/>
    </>}
    {kind === 'precision' && <><circle cx="32" cy="32" r="18" strokeWidth="3"/>
      <circle cx="32" cy="32" r="6" strokeWidth="3"/><path d="M32 5V19M32 45V59M5 32H19M45 32H59" strokeWidth="3"/></>}
    {kind === 'aerial-passive' && <><ellipse cx="32" cy="47" rx="24" ry="7" strokeWidth="3"/>
      <path d="M32 41V9M20 21L32 8 44 21" strokeWidth="4"/><path d="M15 37Q32 48 49 37" strokeWidth="3"/></>}
    {kind === 'ranged' && <><path d="M12 10Q42 32 12 54" strokeWidth="4"/><path d="M11 11L11 53M10 32H52" strokeWidth="2"/><path d="M45 25L54 32 45 39" strokeWidth="3"/></>}
    {kind === 'shield' && <><path d="M32 6L52 14V32Q50 47 32 57Q14 47 12 32V14Z" strokeWidth="3"/></>}
    {kind === 'passive' && <><path d="M10 46Q21 16 53 11Q48 40 19 53Z" strokeWidth="3"/>
      <path d="M17 52Q30 31 46 22" strokeWidth="3"/></>}
    {kind === 'burst' && <><path d="M32 3L39 23 60 32 39 39 32 61 24 39 4 32 24 24Z" strokeWidth="3"/></>}
  </svg>;
}
function SkillDetails({ node, category, paths, companion, activeIds, onEquip }) {
  const path = paths.find(p=>p.id===node?.lane);
  const status = path && node?.tier ? resolveCloneSkillTreeTier(path,node.tier,isWeaponSkillUnlocked) : null;
  const passive = node?.kind === 'passive' ? path?.passives?.find(p=>p.id===node.id) : null;
  const skill = node?.kind==='skill' ? (companion ? getCompanionSkillById(node.id) : getSkillById(node.id)) : null;
  const mastery = skill && !companion ? getSkillMastery(skill.skill_id) : null;
  const title = passive?.label || (skill && path?.titles?.[node.tier-1]) ||
    skill?.skill_name || 'Select a skill';
  const icon = passive?.icon || path?.icon || 'burst';
  const effects = skill ? Object.keys(skill.scaling||{}) : [];
  const xpLeft = mastery?.nextLevelXp == null ? null : Math.max(0,mastery.nextLevelXp-mastery.xp);
  return <aside className="axe-ct-details" aria-label="Skill details">
    <header className="axe-ct-details-top">
      <span className="axe-ct-detail-icon"><TreeIcon kind={icon} size={62}/></span>
      <div><small>SKILL DETAILS</small><h2>{title}</h2>
        <div className="axe-ct-pills"><span>{passive?'Passive':skill?classify(skill):'Combat'}</span>
          {mastery && <span>Lv. {mastery.level} / {mastery.maxLevel}</span>}</div></div>
    </header>
    <section className="axe-ct-detail-section">
      <h3><BookOpen size={16}/> Description</h3>
      <p>{passive ? 'This branch displays a linked Charge Focus marker for the existing weapon-skill point progression. ' +
        'The game grants +1% charged-strike damage per unlocked stage to the weapon path, not an independent skill.'
        : skill?.description || 'Select a combat skill or passive node to see its details.'}</p>
      {skill && title !== skill.skill_name && <small className="axe-ct-registered">Registry: {skill.skill_name}</small>}
    </section>
    <section className="axe-ct-detail-section">
      <h3><Swords size={17}/> Skill stats</h3>
      {passive ? <div className="axe-ct-stats">
        <div><span>Bonus type</span><strong>Charged strike (shared path)</strong></div>
        <div><span>Unlocked effect</span><strong className="axe-ct-positive">+{(passive.bonusPct*100).toFixed(0)}%</strong></div>
      </div> : skill ? <div className="axe-ct-stats">
        <div className="axe-ct-stat-head"><span>Attribute</span><span>Current</span><span>Next level</span></div>
        {effects.map(stat=><div key={stat}>
          <span>{formatStatName(stat)}</span><strong>{valueAt(skill,stat,mastery?.level||1)}</strong>
          <strong className="axe-ct-positive">{mastery && mastery.level < mastery.maxLevel
            ? '→ '+valueAt(skill,stat,mastery.level+1) : '—'}</strong></div>)}
        <div><span>Cooldown</span><strong>{skill.cooldown || 0}s</strong><strong>—</strong></div>
        <div><span>Hits</span><strong>{skill.hit_count || 0}</strong><strong>—</strong></div>
        {path && <div><span>Weapon point bonus</span><strong className="axe-ct-positive">
          +{(getWeaponSkillChargeBonusPct(skill.skill_id)).toFixed(0)}%</strong>
          <strong>Live allocation</strong></div>}
      </div> : <p>No skill selected.</p>}
    </section>
    <section className="axe-ct-detail-section">
      <h3><Sparkles size={17}/> Tree progression {path && <span className="axe-ct-tier-note">{path.label}</span>}</h3>
      {path && <div className="axe-ct-progress-route">
        {path.active.map((id,i)=><span key={id} className={i===node.tier-1?'axe-ct-progress-current':''}>
          {i!==0?'→ ':''}T{i+1}</span>)}
      </div>}
      <h3>Level progression</h3>
      <p>{passive ? (status?.unlocked?'Available through weapon skill point progression.':'Complete the previous weapon-skill point tier.')
        : mastery ? 'Lv. '+mastery.level+' / '+mastery.maxLevel+' · '+mastery.rank.label
          : 'Mastery XP is earned through confirmed combat use.'}</p>
      {mastery && <><div className="axe-ct-xp-track"><span style={{width:Math.max(0,Math.min(100,mastery.progress*100))+'%'}}/></div>
        <p className="axe-ct-progress-copy">{xpLeft==null?'Maximum level reached':Math.ceil(xpLeft).toLocaleString()+' XP to next level'}</p></>}
    </section>
    <section className="axe-ct-detail-section axe-ct-requirements">
      <h3><Shield size={17}/> Requirements</h3>
      {status && <p className={status.unlocked?'axe-ct-positive':'axe-ct-warning'}>
        {status.unlocked?'✓ Tier available':'◇ Complete the previous paid weapon skill tier'}</p>}
      {skill?.weapon_type && <p>◉ {skill.weapon_type} weapon required to cast</p>}
      {passive && <p>◉ Read-only marker for existing charged-strike passives.</p>}
    </section>
    {skill && <button className="axe-ct-detail-equip" type="button"
      disabled={!!status && !status.unlocked || activeIds.includes(skill.skill_id)}
      onClick={()=>onEquip(skill)}>
      {activeIds.includes(skill.skill_id)?'Equipped':'Equip in next empty slot'}
    </button>}
  </aside>;
}
function FlatSkillCatalog({ skills, selected, equipped, onSelect, companion, search, onEquipSkill }) {
  const items=skills.filter(skill=>!search ||
    [skill.skill_name,skill.description,skill.category].filter(Boolean).join(' ').toLowerCase().includes(search));
  return <div className="axe-ct-flat-catalog">{items.map(skill=><button key={skill.skill_id} type="button"
    className={selected?.id===skill.skill_id?'axe-ct-flat-selected':''}
    onClick={()=>onSelect({kind:'skill',id:skill.skill_id,tier:0})}
    onDoubleClick={()=>onEquipSkill?.(skill.skill_id)}
    onContextMenu={event=>{event.preventDefault();onEquipSkill?.(skill.skill_id);}}
    title={skill.skill_name+' — Double-click or right-click to equip'}>
    <TreeIcon kind={skill.aerial?'aerial':classify(skill)==='Multi-Hit'?'triple':'single'} size={38}/>
    <strong>{skill.skill_name}</strong><small>{companion?skill.category:classify(skill)}</small>
    <span>{equipped.includes(skill.skill_id)?'Equipped':'Available'}</span>
  </button>)}{!items.length && <p>No skills match the selected filters.</p>}</div>;
}
export default function AXECloneSkillTreeWorkspace({
  currentPage='skills_character', companion=false, onPageChange,
  view='skills', onChangeView, selected: selectedSkill, onSelect: onSelectSkill,
  ownedWeapons=[], activeMode, activeIds=[], passiveIds=[],
  onQuickEquip, onEquipActive, onRemoveActive, onRemovePassive,
  onSavePreset, onChoosePreset, currentPresetIndex=0,
  onActivateWeapon, status='', onClose,
}) {
  const [,setMasteryRevision] = useState(0);
  const [category,setCategory] = useState(activeMode?.id||'damage');
  const [activePathId,setActivePathId] = useState('single');
  const [filter,setFilter] = useState('all');
  const [search,setSearch] = useState('');
  const [selected,setSelected] = useState(()=>{
    if(companion)return null;
    const mode=activeMode?.id||'damage';
    const initial=createCloneSkillTreePaths(mode)[0];
    return {kind:'skill',id:initial.active[0],category:mode,lane:'single',tier:1};
  });
  const [feedback,setFeedback] = useState('');
  // Optional target slot for gestures: right-click or double-click a skill
  // to equip to the selected slot, otherwise use the next empty slot.
  const [targetEquipSlot,setTargetEquipSlot] = useState(null);
  const [manualSkillSelected,setManualSkillSelected] = useState(false);
  const paths = useMemo(()=>createCloneSkillTreePaths(category),[category]);
  const normalizedSearch = search.trim().toLowerCase();
  useEffect(()=>subscribeSkillMastery(()=>setMasteryRevision(v=>v+1)),[]);
  useEffect(()=>subscribeWeaponSkillPoints(()=>setMasteryRevision(v=>v+1)),[]);
  useEffect(()=>{
    if(companion){setCategory('combat');setSelected(null);}
    else if(activeMode?.id){
      setCategory(activeMode.id);
      setActivePathId('single');
      const first=createCloneSkillTreePaths(activeMode.id)[0];
      setSelected({kind:'skill',id:first.active[0],
        category:activeMode.id,lane:'single',tier:1});
    }
  },[activeMode?.id,companion]);
  // The Game 3D controller owns selection, saves, unlocks, and loadout transactions.
  const registry = companion ? getAllCompanionSkills() : getAllSkills();
  const companionCategories = useMemo(()=>[...new Set(getAllCompanionSkills()
    .map(skill=>skill.category).filter(Boolean))].map(id=>({
      id,label:id.charAt(0).toUpperCase()+id.slice(1),icon:'passive',
    })),[]);
  const displayCategories = companion ? companionCategories : CLONE_SKILL_TREE_CATEGORIES;
  const filteredFlat = companion ? registry.filter(skill=>skill.category===category) :
    registry.filter(s=>s.skill_type===(view==='buffs'?SKILL_TYPE.ACTIVE_BUFF:SKILL_TYPE.ACTIVE_ATTACK));
  const collection = view==='skills'&&!companion&&['damage','range','defense'].includes(category);
  const modernCollection=companion||category==='universal';
  const getSkill = companion ? getCompanionSkillById : getSkillById;
  const switchPreset = next => {
    if (!onChoosePreset) {setFeedback('Skill set switching is unavailable.');return;}
    onChoosePreset((next+3)%3);
    setFeedback('');
  };
  const equipSkill = (skill,index=null) => {
    if(!skill) return;
    if(!companion && !cloneSkillTreeIsAvailable(skill.skill_id,isWeaponSkillUnlocked)) {
      setFeedback('Complete the weapon skill point stage before equipping this ability.');
      return;
    }
    if(index===null) onQuickEquip?.(skill);
    else onEquipActive?.(index,skill);
    setFeedback('');
  };
  const selectNode = node => {
    setSelected(node);
    setManualSkillSelected(node?.kind==='skill');
    onSelectSkill?.(node?.kind==='skill' ? getSkill(node.id) : null);
    setFeedback('');
  };
  const equipFromTree = skillId => {
    // Only registered active attacks can be equipped from this weapon tree;
    // visual charged-strike passives and paid stages are not castable items.
    const skill=getSkillById(skillId);
    if(!skill) { setFeedback('This entry is a progression bonus, not an equippable skill.');return; }
    equipSkill(skill,targetEquipSlot);
    setManualSkillSelected(false);
    setTargetEquipSlot(null);
  };
  const equipFromModernHub = skill => {
    if(!skill)return;
    const destination=skill.skill_type===SKILL_TYPE.PASSIVE?null:targetEquipSlot;
    equipSkill(skill,destination);
    setTargetEquipSlot(null);
    setManualSkillSelected(false);
  };
  const equipFromCatalog = skillId => {
    const skill=getSkill(skillId);
    if(!skill)return;
    // Real passive skills use passive slots rather than the targeted active slot.
    const destination=skill.skill_type===SKILL_TYPE.PASSIVE?null:targetEquipSlot;
    equipSkill(skill,destination);
    setManualSkillSelected(false);
    setTargetEquipSlot(null);
  };
  const clickEquipSlot = index => {
    if(manualSkillSelected&&selected?.kind==='skill'){
      equipSkill(getSkill(selected.id),index);
      setManualSkillSelected(false);
      setTargetEquipSlot(null);
    } else {
      setTargetEquipSlot(index);
      setFeedback('Skill slot '+(index===9?'0':index+1)+' selected. Right-click or double-click a skill to equip it here.');
    }
  };
  const selectCategory = id => {
    setCategory(id);
    setActivePathId('single');
    setTargetEquipSlot(null);
    setManualSkillSelected(false);
    const first=['damage','range','defense'].includes(id)?createCloneSkillTreePaths(id)[0]:null;
    const next=first?{kind:'skill',id:first.active[0],lane:'single',category:id,tier:1}:null;
    setSelected(next);
    onSelectSkill?.(next?getSkillById(next.id):null);
    setSearch('');setFilter('all');setFeedback('');
  };
  const changePath = id => {
    const next=paths.find(item=>item.id===id);
    if(!next)return;
    setActivePathId(id);
    setTargetEquipSlot(null);
    setManualSkillSelected(false);
    setSelected({kind:'skill',id:next.active[0],lane:id,category,tier:1});
    onSelectSkill?.(getSkillById(next.active[0]));
  };
  const resolveNodeForDetail = () => {
    if(!selected) return null;
    if(selected.kind==='passive') return selected;
    return getSkill(selected.id)?selected:null;
  };
  const selectedWeapon = ['damage','range','defense'].includes(category)
    ? getWeaponForSkillBookMode(ownedWeapons,category) : null;
  void selectedSkill;void onRemovePassive;
  return <div className="axe-clone-skill-root" data-progression-panel={currentPage}>
    <header className="axe-ct-header">
      <BookOpen size={34} aria-hidden="true"/>
      <div className="axe-ct-heading"><h1>Skill Book</h1>
        <p>Learn, equip and master your combat skills.</p></div>
      <nav className="axe-ct-actor" aria-label="Skill owner">
        {[['skills_character','Character'],['skills_companion','Companion']].map(([id,label])=>
          <button key={id} type="button" aria-pressed={currentPage===id}
            onClick={()=>{setSelected(null);setSearch('');setFeedback('');onPageChange?.(id);}}>{label}</button>)}
      </nav>
      <div className="axe-ct-header-right"><span>✧ &nbsp; Live skill mastery · Game 3D</span>
        {onClose && <button className="axe-ct-close" type="button" aria-label="Close Skill Book"
          onClick={onClose}><X size={20}/></button>}</div>
    </header>
    <div className={'axe-ct-content'+(collection?' axe-ct-content--horizontal':'')+
      (modernCollection?' axe-ct-content--collection':'')+
      (companion?' axe-ct-content--companion':'')}>
      {!companion && <aside className="axe-ct-categories" aria-label="Weapon Category">
        {displayCategories.map(item=><button key={item.id} type="button"
          aria-pressed={category===item.id} onClick={()=>selectCategory(item.id)}>
          <TreeIcon kind={item.icon} size={27}/><span>{item.label}</span></button>)}
      </aside>}
      <main className={'axe-ct-main'+(collection?' axe-ct-main--horizontal':'')+
        (modernCollection?' axe-ct-main--collection':'')}>
        {collection ? <AXESkillTreeErrorBoundary resetKey={category+':'+activePathId}>
          <AXESkillPathHorizontal category={category} paths={paths}
            activePathId={activePathId} onChangePath={changePath}
            selected={selected} onSelect={selectNode} activeIds={activeIds}
            onEquipSkill={equipFromTree} onFeedback={setFeedback}
            onActivateWeapon={onActivateWeapon} activeMode={activeMode}/>
        </AXESkillTreeErrorBoundary> : companion
          ? <AXECompanionSkillHub activeIds={activeIds}
              onEquip={equipFromModernHub}
              onSelected={skill=>selectNode({kind:'skill',id:skill.skill_id,tier:0})}/>
          : category==='universal'
          ? <AXEUniversalSkillHub
              activeIds={activeIds} passiveIds={passiveIds}
              onEquip={equipFromModernHub}
              onSelected={skill=>selectNode({kind:'skill',id:skill.skill_id,tier:0})}/>
          : <>
          <div className="axe-ct-main-heading">
            <div className="axe-ct-main-icon"><Swords size={29}/></div>
            <div><h2>{companion?'Companion Skills':'Universal Skills'}</h2>
              <p>Your registered skill collection and mastery</p></div>
          </div>
          <div className="axe-ct-toolbar">
            <select aria-label="Filter available skills" value={filter}
              onChange={event=>setFilter(event.target.value)}>
              <option value="all">All Skills</option>
            </select>
            <label className="axe-ct-search"><BookOpen size={16}/>
              <input type="search" aria-label="Search Skill" placeholder="Search Skill"
                value={search} onChange={event=>setSearch(event.target.value)}/>
              <Search size={17}/>
            </label>
            <nav className="axe-ct-view" aria-label="Skill, buff and advancement">
              {[['skills','Skill'],['buffs','Buff'],['advance','Advance']].map(([id,label])=>
                <button key={id} type="button" aria-pressed={view===id}
                  onClick={()=>{onChangeView?.(id);setSearch('');setFilter('all');setSelected(null);}}>
                  {label}</button>)}
            </nav>
          </div>
          {view==='advance'&&!companion
            ? <div className="axe-ct-tree-scroll axe-ct-advance"><AXEWeaponSkillPointsPanel/></div>
            : <FlatSkillCatalog skills={filteredFlat} selected={selected} equipped={activeIds}
                companion={companion} search={normalizedSearch} onSelect={selectNode}
                onEquipSkill={equipFromCatalog}/>}
        </>}
        <div className="axe-ct-equipped" aria-label="Equipped skills">
          <div className="axe-ct-equipped-heading">
            <button type="button" onClick={()=>switchPreset(currentPresetIndex-1)} aria-label="Previous skill set">
              <ChevronLeft size={20}/></button>
            <h3>Equipped Skills</h3>
            <span className="axe-ct-preset">Set {currentPresetIndex+1} / 3</span>
            <button type="button" className="axe-ct-save-preset"
              onClick={()=>onSavePreset?.()} aria-label="Save currently equipped skill bar">
              Save
            </button>
            <button type="button" onClick={()=>switchPreset(currentPresetIndex+1)} aria-label="Next skill set">
              <ChevronRight size={20}/></button>
            <small>Select a slot, then right-click or double-click a skill to equip.</small>
          </div>
          <div className="axe-ct-equipped-slots">
            {activeIds.map((id,i)=><button type="button" key={i}
              className={targetEquipSlot===i?'axe-ct-equipped-target':''}
              aria-pressed={targetEquipSlot===i}
              onClick={()=>clickEquipSlot(i)}
              onContextMenu={event=>{
                event.preventDefault();
                if(id)onRemoveActive?.(i);
                setTargetEquipSlot(null);
              }}
              title={(id ? getSkill(id)?.skill_name || 'Equipped skill' : 'Empty skill slot')+
                ' — Click to target for skill gestures; right-click a filled slot to unequip'}
              aria-label={(companion?COMPANION_SLOT_KEYS[i]:String(i+1))+': '+(getSkill(id)?.skill_name||'Empty')+
                (targetEquipSlot===i?' — selected destination':'')}>
              {id?<TreeIcon kind={classify(getSkill(id))==='Multi-Hit'?'triple':
                classify(getSkill(id))==='Aerial Effect'?'aerial':'single'} size={34}/>
                :<span className="axe-ct-slot-star">✦</span>}
              <small>{companion?COMPANION_SLOT_KEYS[i]:i===9?'0':i+1}</small>
            </button>)}
          </div>
        </div>
      </main>
      {!collection && !modernCollection && <SkillDetails node={resolveNodeForDetail()} category={category} paths={paths}
        companion={companion} activeIds={activeIds} onEquip={equipSkill}/>}
    </div>
    <footer className="axe-ct-footer">
      <span role="status">{feedback||status||'Choose a category to browse skills, equip them to a loadout, and master your combat style.'}</span>
      <span>◉ Mastery is earned through gameplay</span>
    </footer>
  </div>;
}