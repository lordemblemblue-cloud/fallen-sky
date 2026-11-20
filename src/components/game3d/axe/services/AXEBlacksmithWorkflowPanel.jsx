import {Swords, Gem, Package, Layers, LockKeyhole} from 'lucide-react';
import './AXEBlacksmithWorkflowPanel.css';

const art = item => item?.imageUrl || item?.iconUrl || item?.image || null;
const titleFor = (mode, operation) => mode === 'combine' ? 'Combine'
  : mode === 'over_enchant' ? 'Over-Enchant'
    : operation === 'enchant' ? 'Enchant Slots' : 'Enchant';
const titleTarget = (operation,value) => operation === 'reinforcement' ? value+'%'
  : operation === 'enchant' ? '+'+value+' across slots' : '+'+value;
const targetsFor = operation => operation === 'reinforcement'
  ? [25,50,75,100,125,150,175,200]
  : operation === 'enchant' ? [5,10,20,30,40]
    : operation === 'over_enchant' ? [1,2,3,4,5,6,7,8,9,10]
      : [1,2,3,4,5,6,8,10,12];
const shown = item => item?.name || 'Equipment';

// This is the compact ingredient/primary-action view ONLY. The circle shows
// the outcome; the separate right overlay logs attempts. Nothing in this view
// creates materials or processes an unconfirmed transaction.
export default function AXEBlacksmithWorkflowPanel({
  mode, operation=mode, target, donor, compatibleDonors=[], requirements=[],
  materialSelection='', selectedMaterial=null, getMaterialName=id=>String(id).replaceAll('_',' '),
  readout, canForge, confirmCombine, autoEnabled, onToggleAuto,
  autoTarget, onChangeAutoTarget, onSelectDonor, onClearTarget, onClearDonor,
  onDropSlot, onMaterial, onFocusInventory=()=>{}, onForge, onAuto,
  busy, batchBusy, batchPending, onCancelBatch, overReady=true, maxEnchantPercent=null,
}) {
  const combine=mode==='combine';
  const label=titleFor(mode,operation);
  const missing=mode==='over_enchant'&&!overReady;
  const resourceMissing=requirements.some(([,needed,owned])=>owned<needed);
  const ingredient=(kind,item,title,Icon,callback) =>
    <button type="button" className="axe-forge-flow-slot" data-ingredient={kind}
      disabled={busy||batchBusy} onClick={()=>item?callback():onFocusInventory(kind)}
      onDragOver={event=>event.preventDefault()} onDrop={event=>onDropSlot(event,kind)}
      aria-label={item?title+': '+item.name+'. Click to remove.':title+': empty. Choose from inventory.'}
      title={item?'Remove '+item.name:'Choose '+title.toLowerCase()}>
      {art(item)?<img src={art(item)} alt="" draggable={false}/>:<Icon size={24} aria-hidden="true"/>}
      <span>{item?.name || title}</span>
    </button>;
  return <section className="axe-blacksmith-workflow" data-blacksmith-two-slot="true"
    aria-label={label+' equipment forge'}>
    <header className="axe-forge-workflow-header">
      <h3>{label}</h3>
      <small>{missing?'Requires '+maxEnchantPercent+'% Enchant'
        :combine?'Combine a matching owned weapon or gear piece'
          :'The material you choose determines the enchant method'}</small>
    </header>
    <div className="axe-forge-flow" aria-label="Equipment plus ingredient">
      {ingredient('target',target,'Equipment',Swords,onClearTarget)}
      <span className="axe-forge-ingredient-plus" aria-hidden="true">+</span>
      {combine ? ingredient('donor',donor,'Donor',Layers,onClearDonor)
        : <button type="button" className="axe-forge-flow-slot" data-ingredient="materials"
            disabled={busy||batchBusy} onClick={()=>onFocusInventory('materials')}
            onDragOver={event=>event.preventDefault()} onDrop={event=>onDropSlot(event,'materials')}
            title="Choose an upgrade material from inventory" aria-label="Upgrade material slot">
            {selectedMaterial?<Gem size={24} aria-hidden="true"/>:<Package size={24} aria-hidden="true"/>}
            <span>{selectedMaterial?.name || 'Materials'}</span>
          </button>}
    </div>
    {combine && target && <label className="axe-forge-donor-picker">Matching donor
      <select value={donor?.instanceId||''} disabled={busy||batchBusy}
        aria-label="Matching equipment donor"
        onChange={event=>{
          const item=compatibleDonors.find(entry=>entry.instanceId===event.target.value);
          if(item)onSelectDonor(item);else onClearDonor();
        }}>
        <option value="">Choose equipment</option>
        {compatibleDonors.map(item=><option key={item.instanceId} value={item.instanceId}>
          {shown(item)} · Lv {item.itemLevel??item.level??1}
        </option>)}
      </select>
    </label>}
    {!combine && target && <div className="axe-forge-material-cost" aria-label="Required materials">
      {requirements.length?requirements.map(([id,needed,owned])=>
        <button type="button" key={id} disabled={busy||batchBusy}
          aria-pressed={materialSelection===id} onClick={()=>onMaterial(id)}>
          <span>{getMaterialName(id)}</span>
          <b className={owned<needed?'is-short':''}>{owned}/{needed}</b>
        </button>):<small>No materials required.</small>}
    </div>}
    {missing&&<p className="axe-forge-locked"><LockKeyhole size={14} aria-hidden="true"/>
      Reach the maximum standard enchantment on this equipment first.</p>}
    <button type="button" className="axe-forge-primary-action" onClick={onForge}
      disabled={busy||batchBusy||!canForge||resourceMissing} aria-busy={busy}>
      {busy?'Forging…':confirmCombine?'Confirm Combine':label}
    </button>
    <div className="axe-forge-compact-auto" aria-label="Automatic forge controls">
      <label><input type="checkbox" checked={autoEnabled}
        disabled={busy||batchBusy} onChange={event=>onToggleAuto(event.target.checked)}/>
        Auto-{label}
      </label>
      {autoEnabled&&<>
        <label>Target
          <select value={autoTarget} aria-label="Automatic forge target"
            disabled={busy||batchBusy} onChange={event=>onChangeAutoTarget(Number(event.target.value))}>
            {targetsFor(operation).map(value=><option value={value} key={value}>
              {titleTarget(operation,value)}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy||batchBusy||!target||!canForge}
          onClick={onAuto}>Start Auto</button>
      </>}
    </div>
    {batchPending&&<div className="axe-forge-confirm" aria-label="Confirm automatic forging">
      <p>Up to 12 paid attempts toward {titleTarget(operation,autoTarget)}.
        {combine?' Matching donors are consumed on success.':''}</p>
      <button type="button" onClick={onAuto}>Confirm Auto-Forge</button>
      <button type="button" onClick={onCancelBatch}>Cancel</button>
    </div>}
  </section>;
}
