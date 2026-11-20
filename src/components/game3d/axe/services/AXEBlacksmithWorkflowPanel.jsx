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

// Only the two slots, their plus sign and direct actions live above the original
// result circle. Inventory, result history, safety and transaction authority stay
// in their existing owners; no extra operation subpages or enclosing card.
export default function AXEBlacksmithWorkflowPanel({
  mode, operation=mode, target, donor, requirements=[],
  selectedMaterial=null, readout, canForge, confirmCombine,
  autoEnabled, onToggleAuto, autoTarget, onChangeAutoTarget,
  onClearTarget, onClearDonor, onDropSlot, onFocusInventory=()=>{},
  onForge, onAuto, busy, batchBusy, batchPending, onCancelBatch,
  overReady=true, maxEnchantPercent=null,
}) {
  const combine=mode==='combine';
  const label=titleFor(mode,operation);
  const missing=mode==='over_enchant'&&!overReady;
  const resourceMissing=requirements.some(([,needed,owned])=>owned<needed);
  void readout;
  const ingredient=(kind,item,title,Icon,callback) =>
    <button type="button" className="axe-forge-flow-slot" data-ingredient={kind}
      disabled={busy||batchBusy} onClick={()=>item?callback():onFocusInventory(kind)}
      onDragOver={event=>event.preventDefault()} onDrop={event=>onDropSlot(event,kind)}
      aria-label={item?title+': '+item.name+'. Click to remove.':title+': empty. Choose from inventory.'}
      title={item?'Remove '+item.name:'Choose '+title.toLowerCase()}>
      {item ? (art(item) ? <img src={art(item)} alt="" draggable={false}/>
        : <Icon size={24} aria-hidden="true"/>)
        : <span className="axe-forge-empty-plus" aria-hidden="true">+</span>}
      <small>{item?.name || title}</small>
    </button>;

  return <section className="axe-blacksmith-workflow" data-blacksmith-two-slot="true"
    aria-label={label+' equipment forge'}>
    <div className="axe-forge-flow" aria-label="Equipment plus ingredient">
      {ingredient('target',target,'Equipment',Gem,onClearTarget)}
      <span className="axe-forge-ingredient-plus" aria-hidden="true">+</span>
      {combine ? ingredient('donor',donor,'Donor',Layers,onClearDonor)
        : <button type="button" className="axe-forge-flow-slot" data-ingredient="materials"
            disabled={busy||batchBusy} onClick={()=>onFocusInventory('materials')}
            onDragOver={event=>event.preventDefault()} onDrop={event=>onDropSlot(event,'materials')}
            title="Choose an upgrade material from inventory" aria-label="Upgrade material slot">
            {selectedMaterial?<Gem size={24} aria-hidden="true"/>
              :<span className="axe-forge-empty-plus" aria-hidden="true">+</span>}
            <small>{selectedMaterial?.name || 'Materials'}</small>
          </button>}
    </div>
    <div className="axe-forge-inline-actions">
      <button type="button" className="axe-forge-primary-action" onClick={onForge}
        disabled={busy||batchBusy||!canForge||resourceMissing} aria-busy={busy}>
        {busy?'Forging…':confirmCombine?'Confirm Combine':label}
      </button>
      <label className="axe-forge-auto-toggle">
        <input type="checkbox" checked={autoEnabled} disabled={busy||batchBusy}
          onChange={event=>onToggleAuto(event.target.checked)}/>
        Auto {label}
      </label>
    </div>
    {autoEnabled&&<div className="axe-forge-compact-auto" aria-label="Automatic forge controls">
      <label>Target
        <select value={autoTarget} aria-label="Automatic forge target"
          disabled={busy||batchBusy} onChange={event=>onChangeAutoTarget(Number(event.target.value))}>
          {targetsFor(operation).map(value=><option value={value} key={value}>
            {titleTarget(operation,value)}</option>)}
        </select>
      </label>
      <button type="button" disabled={busy||batchBusy||!target||!canForge}
        onClick={onAuto}>Start Auto</button>
    </div>}
    {missing&&<small className="axe-forge-locked"><LockKeyhole size={14} aria-hidden="true"/>
      Requires {maxEnchantPercent}% standard Enchant first.</small>}
    {batchPending&&<div className="axe-forge-confirm" aria-label="Confirm automatic forging">
      <p>Up to 12 paid attempts toward {titleTarget(operation,autoTarget)}.
        {combine?' Matching donors are consumed on success.':''}</p>
      <button type="button" onClick={onAuto}>Confirm Auto-Forge</button>
      <button type="button" onClick={onCancelBatch}>Cancel</button>
    </div>}
  </section>;
}
