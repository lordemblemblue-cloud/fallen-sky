import {useEffect,useState} from 'react';
import {Activity,Compass,Gem,Heart,Shield,Sparkles,Swords,Target,Wind} from 'lucide-react';
import {getAXEMountBonuses,getAXEMountDefinition} from '../progression/AXEMountSystem';
import {getCompanionGrowthView,applyCompanionGrowthBonus} from '../progression/AXECompanionGrowthView.mjs';
import {getCompanionMasteryProgress,applyCompanionRoleBonus} from '../progression/AXECompanionRoleMastery.mjs';
import {getActiveWeaponPath,subscribeWeaponBuffs} from '../../weaponClassBuffStore';

// These are read-only projections of the same mount/weapon data the Character
// HUD already uses. The selector and 3D viewer belong to Equipment, not here.
const METRICS=[
  {key:'hp',label:'HP',Icon:Heart},
  {key:'damage',label:'Attack',Icon:Swords},
  {key:'defense',label:'Defense',Icon:Shield},
  {key:'attributionAttack',label:'Attribute Attack',Icon:Sparkles},
  {key:'attributionDefense',label:'Attribute Defense',Icon:Shield},
  {key:'critChance',label:'Critical Chance',Icon:Target},
];
const fmt=value=>Number(value||0).toLocaleString('en-US',{maximumFractionDigits:2});
const title=value=>String(value||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

/** Single read-only live summary for the Equipment page. Never creates a second progression state. */
export function CompanionOverviewStrip({mount,snapshot}) {
  const [weaponRole,setWeaponRole]=useState(getActiveWeaponPath);
  useEffect(()=>subscribeWeaponBuffs(()=>setWeaponRole(getActiveWeaponPath())),[]);
  const role=weaponRole==='ranged'?'range':weaponRole;
  const growth=getCompanionGrowthView(mount?.totalXp||0);
  const def=mount?getAXEMountDefinition(mount.definitionId):null;
  const base=mount?getAXEMountBonuses(mount):{};
  const stats=applyCompanionRoleBonus(applyCompanionGrowthBonus(base,mount?.totalXp||0),mount,role);
  const masteryRoles=['damage','defense','range'].map(id=>({
    id,rank:getCompanionMasteryProgress(mount,id).rank,
  }));
  const active=Boolean(mount?.instanceId&&snapshot?.activeMountId===mount.instanceId);
  const registered=Boolean(mount?.instanceId&&snapshot?.registeredMountId===mount.instanceId);
  const levelFraction=growth.maxed?100:growth.percent;
  return <section className="axe-comp-unified-equipment-overview"
    aria-label="Companion overview, attributes and experience"
    data-companion-card="unified-equipment-overview">
    <div className="axe-comp-unified-identity">
      <small>COMPANION OVERVIEW</small>
      <strong>{def?.name||'Select a Companion'}</strong>
      <span>{mount?(active?'Active':'Owned')+' · '+(registered?'Bonded':'Not bonded')
        :'Select an owned companion'}</span>
    </div>
    <div className="axe-comp-unified-progress">
      <div className="axe-comp-unified-progress-title">
        <strong>Level {growth.level}/{growth.maxLevel}</strong>
        <span>Cycle {growth.cycle}/4 {growth.maxed?'· MAX LEVEL':''}</span>
      </div>
      <div className="axe-collection-progress" role="progressbar"
        aria-label="Companion level experience" aria-valuemin={0}
        aria-valuemax={100} aria-valuenow={levelFraction}>
        <span style={{width:levelFraction+'%'}}/>
      </div>
      <small>{fmt(Math.min(growth.totalXp,20000))} / 20,000 companion XP</small>
    </div>
    <div className="axe-comp-unified-attributes">
      {[['HP','hp'],['Attack','damage'],['Defense','defense']].map(([name,key])=><div key={key}>
        <small>{name}</small><strong>+{fmt(stats[key])}</strong>
      </div>)}
    </div>
    <div className="axe-comp-unified-mastery">
      <small>MASTERY {growth.maxed?'· UNLOCKED':'· LOCKED UNTIL MAX LEVEL'}</small>
      <div>{masteryRoles.map(({id,rank})=><span key={id}>
        {title(id)} <b>{rank}/10</b>
      </span>)}</div>
    </div>
  </section>;
}

export function CompanionAttributesPanel({mount,snapshot}) {
  const [weaponRole,setWeaponRole]=useState(getActiveWeaponPath);
  useEffect(()=>subscribeWeaponBuffs(()=>setWeaponRole(getActiveWeaponPath())),[]);
  const role=weaponRole==='ranged'?'range':weaponRole;
  const growth=getCompanionGrowthView(mount?.totalXp||0);
  const base=mount?getAXEMountBonuses(mount):{};
  const stats=applyCompanionRoleBonus(applyCompanionGrowthBonus(base,mount?.totalXp||0),mount,role);
  const mastery=getCompanionMasteryProgress(mount,role);
  const bonded=Boolean(mount?.instanceId&&snapshot?.registeredMountId===mount.instanceId);
  const active=Boolean(mount?.instanceId&&snapshot?.activeMountId===mount.instanceId);
  const extra=Object.entries(stats).filter(([key,value])=>
    !METRICS.some(row=>row.key===key)&&Number.isFinite(Number(value)));
  return <section className="axe-app-card axe-comp-insights-card" aria-label="Companion current attributes"
    data-companion-insight="attributes">
    <header className="axe-app-card-heading"><Activity size={18}/>
      <h3>Companion Attributes</h3><small>Live stats</small></header>
    <div className="axe-app-card-content axe-comp-insights-body">
      {!mount?<p className="axe-app-description">Select an owned companion to view its attributes.</p>:<>
        <div className="axe-comp-insight-summary">
          <div><small>Growth Bonus</small><strong>+{growth.bonusPct}%</strong></div>
          <div><small>Combat Role</small><strong>{title(role)}</strong></div>
          <div><small>Role Mastery</small><strong>{mastery.rank} / 10</strong></div>
          <div><small>Bond</small><strong>{bonded?'Registered':'Not Registered'}</strong></div>
        </div>
        <div className="axe-comp-insight-heading"><h4>Current Stat Contribution</h4>
          <span>{active?'Active companion':'Selected companion'}</span></div>
        <div className="axe-comp-insight-metrics">
          {METRICS.map(({key,label,Icon})=><div className="axe-comp-insight-stat" key={key}>
            <Icon size={16}/><span>{label}</span><strong>+{fmt(stats[key])}</strong>
          </div>)}
          {extra.map(([key,value])=><div className="axe-comp-insight-stat" key={key}>
            <Gem size={16}/><span>{title(key)}</span><strong>+{fmt(value)}</strong>
          </div>)}
        </div>
        <p className="axe-comp-insight-footnote">
          Includes earned companion growth and the mastery path matching your current
          weapon. These contributions affect your character only while this mount is registered.
          Previewing another owned mount does not equip or register it.
        </p>
      </>}
    </div>
  </section>;
}

export function CompanionGrowthPanel({mount,snapshot}) {
  const growth=getCompanionGrowthView(mount?.totalXp||0);
  const definition=mount?getAXEMountDefinition(mount.definitionId):null;
  const abilities=(mount?.legendary?.abilities||[]).filter(ability=>ability?.label||ability?.id);
  return <section className="axe-app-card axe-comp-insights-card" aria-label="Companion growth and experience"
    data-companion-insight="growth">
    <header className="axe-app-card-heading"><Sparkles size={18}/>
      <h3>Growth &amp; Experience</h3><small>{definition?.name||'Companion'}</small></header>
    <div className="axe-app-card-content axe-comp-insights-body">
      {!mount?<p className="axe-app-description">No companion is selected.</p>:<>
        <div className="axe-comp-insight-level">
          <div><small>Current Level</small><strong>{growth.level} <span>/ {growth.maxLevel}</span></strong></div>
          <div><small>Growth Cycle</small><strong>{growth.cycle} / 4</strong></div>
        </div>
        <div className="axe-collection-progress" role="progressbar"
          aria-label="Companion level experience" aria-valuenow={growth.percent}
          aria-valuemin={0} aria-valuemax={100}>
          <span style={{width:growth.percent+'%'}}/>
        </div>
        <div className="axe-collection-progress-caption">
          <span>{fmt(growth.currentLevelXP)} / {fmt(growth.levelXPRequired)} Level XP</span>
          <span>{fmt(growth.totalXp)} Total XP</span>
        </div>
        <div className="axe-comp-insight-heading"><h4>Current &amp; Next Milestone</h4></div>
        <div className="axe-comp-insight-summary">
          <div><small>Current Bonus</small><strong>+{growth.bonusPct}%</strong></div>
          <div><small>Next Bonus</small><strong>{growth.nextBonusPct==null?'Maxed':'+'+growth.nextBonusPct+'%'}</strong></div>
          <div><small>Next Level</small><strong>{growth.nextLevelXP==null?'Complete':fmt(growth.nextLevelXP)+' XP'}</strong></div>
          <div><small>Next Tier</small><strong>{growth.nextMilestoneXP==null?'Complete':fmt(growth.nextMilestoneXP)+' XP'}</strong></div>
        </div>
        <div className="axe-comp-insight-heading"><h4>Earned Experience</h4></div>
        <div className="axe-comp-insight-metrics">
          {[
            ['PvE Battles','pveXp',Swords],
            ['PvP Battles','pvpXp',Shield],
            ['Quest Rewards','questXp',Sparkles],
            ['Riding','ridingXp',Wind],
          ].map(([label,key,Icon])=><div className="axe-comp-insight-stat" key={key}>
            <Icon size={16}/><span>{label}</span><strong>{fmt(mount.sourceStats?.[key])} XP</strong>
          </div>)}
        </div>
        <div className="axe-comp-insight-heading"><h4>Abilities</h4></div>
        {abilities.length
          ?abilities.map((ability,index)=><p className="axe-comp-insight-ability" key={ability.id||index}>
              <Sparkles size={13}/>{ability.label||title(ability.id)}
            </p>)
          :<p className="axe-comp-insight-footnote">No unlocked mount abilities recorded yet.</p>}
        <p className="axe-comp-insight-footnote">
          Your active companion gains 50% of the XP you actually receive from
          combat (including rested XP) and quests, with fractions saved for later rewards.
          It also earns XP through riding. Higher-level enemy rewards automatically count
          because the companion shares your awarded XP. Each completed 20-level cycle unlocks
          a companion stat-contribution milestone: +10%, +15%, +20%, then +25%.
          Progression is read from this companion's saved experience, not granted here.
        </p>
        {snapshot?.registeredMountId!==mount.instanceId&&<p className="axe-comp-insight-footnote">
          Register this companion to apply its bonus to your character.
        </p>}
      </>}
    </div>
  </section>;
}
