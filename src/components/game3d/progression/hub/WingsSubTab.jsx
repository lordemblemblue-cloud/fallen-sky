import { useEffect, useState } from 'react';
import { Check, Feather, Shield, Sparkles } from 'lucide-react';
import {
  subscribeWings, equipWings, unequipWings, setWingVisualStyle,
  attemptWingEnhancementBatch, attemptWingReinforcement,
} from '../wingsStore';
import { MAX_WING_LEVEL } from '../wingsData';
import AXEServicePathIcon from '../../axe/services/AXEServicePathIcon';
import './WingsSubTab.css';

// These presets are real paid RNG ATTEMPTS, not free level grants. The game
// increases a wing path by 1 only when its existing success roll succeeds.
export const WING_ENCHANT_PRESETS = [1, 20, 50, 100, 'max'];
// A large PvP balance must not block the browser with thousands of sync rolls.
// Repeated Max Level enchantments can continue toward the same level cap.
export const MAX_WING_ENCHANT_ATTEMPTS_PER_ACTION = 200;

const number = v => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const percent = v => (Number(v || 0) * 100).toFixed(1).replace(/\.0$/, '') + '%';
const STATS = [
  ['Strength', 'strength'], ['Constitution', 'constitution'],
  ['Dexterity', 'dexterity'], ['Focus', 'focus'],
];
const FINAL_STATS = [
  ['Max HP', 'hp', false], ['Damage', 'damage', false],
  ['Defense', 'defense', false], ['Crit Chance', 'critChance', true],
  ['Crit Damage', 'critDamage', 'ratio'], ['Crit Defense', 'criticalDefense', 'ratio'],
];
const successMessage = result => {
  if (result?.batch) {
    const { attempts, successes, finalLevel } = result.batch;
    return `${attempts} paid attempts · ${successes} successful · Level ${finalLevel}`
      + (result.isMax && finalLevel < MAX_WING_LEVEL
        ? ' · Select Max Level again to continue if you have kills.' : '');
  }
  if (result?.reinforcement) return result.message;
  return '';
};
function Row({ title, value }) {
  return <div className="axe-wings-stat-row"><span>{title}</span><strong>{value}</strong></div>;
}
function formatFinal(v, suffix) {
  return suffix === 'ratio' ? '+' + percent(v) :
    suffix === true ? '+' + number(v) + '%' : '+' + number(v);
}

export default function WingsSubTab() {
  const [wings, setWings] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [preset, setPreset] = useState(1);
  const [pending, setPending] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  useEffect(() => subscribeWings(snapshot => {
    setWings(snapshot);
    setSelectedId(current => snapshot.paths[current] ? current
      : snapshot.paths[snapshot.equippedPathId]
        ? snapshot.equippedPathId : Object.keys(snapshot.paths)[0] || null);
  }), []);

  if (!wings || !selectedId) return null;
  const path = wings.paths[selectedId];
  const isEquipped = wings.equippedPathId === selectedId;
  const cost = Math.max(1, Number(wings.attemptCost || 1));
  const maxAffordable = Math.floor(Math.max(0, wings.kills) / cost);
  const requested = preset === 'max'
    ? Math.min(maxAffordable, MAX_WING_ENCHANT_ATTEMPTS_PER_ACTION)
    : preset;
  const enough = !path.isMaxLevel && maxAffordable >= (preset === 'max' ? 1 : preset);
  const expectedMaximumSpend = requested * cost;
  const chance = Math.round((path.successChance || 0) * 100);
  const currentLevel = Number(path.level || 0);
  const chanceNote = path.isMaxLevel
    ? 'Max level reached.'
    : 'Each attempt spends Player Kill Count and can fail. Levels are not guaranteed.';
  const canUseReinforcement = !path.isMaxReinforcement &&
    Object.entries(path.reinforcementCost || {}).every(([id,n]) => (wings.materials?.[id] || 0) >= n);
  const canUseProtected = !path.isMaxReinforcement &&
    (wings.materials?.wing_stabilizer || 0) >= 1 &&
    Object.entries(path.reinforcementCost || {}).every(([id,n]) => (wings.materials?.[id] || 0) >= n);

  const changePath = id => {
    setSelectedId(id); setPending(false); setLastResult(null);
  };
  const changePreset = value => {
    setPreset(value); setPending(false); setLastResult(null);
  };
  const enchant = () => {
    if (!enough || !requested) return;
    if (requested > 1 && !pending) { setPending(true); return; }
    setPending(false);
    // The canonical store rolls and spends kills per attempt, and stops on
    // insufficient funds or MAX_WING_LEVEL. No debug setWingLevel shortcut.
    const batch = attemptWingEnhancementBatch(selectedId, requested);
    setLastResult({ ok:batch.attempts > 0, batch, isMax:preset === 'max' });
  };
  const reinforce = protectedAttempt => {
    const result = attemptWingReinforcement(selectedId, { protectedAttempt });
    setLastResult({ reinforcement:true,
      message: result.ok ? 'Reinforcement succeeded · +' + number(result.percent) + '%'
        : 'Reinforcement: ' + String(result.outcome || result.reason || 'not successful').replaceAll('_',' ') });
  };

  return <div className="axe-wings-workspace" aria-label="Spiritual Wings enchantment workstation">
    <nav className="axe-wings-selector" aria-label="Wing types">
      <h3>Wing Types</h3>
      {Object.values(wings.paths).map(type => <button type="button" key={type.id}
        aria-pressed={selectedId === type.id}
        onClick={() => changePath(type.id)}
        title={type.name}>
        <span className="axe-wings-type-icon"><AXEServicePathIcon pathId={type.id}/></span>
        <span className="axe-wings-type-name"><span className="axe-wings-sr-only">Wings of </span>{type.name.replace(/^Wings of /, '')}</span>
        <small>Lv {type.level} / {MAX_WING_LEVEL}</small>
        {wings.equippedPathId === type.id && <span className="axe-wings-type-equipped" aria-label="Equipped"><Check size={12}/></span>}
      </button>)}
    </nav>
    <div className="axe-wings-divider" aria-hidden="true"/>
    <section className="axe-wings-details" aria-label={path.name + ' stats and enchantment'}>
      <div className="axe-wings-selected">
        <span className="axe-wings-selected-icon"><AXEServicePathIcon pathId={selectedId}/></span>
        <div><h3>{path.name}</h3>
          <p>Lv {currentLevel} / {MAX_WING_LEVEL} · +{path.reinforcementPercent || 0}% reinforced</p></div>
      </div>
      <p className="axe-wings-description">{path.description}</p>
      <div className="axe-wings-level-meter" role="progressbar" aria-label={path.name + ' level'}
        aria-valuemin={0} aria-valuemax={MAX_WING_LEVEL} aria-valuenow={currentLevel}>
        <span style={{ width: Math.min(100, currentLevel / MAX_WING_LEVEL * 100) + '%' }}/>
      </div>

      <div className="axe-wings-section-label"><Sparkles size={14}/> Enchant</div>
      <div className="axe-wings-presets" role="group" aria-label="Enchantment attempt options">
        {WING_ENCHANT_PRESETS.map(value => <button type="button" key={value}
          aria-pressed={preset === value} onClick={() => changePreset(value)}
          disabled={path.isMaxLevel}>
          {value === 'max' ? 'Max Level' : '+' + value}
        </button>)}
      </div>
      <div className="axe-wings-costs">
        <Row title="Player Kill Count" value={number(wings.kills)}/>
        <Row title="Cost per attempt" value={number(cost) + ' kills'}/>
        <Row title="Success chance" value={chance + '%'}/>
        <Row title="Selected attempts" value={path.isMaxLevel ? '—' : number(requested)}/>
        <Row title="Maximum cost" value={path.isMaxLevel ? '—' : number(expectedMaximumSpend) + ' kills'}/>
      </div>
      <p className="axe-wings-attempt-note">{chanceNote}
        {preset === 'max' && !path.isMaxLevel &&
          ' Max Level attempts to reach the cap using available kills, up to 200 attempts per activation.'}</p>
      {pending && <div className="axe-wings-confirm" role="status">
        <p>Spend up to {number(expectedMaximumSpend)} kills on {requested} chance-based attempts for {path.name}?</p>
        <button type="button" onClick={enchant}>Confirm Enchant</button>
        <button type="button" onClick={() => setPending(false)}>Cancel</button>
      </div>}
      <button type="button" className="axe-wings-enchant-button"
        onClick={enchant} disabled={!enough || pending}>
        <Sparkles size={17}/>{path.isMaxLevel ? 'Max Level' :
          enough ? 'Enchant' : 'Insufficient Player Kills'}
      </button>
      {lastResult && <p className="axe-wings-result" role="status">
        {successMessage(lastResult)}</p>}

      <div className="axe-wings-section-label"><Shield size={14}/> Wing Statistics</div>
      <div className="axe-wings-stats">
        <div className="axe-wings-stat-heading">Virtual Attributes</div>
        {STATS.map(([label,id]) => <Row key={id} title={label}
          value={'+' + number(path.multiplierBonuses?.[id])}/>)}
        <div className="axe-wings-stat-heading">Specialization</div>
        {FINAL_STATS.map(([label,id,suffix]) => <Row key={id} title={label}
          value={formatFinal(path.flatBonuses?.[id], suffix)}/>)}
      </div>
      <section aria-label="Wing appearance" className="axe-wings-appearance" style={{marginTop:16,marginBottom:12}}>
        <h4 style={{fontSize:12,fontWeight:600,marginBottom:7}}>Wing appearance — available to every faction</h4>
        <div role="group" aria-label="Choose wing appearance" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {[['classic','Classic Energy Wings'],['blue_energy','Blue Angel Wings (GLB)']].map(([id,label]) =>
            <button key={id} type="button" aria-pressed={(wings.visualStyle||'classic')===id}
              onClick={()=>setWingVisualStyle(id)} style={{
                padding:'8px 12px',fontSize:12,borderRadius:7,
                border:(wings.visualStyle||'classic')===id?'1px solid #7dd3fc':'1px solid #ffffff3d',
                background:(wings.visualStyle||'classic')===id?'#38bdf825':'#ffffff0c',color:'#eff6ff',
              }}>{label}</button>)}
        </div>
        <p style={{color:'#b6c5d6',fontSize:11,marginTop:6}}>Appearance only. Your equipped path, level and combat bonuses stay unchanged.</p>
      </section>
      <button type="button" className="axe-wings-equip"
        onClick={() => isEquipped ? unequipWings() : equipWings(selectedId)}>
        <Feather size={15}/>{isEquipped ? 'Unequip Wings' : 'Equip Wings'}
      </button>

      <details className="axe-wings-reinforcement">
        <summary>Wing Reinforcement · +{path.reinforcementPercent || 0}% / {wings.maxReinforcementPercent}%</summary>
        <p>{path.visualTier?.label || 'Dormant'} · {Math.round((path.reinforcementChance || 0) * 100)}% success</p>
        <p>Materials: {Object.entries(path.reinforcementCost || {}).map(([id,quantity]) =>
          id.replaceAll('_',' ') + ' ×' + quantity +
          ' (owned ' + (wings.materials?.[id] || 0) + ')').join(' · ')}</p>
        <div className="axe-wings-reinforce-actions">
          <button type="button" onClick={() => reinforce(false)} disabled={!canUseReinforcement}>
            Reinforce</button>
          <button type="button" onClick={() => reinforce(true)} disabled={!canUseProtected}>
            Protected Attempt</button>
        </div>
      </details>
    </section>
  </div>;
}
