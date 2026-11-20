import { Gem, Layers, LockKeyhole } from 'lucide-react';
import './AXEBlacksmithWorkflowPanel.css';

const art = item => item?.imageUrl || item?.iconUrl || item?.image || null;
const titleFor = (mode, operation) => mode === 'combine' ? 'Combine'
  : mode === 'over_enchant' ? 'Over-Enchant'
    : operation === 'enchant' ? 'Enchant Slots' : 'Enchant';
const titleTarget = (operation, value) => operation === 'reinforcement' ? value + '%'
  : operation === 'enchant' ? '+' + value + ' across slots' : '+' + value;
const targetsFor = operation => operation === 'reinforcement'
  ? [25,50,75,100,125,150,175,200]
  : operation === 'enchant' ? [5,10,20,30,40]
    : operation === 'over_enchant' ? [1,2,3,4,5,6,7,8,9,10]
      : [1,2,3,4,5,6,8,10,12];

/**
 * A single UNBOXED forge work area, to the right of the equipment circle.
 * The former left-column "Inventory Forge" section is removed completely.
 * Inventory and operation navigation are in AXEBlacksmithImageWorkspace.
 * Keep live item/material selection, Combine donors, Auto, safety, and confirmations.
 */
export default function AXEBlacksmithWorkflowPanel({
  mode, operation=mode, enchantMode='percent', onChangeEnchantMode=()=>{},
  target, donor, compatibleDonors=[], requirements=[], materialSelection='',
  selectedMaterial=null, getMaterialName=id=>String(id).replaceAll('_',' '),
  canForge, confirmCombine, autoEnabled, onToggleAuto,
  autoProtection=false, onToggleProtection=()=>{}, minSuccess=90, onChangeThreshold=()=>{},
  autoTarget, onChangeAutoTarget, onSelectDonor=()=>{}, onMaterial=()=>{},
  onClearTarget, onClearDonor, onDropSlot, onFocusInventory=()=>{},
  onForge, onAuto, onStop=()=>{}, busy, batchBusy, batchPending, onCancelBatch,
  notice, overReady=true, maxEnchantPercent=null,
}) {
  const combine = mode === 'combine';
  const label = titleFor(mode, operation);
  const missing = mode === 'over_enchant' && !overReady;
  const resourceMissing = requirements.some(([, needed, owned]) => owned < needed);
  const ingredient = (kind, item, caption, Icon, clear) =>
    <button type="button" className="axe-forge-flow-slot" data-ingredient={kind}
      disabled={busy || batchBusy}
      onClick={() => item ? clear() : onFocusInventory(kind)}
      onDragOver={event => event.preventDefault()}
      onDrop={event => onDropSlot(event, kind)}
      title={item ? 'Remove ' + item.name : 'Choose ' + caption.toLowerCase() + ' from inventory'}
      aria-label={item ? caption + ': ' + item.name + '. Click to remove.'
        : caption + ': empty. Choose from inventory.'}>
      {item ? (art(item) ? <img src={art(item)} alt="" draggable={false}/>
        : <Icon size={24} aria-hidden="true"/>)
        : <span className="axe-forge-empty-plus" aria-hidden="true">+</span>}
      <small>{item?.name || caption}</small>
    </button>;

  return <section className="axe-blacksmith-workflow" data-blacksmith-two-slot="true"
    aria-label={label + ' equipment and materials controls'}>
    {/* These are the ONLY two ingredient squares, below the operation row
        and to the RIGHT of the visible equipped-item circle. */}
    <div className="axe-forge-flow" aria-label="Equipment plus material or donor">
      {ingredient('target', target, 'Equipment', Gem, onClearTarget)}
      <span className="axe-forge-ingredient-plus" aria-hidden="true">+</span>
      {combine ? ingredient('donor', donor, 'Donor', Layers, onClearDonor)
        : <button type="button" className="axe-forge-flow-slot" data-ingredient="materials"
            disabled={busy || batchBusy}
            onClick={() => onFocusInventory('materials')}
            onDragOver={event => event.preventDefault()}
            onDrop={event => onDropSlot(event, 'materials')}
            title="Choose required upgrade materials from inventory"
            aria-label={selectedMaterial ? 'Material: ' + selectedMaterial.name : 'Material: empty. Choose from inventory.'}>
            {selectedMaterial ? <Gem size={24} aria-hidden="true"/>
              : <span className="axe-forge-empty-plus" aria-hidden="true">+</span>}
            <small>{selectedMaterial?.name || 'Materials'}</small>
          </button>}
    </div>

    {mode === 'enchant' && <div className="axe-forge-enchant-choices"
      role="group" aria-label="Enchant type">
      {[['percent','Enchant %'], ['slots','4 Enchant Slots']].map(([id, text]) =>
        <button type="button" key={id} aria-pressed={enchantMode === id}
          disabled={busy || batchBusy} onClick={() => onChangeEnchantMode(id)}>{text}</button>)}
    </div>}

    <p className="axe-forge-selected-line">
      {target ? <><strong>{target.name}</strong>
        <button type="button" onClick={onClearTarget} disabled={busy || batchBusy}>Clear</button></>
        : 'Select equipment from Inventory'}
    </p>

    {/* Plain settings underneath the squares — not another bordered box. */}
    <div className="axe-forge-options" aria-label="Forge options">
      <label className="axe-forge-auto-toggle">
        <input type="checkbox" checked={!!autoEnabled} disabled={busy || batchBusy}
          onChange={event => onToggleAuto(event.target.checked)}/>
        Auto {label}
      </label>
      {autoEnabled && <label className="axe-forge-auto-target">Auto target
        <select value={autoTarget} aria-label="Automatic forge target"
          disabled={busy || batchBusy} onChange={event => onChangeAutoTarget(Number(event.target.value))}>
          {targetsFor(operation).map(value => <option value={value} key={value}>
            {titleTarget(operation, value)}</option>)}
        </select>
      </label>}
      {autoEnabled && <details className="axe-forge-safety">
        <summary>Auto safety options</summary>
        <label>Stop below success rate
          <select aria-label="Minimum success rate" value={minSuccess}
            disabled={busy || batchBusy} onChange={event => onChangeThreshold(Number(event.target.value))}>
            {[100,95,90,85,80,75,70,60,50,30,0].map(n =>
              <option key={n} value={n}>{n}%</option>)}
          </select>
        </label>
        {['reinforcement', 'over_enchant'].includes(operation) && <label>
          <input type="checkbox" checked={!!autoProtection} disabled={busy || batchBusy}
            onChange={event => onToggleProtection(event.target.checked)}/>
          Use Stabilizers at high risk
        </label>}
      </details>}
      {missing && <small className="axe-forge-locked"><LockKeyhole size={14} aria-hidden="true"/>
        Requires {maxEnchantPercent}% standard Enchant first.</small>}
    </div>

    {/* Primary operation comes BELOW Auto and the related choices. */}
    <div className="axe-forge-action-row">
      <button type="button" className="axe-forge-primary-action"
        disabled={busy || batchBusy || !canForge || resourceMissing} onClick={onForge}
        aria-busy={!!busy}>
        {busy ? 'Forging…' : confirmCombine ? 'Confirm Combine' : label}
      </button>
      {autoEnabled && (batchBusy
        ? <button type="button" className="axe-forge-stop" onClick={onStop}>Stop after current attempt</button>
        : <button type="button" disabled={busy || !target || !canForge} onClick={onAuto}>Start Auto {label}</button>)}
    </div>

    {/* Keep the existing donor/material selectors, without taking up space as
        permanent cards. Inventory selection and drag/drop remain available. */}
    <details className="axe-forge-material-details">
      <summary>{combine ? 'Matching donors (' + compatibleDonors.length + ')' : 'Material requirements'}</summary>
      {!target && <p>Choose equipment in Inventory first.</p>}
      {target && combine && (compatibleDonors.length
        ? <div className="axe-forge-donor-list">{compatibleDonors.slice(0, 8).map(item =>
            <button type="button" key={item.instanceId} disabled={busy || batchBusy}
              aria-pressed={donor?.instanceId === item.instanceId}
              onClick={() => onSelectDonor(item)}>{item.name}
              <small>Lv. {item.itemLevel ?? item.level ?? 1}</small>
            </button>)}</div>
        : <p>No compatible owned donor available.</p>)}
      {target && !combine && (requirements.length ? requirements.map(([id, needed, owned]) =>
        <button type="button" className="axe-forge-required-item" key={id}
          aria-pressed={materialSelection === id} disabled={busy || batchBusy}
          onClick={() => onMaterial(id)}>
          <span>{getMaterialName(id)}</span>
          <strong className={owned < needed ? 'is-short' : ''}>{owned}/{needed}</strong>
        </button>) : <p>No materials required.</p>)}
    </details>

    {batchPending && <div className="axe-forge-confirm" role="group" aria-label="Confirm automatic forging">
      <p>Up to 12 paid attempts toward {titleTarget(operation, autoTarget)}.
        {combine ? ' Matching donors are consumed on success.' : ''}</p>
      <button type="button" onClick={onAuto}>Confirm Auto-Forge</button>
      <button type="button" onClick={onCancelBatch}>Cancel</button>
    </div>}
    <p className="axe-forge-workflow-notice" role="status" aria-live="polite">
      {notice || 'Choose owned equipment and materials from Inventory.'}
    </p>
  </section>;
}
