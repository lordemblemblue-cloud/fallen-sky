import { useMemo, useState } from 'react';
import { Layers, Shield, Swords, Package, SlidersHorizontal } from 'lucide-react';
import { getAXEAdvancementState } from '../equipment/AXEItemAdvancementStore';
import { getAXEServiceEligibility } from './AXEServiceEligibility';
import { isAXECompatibleDonor } from './AXEServiceWorkspaceModel';
import './AXECombineInventoryPane.css';

const artOf = item => item?.imageUrl || item?.iconUrl || item?.image || null;
const iconFor = item => item?.slot === 'weapon' ? <Swords size={21}/> :
  ['helm','chest','gloves','legs','boots'].includes(item?.slot) ? <Shield size={21}/> : <Package size={21}/>;

export default function AXECombineInventoryPane({ items, selectedId, donorId, onTarget, onDonor }) {
  const [type,setType] = useState('All');
  const [rarity,setRarity] = useState('All');
  const target = items.find(item=>item.instanceId===selectedId) || null;
  const stage = target ? getAXEAdvancementState(target.instanceId) : {};
  const candidates = useMemo(() => target
    ? items.filter(item => item.instanceId !== selectedId && isAXECompatibleDonor(target,item,stage))
    : [], [items,selectedId,stage.combine?.count]);
  const owned = useMemo(() => items.filter(item => getAXEServiceEligibility('combine',item).eligible),[items]);
  const filtered = owned.filter(item => (type === 'All' || (item.slot || item.category) === type)
    && (rarity === 'All' || String(item.rarity || item.tier || '').toLowerCase() === rarity));
  const types = [...new Set(owned.map(item => item.slot || item.category).filter(Boolean))];
  const rarities = [...new Set(owned.map(item => String(item.rarity || item.tier || '').toLowerCase()).filter(Boolean))];

  const itemButton = (item, role) => <button type="button" key={item.instanceId}
    className="axe-combine-inventory-item" aria-pressed={(role==='donor'?donorId:selectedId)===item.instanceId}
    draggable={true} onDragStart={event => {
      event.dataTransfer.setData('application/x-axe-owned-equipment',item.instanceId);
      event.dataTransfer.setData('text/plain',item.instanceId);
      event.dataTransfer.effectAllowed='copy';
    }}
    title={(role==='donor' ? 'Matching donor: ' : 'Select target: ') + item.name}
    onClick={()=>role==='donor'?onDonor(item):onTarget(item)}>
    {artOf(item)?<img src={artOf(item)} alt=""/>:iconFor(item)}
    <small>{item.name || item.instanceId}</small>
    {item.instanceId===donorId && role==='donor' && <em>Donor</em>}
    {item.instanceId===selectedId && role==='target' && <em>Target</em>}
  </button>;

  return <section className="axe-combine-inventory" aria-label="Combine Stage equipment inventory">
    <div className="axe-combine-compatible" aria-label="Compatible Combine Stage donors">
      <div className="axe-combine-inventory-title"><Layers size={15}/> Compatible</div>
      <p>{target ? 'For '+target.name : 'Select your target from inventory'}</p>
      <small>{candidates.length} available</small>
      <div className="axe-combine-compatible-grid">
        {candidates.length ? candidates.map(item=>itemButton(item,'donor'))
          : <p>{target ? 'No matching unlocked, unequipped donors owned.' : 'Compatible items appear here after you choose a target.'}</p>}
      </div>
    </div>
    <div className="axe-combine-owned" aria-label="Owned equipment for Combine Stage">
      <div className="axe-combine-inventory-title"><Package size={16}/> Equipment Inventory <small>{owned.length} owned</small></div>
      <div className="axe-combine-inventory-filters">
        <SlidersHorizontal size={13}/>
        <select aria-label="Filter equipment slot" value={type} onChange={event=>setType(event.target.value)}>
          <option value="All">All equipment</option>
          {types.map(value=><option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Filter equipment rarity" value={rarity} onChange={event=>setRarity(event.target.value)}>
          <option value="All">All rarities</option>
          {rarities.map(value=><option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      <p>Choose the item to combine; compatible copies appear on the left.</p>
      <div className="axe-combine-owned-grid">
        {filtered.length ? filtered.map(item=>itemButton(item,'target')) : <p>No matching equipment.</p>}
      </div>
    </div>
  </section>;
}
