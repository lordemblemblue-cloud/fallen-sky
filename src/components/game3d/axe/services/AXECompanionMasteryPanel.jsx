import { CheckCircle2, Heart, Search, Sparkles } from 'lucide-react';
import { getAXEPetDefinition, AXE_PET_CONFIG, xpForAXEPetLevel } from '../progression/AXEPetSystem';
import { registerAXEPet, summonAXEPet, feedAXEPet, overEnchantAXEPet } from '../progression/AXEPetStore';
import { isSoulCompanionMastered } from '../progression/AXESoulRegaliaSystem';
import { useState } from 'react';
import './AXECompanionCollectionPages.css';

const STATS = { hp: 'HP', damage: 'Attack', defense: 'Defense', chi: 'Spirit',
  attributionAttack: 'Attribute ATK', attributionDefense: 'Attribute DEF' };
const fmt = value => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
const title = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());

export default function AXECompanionMasteryPanel({
  pets, selectedPet, onSelectPet = () => {}, onAction = () => {},
}) {
  const [query, setQuery] = useState('');
  const allPets = Array.isArray(pets?.pets) ? pets.pets : [];
  const current = allPets.find(pet => pet.instanceId === selectedPet?.instanceId) || allPets[0] || null;
  const definition = current ? getAXEPetDefinition(current.definitionId) : null;
  const mastered = current ? isSoulCompanionMastered(current) : false;
  const maxLevel = AXE_PET_CONFIG.maxLevel;
  const maxEnchant = AXE_PET_CONFIG.maxOverEnchantPercent;
  const xpGoal = current ? xpForAXEPetLevel(current.level || 1) : 0;
  const visible = allPets.filter(pet => {
    const needle = query.trim().toLowerCase();
    return !needle || [
      getAXEPetDefinition(pet.definitionId)?.name,
      pet.definitionId, pet.tierId, pet.specialty,
    ].filter(Boolean).some(value => String(value).toLowerCase().includes(needle));
  });
  return <section className="axe-collection-page" data-companion-page="mastery" aria-label="Owned companion mastery">
    <header className="axe-collection-page-header">
      <div>
        <div className="axe-collection-eyebrow">Companion · Growth & Training</div>
        <h2>Companion Mastery <span>{allPets.length} owned</span></h2>
        <p>Select an owned companion to see its progression, current combat stats and mastery readiness. Mount armor and Soul Fusion are not managed here.</p>
      </div>
    </header>
    <div className="axe-collection-mastery-layout">
      <aside className="axe-collection-mastery-roster" aria-label="Owned companions">
        <label className="axe-collection-search"><Search size={16} aria-hidden="true" />
          <span className="sr-only">Search owned companions</span>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)}
            placeholder="Search companions…" />
        </label>
        <div className="axe-collection-mastery-scroll">
          {visible.map(pet => {
            const def = getAXEPetDefinition(pet.definitionId);
            const active = current?.instanceId === pet.instanceId;
            return <button key={pet.instanceId} type="button" aria-pressed={active}
              onClick={() => onSelectPet(pet.instanceId)}>
              <span className="axe-collection-card-emblem"><Heart size={18} aria-hidden="true" /></span>
              <span className="axe-collection-mastery-roster-text">
                <strong>{def?.name || title(pet.definitionId)}</strong>
                <small>Lv. {fmt(pet.level)} · {title(pet.tierId || 'base')}</small>
              </span>
              {active && <CheckCircle2 size={16} aria-hidden="true" />}
            </button>;
          })}
          {!allPets.length && <p role="status">No owned companions yet.</p>}
          {!!allPets.length && !visible.length && <p role="status">No companions match this search.</p>}
        </div>
      </aside>
      {current ? <div className="axe-collection-mastery-detail">
        <div className="axe-collection-mastery-heading">
          <div><div className="axe-collection-card-kicker">{title(current.tierId || 'base')} · {title(current.specialty)}</div>
            <h3>{definition?.name || title(current.definitionId)}</h3></div>
          <span className={mastered ? 'axe-collection-ready' : 'axe-collection-training'}>
            {mastered ? 'Mastered' : 'Training'}
          </span>
        </div>
        <div className="axe-collection-primary-stats">
          <div>Level <strong>{fmt(current.level)} / {maxLevel}</strong></div>
          <div>Over-Enchantment <strong>{fmt(current.overEnchantPercent)}% / {maxEnchant}%</strong></div>
        </div>
        <div className="axe-collection-progress" aria-label={'Progress to next pet level'}>
          <span style={{ width: (Number(current.level) >= maxLevel ? 100
            : Math.min(100, Math.max(0, Number(current.xp || 0) / Math.max(1, xpGoal) * 100))) + '%' }} />
        </div>
        <div className="axe-collection-progress-caption">
          <span>{fmt(current.xp)} current XP</span>
          <span>{Number(current.level) >= maxLevel ? 'Maximum level' : fmt(xpGoal) + ' XP to next level'}</span>
        </div>
        <h4>Current companion stats</h4>
        <dl className="axe-collection-stat-grid">
          {Object.entries(current.bonuses || {}).filter(([, v]) => Number.isFinite(Number(v)))
            .map(([key, value]) => <div key={key}>
              <dt>{STATS[key] || title(key)}</dt><dd>+{fmt(value)}</dd>
            </div>)}
        </dl>
        <div className="axe-collection-detail-footer">
          <span>Registered <b>{pets.activeRegisteredPetId === current.instanceId ? 'Yes' : 'No'}</b></span>
          <span>Summoned <b>{pets.summonedPetId === current.instanceId ? 'Yes' : 'No'}</b></span>
          <span>Feed <b>{fmt(pets.materials?.pet_feed)}</b></span>
          <span>Catalysts <b>{fmt(pets.materials?.pet_catalyst)}</b></span>
        </div>
        <div className="axe-collection-training-panel">
          <h4><Sparkles size={15} aria-hidden="true" /> Training</h4>
          <p>Mastery requires Level {maxLevel} and {maxEnchant}% Over-Enchantment. Feed and catalysts use your existing owned supplies.</p>
          <div className="axe-collection-training-actions">
            <button type="button" disabled={!(pets.materials?.pet_feed > 0) || current.level >= maxLevel}
              onClick={() => onAction('Feed companion', () => feedAXEPet(current.instanceId, 1))}>Feed · +25 XP</button>
            <button type="button" disabled={!(pets.materials?.pet_catalyst > 0) || current.overEnchantPercent >= maxEnchant}
              onClick={() => onAction('Over-enchant companion', () => overEnchantAXEPet(current.instanceId), true)}>
              Over-Enchant
            </button>
            <button type="button" disabled={pets.activeRegisteredPetId === current.instanceId}
              onClick={() => onAction('Register companion', () => registerAXEPet(current.instanceId))}>Register</button>
            <button type="button" disabled={pets.summonedPetId === current.instanceId}
              onClick={() => onAction('Summon companion', () => summonAXEPet(current.instanceId))}>Summon</button>
          </div>
        </div>
      </div> : <div className="axe-collection-empty">Select an owned companion when available to review its mastery.</div>}
    </div>
  </section>;
}
