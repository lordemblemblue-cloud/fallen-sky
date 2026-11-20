import { ShieldCheck, Layers, Gem } from 'lucide-react';
import './AXEBlacksmithWorkflowPanel.css';

const art = item => item?.imageUrl || item?.iconUrl || item?.image || null;
const display = value => String(value ?? '').replaceAll('_', ' ');
const labelFor = mode => mode === 'combine' ? 'Combine' : mode === 'over_enchant' ? 'Over-Enchant' : 'Enchant';
const pct = chance => chance == null ? '—' : Math.round(Number(chance) * 1000) / 10 + '%';

// These are the controls for the open area BETWEEN Inventory and the existing
// result circle. Operation navigation lives in AXEBlacksmithImageWorkspace;
// Forge Results and the circular result are intentionally separate.
export default function AXEBlacksmithWorkflowPanel({
  mode, operation = mode, enchantMode = 'percent', onChangeEnchantMode = () => {},
  target, donor, compatibleDonors = [], requirements = [], selectedMaterial = null,
  materialSelection = '', readout, canForge, confirmCombine,
  autoEnabled, onToggleAuto, autoProtection, onToggleProtection,
  minSuccess, onChangeThreshold, onSelectDonor, onClearTarget, onClearDonor,
  onDropSlot, onMaterial, onFocusInventory = () => {}, onForge, onAuto, onStop,
  busy, batchBusy, batchPending, onCancelBatch, notice,
}) {
  const combine = mode === 'combine';
  const percentMode = operation === 'reinforcement';
  const isRisky = mode === 'over_enchant' || percentMode;
  const label = labelFor(mode);
  const icon = item => art(item) ? <img src={art(item)} alt="" draggable={false}/> : <Gem size={25} aria-hidden="true"/>;
  const slot = (which, item, caption, clear) =>
    <button type="button" className="axe-forge-flow-slot"
      onClick={() => item ? clear() : onFocusInventory(which)}
      onDragOver={event => event.preventDefault()}
      onDrop={event => onDropSlot(event, which)}
      title={item ? caption + ': ' + item.name + '. Click to clear.' : 'Select ' + caption.toLowerCase() + ' from inventory'}
      aria-label={item ? caption + ': ' + item.name + '. Click to remove.' : caption + ': empty. Choose from inventory.'}
      disabled={busy || batchBusy}>
      {item ? icon(item) : <span className="axe-forge-flow-empty" aria-hidden="true">+</span>}
      <small>{item?.name || caption}</small>
    </button>;

  return <section className="axe-blacksmith-workflow" aria-label={label + ' controls'}>
    {mode === 'enchant' && <div className="axe-forge-enchant-choices" role="group" aria-label="Enchant type">
      {[['percent', 'Enchant %'], ['slots', 'Enchant Slots']].map(([id, text]) =>
        <button type="button" key={id} aria-pressed={enchantMode === id}
          onClick={() => onChangeEnchantMode(id)} disabled={busy || batchBusy}>
          {text}
        </button>)}
    </div>}

    <div className="axe-forge-flow" aria-label="Two forge ingredient slots">
      {slot('target', target, 'Equipment', onClearTarget)}
      <span className="axe-forge-ingredient-plus" aria-hidden="true">+</span>
      {combine ? slot('donor', donor, 'Donor', onClearDonor)
        : <button type="button" className="axe-forge-flow-slot"
            disabled={busy || batchBusy || !requirements.length}
            onClick={() => onMaterial(requirements[0]?.[0] || '')}
            title="View required materials below"
            aria-label={selectedMaterial ? 'Materials: ' + selectedMaterial.name : 'Required material'}>
            {selectedMaterial ? <Gem size={25} aria-hidden="true"/> : <span className="axe-forge-flow-empty" aria-hidden="true">+</span>}
            <small>{selectedMaterial?.name || 'Materials'}</small>
          </button>}
    </div>

    <p className="axe-forge-current-item">
      {target ? <><strong>{target.name}</strong>
        <button type="button" disabled={busy || batchBusy} onClick={onClearTarget}>Clear</button></>
        : 'Choose equipment from Inventory'}
    </p>

    <div className="axe-forge-automation" aria-label="Automatic forge options">
      <label className="axe-forge-toggle">
        <input type="checkbox" checked={!!autoEnabled} disabled={busy || batchBusy}
          onChange={event => onToggleAuto(event.target.checked)}/>
        <span>{combine ? 'Auto-add matching donors' : 'Auto-' + label}</span>
      </label>
      {!combine && <>
        <label className="axe-forge-threshold">Stop below success rate
          <select aria-label="Minimum success rate" value={minSuccess}
            disabled={busy || batchBusy} onChange={event => onChangeThreshold(Number(event.target.value))}>
            {[100, 95, 90, 85, 80, 75, 70, 60, 50].map(n =>
              <option key={n} value={n}>{n}%</option>)}
          </select>
        </label>
        {isRisky && <label className="axe-forge-toggle">
          <input type="checkbox" checked={!!autoProtection} disabled={busy || batchBusy}
            onChange={event => onToggleProtection(event.target.checked)}/>
          <span>Use Stabilizers below limit</span>
        </label>}
      </>}
    </div>

    <div className="axe-forge-action-row">
      <button type="button" className="axe-forge-primary-action" onClick={onForge}
        disabled={busy || batchBusy || !canForge}>
        {busy ? 'Forging…' : confirmCombine ? 'Confirm Combine' : label}
      </button>
      {autoEnabled && (batchBusy
        ? <button type="button" className="axe-forge-stop" onClick={onStop}>Stop after current attempt</button>
        : <button type="button" onClick={onAuto} disabled={busy || !target}>Start Auto-{label}</button>)}
    </div>

    <details className="axe-forge-material-details">
      <summary>{combine ? 'Matching equipment (' + compatibleDonors.length + ')' : 'Required materials'}</summary>
      {!target && <p>Choose equipment in the inventory first.</p>}
      {target && combine && (compatibleDonors.length
        ? <div className="axe-forge-donor-list">{compatibleDonors.slice(0, 10).map(item =>
            <button type="button" key={item.instanceId}
              aria-pressed={donor?.instanceId === item.instanceId} disabled={busy || batchBusy}
              onClick={() => onSelectDonor(item)}>
              {item.name} <small>Lv. {item.itemLevel ?? item.level ?? 1}</small>
            </button>)}</div>
        : <p>No matching, unlocked donor available.</p>)}
      {target && !combine && (requirements.length
        ? requirements.map(([id, needed, owned]) =>
            <button type="button" key={id} className="axe-forge-required-item"
              aria-pressed={materialSelection === id} disabled={busy || batchBusy}
              onClick={() => onMaterial(id)}>
              <span>{display(id)}</span><strong className={owned < needed ? 'is-short' : ''}>{owned} / {needed}</strong>
            </button>)
        : <p>No additional materials required.</p>)}
    </details>

    {target && <details className="axe-forge-material-details axe-forge-chance-details">
      <summary>Upgrade chance and rules</summary>
      <p className="axe-forge-risk-note"><ShieldCheck size={14} aria-hidden="true"/>
        {percentMode
          ? 'Success: ' + pct(readout?.chance) + '. +5 points; a failure loses 3 points, never below 0%. Equipment never breaks.'
          : mode === 'enchant' ? 'Slot Enchant follows current rules and does not break equipment.'
            : combine ? 'Success: ' + pct(readout?.chance) + '. A successful Combine consumes the donor; failure retains the donor and stage.'
              : 'Success: ' + pct(readout?.chance) + '. Failure may fracture and reduce Over-Enchant. Unsafe attempts stop.'}
      </p>
    </details>}

    {batchPending && <div className="axe-forge-confirm" role="group" aria-label="Confirm automatic forging">
      <p>Run up to 12 sequential attempts? Materials may be consumed. Combine uses donors on success.</p>
      <button type="button" onClick={onAuto}>Confirm batch</button>
      <button type="button" onClick={onCancelBatch}>Cancel</button>
    </div>}
    <p className="axe-forge-workflow-notice" role="status" aria-live="polite">
      {notice || 'Uses only your owned items and materials.'}
    </p>
  </section>;
}
