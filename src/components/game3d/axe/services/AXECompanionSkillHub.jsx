import {useMemo,useState} from 'react';
import {Activity,ArrowRight,Check,Clock3,Heart,LockKeyhole,Search,Shield,Sparkles,Swords,Target,Wind} from 'lucide-react';
import {getAllCompanionSkills} from '../../skills/companionSkillRegistry';
import {COMPANION_ABILITIES} from '../../companionAbilityStore';
import {companionCombatPaths} from './AXECompanionSkillModel.mjs';
import {
  COMPANION_SKILL_BRANCHES,buildCompanionSkillBranches,
  companionSkillCanCast,companionSkillMetrics,
} from './AXECompanionSkillBranches.mjs';
import './AXESkillCollections.css';
import './AXECompanionSkillTree.css';

const COMBAT_ICONS={single:Swords,multi:Activity,area:Sparkles,other:Target};
const ASSIST_ICONS={support:Heart,mobility:Wind,fusion:Sparkles};
const RUNTIME_IDS=COMPANION_ABILITIES.map(ability=>ability.id);
const readable=value=>String(value||'').replaceAll('_',' ').replace(/\b\w/g,ch=>ch.toUpperCase());

/**
 * The 2-lane skill tree is a visual catalog, not a new skill unlock engine.
 * All equip gestures use the parent's canonical companion loadout callbacks.
 */
export default function AXECompanionSkillHub({
  activeIds=[],onEquip,onSelected,targetEquipSlot=null,
}) {
  const [branch,setBranch]=useState('damage');
  const [query,setQuery]=useState('');
  const [selectedId,setSelectedId]=useState(null);
  const [message,setMessage]=useState('');
  const registry=useMemo(()=>getAllCompanionSkills(),[]);
  // Keep existing registered attack path mapping (single/multi/area) intact.
  const combatPaths=useMemo(()=>companionCombatPaths(registry),[registry]);
  const groups=useMemo(()=>buildCompanionSkillBranches(registry),[registry]);
  const current=groups.find(group=>group.id===branch)||groups[0];
  const term=query.trim().toLowerCase();
  const shown=current.skills.filter(skill=>!term||
    [skill.skill_name,skill.description,skill.category].filter(Boolean)
      .join(' ').toLowerCase().includes(term));
  const selected=shown.find(skill=>skill.skill_id===selectedId)||shown[0]||null;
  const equipped=selected?activeIds.includes(selected.skill_id):false;
  const canCast=companionSkillCanCast(selected,RUNTIME_IDS);
  const selectedSlot=Number.isInteger(targetEquipSlot)&&targetEquipSlot>=0&&targetEquipSlot<4
    ?targetEquipSlot:null;

  const choose=skill=>{
    setSelectedId(skill.skill_id);
    setMessage('');
    onSelected?.(skill);
  };
  const equip=skill=>{
    if(!skill)return;
    if(!companionSkillCanCast(skill,RUNTIME_IDS)){
      setMessage('This ability has no active companion cast handler yet. It cannot be equipped.');
      return;
    }
    if(activeIds.includes(skill.skill_id)&&selectedSlot===null){
      setMessage('This skill is already equipped. Select a different skill or target a slot to move it.');
      return;
    }
    onEquip?.(skill);
    setMessage('');
  };

  return <section className="axe-sk-hub axe-sk-companion-hub axe-comp-skillbook"
    data-skill-hub="companion" data-companion-skill-layout="assist-damage-tree"
    aria-label="Companion skill tree">
    <header className="axe-comp-tree-hero">
      <div className="axe-comp-tree-brand"><Sparkles size={25}/></div>
      <div><small>COMPANION ABILITIES</small><h2>Companion Skill Tree</h2>
        <p>Two branches. Real companion abilities. Four equipped slots.</p></div>
      <span>{activeIds.filter(Boolean).length} / 4 equipped</span>
    </header>

    <div className="axe-comp-tree-controls">
      <nav className="axe-comp-tree-tabs" aria-label="Companion skill branches">
        {COMPANION_SKILL_BRANCHES.map(entry=>{
          const Icon=entry.id==='assist'?Heart:Swords;
          const count=groups.find(group=>group.id===entry.id)?.skills.length||0;
          return <button key={entry.id} type="button" aria-pressed={branch===entry.id}
            onClick={()=>{setBranch(entry.id);setSelectedId(null);setMessage('');}}>
            <Icon size={17}/><strong>{entry.label}</strong><small>{count}</small>
          </button>;
        })}
      </nav>
      <label className="axe-comp-tree-search"><Search size={16} aria-hidden="true"/>
        <input type="search" value={query} onChange={event=>{setQuery(event.target.value);setSelectedId(null);}}
          placeholder="Search companion abilities" aria-label="Search companion abilities"/>
      </label>
    </div>
    <div className="axe-comp-tree-body">
      <section className="axe-comp-tree-map" aria-label={current.label+' skill path'}>
        <div className="axe-comp-tree-map-heading"><div>
          <h3>{current.label} Path</h3><p>{current.description}</p></div>
          <span>{shown.length} abilities</span>
        </div>
        <div className="axe-sk-companion-tree axe-comp-tree-nodes" role="list"
          aria-label={current.label+' companion skills'}>
          {shown.map((skill,index)=>{
            const path=combatPaths.find(group=>group.skills.some(item=>item.skill_id===skill.skill_id))||{id:'other'};
            const Icon=branch==='damage'?(COMBAT_ICONS[path.id]||Swords):
              (ASSIST_ICONS[skill.category]||Shield);
            const ready=companionSkillCanCast(skill,RUNTIME_IDS);
            const isEquipped=activeIds.includes(skill.skill_id);
            return <div key={skill.skill_id} className="axe-sk-combat-node" role="listitem">
              <button type="button" aria-pressed={selected?.skill_id===skill.skill_id}
                className={'axe-sk-skill axe-comp-tree-node'+(!ready?' axe-comp-tree-node--future':'')+
                  (selected?.skill_id===skill.skill_id?' axe-sk-skill--selected':'')}
                onClick={()=>choose(skill)} onDoubleClick={()=>equip(skill)}
                onContextMenu={event=>{event.preventDefault();equip(skill);}}
                title={ready?'Click for details; right-click or double-click to equip':'Preview only: cast unavailable'}>
                <span className="axe-comp-tree-node-top"><span className="axe-sk-skill-mark">
                  <Icon size={22}/></span>
                  {isEquipped?<span className="axe-comp-tree-node-status"><Check size={13}/> Equipped</span>:
                    !ready?<span className="axe-comp-tree-node-status axe-comp-tree-node-status--future"><LockKeyhole size={12}/> Future</span>:null}
                </span>
                <strong>{skill.skill_name}</strong>
                <small>{branch==='damage'?readable(path.id):readable(skill.category)}</small>
                <span className="axe-comp-tree-node-foot"><Clock3 size={13}/> {skill.cooldown}s cooldown</span>
              </button>
              {index<shown.length-1&&<span className="axe-sk-combat-connector" aria-hidden="true">
                <ArrowRight size={20}/></span>}
            </div>;
          })}
          {!shown.length&&<p className="axe-sk-empty">No skills match the search. Try another name.</p>}
        </div>
        <div className="axe-comp-tree-note">
          <Sparkles size={15}/><p>The lines organize the companion's abilities; they do not
            invent skill points, mastery levels or prerequisites. Pick an ability, then choose a
            Z / X / V / B slot beneath the tree to equip it.</p>
        </div>
        {branch==='assist'&&<p className="axe-comp-tree-assist-note">
          Teleport Dash is the available repositioning ability. A lasting
          speed-increase buff is not yet implemented. Deity Fusion remains
          visible for planning but cannot be cast until its runtime is ready.</p>}
      </section>
      <aside className="axe-sk-inspector axe-comp-tree-inspector" aria-label="Selected companion skill details">
        {selected?<>
          <span className="axe-sk-inspector-kicker">{current.label} · {readable(selected.category)}</span>
          <h3>{selected.skill_name}</h3>
          <p>{selected.description}</p>
          <div className="axe-sk-metrics">
            {companionSkillMetrics(selected).map(([label,value])=><span key={label}>
              {label}<strong>{value}</strong></span>)}
          </div>
          <h4><Shield size={17}/> Equipped ability</h4>
          <p>{equipped?'Currently equipped to '+['Z','X','V','B'][activeIds.indexOf(selected.skill_id)]+'.':
            canCast?'This ability uses the existing companion combat runtime.':'This ability is registered for future development, but its cast is unavailable.'}</p>
          <button type="button" className="axe-sk-equip"
            disabled={!canCast||(equipped&&selectedSlot===null)} onClick={()=>equip(selected)}>
            {!canCast?<><LockKeyhole size={16}/> Not Yet Available</>:
              equipped&&selectedSlot===null?<><Check size={16}/> Already Equipped</>:
              selectedSlot!==null?<><Swords size={16}/> Equip to {['Z','X','V','B'][selectedSlot]}</>:
              <><Swords size={16}/> Equip to Next Free Slot</>}
          </button>
          {canCast&&selectedSlot===null&&!equipped&&activeIds.every(Boolean)&&
            <p className="axe-comp-tree-slot-help">All four slots are occupied. Select a slot below to replace its ability.</p>}
        </>:<div className="axe-sk-empty">Select a registered ability to inspect its effects.</div>}
        {message&&<p className="axe-comp-tree-feedback" role="status">{message}</p>}
      </aside>
    </div>
  </section>;
}
