import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Compass, Search, Shield, Wind } from 'lucide-react';
import { getAXEMountState, subscribeAXEMounts } from '../progression/AXEMountStore';
import { getAXENextMountGrowthBand } from '../progression/AXEMountSystem';
import { buildOwnedMountRoster } from './MountCollectionModel.mjs';
import './AXECompanionCollectionPages.css';

const STAT_LABELS = {
  hp: 'HP', damage: 'Attack', defense: 'Defense',
  attributionAttack: 'Attribute ATK', attributionDefense: 'Attribute DEF',
  attackBlock: 'Evasion', critChance: 'Crit Rate',
};
const fmt = value => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const statLabel = key => STAT_LABELS[key] || String(key).replaceAll('_', ' ');

export default function AXEOwnedMountsPanel({ onOpenArmory = () => {} }) {
  const [state, setState] = useState(getAXEMountState);
  const [search, setSearch] = useState('');
  useEffect(() => subscribeAXEMounts(setState), []);
  const mounts = useMemo(() => buildOwnedMountRoster(state), [state]);
  const visible = mounts.filter(mount => {
    const term = search.trim().toLowerCase();
    return !term || [mount.name, mount.rarity, mount.specialty, mount.definitionId]
      .filter(Boolean).some(value => String(value).toLowerCase().includes(term));
  });
  return (
    <section className="axe-collection-page" aria-label="Owned mounts and their stats" data-companion-page="owned-mounts">
      <header className="axe-collection-page-header">
        <div>
          <div className="axe-collection-eyebrow">Companion · Mount Collection</div>
          <h2>My Mounts <span>{mounts.length} owned</span></h2>
          <p>View your owned mounts, travel speed, growth, and combat bonuses. Mount armor and upgrades are kept in the Armory.</p>
        </div>
        <button type="button" className="axe-collection-armory-button" onClick={onOpenArmory}>
          <Shield size={16} aria-hidden="true" /> Mount Armory <ChevronRight size={14} aria-hidden="true" />
        </button>
      </header>
      <div className="axe-collection-toolbar">
        <label className="axe-collection-search"><Search size={16} aria-hidden="true" />
          <span className="sr-only">Search owned mounts</span>
          <input type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Search owned mounts…" />
        </label>
        <span>{visible.length} of {mounts.length} mounts</span>
      </div>
      {!mounts.length && <div className="axe-collection-empty" role="status">
        No mounts are owned by this character yet. New mounts will appear here when acquired.
      </div>}
      {!!mounts.length && !visible.length && <div className="axe-collection-empty" role="status">
        No owned mounts match this search.
      </div>}
      <div className="axe-collection-card-grid">
        {visible.map(mount => {
          const next = getAXENextMountGrowthBand(mount.totalXp);
          const progress = next ? Math.min(100, mount.totalXp / Math.max(1, next.totalXpRequired) * 100) : 100;
          return <article className="axe-collection-card" key={mount.instanceId}
            aria-label={mount.name + ' mount stats'}>
            <header className="axe-collection-card-heading">
              <div className="axe-collection-card-emblem"><Compass size={24} aria-hidden="true" /></div>
              <div className="axe-collection-card-name">
                <div className="axe-collection-card-kicker">{mount.rarity} · {mount.specialty}</div>
                <h3>{mount.name}</h3>
                <div className="axe-collection-badges">
                  {mount.active && <span>Active</span>}
                  {mount.registered && <span>Registered</span>}
                  {mount.riding && <span>Riding</span>}
                  {mount.legendary && <span>Legendary</span>}
                </div>
              </div>
            </header>
            <div className="axe-collection-primary-stats">
              <div><Wind size={16} aria-hidden="true" /> Speed <strong>×{fmt(mount.speedMultiplier)}</strong></div>
              <div>Growth <strong>{fmt(mount.growthPercent)}%</strong></div>
            </div>
            <div className="axe-collection-progress" aria-label={mount.growthPercent + ' percent mount growth'}>
              <span style={{ width: progress + '%' }} />
            </div>
            <div className="axe-collection-progress-caption">
              <span>{fmt(mount.totalXp)} total XP</span>
              <span>{next ? 'Next ' + next.percent + '% at ' + fmt(next.totalXpRequired) + ' XP' : 'Max growth'}</span>
            </div>
            <h4>Mount bonuses</h4>
            <dl className="axe-collection-stat-grid">
              {Object.entries(mount.bonuses).length
                ? Object.entries(mount.bonuses).map(([key, value]) => <div key={key}>
                    <dt>{statLabel(key)}</dt><dd>+{fmt(value)}{key === 'critChance' ? '%' : ''}</dd>
                  </div>)
                : <div><dt>Current bonuses</dt><dd>None yet</dd></div>}
            </dl>
            <div className="axe-collection-detail-footer">
              <span>Ride XP <b>{fmt(mount.sourceStats.ridingXp)}</b></span>
              <span>PvE XP <b>{fmt(mount.sourceStats.pveXp)}</b></span>
              <span>PvP XP <b>{fmt(mount.sourceStats.pvpXp)}</b></span>
              {mount.spiritualMaxRank > 0 && <span>Spirit rank <b>{mount.spiritualRank}/{mount.spiritualMaxRank}</b></span>}
            </div>
            {mount.abilities.length > 0 && <p className="axe-collection-abilities">
              Legendary abilities: {mount.abilities.map(ability => ability.label).join(' · ')}
            </p>}
          </article>;
        })}
      </div>
    </section>
  );
}
