import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, CircleHelp, Crown, Feather, Gem, Search, Shield, Sparkles, Swords, X } from 'lucide-react';
import { CAST_TYPE, SKILL_TYPE } from '../../skills/skillTypes';
import { getAllSkills, getSkillById, scaleStat } from '../../skills/skillRegistry';
import { getAllCompanionSkills, getCompanionSkillById } from '../../skills/companionSkillRegistry';
import { COMPANION_SLOT_KEYS } from '../../skills/companionLoadoutStore';
import { getWeaponForSkillBookMode } from './SkillBookWeaponModes.mjs';
import { getSkillMastery, subscribeSkillMastery } from '../../skills/skillMasteryStore';
import { isWeaponSkillUnlocked, getWeaponSkillChargeBonusPct, subscribeWeaponSkillPoints } from '../../skills/weaponSkillPointsStore';
import AXEWeaponSkillPointsPanel from './AXEWeaponSkillPointsPanel';
import {
  CLONE_SKILL_TREE_CATEGORIES, createCloneSkillTreePaths, resolveCloneSkillTreeTier,
  cloneSkillTreeIsAvailable,
} from '../skills/AXECloneSkillTreeModel.mjs';
import './AXECloneSkillTree.css';

const tierTitles = ['Root', 'Branch', 'Mastery'];
const displayNames = {
  damage: {
    single: ['Single Hit', 'Heavy Slash', 'Execution Cut'],
    three: ['Three-Hit', 'Rising Flurry', 'Storm Flurry'],
    aerial: ['Aerial Effect', 'Sky Burst', 'Heaven Crash'],
  },
};
const passiveDescription = {
  single: 'Focused strike damage',
  three: 'Consecutive-hit damage',
  aerial: 'Circular blast and aerial damage',
};
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
function TierConnector() {
  return <svg className="axe-ct-connector" viewBox="0 0 200 35" preserveAspectRatio="none" aria-hidden="true">
    <path d="M100 0V9Q100 14 90 14H50Q43 14 43 22V31M100 9Q100 14 110 14H150Q157 14 157 22V31"
      fill="none" stroke="#efca87" strokeWidth="1.9"/>
    <path d="M39 27L43 33 47 27M153 27L157 33 161 27" stroke="#efca87"
      strokeWidth="2" fill="none" strokeLinejoin="round"/>
  </svg>;
}
function TreeNode({ icon, title, tier, skill, passive, locked, selected, equipped, requirement, onClick }) {
  const mastery = skill ? getSkillMastery(skill.skill_id) : null;
  return <button type="button" className={['axe-ct-node',selected?'axe-ct-node--selected':'',
    locked?'axe-ct-node--locked':'', passive?'axe-ct-node--passive':''].join(' ')}
    onClick={onClick} aria-pressed={selected} aria-label={title + (locked ? ': Locked, '+requirement : '')}
    title={skill?.skill_name || passive?.label || title}>
    <span className="axe-ct-node-icon"><TreeIcon kind={icon} size={37}/></span>
    <span className="axe-ct-node-title">{title}</span>
    <small>{passive ? '+' + (passive.bonusPct*100).toFixed(0) + '% charged'
      : skill ? 'Lv. ' + mastery.level + ' / ' + mastery.maxLevel : ''}</small>
    {tier === 1 && <span className="axe-ct-node-tier">T1</span>}
    {locked && <span className="axe-ct-locked-note">◆ Tier locked</span>}
    {equipped && <span className="axe-ct-equipped-note">Equipped</span>}
  </button>;
}
function BranchLane({ path, category, selected, onSelect, equipped, search, filter }) {
  const names = path.titles;
  const skills = path.active.map(id => getSkillById(id));
  const tiers = [1,2,3].map(n => resolveCloneSkillTreeTier(path,n,isWeaponSkillUnlocked));
  const title = (tier) => names?.[tier-1] || (tier === 1 ? path.label : skills[tier-1]?.skill_name || path.label);
  const matches = !search || [path.label,...(names||[]),...skills.map(s=>s?.skill_name||''),
    ...path.passives.map(p=>p.label)].join(' ').toLowerCase().includes(search);
  const faded = (filter !== 'all' && filter !== path.id) || !matches;
  const current = (kind,id) => selected?.kind===kind && selected?.id===id;
  const selectActive = tier => onSelect({ kind:'skill', id:path.active[tier-1], category, lane:path.id, tier });
  const selectPassive = passive => onSelect({kind:'passive',id:passive.id,category,lane:path.id,tier:passive.tier});
  const passiveCard = tier => {
    const passive = path.passives[tier-2];
    return <TreeNode key={passive.id} icon={passive.icon} title={passive.label} tier={tier}
      passive={passive} locked={!tiers[tier-1].unlocked} selected={current('passive',passive.id)}
      requirement={'Complete prerequisite paid weapon skill stage'}
      onClick={()=>selectPassive(passive)}/>;
  };
  return <div className={'axe-ct-lane'+(faded?' axe-ct-lane--faded':'')} data-path={path.id}>
    <TreeNode icon={path.icon} title={title(1)} tier={1} skill={skills[0]}
      selected={current('skill',path.active[0])} equipped={equipped.includes(path.active[0])}
      onClick={()=>selectActive(1)}/>
    <TierConnector/>
    <div className="axe-ct-pair">
      <TreeNode icon={path.icon} title={title(2)} tier={2} skill={skills[1]}
        locked={!tiers[1].unlocked} selected={current('skill',path.active[1])}
        equipped={equipped.includes(path.active[1])} requirement={'Complete prerequisite paid weapon skill stage'}
        onClick={()=>selectActive(2)}/>
      {passiveCard(2)}
    </div>
    <TierConnector/>
    <div className="axe-ct-pair">
      <TreeNode icon={path.icon} title={title(3)} tier={3} skill={skills[2]}
        locked={!tiers[2].unlocked} selected={current('skill',path.active[2])}
        equipped={equipped.includes(path.active[2])} requirement={'Complete prerequisite paid weapon skill stage'}
        onClick={()=>selectActive(3)}/>
      {passiveCard(3)}
    </div>
  </div>;
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
function FlatSkillCatalog({ skills, selected, equipped, onSelect, companion, search }) {
  const items=skills.filter(skill=>!search ||
    [skill.skill_name,skill.description,skill.category].filter(Boolean).join(' ').toLowerCase().includes(search));
  return <div className="axe-ct-flat-catalog">{items.map(skill=><button key={skill.skill_id} type="button"
    className={selected?.id===skill.skill_id?'axe-ct-flat-selected':''}
    onClick={()=>onSelect({kind:'skill',id:skill.skill_id,tier:0})}>
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
  const [filter,setFilter] = useState('all');
  const [search,setSearch] = useState('');
  const [selected,setSelected] = useState({kind:'skill',id:'axe_offensive_skill_5',
    category:'damage',lane:'three',tier:2});
  const [feedback,setFeedback] = useState('');
  const paths = useMemo(()=>createCloneSkillTreePaths(category),[category]);
  const normalizedSearch = search.trim().toLowerCase();
  useEffect(()=>subscribeSkillMastery(()=>setMasteryRevision(v=>v+1)),[]);
  useEffect(()=>subscribeWeaponSkillPoints(()=>setMasteryRevision(v=>v+1)),[]);
  useEffect(()=>{
    if(companion)setCategory('combat');
    else if(activeMode?.id)setCategory(activeMode.id);
  },[activeMode?.id,companion]);
  // The Game 3D controller owns selection, saves, unlocks, and loadout transactions.
  const registry = companion ? getAllCompanionSkills() : getAllSkills();
  const companionCategories = useMemo(()=>[...new Set(getAllCompanionSkills()
    .map(skill=>skill.category).filter(Boolean))].map(id=>({
      id,label:id.charAt(0).toUpperCase()+id.slice(1),icon:'passive',
    })),[]);
  const displayCategories = companion ? companionCategories : CLONE_SKILL_TREE_CATEGORIES;
  const filteredFlat = companion ? registry.filter(skill=>skill.category===category)
    : category==='passive' ?
    registry.filter(s=>s.skill_type===SKILL_TYPE.PASSIVE) :
    registry.filter(s=>s.skill_type===(view==='buffs'||category==='universal'?SKILL_TYPE.ACTIVE_BUFF:SKILL_TYPE.ACTIVE_ATTACK));
  const collection = view==='skills'&&!companion&&['damage','range','defense'].includes(category);
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
    onSelectSkill?.(node?.kind==='skill' ? getSkill(node.id) : null);
    setFeedback('');
  };
  const selectCategory = id => {
    setCategory(id);setSelected(null);onSelectSkill?.(null);
    setSearch('');setFilter('all');setFeedback('');
  };
  const resolveNodeForDetail = () => {
    if(!selected) return null;
    if(selected.kind==='passive') return selected;
    return getSkill(selected.id)?selected:null;
  };
  const selectedWeapon = ['damage','range','defense'].includes(category)
    ? getWeaponForSkillBookMode(ownedWeapons,category) : null;
  void selectedSkill;void passiveIds;void onRemovePassive;
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
    <div className="axe-ct-content">
      <aside className="axe-ct-categories" aria-label="Weapon Category">
        {displayCategories.map(item=><button key={item.id} type="button"
          aria-pressed={category===item.id} onClick={()=>selectCategory(item.id)}>
          <TreeIcon kind={item.icon} size={27}/><span>{item.label}</span></button>)}
      </aside>
      <main className="axe-ct-main">
        <div className="axe-ct-main-heading">
          <div className="axe-ct-main-icon"><Swords size={29}/></div>
          <div><h2>{collection?'Combat Skill Tree':companion?'Companion Skills':category==='passive'?'Passive Skills':'Combat Skills'}</h2>
            <p>{collection?'Branching combat skills · Build your fighting style':'Your registered skill collection and mastery'}</p></div>
          {collection && <button type="button" className="axe-ct-activate-weapon"
            aria-label={'Activate '+category+' weapon skill bar'}
            onClick={()=>onActivateWeapon?.(category)}
            title="Draw an owned weapon and activate its saved skill set">
            {activeMode?.id===category?'Active':'Activate'} {category==='range'?'Range':category==='defense'?'Defense':'Damage'} Bar
            {selectedWeapon?.name && <small>{selectedWeapon.name}</small>}
          </button>}
        </div>
        <div className="axe-ct-toolbar">
          <select aria-label="Filter skill tree" value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="all">{collection?'All '+category[0].toUpperCase()+category.slice(1)+' Skills':'All Skills'}</option>
            {collection && paths.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <label className="axe-ct-search"><BookOpen size={16}/>
            <input type="search" aria-label="Search Skill" placeholder="Search Skill"
              value={search} onChange={e=>setSearch(e.target.value)}/>
            <Search size={17}/></label>
          <nav className="axe-ct-view" aria-label="Skill, buff and advancement">
            {[['skills','Skill'],['buffs','Buff'],['advance','Advance']].map(([id,label])=>
              <button key={id} type="button" aria-pressed={view===id}
                onClick={()=>{onChangeView?.(id);setSearch('');setFilter('all');setSelected(null);}}>{label}</button>)}
          </nav>
        </div>
        {view==='advance' && !companion ? <div className="axe-ct-tree-scroll axe-ct-advance"><AXEWeaponSkillPointsPanel/></div> : collection ? <div className="axe-ct-tree-scroll" aria-label="Three branch combat skill tree">
          <div className="axe-ct-tree-canvas">
            <div className="axe-ct-tier-axis">
              {tierTitles.map((label,i)=><div key={label}><b>T{i+1}</b><span>{label}</span></div>)}
            </div>
            <div className="axe-ct-lanes">
              {paths.map(path=><BranchLane key={path.id} path={path} category={category}
                selected={selected} onSelect={selectNode} equipped={activeIds}
                filter={filter} search={normalizedSearch}/>)}
            </div>
          </div>
        </div> : <FlatSkillCatalog skills={filteredFlat} selected={selected} equipped={activeIds}
          companion={companion} search={normalizedSearch} onSelect={selectNode}/>}
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
            <small>Select a skill, then choose a slot.</small>
          </div>
          <div className="axe-ct-equipped-slots">
            {activeIds.map((id,i)=><button type="button" key={i} onClick={()=>{
                if(selected?.kind==='skill')equipSkill(getSkill(selected.id),i);
                else if(id)onRemoveActive?.(i);
              }} title={id ? getSkill(id)?.skill_name || 'Equipped skill' : 'Empty skill slot'}
              aria-label={(companion?COMPANION_SLOT_KEYS[i]:String(i+1))+': '+(getSkill(id)?.skill_name||'Empty')}>
              {id?<TreeIcon kind={classify(getSkill(id))==='Multi-Hit'?'triple':
                classify(getSkill(id))==='Aerial Effect'?'aerial':'single'} size={34}/>
                :<span className="axe-ct-slot-star">✦</span>}
              <small>{companion?COMPANION_SLOT_KEYS[i]:i===9?'0':i+1}</small>
            </button>)}
          </div>
        </div>
      </main>
      <SkillDetails node={resolveNodeForDetail()} category={category} paths={paths}
        companion={companion} activeIds={activeIds} onEquip={equipSkill}/>
    </div>
    <footer className="axe-ct-footer">
      <span role="status">{feedback||status||'Choose a category to browse skills, equip them to a loadout, and master your combat style.'}</span>
      <span>◉ Mastery is earned through gameplay</span>
    </footer>
  </div>;
}