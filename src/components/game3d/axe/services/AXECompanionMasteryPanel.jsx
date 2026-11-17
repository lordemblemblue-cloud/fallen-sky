import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowRight, Compass, Shield, Swords, Target } from 'lucide-react';
import AXECompanionMountCircleRail from './AXECompanionMountCircleRail';
import { getAXEMountState, subscribeAXEMounts, activateAXEMount } from '../progression/AXEMountStore';
import { getAXEMountDefinition, getAXEMountBonuses } from '../progression/AXEMountSystem';
import { getCompanionById } from '../../companionData';
import { getActiveWeaponPath, subscribeWeaponBuffs } from '../../weaponClassBuffStore';
import {
  COMPANION_MASTERY_PATHS, getCompanionMasteryProgress, normalizeCompanionMasteryRole,
} from '../progression/AXECompanionRoleMastery.mjs';
import { getCompanionGrowthView, applyCompanionGrowthBonus } from '../progression/AXECompanionGrowthView.mjs';
import './AXECompanionProfileRedesign.css';
import './AXECompanionMasteryGallery.css';

const CompanionPreview3D = lazy(()=>import('../../equipment/CompanionPreview3D'));

const ICONS = { damage: Swords, defense: Shield, range: Target };
const format = value => Number(value||0).toLocaleString('en-US',{maximumFractionDigits:1});
const label = value => String(value||'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());
const relevant = {
  damage: [['Damage','damage'],['Attribute Attack','attributionAttack']],
  defense: [['HP','hp'],['Defense','defense'],['Attribute Defense','attributionDefense']],
  range: [['Damage','damage'],['Attribute Attack','attributionAttack'],['Critical Chance','critChance']],
};

export default function AXECompanionMasteryPanel({onNotice=()=>{},onMyCompanion=()=>{}}) {
  const [snapshot,setSnapshot] = useState(getAXEMountState);
  const [weaponRole,setWeaponRole] = useState(getActiveWeaponPath);
  const [selectedId,setSelectedId] = useState(null);
  const [selectedRole,setSelectedRole] = useState(null);
  useEffect(()=>subscribeAXEMounts(setSnapshot),[]);
  useEffect(()=>subscribeWeaponBuffs(()=>setWeaponRole(getActiveWeaponPath())),[]);
  const mounts=snapshot.mounts||[];
  const mount=mounts.find(entry=>entry.instanceId===selectedId)
    ||mounts.find(entry=>entry.instanceId===snapshot.activeMountId)||mounts[0]||null;
  const def=mount?getAXEMountDefinition(mount.definitionId):null;
  const linkedModel=def?.modelRef?getCompanionById(def.modelRef):null;
  const activeRole=normalizeCompanionMasteryRole(weaponRole);
  const role=selectedRole||activeRole;
  const chosen=COMPANION_MASTERY_PATHS.find(path=>path.id===role)||COMPANION_MASTERY_PATHS[0];
  const progress=getCompanionMasteryProgress(mount,role);
  const growth=getCompanionGrowthView(mount?.totalXp||0);
  const eligible=growth.completedCycles>=1;
  const base=applyCompanionGrowthBonus(getAXEMountBonuses(mount),mount?.totalXp||0);
  const nextRank=progress.nextXp===null?progress.rank:Math.min(10,progress.rank+1);
  const currentBonus=progress.rank*2;
  const nextBonus=nextRank*2;
  const remainingXP=progress.nextXp===null?0:Math.max(0,progress.nextXp-progress.xp);

  return <div className="axe-mastery-rebuild axe-mastery-rebuild--compact" data-companion-page="role-mastery"
    aria-label="Companion combat mastery">
    <AXECompanionMountCircleRail mounts={mounts} selectedId={mount?.instanceId}
      activeId={snapshot.activeMountId} registeredId={snapshot.registeredMountId}
      label="My Companion" onSelect={id=>{setSelectedId(id);setSelectedRole(null);}}/>
    <section className="axe-mastery-portrait" aria-label="Selected companion live 3D viewer">
      <header className="axe-mastery-portrait-head">
        <small>{snapshot.activeMountId===mount?.instanceId?'ACTIVE COMPANION':'OWNED COMPANION'}</small>
        <strong>{def?.name||'No companion selected'}</strong>
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
          <span>Growth cycles <strong>{growth.completedCycles} / 4</strong></span>
          <span>Level <strong>{growth.level} / 20</strong></span>
        </div>
        <div className="axe-collection-progress" role="progressbar"
          aria-label="Companion growth level progress" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(growth.percent)}><span style={{width:growth.percent+'%'}}/></div>
        <small>{eligible?'Mastery training unlocked':
          'Complete the first Level 20 cycle (5,000 XP) to unlock mastery'}</small>
        <button className="axe-mastery-return" type="button" onClick={onMyCompanion}>
          <Compass size={15}/>Equipment</button>
      </div>
    </section>
    <main className="axe-mastery-center">
      <header className="axe-mastery-compact-header">
        <div><small>COMPANION MASTERY</small>
          <h2>{def?.name||'Select a Companion'}</h2>
          {mount&&<span>Lv {growth.level} · Growth {mount.growthPercent||0}% · {format(mount.totalXp)} XP</span>}
        </div>
      </header>
      {mount?<div className="axe-mastery-workbench">
        <section className="axe-mastery-paths" aria-label="Damage, Defense and Range mastery paths">
          <div className="axe-mastery-path-heading">
            <strong>Mastery Paths</strong><small>Choose to inspect</small>
          </div>
          <div className="axe-mastery-role-list" role="group" aria-label="Mastery paths">
            {COMPANION_MASTERY_PATHS.map(path=>{
              const Icon=ICONS[path.id];
              const p=getCompanionMasteryProgress(mount,path.id);
              return <button type="button" key={path.id} className="axe-mastery-role-row"
                aria-pressed={role===path.id} onClick={()=>setSelectedRole(path.id)}>
                <Icon size={21} aria-hidden="true"/>
                <span className="axe-mastery-role-text">
                  <strong>{path.label}</strong>
                  <small>Rank {p.rank} / 10 · +{p.rank*2}%</small>
                  <span className="axe-collection-progress" aria-hidden="true">
                    <span style={{width:p.percent+'%'}}/></span>
                </span>
                {activeRole===path.id&&<em title="Matches equipped weapon">Active</em>}
              </button>;
            })}
          </div>
          <details className="axe-mastery-how">
            <summary>How mastery works</summary>
            <p>After the companion completes its first 20-level growth cycle
              (5,000 total XP), eligible combat XP trains the path matching
              your equipped weapon. Each path reaches Rank 10 independently.
              Riding, feeding and viewing this page grant no mastery XP.</p>
          </details>
        </section>
        <section className="axe-mastery-inspector" aria-label={chosen.label+' mastery details'}>
          <header className="axe-mastery-detail-header">
            <div><small>{activeRole===role?'MATCHES EQUIPPED WEAPON':'PREVIEW ONLY · DIFFERENT WEAPON ROLE'}</small>
              <h3>{chosen.label} Mastery</h3>
              <p>{chosen.description}</p></div>
          </header>
          <div className="axe-mastery-summary-line">
            <div><small>Rank</small><strong>{progress.rank} <span>/ 10</span></strong></div>
            <div><small>Current bonus</small><strong>+{currentBonus}%</strong></div>
            <div><small>Next bonus</small><strong>{progress.nextXp===null?'MAX':'+'+nextBonus+'%'}</strong></div>
            <div><small>Earned XP</small><strong>{format(progress.xp)}</strong></div>
          </div>
          <div className="axe-mastery-progress-details">
            <div className="axe-collection-progress" role="progressbar"
              aria-label="Mastery rank progress" aria-valuenow={Math.round(progress.percent)}
              aria-valuemin={0} aria-valuemax={100}>
              <span style={{width:progress.percent+'%'}}/></div>
            <div className="axe-collection-progress-caption">
              <span>Rank {progress.rank} progress</span>
              <span>{progress.nextXp===null?'Max rank reached':format(remainingXP)+' XP until Rank '+nextRank}</span>
            </div>
          </div>
          <div className="axe-mastery-increase-heading">
            <h4>Stat Increases</h4>
            <span>Current <ArrowRight size={12}/> Next Rank</span>
          </div>
          <div className="axe-mastery-stat-breakdown">
            {(relevant[role]||[]).map(([name,key])=>{
              const available=Object.prototype.hasOwnProperty.call(base,key);
              const raw=Number(base[key]||0);
              const now=raw*progress.rank*.02;
              const next=raw*nextRank*.02;
              return <div key={key} className="axe-mastery-stat-row">
                <div><strong>{name}</strong>
                  <small>{available?'Base companion contribution: '+format(raw):
                    'No '+name.toLowerCase()+' bonus recorded for this mount'}</small></div>
                <div className="axe-mastery-stat-numbers">
                  <span>{available?'+'+format(now):'—'}</span>
                  <ArrowRight size={14} aria-hidden="true"/>
                  <b>{available?'+'+format(next):'—'}</b>
                  {available&&progress.nextXp!==null&&<small>+{format(Math.max(0,next-now))} next rank</small>}
                </div>
              </div>;
            })}
          </div>
          <p className="axe-comp-detail-hint">Values are this mastery path's additional
            contribution, calculated from real earned mount stats. They do not
            include a second bonus from other mastery paths.</p>
          {!eligible?<p className="axe-mastery-locked">Training unlocks after completing
            the first growth cycle (Level 20, 5,000 total mount XP).</p>
            :<p className="axe-mastery-ready">{progress.rank===10?'This role is fully mastered.':
              'Train through combat with the matching weapon equipped.'}</p>}
          {mount&&snapshot.activeMountId!==mount.instanceId&&
            <button type="button" className="axe-mastery-return axe-mastery-activate"
              onClick={()=>{const result=activateAXEMount(mount.instanceId);
                onNotice(result?.ok?'Mount activated.':label(result?.reason));}}>Make Active Mount</button>}
        </section>
      </div>:<p className="axe-mastery-empty">No owned mount available for mastery.</p>}
    </main>
  </div>;
}
