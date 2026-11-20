import { Gem, Layers, LockKeyhole, Zap } from 'lucide-react';
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
  mode, operation=mode, enchantMode='percent', onChangeEnchantMode=()=>{}, onChangeMode=()=>{},
  target, donor, compatibleDonors=[], requirements=[], materialSelection='',
  selectedMaterial=null, getMaterialName=id=>String(id).replaceAll('_',' '),
  readout, canForge, confirmCombine, autoEnabled, onToggleAuto,
  autoProtection=false, onToggleProtection=()=>{}, minSuccess=90, onChangeThreshold=()=>{},
  autoTarget, onChangeAutoTarget, onSelectDonor=()=>{}, onMaterial=()=>{},
  onClearTarget, onClearDonor, onDropSlot, onFocusInventory=()=>{},
  onForge, onAuto, onStop=()=>{}, busy, batchBusy, batchPending, onCancelBatch,
  notice, overReady=true, maxEnchantPercent=null,
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

  return <><section className="axe-blacksmith-workflow" data-blacksmith-two-slot="true"
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
  </section>
  <section className="axe-blacksmith-inventory-forge" aria-label={label+' inventory forge'}>
    <header className="axe-forge-workflow-header">
      <span>Inventory Forge</span><h3>{label}</h3>
      <small>Right-click an owned item to place it here.</small>
    </header>
    <nav className="axe-forge-mode-boxes" aria-label="Inventory forge modes">
      {['enchant','over_enchant','combine'].map(id=><button type="button"
        className="axe-forge-mode-box" key={id} aria-pressed={mode===id}
        onClick={()=>onChangeMode(id)} disabled={busy||batchBusy}>
        {id==='combine'?<Layers size={19} aria-hidden="true"/>:
          id==='over_enchant'?<Zap size={19} aria-hidden="true"/>:
            <Gem size={19} aria-hidden="true"/>}
        <span>{id==='over_enchant'?'Over-Enchant':id==='combine'?'Combine':'Enchant'}</span>
      </button>)}
    </nav>
    {mode==='enchant'&&<div className="axe-forge-mode-boxes axe-forge-enchant-modes"
      role="group" aria-label="Enchant type">
      {[['percent','Enchant % (0–200)'],['slots','Slots (4 × +10)']].map(([id,text])=>
        <button type="button" key={id} className="axe-forge-mode-box"
          aria-pressed={enchantMode===id} disabled={busy||batchBusy}
          onClick={()=>onChangeEnchantMode(id)}>{text}</button>)}
    </div>}
    <div className="axe-forge-selected" aria-label="Selected equipment">
      <div className="axe-forge-selected-art">
        {target?(art(target)?<img src={art(target)} alt="" draggable={false}/>:
          <Gem size={22} aria-hidden="true"/>):<Layers size={22} aria-hidden="true"/>}
      </div>
      <div><strong>{target?.name||'No equipment selected'}</strong>
        <small>{target?'Lv. '+(target.itemLevel??target.level??1)+' · '+(target.rarity??target.tier??'Equipment')
          :'Choose an item from Inventory'}</small></div>
      {target&&<button type="button" className="axe-forge-clear" onClick={onClearTarget}
        aria-label="Remove selected equipment" disabled={busy||batchBusy}>×</button>}
    </div>
    <div className="axe-forge-help-items">
      <h4>{mode==='combine'?'Matching equipment ('+compatibleDonors.length+')':'Required materials'}</h4>
      {!target&&<p>Select equipment from Inventory.</p>}
      {target&&mode==='combine'&&(compatibleDonors.length?<div className="axe-forge-donor-list">
        {compatibleDonors.slice(0,8).map(item=><button type="button" key={item.instanceId}
          aria-pressed={donor?.instanceId===item.instanceId} disabled={busy||batchBusy}
          onClick={()=>onSelectDonor(item)}>
          <span>{item.name}</span><small>Lv. {item.itemLevel??item.level??1}</small>
        </button>)}
      </div>:<p>No matching owned donor available.</p>)}
      {target&&mode!=='combine'&&(requirements.length?requirements.map(([id,needed,owned])=>
        <button type="button" className="axe-forge-required-item" key={id}
          aria-pressed={materialSelection===id} disabled={busy||batchBusy}
          onClick={()=>onMaterial(id)}><span>{getMaterialName(id)}</span>
          <strong className={owned<needed?'is-short':''}>{owned}/{needed}</strong>
        </button>):<p>No materials required.</p>)}
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
    {autoEnabled&&<details className="axe-forge-safety">
      <summary>Auto safety</summary>
      <label>Stop below success rate
        <select aria-label="Minimum success rate" value={minSuccess}
          disabled={busy||batchBusy} onChange={event=>onChangeThreshold(Number(event.target.value))}>
          {[100,95,90,85,80,75,70,60,50,30,0].map(n=>
            <option key={n} value={n}>{n}%</option>)}
        </select>
      </label>
      {['reinforcement','over_enchant'].includes(operation)&&<label>
        <input type="checkbox" checked={autoProtection} disabled={busy||batchBusy}
          onChange={event=>onToggleProtection(event.target.checked)}/>
        Use Stabilizers at high risk
      </label>}
      {batchBusy&&<button type="button" onClick={onStop}>Stop after current attempt</button>}
    </details>}
    {batchPending&&<div className="axe-forge-confirm" aria-label="Confirm automatic forging">
      <p>Up to 12 paid attempts toward {titleTarget(operation,autoTarget)}.
        {combine?' Matching donors are consumed on success.':''}</p>
      <button type="button" onClick={onAuto}>Confirm Auto-Forge</button>
      <button type="button" onClick={onCancelBatch}>Cancel</button>
    </div>}
    <p className="axe-forge-workflow-notice" role="status" aria-live="polite">
      {notice||'Select equipment and materials from Inventory.'}
    </p>
  </section></>;
}
