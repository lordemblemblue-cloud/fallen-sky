import {lazy,Suspense,useEffect,useState} from 'react';
import {ArrowRight,Check,Compass,Shield,Swords,Target} from 'lucide-react';
import {getAXEMountState,subscribeAXEMounts,activateAXEMount} from '../progression/AXEMountStore';
import {getAXEMountDefinition,getAXEMountBonuses} from '../progression/AXEMountSystem';
import {getCompanionById} from '../../companionData';
import {getActiveWeaponPath,subscribeWeaponBuffs} from '../../weaponClassBuffStore';
import {
  COMPANION_MASTERY_PATHS,getCompanionMasteryProgress,
} from '../progression/AXECompanionRoleMastery.mjs';
import {getCompanionGrowthView,applyCompanionGrowthBonus} from '../progression/AXECompanionGrowthView.mjs';
import './AXECompanionProfileRedesign.css';
import './AXECompanionMasteryGallery.css';

const CompanionPreview3D=lazy(()=>import('../../equipment/CompanionPreview3D'));

const ICONS={damage:Swords,defense:Shield,range:Target};
const label=value=>String(value||'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());
const format=value=>Number(value||0).toLocaleString('en-US',{maximumFractionDigits:1});
const masterySummary={
  damage:'Strengthens the attack stats your companion contributes.',
  defense:'Strengthens the HP and protection your companion contributes.',
  range:'Strengthens your companion’s ranged damage and precision contribution.',
};
const xpRemaining=progress=>progress.nextXp===null?0:Math.max(0,progress.nextXp-progress.xp);
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
  useEffect(()=>subscribeAXEMounts(setSnapshot),[]);
  useEffect(()=>subscribeWeaponBuffs(()=>setWeaponRole(getActiveWeaponPath())),[]);
  const mounts=snapshot.mounts||[];
  const mount=mounts.find(m=>m.instanceId===selectedId)
    ||mounts.find(m=>m.instanceId===snapshot.activeMountId)||mounts[0]||null;
  const def=mount?getAXEMountDefinition(mount.definitionId):null;
  const linkedModel=def?.modelRef?getCompanionById(def.modelRef):null;
  const selectedName=def?.name||'No companion selected';
  const activeRole=weaponRole==='ranged'?'range':weaponRole;
  const role=selectedRole||activeRole;
  const chosen=COMPANION_MASTERY_PATHS.find(path=>path.id===role)||COMPANION_MASTERY_PATHS[0];
  const progress=getCompanionMasteryProgress(mount,role);
  const level=getCompanionGrowthView(mount?.totalXp||0);
  const eligible=level.completedCycles>=1;
  const base=applyCompanionGrowthBonus(getAXEMountBonuses(mount),mount?.totalXp||0);


  return <div className="axe-mastery-rebuild axe-mastery-rebuild--gallery" data-companion-page="role-mastery"
    data-mastery-layout="portrait-3d-guided" aria-label="Companion combat mastery">
    <aside className="axe-mastery-avatar-rail" aria-label="Owned companion selection">
      <small className="axe-mastery-rail-heading">OWNED</small>
      <div className="axe-mastery-avatar-scroll" role="group" aria-label="Select companion to preview">
        {mounts.map(entry=>{
          const definition=getAXEMountDefinition(entry.definitionId);
          const Icon=definition?.specialty==='defense'?Shield:
            definition?.specialty==='attack'?Swords:Compass;
          const isSelected=mount?.instanceId===entry.instanceId;
          const isActive=snapshot.activeMountId===entry.instanceId;
          const name=definition?.name||label(entry.definitionId);
          return <button type="button" key={entry.instanceId}
            className="axe-mastery-avatar" aria-pressed={isSelected}
            aria-label={'Preview '+name+(isActive?', active mount':'')}
            title={name+(isActive?' · Active':'')}
            onClick={()=>{setSelectedId(entry.instanceId);setSelectedRole(null);}}>
            <Icon size={22} aria-hidden="true"/>
            {isActive&&<span className="axe-mastery-avatar-active" aria-label="Active"><Check size={10}/></span>}
          </button>;
        })}
      </div>
      <small className="axe-mastery-rail-count">{mounts.length} owned</small>
    </aside>

    <section className="axe-mastery-portrait" aria-label="Selected companion live 3D viewer">
      <header className="axe-mastery-portrait-head">
        <small>{snapshot.activeMountId===mount?.instanceId?'ACTIVE COMPANION':'OWNED COMPANION'}</small>
        <strong>{selectedName}</strong>
      </header>
      <div className="axe-mastery-portrait-stage">
        {linkedModel?<Suspense fallback={<p className="axe-mastery-model-empty">Loading 3D companion…</p>}>
          <CompanionPreview3D key={linkedModel.id} companionId={linkedModel.id}/>
        </Suspense>:<p className="axe-mastery-model-empty">{mount
          ? 'No 3D model is linked to this companion.'
          : 'Choose an owned companion to preview.'}</p>}
      </div>
      <div className="axe-mastery-portrait-foot">
        <div className="axe-mastery-growth-compact">
          <span>Growth cycles <strong>{level.completedCycles} / 4</strong></span>
          <span>Level <strong>{level.level} / 20</strong></span>
        </div>
        <div className="axe-collection-progress" role="progressbar"
          aria-label="Companion growth level progress" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={level.percent}><span style={{width:level.percent+'%'}}/></div>
        <small>{eligible?'Mastery training unlocked':
          'Complete the first Level 20 cycle (5,000 XP) to unlock mastery'}</small>
        <button className="axe-mastery-return" type="button" onClick={onMyCompanion}>
          <Compass size={15}/>Equipment</button>
      </div>
    </section>

    <main className="axe-mastery-center axe-mastery-guide" aria-label="Mastery paths and training guide">
      <header className="axe-mastery-hero">
        <small>COMPANION SPECIALIZATION</small>
        <h2>Mastery Paths</h2>
        <p>Choose a path to see how your companion helps in combat.
          The role matching your equipped weapon is automatically active.</p>
      </header>
      <div className="axe-mastery-role-grid" role="group" aria-label="Mastery paths">
        {COMPANION_MASTERY_PATHS.map(path=>{
          const Icon=ICONS[path.id];
          const p=getCompanionMasteryProgress(mount,path.id);
          const isActive=activeRole===path.id;
          return <button type="button" key={path.id} aria-pressed={role===path.id}
            className="axe-mastery-role-card" onClick={()=>setSelectedRole(path.id)}>
            <span className="axe-mastery-role-icon"><Icon size={22}/></span>
            <span className="axe-mastery-role-copy">
              <strong>{path.label} <small>Rank {p.rank} / 10</small></strong>
              <span className="axe-mastery-role-description">{masterySummary[path.id]}</span>
              <span className="axe-collection-progress" role="progressbar"
                aria-label={path.label+' rank progress'} aria-valuemin={0}
                aria-valuemax={100} aria-valuenow={p.percent}>
                <span style={{width:p.percent+'%'}}/>
              </span>
              <small>{p.nextXp===null?'Fully mastered':format(xpRemaining(p))+' XP remaining'}
                {' · '}+{p.rank*2}% earned role bonus</small>
            </span>
            {isActive&&<span className="axe-mastery-active-pill">Active weapon</span>}
          </button>;
        })}
      </div>
      <div className="axe-mastery-rules">
        <h3>How to train</h3>
        <p><b>1.</b> Grow your companion through its first Level 20 cycle.
          <b> 2.</b> Fight with your active companion beside you, not while riding.
          <b> 3.</b> Use the weapon matching the mastery path you want to train.</p>
        <p>Damage, Defense and Range train separately. Changing weapons switches
          the active bonus without removing previously earned ranks.</p>
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
        <span>Rank progress</span><span>{progress.nextXp===null?'Complete':format(xpRemaining(progress))+' XP remaining'}</span>
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
