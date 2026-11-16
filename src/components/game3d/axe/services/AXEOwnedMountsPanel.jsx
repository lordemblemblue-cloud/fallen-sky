import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Compass, Search, Shield, Wind } from 'lucide-react';
import { getAXEMountState, subscribeAXEMounts } from '../progression/AXEMountStore';
import { getAXENextMountGrowthBand } from '../progression/AXEMountSystem';
import { buildOwnedMountRoster } from './MountCollectionModel.mjs';
import './AXECompanionCollectionPages.css';

const STAT_LABELS = {
  hp:'HP',damage:'Attack',defense:'Defense',
  attributionAttack:'Attribute ATK',attributionDefense:'Attribute DEF',
  attackBlock:'Evasion',critChance:'Crit Rate',
};
const fmt=value=>Number(value||0).toLocaleString('en-US',{maximumFractionDigits:2});
const statLabel=key=>STAT_LABELS[key]||String(key).replaceAll('_',' ');

export default function AXEOwnedMountsPanel({onOpenArmory=()=>{}}) {
  const [state,setState]=useState(getAXEMountState);
  const [query,setQuery]=useState('');
  const [selectedId,setSelectedId]=useState(null);
  const [onlyActive,setOnlyActive]=useState(false);
  useEffect(()=>subscribeAXEMounts(setState),[]);
  const mounts=useMemo(()=>buildOwnedMountRoster(state),[state]);
  const visible=mounts.filter(mount=>{
    const term=query.trim().toLowerCase();
    return (!onlyActive||mount.active)
      &&(!term||[mount.name,mount.rarity,mount.specialty,mount.definitionId]
        .filter(Boolean).some(value=>String(value).toLowerCase().includes(term)));
  });
  const selected=visible.find(mount=>mount.instanceId===selectedId)
    ||visible.find(mount=>mount.active)||visible[0]||null;
  const next=selected?getAXENextMountGrowthBand(selected.totalXp):null;
  const progress=selected?(next
    ?Math.min(100,selected.totalXp/Math.max(1,next.totalXpRequired)*100):100):0;

  return <section className="axe-collection-page axe-mounts-redesign"
    aria-label="Owned mounts and their stats" data-companion-page="owned-mounts">
    <header className="axe-collection-page-header">
      <div><div className="axe-collection-eyebrow">Companion · Mount Collection</div>
        <h2>My Mounts <span>{mounts.length} owned</span></h2>
        <p>Browse one mount at a time, inspect its actual speed, progression and bonuses.
          Mount upgrades and equipment remain in the separate Armory.</p></div>
      <button type="button" className="axe-collection-armory-button" onClick={onOpenArmory}>
        <Shield size={16}/> Mount Armory <ChevronRight size={14}/>
      </button>
    </header>
    <div className="axe-mounts-workspace">
      <aside className="axe-mounts-roster" aria-label="Owned mount selector">
        <div className="axe-mounts-roster-heading"><Compass size={18}/>
          <strong>Owned Mounts</strong><small>{visible.length} shown</small></div>
        <label className="axe-collection-search"><Search size={16}/>
          <span className="sr-only">Search owned mounts</span>
          <input type="search" value={query} onChange={event=>setQuery(event.target.value)}
            placeholder="Search mounts…"/></label>
        <label className="axe-mounts-active-filter"><input type="checkbox"
          checked={onlyActive} onChange={event=>setOnlyActive(event.target.checked)}/>
          Show active only</label>
        <div className="axe-mounts-roster-list">
          {visible.map(mount=><button type="button" key={mount.instanceId}
            aria-pressed={selected?.instanceId===mount.instanceId}
            onClick={()=>setSelectedId(mount.instanceId)}>
            <span className="axe-mounts-roster-icon"><Compass size={22}/></span>
            <span><strong>{mount.name}</strong>
              <small>{mount.rarity} · {mount.specialty}</small></span>
            {mount.active&&<CheckCircle2 size={17} className="axe-mounts-active-check"/>}
          </button>)}
          {!mounts.length&&<p role="status">No owned mounts yet.</p>}
          {!!mounts.length&&!visible.length&&<p role="status">No mounts match your filters.</p>}
        </div>
      </aside>
      <div className="axe-mounts-profile">
        {selected?<><div className="axe-mounts-profile-banner">
            <div className="axe-mounts-profile-emblem"><Compass size={34}/></div>
            <div><small>{selected.rarity} · {selected.specialty}</small>
              <h3>{selected.name}</h3>
              <p>{selected.active?'Currently active mount':'Owned mount'}
                {selected.registered?' · Registered':''}{selected.riding?' · Riding':''}</p></div>
            {selected.active&&<span className="axe-mounts-status">Active</span>}
          </div>
          <div className="axe-collection-primary-stats">
            <div><Wind size={16}/> Travel Speed <strong>×{fmt(selected.speedMultiplier)}</strong></div>
            <div>Growth <strong>{fmt(selected.growthPercent)}%</strong></div>
          </div>
          <div className="axe-collection-progress"
            aria-label={selected.growthPercent+' percent mount growth'}>
            <span style={{width:progress+'%'}}/></div>
          <div className="axe-collection-progress-caption"><span>{fmt(selected.totalXp)} total XP</span>
            <span>{next?'Next '+next.percent+'% at '+fmt(next.totalXpRequired)+' XP':'Max growth'}</span>
          </div>
          <h4>Combat and travel bonuses</h4>
          <dl className="axe-collection-stat-grid">
            {Object.entries(selected.bonuses).length
              ?Object.entries(selected.bonuses).map(([key,value])=><div key={key}>
                <dt>{statLabel(key)}</dt><dd>+{fmt(value)}{key==='critChance'?'%':''}</dd></div>)
              :<div><dt>Current bonuses</dt><dd>None yet</dd></div>}
          </dl>
          <div className="axe-collection-detail-footer">
            <span>Ride XP <b>{fmt(selected.sourceStats.ridingXp)}</b></span>
            <span>PvE XP <b>{fmt(selected.sourceStats.pveXp)}</b></span>
            <span>PvP XP <b>{fmt(selected.sourceStats.pvpXp)}</b></span>
            {selected.spiritualMaxRank>0&&<span>Spirit Rank <b>
              {selected.spiritualRank}/{selected.spiritualMaxRank}</b></span>}
          </div>
          {!!selected.abilities.length&&<p className="axe-collection-abilities">
            Legendary abilities: {selected.abilities.map(a=>a.label).join(' · ')}</p>}
          <button type="button" className="axe-mounts-secondary-action" onClick={onOpenArmory}>
            <Shield size={16}/> Open Mount Equipment & Upgrades
          </button>
        </>:<div className="axe-collection-empty">Select an owned mount to view its profile.</div>}
      </div>
    </div>
  </section>;
}
