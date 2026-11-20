import { ShieldCheck, Layers, Gem, Zap, Sparkles } from 'lucide-react';
import './AXEBlacksmithWorkflowPanel.css';

const art = item => item?.imageUrl || item?.iconUrl || item?.image || null;
const display = value => String(value ?? '').replaceAll('_', ' ');
const labelFor = mode => mode === 'combine' ? 'Combine' : mode === 'over_enchant' ? 'Over-Enchant' : 'Enchant';
const pct = chance => chance == null ? '—' : Math.round(Number(chance) * 1000) / 10 + '%';

// Blacksmith v2 (docs/game3d/BLACKSMITH_V2_20261118.md): the Enchant tab runs the item's
// Enchant % (0–200, `operation` 'reinforcement') or its four +10 slots ('enchant').
export default function AXEBlacksmithWorkflowPanel({ mode, operation = mode, enchantMode = 'percent', onChangeEnchantMode = () => {},
  target, donor, compatibleDonors = [],
  requirements = [], materialSelection = '', selectedMaterial = null,
  readout, canForge, confirmCombine, autoEnabled, onToggleAuto, autoProtection, onToggleProtection,
  minSuccess, onChangeThreshold, onSelectDonor, onClearTarget, onClearDonor,
  onDropSlot, onMaterial, onForge, onAuto, onStop, busy, batchBusy,
  batchPending, onCancelBatch, notice, onChangeMode,
}) {
  const combine = mode === 'combine';
  const percentMode = operation === 'reinforcement';
  const isRisky = mode === 'over_enchant' || percentMode;
  const chance = readout?.chance;
  const current = combine ? '+' + (readout?.combineStage ?? 0) : mode === 'over_enchant'
    ? readout?.overEnchantLevel : percentMode ? (readout?.reinforcementPercent ?? 0) + '%' : readout?.enchantTotal;
  const icon = item => art(item)
    ? <img src={art(item)} alt="" draggable={false}/>
    : <Gem size={23} aria-hidden="true"/>;
  const slot = (which, item, caption, action) => <button type="button"
    className="axe-forge-flow-slot" onClick={action}
    onDragOver={event => event.preventDefault()}
    onDrop={event => onDropSlot(event, which)}
    title={item ? caption + ': ' + item.name + ' — click to clear' : 'Place ' + caption.toLowerCase() + ' here'}
    aria-label={item ? caption + ': ' + item.name : caption + ': empty'}
    disabled={batchBusy}>
    {item ? icon(item) : <span className="axe-forge-flow-plus" aria-hidden="true">+</span>}
    <small>{item?.name || caption}</small>
  </button>;
  return <section className="axe-blacksmith-workflow" aria-label={labelFor(mode) + ' inventory workstation'}>
    <header className="axe-forge-workflow-header">
      <span>Inventory Forge</span><h3>{labelFor(mode)}</h3>
      <small>Right-click an owned item to place it here.</small>
    </header>
    <nav className="axe-forge-mode-boxes" aria-label="Inventory upgrade subpages">
      {['enchant', 'over_enchant', 'combine'].map(id =>
        <button type="button" key={id} className="axe-forge-mode-box"
          aria-pressed={mode === id} aria-current={mode === id ? 'page' : undefined}
          onClick={() => onChangeMode(id)} disabled={batchBusy}
          title={'Switch to ' + labelFor(id)}>
          {id === 'combine' ? <Layers size={19} aria-hidden="true"/> : id === 'over_enchant'
            ? <Zap size={19} aria-hidden="true"/> : <Gem size={19} aria-hidden="true"/>}
          <span>{labelFor(id)}</span>
        </button>)}
    </nav>
    {mode === 'enchant' && <div className="axe-forge-mode-boxes axe-forge-enchant-modes" role="group" aria-label="Enchant type">
      {[['percent', 'Enchant % (0–200)'], ['slots', 'Slots (4 × +10)']].map(([id, label]) =>
        <button type="button" key={id} className="axe-forge-mode-box" aria-pressed={enchantMode === id}
          onClick={() => onChangeEnchantMode(id)} disabled={batchBusy}>
          <span>{label}</span>
        </button>)}
    </div>}
    <div className="axe-forge-selected" aria-label="Selected equipment">
      <div className="axe-forge-selected-art">{target ? icon(target) : <Layers size={24} aria-hidden="true"/>}</div>
      <div><strong>{target?.name || 'No equipment selected'}</strong>
        {target ? <small>Lv. {target.itemLevel ?? target.level ?? 1} · {target.rarity ?? target.tier ?? 'Equipment'}</small>
          : <small>Choose an item from Inventory</small>}
        {target && <small>{current == null ? 'Equipment' : (combine ? 'Combine' : percentMode ? 'Enchant' : mode === 'over_enchant' ? 'Over-Enchant' : 'Enchant slots') + ': ' + display(current)}</small>}
      </div>
      {target && <button type="button" className="axe-forge-clear" onClick={onClearTarget}
        aria-label="Remove selected equipment" disabled={batchBusy}>×</button>}
    </div>
    <div className="axe-forge-flow" aria-label="Upgrade ingredients and result">
      {slot('target', target, 'Base', onClearTarget)}
      <span aria-hidden="true">+</span>
      {combine ? slot('donor', donor, 'Donor', onClearDonor)
        : <button type="button" className="axe-forge-flow-slot" disabled={batchBusy || !requirements.length}
            onClick={() => onMaterial(requirements[0]?.[0] || '')}
            aria-label="Show required upgrade materials">
            {selectedMaterial ? <Gem size={21} aria-hidden="true"/> : <span aria-hidden="true">+</span>}
            <small>{selectedMaterial?.name || 'Materials'}</small>
          </button>}
      <span aria-hidden="true">=</span>
      <div className="axe-forge-flow-result" title="Next result uses server-compatible forge preview">
        <Sparkles size={23} aria-hidden="true"/><small>{readout?.preview?.outcome || 'Preview'}</small>
      </div>
    </div>
    <div className="axe-forge-help-items">
      <h4>{combine ? 'Matching equipment (' + compatibleDonors.length + ')' : 'Required materials'}</h4>
      {!target && <p>Choose your base equipment to see compatible items.</p>}
      {target && combine && (compatibleDonors.length ? <div className="axe-forge-donor-list">
        {compatibleDonors.slice(0, 10).map(item => <button type="button" key={item.instanceId}
          aria-pressed={donor?.instanceId === item.instanceId} disabled={batchBusy}
          onClick={() => onSelectDonor(item)} title={'Select ' + item.name + ' as donor'}>
          {item.name} <small>Lv. {item.itemLevel ?? item.level ?? 1}</small>
        </button>)}
      </div> : <p>No unlocked, unequipped item with the same rarity, item level, slot and type.</p>)}
      {target && !combine && (requirements.length ? requirements.map(([id, required, owned]) =>
        <button type="button" key={id} className="axe-forge-required-item"
          aria-pressed={materialSelection === id} disabled={batchBusy}
          onClick={() => onMaterial(id)}>
          <span>{display(id)}</span><strong className={owned < required ? 'is-short' : ''}>{owned} / {required}</strong>
        </button>) : <p>No materials required for this upgrade.</p>)}
    </div>
    <div className="axe-forge-automation">
      <label className="axe-forge-toggle"><input type="checkbox" checked={autoEnabled}
        disabled={batchBusy} onChange={event => onToggleAuto(event.target.checked)}/>
        <span>{combine ? 'Auto-add matching donors' : 'Enable Auto-' + labelFor(mode)}</span>
      </label>
      {!combine && <>
        <label className="axe-forge-threshold">Stop below success rate
          <select aria-label="Minimum success rate" value={minSuccess}
            onChange={event => onChangeThreshold(Number(event.target.value))} disabled={batchBusy}>
            {[100, 95, 90, 85, 80, 75, 70, 60, 50].map(n =>
              <option value={n} key={n}>{n}%</option>)}
          </select>
        </label>
        {isRisky && <label className="axe-forge-toggle"><input type="checkbox"
          checked={autoProtection} disabled={batchBusy}
          onChange={event => onToggleProtection(event.target.checked)}/>
          <span>Use Stabilizers below limit</span>
        </label>}
      </>}
      {target && <p className="axe-forge-risk-note"><ShieldCheck size={14} aria-hidden="true"/>
        {percentMode ? 'Success: ' + pct(chance) + ' (+5 points). Failure: −3 points, never below 0 %; the item never breaks and Combine and Ascension stay.'
          : mode === 'enchant' ? 'Slot Enchant succeeds with the current rules; it does not break gear.'
            : combine ? 'Success: ' + pct(chance) + '. A success uses up the donor; a failure keeps the donor and the stage (fee: free).'
              : 'Success: ' + pct(chance) + '. Failure can fracture and lower Over-Enchant. Unsafe unprotected attempts stop.'}
      </p>}
    </div>
    <div className="axe-forge-action-row">
      <button type="button" onClick={onForge} disabled={busy || batchBusy || !canForge}>
        {busy ? 'Forging…' : confirmCombine ? 'Confirm Combine' : 'Forge ' + labelFor(mode)}
      </button>
      {autoEnabled && (batchBusy ? <button type="button" className="axe-forge-stop" onClick={onStop}>
        Stop after current attempt
      </button> : <button type="button" onClick={onAuto} disabled={!target}>
        {'Auto-' + labelFor(mode)}
      </button>)}
    </div>
    {batchPending && <div className="axe-forge-confirm" role="group" aria-label="Confirm automatic forging">
      <p>Run up to 12 sequential attempts? Each may consume materials. Combine consumes matching donors on success.</p>
      <button type="button" onClick={onAuto}>Confirm batch</button>
      <button type="button" onClick={onCancelBatch}>Cancel</button>
    </div>}
    <p className="axe-forge-workflow-notice" role="status" aria-live="polite">{notice || 'Selection is free. Forge operations use your existing owned resources.'}</p>
  </section>;
}
