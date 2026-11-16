import {useEffect,useState} from 'react';
import {ArrowRight,Check,Compass,Search,Shield,Swords,Target} from 'lucide-react';
import {getAXEMountState,subscribeAXEMounts,activateAXEMount} from '../progression/AXEMountStore';
import {getAXEMountDefinition,getAXEMountBonuses} from '../progression/AXEMountSystem';
import {getActiveWeaponPath,subscribeWeaponBuffs} from '../../weaponClassBuffStore';
import {
  COMPANION_MASTERY_PATHS,getCompanionMasteryProgress,
} from '../progression/AXECompanionRoleMastery.mjs';
import {getCompanionGrowthView,applyCompanionGrowthBonus} from '../progression/AXECompanionGrowthView.mjs';
import './AXECompanionProfileRedesign.css';

const ICONS={damage:Swords,defense:Shield,range:Target};
const label=value=>String(value||'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());
const format=value=>Number(value||0).toLocaleString('en-US',{maximumFractionDigits:1});
const relevant={
  damage:[['Damage','damage'],['Attribute Attack','attributionAttack']],
  defense:[['HP','hp'],['Defense','defense'],['Attribute Defense','attributionDefense']],
  range:[['Damage','damage'],['Attribute Attack','attributionAttack'],['Critical Chance','critChance']],
};
export default function AXECompanionMasteryPanel({onNotice=()=>{},onMyCompanion=()=>{}}) {
  const [snapshot,setSnapshot]=useState(getAXEMountState);
  const [weaponRole,setWeaponRole]=useState(getActiveWeaponPath);
  const [selectedId,setSelectedId]=useState(null);
  const [selectedRole,setSelectedRole]=useState(null);
  const [search,setSearch]=useState('');
  useEffect(()=>subscribeAXEMounts(setSnapshot),[]);
  useEffect(()=>subscribeWeaponBuffs(()=>setWeaponRole(getActiveWeaponPath())),[]);
  const mounts=snapshot.mounts||[];
  const mount=mounts.find(m=>m.instanceId===selectedId)
    ||mounts.find(m=>m.instanceId===snapshot.activeMountId)||mounts[0]||null;
  const def=mount?getAXEMountDefinition(mount.definitionId):null;
  const activeRole=weaponRole==='ranged'?'range':weaponRole;
  const role=selectedRole||activeRole;
  const chosen=COMPANION_MASTERY_PATHS.find(path=>path.id===role)||COMPANION_MASTERY_PATHS[0];
  const progress=getCompanionMasteryProgress(mount,role);
  const level=getCompanionGrowthView(mount?.totalXp||0);
  const eligible=level.completedCycles>=1;
  const base=applyCompanionGrowthBonus(getAXEMountBonuses(mount),mount?.totalXp||0);
  const shown=mounts.filter(entry=>!search.trim()||
    [getAXEMountDefinition(entry.definitionId)?.name,entry.definitionId]
      .filter(Boolean).join(' ').toLowerCase().includes(search.trim().toLowerCase()));

  return <div className="axe-mastery-rebuild" data-companion-page="role-mastery" aria-label="Companion combat mastery">
    <aside className="axe-mastery-mount-list">
      <h3>My Companion</h3>
      <label className="axe-comp-quick-search"><Search size={15}/>
        <input aria-label="Find owned mount for mastery" type="search" placeholder="Find mount"
          value={search} onChange={event=>setSearch(event.target.value)}/></label>
      <div className="axe-comp-quick-scroll">
        {shown.map(entry=><button type="button" key={entry.instanceId}
          aria-pressed={mount?.instanceId===entry.instanceId}
          onClick={()=>{setSelectedId(entry.instanceId);setSelectedRole(null);}}>
          <span className="axe-comp-quick-symbol">✧</span>
          <span><strong>{getAXEMountDefinition(entry.definitionId)?.name||label(entry.definitionId)}</strong>
            <small>{snapshot.activeMountId===entry.instanceId?'Active · ':''}{format(entry.growthPercent)}% growth</small></span>
          {mount?.instanceId===entry.instanceId&&<Check size={15}/>}
        </button>)}
        {!shown.length&&<p>No matching owned mounts.</p>}
      </div>
      <button className="axe-mastery-return" type="button" onClick={onMyCompanion}>
        <Compass size={15}/>Back to Equipment</button>
    </aside>
    <main className="axe-mastery-center">
      <header className="axe-mastery-hero">
        <small>COMPANION SPECIALIZATION</small>
        <h2>{def?.name||'Companion Mastery'}</h2>
        <p>Damage, Defense and Range are three independent mastered paths.
          Your equipped weapon automatically determines which earned companion
          role strengthens your character.</p>
      </header>
      <div className="axe-mastery-role-grid" role="group" aria-label="Mastery paths">
        {COMPANION_MASTERY_PATHS.map(path=>{
          const Icon=ICONS[path.id];
          const p=getCompanionMasteryProgress(mount,path.id);
          return <button type="button" key={path.id} aria-pressed={role===path.id}
            className="axe-mastery-role-card" onClick={()=>setSelectedRole(path.id)}>
            <span className="axe-mastery-role-icon"><Icon size={27}/></span>
            <strong>{path.label}</strong>
            <small>Rank {p.rank} / 10</small>
            {activeRole===path.id&&<em>Active weapon</em>}
            <span className="axe-collection-progress"><span style={{width:p.percent+'%'}}/></span>
            <small>+{p.rank*2}% matching stat contribution</small>
          </button>;
        })}
      </div>
      <div className="axe-mastery-rules">
        <h3>How mastery works</h3>
        <p>Fight with your active companion after its first growth cycle reaches
          Level 20. Eligible battle XP trains the path matching the player's
          current weapon: Damage, Defense or Range. All three can reach Rank 10.
          Riding, feeding and opening this panel grant no mastery XP.</p>
        <p>Switching weapons switches the active companion bonus automatically.
          Training a second role never erases progress in another.</p>
      </div>
    </main>
    <aside className="axe-mastery-inspector">
      <header><h3>{chosen.label} Mastery</h3>
        <small>{activeRole===role?'Matches equipped weapon':'Preview role · not active'}</small></header>
      <div className="axe-comp-stat-overview">
        <div><small>Current Rank</small><strong>{progress.rank} / 10</strong></div>
        <div><small>Role Bonus</small><strong>+{progress.rank*2}%</strong></div>
        <div><small>Next Rank</small><strong>{progress.nextXp===null?'Max':progress.rank+1}</strong></div>
        <div><small>Training XP</small><strong>{format(progress.xp)}</strong></div>
      </div>
      <div className="axe-collection-progress" aria-label="Mastery rank progress"
        role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
        <span style={{width:progress.percent+'%'}}/></div>
      <div className="axe-collection-progress-caption">
        <span>Rank progress</span><span>{progress.nextXp===null?'Complete':format(progress.nextXp)+' XP to next rank'}</span>
      </div>
      <h4>Current → Next Rank</h4>
      <div className="axe-char-stat-list">
        {(relevant[role]||[]).map(([name,key])=>{
          const raw=Number(base[key]||0);
          return <div className="axe-char-stat-row" key={key}>
            <span>{name}</span>
            <b>+{format(raw*progress.rank*.02)} <ArrowRight size={12}/>
              +{format(raw*Math.min(10,progress.rank+1)*.02)}</b>
          </div>;
        })}
      </div>
      <p className="axe-comp-detail-hint">{chosen.description} Bonus figures show the
        mastery portion of the mount's earned stats; ordinary growth is separate.</p>
      {!eligible&&<div className="axe-mastery-locked">
        Initial growth required: complete Level 20 (5,000 total mount XP) to unlock combat mastery training.
      </div>}
      {eligible&&<div className="axe-mastery-ready">
        {progress.rank===10?'This role is fully mastered.':'Train this role through earned combat XP with a matching weapon.'}
      </div>}
      {mount&&snapshot.activeMountId!==mount.instanceId&&
        <button type="button" className="axe-mastery-return"
          onClick={()=>{const result=activateAXEMount(mount.instanceId);
            onNotice(result?.ok?'Mount activated.':label(result?.reason));}}>Make Active Mount</button>}
    </aside>
  </div>;
}
