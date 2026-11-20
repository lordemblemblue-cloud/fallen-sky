import { ShieldCheck, Swords, Gem, Package, Layers } from 'lucide-react';
import './AXEBlacksmithWorkflowPanel.css';

const art = item => item?.imageUrl || item?.iconUrl || item?.image || null;
const labelFor = mode => mode === 'combine' ? 'Combine'
  : mode === 'over_enchant' ? 'Over-Enchant' : 'Enchant';
const pct = chance => chance == null ? '—' : Math.round(Number(chance) * 1000) / 10 + '%';
const labelMaterial = id => String(id || '').replace(/^mat_/, '').replaceAll('_', ' ');
const targetLabel = (operation, value) => operation === 'reinforcement' ? value + '%'
  : operation === 'enchant' ? '+' + value + ' across slots'
  : '+' + value;
const progressTargets = operation => operation === 'reinforcement'
  ? [25, 50, 75, 100, 125, 150, 175, 200]
  : operation === 'enchant' ? [5, 10, 20, 30, 40]
    : operation === 'over_enchant' ? [1,2,3,4,5,6,7,8,9,10]
      : [1,2,3,4,5,6,8,10,12];

// The materials box represents ALL required stacks, not a single consumed
// stack. The existing gateway still validates and charges every actual cost.
export default function AXEBlacksmithWorkflowPanel({
  mode, operation = mode, enchantMode = 'percent', onChangeEnchantMode = () => {},
  target, donor, compatibleDonors = [], requirements = [],
  materialSelection = '', selectedMaterial = null, getMaterialName = labelMaterial,
  readout, canForge, confirmCombine, autoEnabled, onToggleAuto,
  autoProtection, onToggleProtection, minSuccess, onChangeThreshold,
  autoTarget, onChangeAutoTarget, onSelectDonor, onClearTarget, onClearDonor,
  onDropSlot, onMaterial, onFocusInventory = () => {},
  onForge, onAuto, onStop, busy, batchBusy, batchPending, onCancelBatch, notice,
}) {
  const combine = mode === 'combine';
  const materialsMissing = requirements.some(([,needed,owned]) => owned < needed);
  const risky = operation === 'reinforcement' || operation === 'over_enchant';
  const current = combine ? '+' + (readout?.combineStage ?? 0)
    : operation === 'reinforcement' ? (readout?.reinforcementPercent ?? 0) + '%'
      : operation === 'enchant' ? '+' + (readout?.enchantTotal ?? 0)
        : '+' + (readout?.overEnchantLevel ?? 0);
  const itemImage = (item, fallback) => art(item)
    ? <img src={art(item)} alt="" draggable={false}/>
    : fallback;

  const equipmentSlot = (kind, item, title, fallback) =>
    <button type="button" className="axe-forge-flow-slot" data-ingredient={kind}
      disabled={busy || batchBusy}
      onClick={() => item ? (kind === 'target' ? onClearTarget() : onClearDonor()) : onFocusInventory(kind)}
      onDragOver={event => event.preventDefault()}
      onDrop={event => onDropSlot(event, kind)}
      title={item ? 'Remove ' + item.name + ' from this slot' : 'Choose ' + title.toLowerCase() + ' from inventory'}
      aria-label={item ? title + ': ' + item.name + '. Click to remove.' : title + ': empty. Choose from inventory.'}>
      <span className="axe-forge-flow-slot-art">
        {item ? itemImage(item, fallback) : fallback}
      </span>
      <strong>{item?.name || title}</strong>
      {item && <small>Lv {item.itemLevel ?? item.level ?? 1}</small>}
    </button>;

  return <section className="axe-blacksmith-workflow" data-blacksmith-two-slot="true"
    aria-label={labelFor(mode) + ' forge workstation'}>
    <header className="axe-forge-workflow-header">
      <span>Blacksmith · Equipment</span>
      <h3>{labelFor(mode)}</h3>
      <small>{!target ? 'Select equipment from Inventory to begin.'
        : mode === 'combine' ? 'Choose matching equipment for the second slot.'
          : 'Supply the required materials and start the upgrade.'}</small>
    </header>

    {mode === 'enchant' && <div className="axe-forge-enchant-modes" role="group" aria-label="Enchant method">
      <button type="button" aria-pressed={enchantMode === 'percent'}
        disabled={busy || batchBusy} onClick={() => onChangeEnchantMode('percent')}>
        Enchant %
      </button>
      <button type="button" aria-pressed={enchantMode === 'slots'}
        disabled={busy || batchBusy} onClick={() => onChangeEnchantMode('slots')}>
        4 Enchant Slots
      </button>
    </div>}

    <div className="axe-forge-flow" aria-label="Two forge ingredients">
      {equipmentSlot('target', target, 'Equipment', <Swords size={35} aria-hidden="true"/>)}
      <span className="axe-forge-ingredient-plus" aria-hidden="true">+</span>
      {combine ? equipmentSlot('donor', donor, 'Donor Equipment', <Layers size={35} aria-hidden="true"/>)
        : <button type="button" data-ingredient="materials" className="axe-forge-flow-slot"
            disabled={busy || batchBusy} onClick={() => {
              onMaterial(requirements[0]?.[0] || '');
              onFocusInventory('materials');
            }} title="Select materials from inventory" aria-label="Required upgrade materials">
            <span className="axe-forge-flow-slot-art">
              {selectedMaterial ? <Gem size={35} aria-hidden="true"/> : <Package size={35} aria-hidden="true"/>}
            </span>
            <strong>{selectedMaterial?.name || 'Materials'}</strong>
            <small>{requirements.length ? requirements.length + ' required resource' + (requirements.length === 1 ? '' : 's')
              : 'No material cost'}</small>
          </button>}
    </div>

    {combine ? <div className="axe-forge-ingredients" aria-label="Eligible donor equipment">
      {target && <label>Matching donor
        <select value={donor?.instanceId || ''} disabled={busy || batchBusy}
          onChange={event => {
            const item = compatibleDonors.find(entry => entry.instanceId === event.target.value);
            if (item) onSelectDonor(item);
            else onClearDonor();
          }}>
          <option value="">Choose a matching item</option>
          {compatibleDonors.map(item => <option key={item.instanceId} value={item.instanceId}>
            {item.name} · Lv {item.itemLevel ?? item.level ?? 1}
          </option>)}
        </select>
      </label>}
      {target && !compatibleDonors.length && <small>No eligible unequipped donor equipment.</small>}
    </div> : <div className="axe-forge-ingredients" aria-label="Material costs">
      {target ? (requirements.length ? requirements.map(([id, needed, owned]) =>
        <button key={id} type="button" className="axe-forge-required-item"
          disabled={busy || batchBusy} aria-pressed={materialSelection === id}
          onClick={() => onMaterial(id)}>
          <span>{getMaterialName(id)}</span>
          <strong className={owned < needed ? 'is-short' : ''}>{owned} / {needed}</strong>
        </button>) : <small>No extra materials required.</small>) : <small>Material costs appear after selecting equipment.</small>}
    </div>}

    <div className="axe-forge-action-row">
      <button type="button" className="axe-forge-primary-action"
        onClick={onForge} disabled={!canForge || busy || batchBusy} aria-busy={busy}>
        {busy ? 'Processing…' : confirmCombine ? 'Confirm Combine'
          : labelFor(mode)}
      </button>
    </div>
    {target && <div className="axe-forge-quick-status">
      <span>{current} · Success {pct(readout?.chance)}</span>
      {materialsMissing && <span className="axe-forge-shortfall">More materials required</span>}
    </div>}

    <div className="axe-forge-automation">
      <label className="axe-forge-toggle">
        <input type="checkbox" checked={autoEnabled} disabled={busy || batchBusy}
          onChange={event => onToggleAuto(event.target.checked)}/>
        <span>Auto-{labelFor(mode)}</span>
      </label>
      {autoEnabled && <>
        <label className="axe-forge-threshold">Upgrade until
          <select aria-label="Automatic forge target" value={autoTarget}
            onChange={event => onChangeAutoTarget(Number(event.target.value))}
            disabled={busy || batchBusy}>
            {progressTargets(operation).map(value =>
              <option key={value} value={value}>{targetLabel(operation, value)}</option>)}
          </select>
        </label>
        <label className="axe-forge-threshold">Stop if chance below
          <select aria-label="Minimum success rate" value={minSuccess}
            disabled={busy || batchBusy}
            onChange={event => onChangeThreshold(Number(event.target.value))}>
            {[100,95,90,85,80,75,70,60,50,30,0].map(value=>
              <option key={value} value={value}>{value}%</option>)}
          </select>
        </label>
        {risky && <label className="axe-forge-toggle">
          <input type="checkbox" checked={autoProtection} disabled={busy || batchBusy}
            onChange={event => onToggleProtection(event.target.checked)}/>
          <span>Use Stabilizers when needed</span>
        </label>}
        <p className="axe-forge-batch-warning">
          Up to 12 attempts per confirmed batch. Each attempt uses the real costs and chance;
          stop when the target is reached, resources run out, or the risk limit applies.
        </p>
        {batchBusy
          ? <button type="button" className="axe-forge-secondary-action" onClick={onStop}>
              Stop after current attempt
            </button>
          : <button type="button" className="axe-forge-secondary-action"
              onClick={onAuto} disabled={busy || !target || !canForge && !batchPending}>
              Start Auto-{labelFor(mode)}
            </button>}
      </>}
    </div>
    {target && <p className="axe-forge-risk-note"><ShieldCheck size={15} aria-hidden="true"/>
      {operation === 'reinforcement'
        ? 'Each success adds 5%. Failure loses 3 points but never breaks the item.'
        : combine
          ? 'On success the donor is consumed. Failure keeps the donor and the combine stage.'
          : operation === 'enchant'
            ? 'Each slot upgrades toward +10. Equipment stays intact.'
            : 'Unprotected failure can fracture and lower Over-Enchant.'}
    </p>}
    {batchPending && <div className="axe-forge-confirm" role="group" aria-label="Confirm automatic forging">
      <p>Confirm up to 12 real upgrade attempts toward {targetLabel(operation,autoTarget)}?
        {combine ? ' Successful combines consume donors.' : ' Materials are consumed on attempts.'}</p>
      <button type="button" onClick={onAuto}>Confirm Auto-Forge</button>
      <button type="button" onClick={onCancelBatch}>Cancel</button>
    </div>}
    <p className="axe-forge-workflow-notice" role="status" aria-live="polite">
      {notice || 'Choose equipment and materials from Inventory. Nothing is consumed until forging.'}
    </p>
  </section>;
}
