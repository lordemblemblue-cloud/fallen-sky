import { useMemo, useState } from 'react';
import { Activity, ArrowRight, Compass, Heart, Search, Shield, Sparkles, Swords, Wind } from 'lucide-react';
import { getAllCompanionSkills } from '../../skills/companionSkillRegistry';
import { companionCombatPaths } from './AXECompanionSkillModel.mjs';
import './AXESkillCollections.css';

// Skill paths are projected from the real companion registry; unknown
// future combat attacks appear in Other rather than being omitted.
const COMBAT_ICONS={single:Swords,multi:Activity,area:Sparkles,other:Shield};
const CATEGORIES=[
  {id:'combat',title:'Combat',subtitle:'Single, multi-hit and area attacks',icon:Swords},
  {id:'mobility',title:'Mobility',subtitle:'Registered movement and repositioning skills',icon:Wind},
  {id:'support',title:'Support',subtitle:'Restoration and recovery',icon:Heart},
  {id:'fusion',title:'Fusion',subtitle:'Transformation skills and current readiness',icon:Sparkles},
];
export default function AXECompanionSkillHub({activeIds=[],onEquip,onSelected}) {
  const [category,setCategory]=useState('combat');
  const [pathId,setPathId]=useState('single');
  const [query,setQuery]=useState('');
  const [selectedId,setSelectedId]=useState(null);
  const registry=useMemo(()=>getAllCompanionSkills(),[]);
  const paths=useMemo(()=>companionCombatPaths(registry),[registry]);
  const currentPath=paths.find(path=>path.id===pathId)||paths[0];
  const categoryData=CATEGORIES.find(group=>group.id===category)||CATEGORIES[0];
  const members=category==='combat'?currentPath.skills:
    registry.filter(skill=>skill.category===category);
  const shown=members.filter(skill=>!query||[skill.skill_name,skill.description]
    .join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const selected=members.find(skill=>skill.skill_id===selectedId)||members[0]||null;
  const Icon=categoryData.icon;
  const equip=skill=>{if(skill)onEquip?.(skill);};
  return <section className="axe-sk-hub axe-sk-companion-hub" data-skill-hub="companion" aria-label="Companion skills">
    <header className="axe-sk-hero">
      <div className="axe-sk-hero-symbol"><Icon size={29}/></div>
      <div><small>Companion · Existing Z / X / V / B loadout</small>
        <h2>Companion {categoryData.title}</h2><p>{categoryData.subtitle}</p></div>
      <span>{registry.length} registered</span>
    </header>
    <div className="axe-sk-companion-tabs" aria-label="Companion skill categories">
      {CATEGORIES.map(group=><button key={group.id} type="button" aria-pressed={category===group.id}
        onClick={()=>{setCategory(group.id);setSelectedId(null);setQuery('');}}>
        <group.icon size={17}/>{group.title}</button>)}
    </div>
    <div className="axe-sk-toolbar">
      {category==='combat'?<nav className="axe-sk-combat-paths" aria-label="Companion combat paths">
        {paths.map(path=><button type="button" key={path.id} aria-pressed={pathId===path.id}
          onClick={()=>{setPathId(path.id);setSelectedId(null);}}>
          {(()=>{
            const PathIcon=COMBAT_ICONS[path.id]||Shield;
            return <PathIcon size={19}/>;
          })()}{path.label}</button>)}
      </nav>:<div className="axe-sk-path-caption">{categoryData.title} · Registered abilities</div>}
      <label className="axe-sk-search"><Search size={16}/><input type="search"
        value={query} onChange={event=>setQuery(event.target.value)}
        aria-label="Search companion abilities" placeholder="Search abilities"/></label>
    </div>
    <div className="axe-sk-columns">
      <div className="axe-sk-skill-list axe-sk-companion-list" role="list"
        aria-label={'Companion '+categoryData.title+' abilities'}>
        {shown.map((skill,i)=>{
          const equipped=activeIds.includes(skill.skill_id);
          return <button key={skill.skill_id} role="listitem" type="button"
            className={'axe-sk-skill'+(selected?.skill_id===skill.skill_id?' axe-sk-skill--selected':'')}
            aria-pressed={selected?.skill_id===skill.skill_id}
            onClick={()=>{setSelectedId(skill.skill_id);onSelected?.(skill);}}
            onDoubleClick={()=>equip(skill)}
            onContextMenu={event=>{event.preventDefault();equip(skill);}}
            title="Click for details; right-click or double-click to equip">
            <span className="axe-sk-skill-mark">{category==='combat'?<Swords size={24}/>:<Icon size={24}/>}</span>
            <span><strong>{skill.skill_name}</strong>
              <small>{skill.cooldown}s cooldown · {skill.requiresTarget?'Target required':'No target'}</small></span>
            <span className="axe-sk-skill-end">{equipped?'Equipped':<ArrowRight size={16}/>}</span>
          </button>;
        })}
        {!shown.length&&<p className="axe-sk-empty">No registered {categoryData.title.toLowerCase()} skills match this selection.</p>}
        {category==='combat'&&<div className="axe-sk-combat-rule">
          <span>Skill progression</span>
          <p>Abilities shown here come from the actual combat registry. Companion skill levels and automatic passives are not separately recorded yet, so no invented upgrades are displayed.</p>
        </div>}
        {category==='mobility'&&<div className="axe-sk-combat-rule">
          <span><Wind size={15}/> Mobility development</span>
          <p>Teleport Dash is the available repositioning ability. A lasting speed-increase buff is not yet implemented in the verified companion runtime; it cannot be equipped as a placeholder.</p>
        </div>}
        {category==='fusion'&&<div className="axe-sk-combat-rule">
          <span>Fusion readiness</span>
          <p>Only registered skills are equippable. Transformation visuals or damage bonuses remain subject to the existing gameplay implementation and eligibility rules.</p>
        </div>}
      </div>
      <aside className="axe-sk-inspector" aria-label="Companion skill information">
        {selected?<><div className="axe-sk-inspector-kicker">{categoryData.title} · Registered Skill</div>
          <h3>{selected.skill_name}</h3><p>{selected.description}</p>
          <div className="axe-sk-metrics">
            <span>Cooldown <strong>{selected.cooldown}s</strong></span>
            <span>Attack <strong>{selected.damage==null?'—':selected.damage}</strong></span>
            <span>Healing <strong>{selected.heal==null?'—':selected.heal}</strong></span>
            <span>Equipped <strong>{activeIds.includes(selected.skill_id)?'Yes':'No'}</strong></span>
          </div>
          <h4><Shield size={17}/> Companion loadout</h4>
          <p>Equipped companion abilities use Z / X / V / B and the existing companion ability runtime. Select a free slot below, or equip directly.</p>
          <button type="button" className="axe-sk-equip" disabled={activeIds.includes(selected.skill_id)}
            onClick={()=>equip(selected)}><Swords size={17}/>
            {activeIds.includes(selected.skill_id)?'Already Equipped':'Equip to Free Companion Slot'}</button>
        </>:<div className="axe-sk-empty"><Compass size={24}/><p>Select a registered companion ability to see its effects.</p></div>}
      </aside>
    </div>
  </section>;
}
