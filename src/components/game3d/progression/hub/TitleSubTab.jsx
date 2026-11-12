import { useEffect, useState } from 'react';
import { advanceTitleStage, subscribeTitles, equipTitle, unequipTitle, setTitleDisplayHidden } from '../titleStore';
import { MAX_TITLE_LEVEL, getTitleStageCost } from '../titleData';
import AXEServicePathIcon from '../../axe/services/AXEServicePathIcon';
import './TitleSubTab.css';

// A batch is a series of normal, validated stage purchases, never a shortcut
// to the developer-only level setter.
export function getTitleBatchPreview(path, points, choice) {
  let level = path.level, spent = 0, count = 0;
  const limit = choice === 'max' ? MAX_TITLE_LEVEL : choice;
  while (count < limit && level < MAX_TITLE_LEVEL) {
    const cost = getTitleStageCost(level + 1);
    if (!(cost > 0) || spent + cost > points) break;
    spent += cost;
    count += 1;
    level += 1;
  }
  return { count, spent, level };
}
export default function TitleSubTab() {
  const [titles, setTitles] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [batch, setBatch] = useState(1);
  const [lastResult, setLastResult] = useState(null);
  useEffect(() => subscribeTitles(s => {
    setTitles(s);
    setSelectedId(current => s.paths[current] ? current
      : s.paths[s.equippedPathId] ? s.equippedPathId : Object.keys(s.paths)[0] || null);
  }), []);
  if (!titles || !selectedId) return null;
  const path = titles.paths[selectedId];
  const isEquipped = titles.equippedPathId === selectedId;
  const preview = getTitleBatchPreview(path, titles.contributionPoints, batch);
  const progress = Math.min(100, path.level / MAX_TITLE_LEVEL * 100);
  const doAdvance = () => {
    let success = 0, result;
    for (let i = 0; i < preview.count; i++) {
      result = advanceTitleStage(path.id);
      if (!result.ok) break;
      success++;
    }
    setLastResult(success ? `Advanced ${success} stage${success === 1 ? '' : 's'} to Stage ${result.level}.`
      : (result?.reason || 'Insufficient contribution points.'));
  };
  return <div className="axe-title-container">
    <section className="axe-title-compact" aria-label="Titles management">
      <header className="axe-title-compact-header">
        <div><span className="axe-title-kicker">Spiritual Enhancement</span><h3>Titles</h3>
          <p>Choose a specialized title and advance it with earned contribution points.</p></div>
        <div className="axe-title-points"><small>Contribution Points</small>
          <strong>{titles.contributionPoints.toLocaleString()}</strong></div>
      </header>
      <nav className="axe-title-paths" aria-label="Title specializations">
        {Object.values(titles.paths).map(p => <button key={p.id} type="button"
          aria-pressed={p.id === selectedId} onClick={() => { setSelectedId(p.id); setLastResult(null); }}>
          <AXEServicePathIcon pathId={p.id} /><span>{p.name}</span>
          <small>Stage {p.level} / {MAX_TITLE_LEVEL}</small>
          {titles.equippedPathId === p.id && <em>Equipped</em>}
        </button>)}
      </nav>
      <div className="axe-title-selection">
        <div><b>{path.name}</b><small>{path.rarity.rarity} · Stage {path.level} / {MAX_TITLE_LEVEL}</small>
          <p>{path.description}</p></div>
        <div className="axe-title-equipment-actions">
          <button type="button" onClick={() => isEquipped ? unequipTitle() : equipTitle(path.id)}>
            {isEquipped ? 'Unequip' : 'Equip'}
          </button>
          <button type="button" onClick={() => setTitleDisplayHidden(!titles.displayHidden)}>
            {titles.displayHidden ? 'Show Title' : 'Hide Title'}
          </button>
        </div>
      </div>
      <div className="axe-title-progress-label"><span>Progress Track</span><b>{path.level} / {MAX_TITLE_LEVEL}</b></div>
      <div className="axe-title-progress" role="progressbar" aria-label="Title stage progress"
        aria-valuenow={path.level} aria-valuemin={0} aria-valuemax={MAX_TITLE_LEVEL}>
        <span style={{ width: progress + '%' }} /></div>
      <div className="axe-title-enhance-row">
        <div className="axe-title-cost"><small>Next Stage Cost</small>
          <b>{path.isMaxLevel ? 'MAX' : path.nextStageCost.toLocaleString()}</b></div>
        <div className="axe-title-batch" role="group" aria-label="Number of stages to advance">
          {[1,2,5,'max'].map(n => <button type="button" key={n}
            aria-pressed={batch === n} onClick={() => setBatch(n)}>{n === 'max' ? 'Max' : '+' + n}</button>)}
        </div>
        <button type="button" className="axe-title-enhance-action" onClick={doAdvance}
          disabled={preview.count === 0 || path.isMaxLevel}>
          {path.isMaxLevel ? 'Mastered' : 'Enhance'}
        </button>
      </div>
      <p className="axe-title-cost-note">
        {preview.count > 0 ? `${preview.count} stage${preview.count === 1 ? '' : 's'} · ${preview.spent.toLocaleString()} contribution points`
          : path.isMaxLevel ? 'Maximum title stage reached' : 'Not enough contribution points for the next stage'}
      </p>
      {lastResult && <p className="axe-title-result" role="status">{lastResult}</p>}
      <div className="axe-title-bonuses">
        <BonusBlock title="Current Statistics" attr={path.attributeBonuses} flat={path.bonuses} />
        {!path.isMaxLevel && <BonusBlock title={`Next Stage · ${path.level + 1}`}
          attr={path.nextLevelAttributeBonuses} flat={path.nextLevelBonuses} />}
      </div>
    </section>
  </div>;
}
function BonusBlock({ title, attr, flat }) {
  const rows = [
    ['Strength', attr?.strength],['Vitality', attr?.constitution],['Dexterity', attr?.dexterity],
    ['Spirit',attr?.focus],['Max HP',flat?.hp],['Chi',flat?.chi],['Damage',flat?.damage],
    ['Defense',flat?.defense],['Crit Chance',flat?.critChance],
  ];
  return <section className="axe-title-stat-group"><h4>{title}</h4>
    <div>{rows.map(([name,value]) => <div key={name}><span>{name}</span><b>+{name === 'Crit Chance' ? Number(value || 0).toFixed(1) + '%' : Number(value || 0).toLocaleString()}</b></div>)}</div>
  </section>;
}
