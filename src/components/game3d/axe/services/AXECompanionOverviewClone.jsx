import {lazy,Suspense,useEffect,useState} from 'react';
import {Check,ChevronRight,Compass,Gem,Heart,Search,Shield,Sparkles,Swords,Wind} from 'lucide-react';
import {getAXEMountState,subscribeAXEMounts,activateAXEMount,registerAXEMount} from '../progression/AXEMountStore';
import {getAXEMountDefinition,getAXEMountBonuses} from '../progression/AXEMountSystem';
import {getCompanionById,COMPANION_GEAR} from '../../companionData';
import {getCompanionState,subscribeCompanion} from '../../companionStore';
import {getActiveWeaponPath,subscribeWeaponBuffs} from '../../weaponClassBuffStore';
import {getCompanionGrowthView} from '../progression/AXECompanionGrowthView.mjs';
import {getCompanionMasteryProgress,applyCompanionRoleBonus} from '../progression/AXECompanionRoleMastery.mjs';
import './AXECompanionOverviewClone.css';
import './AXECompanionProfileRedesign.css';

const CompanionPreview3D=lazy(()=>import('../../equipment/CompanionPreview3D'));
const ATTRIBUTES=[
  ['HP','hp',Heart],['Attack','damage',Swords],['Defense','defense',Shield],
  ['Attribute Attack','attributionAttack',Sparkles],
  ['Attribute Defense','attributionDefense',Shield],
  ['Critical Chance','critChance',Gem],
];
const GEAR_ICONS={saddle:Compass,armor:Shield,charm:Gem};
const display=value=>Number(value||0).toLocaleString('en-US',{maximumFractionDigits:2});
const pretty=value=>String(value||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
export default function AXECompanionOverviewClone({onNotice=()=>{},onEquipment=()=>{}}) {
  const [mounts,setMounts]=useState(getAXEMountState);
  const [loadout,setLoadout]=useState(getCompanionState);
  const [role,setRole]=useState(getActiveWeaponPath);
  const [selectedId,setSelectedId]=useState(null);
  const [query,setQuery]=useState('');
  const [rightView,setRightView]=useState('stats');
  useEffect(()=>subscribeAXEMounts(setMounts),[]);
  useEffect(()=>subscribeCompanion(setLoadout),[]);
  useEffect(()=>subscribeWeaponBuffs(()=>setRole(getActiveWeaponPath())),[]);

  // The mount store is authoritative. Never choose the baby wolf/pet roster,
  // nor use the companion store default as the mount's identity.
  const owned=(mounts.mounts||[]).filter(m=>m?.instanceId);
  const mount=owned.find(m=>m.instanceId===selectedId)
    ||owned.find(m=>m.instanceId===mounts.activeMountId)||owned[0]||null;
  const definition=mount?getAXEMountDefinition(mount.definitionId):null;
  const companionModel=definition?.modelRef?getCompanionById(definition.modelRef):null;
  const modelId=companionModel?.id||null;
  const gear=loadout.gear?.[modelId]||{};
  const slots=companionModel?.gearSlots||['saddle','armor','charm'];
  const equipped=slots.map(slot=>({
    slot,item:COMPANION_GEAR[slot]?.find(item=>item.id===gear[slot])||null,
  }));
  const shown=owned.filter(entry=>{
    const name=getAXEMountDefinition(entry.definitionId)?.name||entry.definitionId;
    const term=query.trim().toLowerCase();
    return !term||[name,entry.definitionId,entry.rarity].filter(Boolean)
      .join(' ').toLowerCase().includes(term);
  });
  const selectedName=definition?.name||'No mount selected';
  const liveBonuses=mount?getAXEMountBonuses(mount):{};
  const growth=getCompanionGrowthView(mount?.totalXp||0);
  const playerRole=role==='ranged'?'range':role;
  const mastered=getCompanionMasteryProgress(mount,playerRole);
  const contribution=applyCompanionRoleBonus(
    Object.fromEntries(Object.entries(liveBonuses).map(([key,value])=>
      [key,Number(value||0)*(1+growth.bonusPct/100)])),mount,playerRole);
  const registered=mounts.registeredMountId===mount?.instanceId;
  const active=mounts.activeMountId===mount?.instanceId;
  const doAction=(action,word)=>{
    if(!mount)return;
    const result=action(mount.instanceId);
    onNotice(result?.ok?word+' '+selectedName+'.':result?.message||pretty(result?.reason));
  };

  return <div className="axe-comp-redesign axe-comp-my-mount" data-companion-page="my-companion">
    <aside className="axe-comp-quick-list" aria-label="My owned mounts">
      <header><span>My Companion</span><small>{owned.length} owned</small></header>
      <label className="axe-comp-quick-search"><Search size={15}/>
        <input type="search" aria-label="Search owned mounts" placeholder="Search companions"
          value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <div className="axe-comp-quick-scroll">
        {shown.map(entry=>{
          const def=getAXEMountDefinition(entry.definitionId);
          const activeEntry=entry.instanceId===mounts.activeMountId;
          return <button key={entry.instanceId} type="button"
            aria-pressed={mount?.instanceId===entry.instanceId}
            onClick={()=>{setSelectedId(entry.instanceId);setRightView('stats');}}>
            <span className="axe-comp-quick-symbol">✧</span>
            <span><strong>{def?.name||pretty(entry.definitionId)}</strong>
              <small>{activeEntry?'Active · ':''}Growth {display(entry.growthPercent||0)}%</small></span>
            {activeEntry?<Check size={16}/>:<ChevronRight size={15}/>}
          </button>;
        })}
        {!owned.length&&<p>No owned mounts on this character.</p>}
        {!!owned.length&&!shown.length&&<p>No mounts match your search.</p>}
      </div>
      <div className="axe-comp-rail-note">Your equipped mount is marked Active.
        Selecting an owned mount previews its real stats and model.</div>
    </aside>

    <section className="axe-comp-profile-center" aria-label="Selected mount 3D viewer and equipment">
      <div className="axe-comp-viewer-head">
        <span>{active?'ACTIVE MOUNT':'OWNED MOUNT'}</span>
        <button type="button" aria-label={rightView==='stats'?'Show mount growth and experience':'Show mount stats'}
          aria-pressed={rightView==='growth'} onClick={()=>setRightView(value=>value==='stats'?'growth':'stats')}>
          <Sparkles size={15}/>{rightView==='stats'?'Growth & XP':'View Stats'}
        </button>
      </div>
      <div className="axe-comp-model-with-gear">
        <div className="axe-comp-profile-model">
          {modelId?<Suspense fallback={<p>Loading your mount…</p>}>
            <CompanionPreview3D key={modelId} companionId={modelId}/>
          </Suspense>:<p>No compatible mount GLB is available. No placeholder animal will be substituted.</p>}
        </div>
        <div className="axe-comp-model-gear" aria-label="Equipped mount gear slots">
          {equipped.map(({slot,item})=>{
            const Icon=GEAR_ICONS[slot]||Shield;
            return <button key={slot} type="button" onClick={()=>onEquipment('companion')}
              aria-label={'Manage '+slot+' slot, '+(item?.name||'empty')}
              title={item?.name||pretty(slot)+' empty'}>
              <span><Icon size={20}/></span><small>{pretty(slot)}</small>
              <strong>{item?.name||'Empty'}</strong>
            </button>;
          })}
        </div>
      </div>
      <div className="axe-comp-profile-caption">
        <strong>{selectedName}</strong>
        <span>{mount?'Live mount profile · '+(registered?'Bonded':'Not bonded'):'No personal mount selected'}</span>
      </div>
    </section>

    <aside className="axe-comp-profile-details axe-comp-character-stats" aria-label={rightView==='growth'?'Mount growth and experience':'Mount character stats'}>
      {rightView==='stats'?<>
        <header><h3>Mount Attributes</h3><small>{selectedName}</small></header>
        <div className="axe-comp-stat-overview">
          <div><small>Bond Tier</small><strong>{growth.completedCycles} / 4</strong></div>
          <div><small>Growth Bonus</small><strong>+{growth.bonusPct}%</strong></div>
          <div><small>Active Weapon</small><strong>{pretty(playerRole)}</strong></div>
          <div><small>Role Rank</small><strong>{mastered.rank} / 10</strong></div>
        </div>
        <h4>Companion Contribution {registered?<small>· Bonded to player</small>:null}</h4>
        <div className="axe-char-stat-list">
          {ATTRIBUTES.map(([label,key,Icon])=><div key={key} className="axe-char-stat-row">
            <Icon size={15}/><span>{label}</span>
            <b>+{display(contribution[key]||0)}</b>
          </div>)}
        </div>
        <p className="axe-comp-detail-hint">Stats shown include unlocked growth and the mastery
          path matching your current weapon. Contributions apply to your character when
          this mount is registered.</p>
        <h4>Equipped Gear</h4>
        <div className="axe-comp-profile-stats">
          {equipped.map(({slot,item})=><div key={slot}><span>{pretty(slot)}</span><strong>{item?.name||'Empty'}</strong></div>)}
        </div>
        <button className="axe-comp-profile-secondary" type="button" onClick={()=>onEquipment('companion')}>
          Open Equipment</button>
      </>:<>
        <header><h3>Mount Growth</h3><small>{selectedName}</small></header>
        <div className="axe-comp-growth-badge"><span>Level</span>
          <strong>{growth.level} <small>/ {growth.maxLevel}</small></strong>
          <span>Cycle {growth.cycle} / 4</span></div>
        <div className="axe-collection-progress" role="progressbar" aria-label="Progress to next level"
          aria-valuenow={growth.percent} aria-valuemin={0} aria-valuemax={100}>
          <span style={{width:growth.percent+'%'}}/></div>
        <div className="axe-collection-progress-caption">
          <span>{display(growth.currentLevelXP)} / {display(growth.levelXPRequired)} Level XP</span>
          <span>{growth.maxed?'All growth cycles complete':display(growth.totalXp)+' total XP'}</span>
        </div>
        <h4>Bond Milestones</h4>
        <div className="axe-comp-stat-overview">
          <div><small>Current Bonus</small><strong>+{growth.bonusPct}%</strong></div>
          <div><small>Next Bonus</small><strong>{growth.nextBonusPct===null?'Complete':'+'+growth.nextBonusPct+'%'}</strong></div>
          <div><small>Next Level</small><strong>{growth.maxed?'Max':display(growth.nextLevelXP)+' XP'}</strong></div>
          <div><small>Next Milestone</small><strong>{growth.maxed?'Max':display(growth.nextMilestoneXP)+' XP'}</strong></div>
        </div>
        <p className="axe-comp-detail-hint">Twenty levels per growth cycle.
          Completed cycles unlock +10%, +15%, +20% and +25% to earned
          companion stat contributions. Experience comes from real fights and riding,
          not from a button on this screen.</p>
        <h4>Earned Experience</h4>
        <div className="axe-char-stat-list">
          {['pveXp','pvpXp','ridingXp'].map(key=><div key={key} className="axe-char-stat-row">
            <Wind size={15}/><span>{key==='pveXp'?'PvE Battles':key==='pvpXp'?'PvP Battles':'Riding'}</span>
            <b>{display(mount?.sourceStats?.[key]||0)} XP</b></div>)}
        </div>
        <h4>Abilities & Unlocks</h4>
        {(mount?.legendary?.abilities||[]).length
          ?(mount.legendary.abilities.map((ability,i)=><p key={i} className="axe-comp-detail-hint">
              {ability.label||pretty(ability.id)}</p>))
          :<p className="axe-comp-detail-hint">No unlocked legendary mount abilities recorded.
            Existing abilities remain governed by their original progression requirements.</p>}
      </>}
      {mount&&<div className="axe-comp-profile-actions">
        {!registered&&<button type="button" onClick={()=>doAction(registerAXEMount,'Registered')}>
          Register for Player Bonuses</button>}
        {!active&&<button type="button" onClick={()=>doAction(activateAXEMount,'Activated')}>
          Make Active Mount</button>}
      </div>}
    </aside>
  </div>;
}
