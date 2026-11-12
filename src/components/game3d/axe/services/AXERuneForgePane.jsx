import { useEffect, useMemo, useState } from 'react';
import { Coins, Gem, Scroll, Shield, Sparkles, Swords } from 'lucide-react';
import { getAllAXEEquipmentItems, subscribeAXEEquipmentInventory } from '../equipment/AXEEquipmentInventoryStore';
import { getLootInventory, getLootItemCount, subscribeLootInventory } from '../../lootStore';
import { getShopState, subscribeShop } from '../../shop/shopStore';
import {
  AXE_RUNE_DEFINITIONS, getAXEEquipmentRunes, subscribeAXEEquipmentRunes,
  equipAXEEquipmentRune, unequipAXEEquipmentRune,
  previewAXERuneUpgrade, upgradeAXEInventoryRune,
} from '../equipment/AXEEquipmentRuneStore';
import './AXERuneForgePane.css';

const pic = item => item?.imageUrl || item?.iconUrl || item?.image || null;
const num = value => Number(value || 0).toLocaleString('en-US',{maximumFractionDigits:2});
const readableStat = name => ({attack:'Damage',defense:'Defense',dexterity:'Dexterity',
  maxHP:'Vitals',critChance:'Critical Chance'})[name] || name;

export default function AXERuneForgePane() {
  const [items,setItems] = useState(getAllAXEEquipmentItems);
  const [loot,setLoot] = useState(getLootInventory);
  const [wallet,setWallet] = useState(getShopState);
  const [equipped,setEquipped] = useState(getAXEEquipmentRunes);
  const [selectedId,setSelectedId] = useState('');
  const [itemId,setItemId] = useState('');
  const [mode,setMode] = useState('equip');
  const [review,setReview] = useState(null);
  const [notice,setNotice] = useState('');
  useEffect(()=>subscribeAXEEquipmentInventory(s=>setItems(s?.items || getAllAXEEquipmentItems())),[]);
  useEffect(()=>subscribeLootInventory(setLoot),[]);
  useEffect(()=>subscribeShop(setWallet),[]);
  useEffect(()=>subscribeAXEEquipmentRunes(setEquipped),[]);
  const owned = useMemo(()=>{
    const counts = new Map();
    for (const unit of loot.rune || []) if (AXE_RUNE_DEFINITIONS[unit.id])
      counts.set(unit.id,(counts.get(unit.id)||0)+1);
    return [...counts].map(([id,count])=>({...AXE_RUNE_DEFINITIONS[id],count}));
  },[loot]);
  const selected = AXE_RUNE_DEFINITIONS[selectedId] || owned[0] || null;
  const target = items.find(item=>item.instanceId===itemId) || null;
  const installed = target ? AXE_RUNE_DEFINITIONS[equipped[target.instanceId]] : null;
  const preview = previewAXERuneUpgrade(selected?.id);
  const count = selected ? getLootItemCount(selected.id,'rune') : 0;
  const canUpgrade = preview.ok && count>=2 && Number(wallet.gold||0)>=preview.silver;
  const canEquip = !!target && !!selected && count>0 && !installed;
  const applyAction=()=>{
    if(!review)return;
    const action=review;setReview(null);
    let result=null;
    if(action==='equip')result=equipAXEEquipmentRune(target?.instanceId,selected?.id);
    else if(action==='remove')result=unequipAXEEquipmentRune(target?.instanceId);
    else if(action==='upgrade')result=upgradeAXEInventoryRune(selected?.id);
    setNotice(result?.ok ? action==='equip' ? 'Rune equipped to this item.'
      : action==='remove' ? 'Rune returned to inventory.'
      : 'Upgrade succeeded. Your higher-tier rune is in inventory.'
      : result?.outcome==='failure' ? 'Rune fusion failed; one rune and Gold were consumed.'
      : String(result?.reason || 'Rune operation unavailable.').replaceAll('_',' '));
  };
  return <section className="axe-runes-workspace" aria-label="Ultimate Runes forge">
    <section className="axe-runes-inventory" aria-label="Owned runes inventory">
      <header><Scroll size={16}/><h3>Inventory Runes</h3><small>{owned.reduce((n,r)=>n+r.count,0)} owned</small></header>
      <div className="axe-runes-tabs" role="tablist" aria-label="Rune actions">
        <button type="button" role="tab" aria-selected={mode==='equip'} onClick={()=>setMode('equip')}>Equip</button>
        <button type="button" role="tab" aria-selected={mode==='upgrade'} onClick={()=>setMode('upgrade')}>Upgrade</button>
      </div>
      <p>Select a rune tag. Only runes actually owned by your character appear here.</p>
      <div className="axe-runes-grid" role="list">
        {owned.map(rune=><button type="button" role="listitem" key={rune.id}
          aria-pressed={selected?.id===rune.id} title={rune.name}
          onClick={()=>{setSelectedId(rune.id);setNotice('');}}>
          <span>{rune.icon}</span><small>{rune.name}</small><em>×{rune.count}</em>
        </button>)}
        {!owned.length && <p>No runes in inventory.</p>}
      </div>
    </section>
    <section className="axe-runes-equipment" aria-label="Equipment rune slots">
      <h3>{mode==='equip'?'Equipment Inventory':'Rune Fusion'}</h3>
      {mode==='equip' ? <>
        <p>Equip one rune tag per equipment item. An existing rune must be removed first.</p>
        <div className="axe-runes-gear-grid">
          {items.map(item=><button type="button" key={item.instanceId}
            aria-pressed={itemId===item.instanceId} onClick={()=>setItemId(item.instanceId)}>
            {pic(item)?<img src={pic(item)} alt=""/>:item.slot==='weapon'?<Swords size={24}/>:<Shield size={24}/>}
            <small>{item.name}</small>
            <span>{AXE_RUNE_DEFINITIONS[equipped[item.instanceId]]?.icon || '◇'}</span>
          </button>)}
        </div>
        <div className="axe-runes-actions">
          <button type="button" disabled={!canEquip} onClick={()=>setReview('equip')}>Equip Rune</button>
          <button type="button" disabled={!installed} onClick={()=>setReview('remove')}>Remove Rune</button>
        </div>
      </> : <>
        <p>Two copies of the same rune produce one higher-tier rune on success.</p>
        <div className="axe-runes-fusion">
          <span>{selected?.icon||'◇'}<small>Rune 1</small></span><b>+</b>
          <span>{count>=2?selected?.icon||'◇':'◇'}<small>{count>=2?'Matching Rune':'Second Copy Needed'}</small></span>
          <b>→</b><span>{preview.next?.icon||'◇'}<small>{preview.next?.name||'Maximum Tier'}</small></span>
        </div>
        <div className="axe-runes-actions">
          <button type="button" disabled={!canUpgrade} onClick={()=>setReview('upgrade')}>Upgrade Rune</button>
        </div>
      </>}
    </section>
    <aside className="axe-runes-details" aria-label="Rune stats and requirements">
      <small>ULTIMATE · RUNE TAGS</small>
      <h3>{selected?.name||'Select a Rune'}</h3>
      <p>{selected?.description||'Select an owned rune from inventory.'}</p>
      <h4>Rune Bonus</h4>
      <div className="axe-runes-row"><span>Effect</span><b>{selected ? readableStat(selected.stat)+' +'+num(selected.value):'—'}</b></div>
      <div className="axe-runes-row"><span>Tier</span><b>{selected?.tier||'—'} / 5</b></div>
      {mode==='equip' ? <>
        <h4>Equipment</h4>
        <div className="axe-runes-row"><span>Selected</span><b>{target?.name||'—'}</b></div>
        <div className="axe-runes-row"><span>Installed Rune</span><b>{installed?.name||'Empty'}</b></div>
        <p>One rune per item. Its bonus contributes to live combat stats while equipped.</p>
      </> : <>
        <h4>Enhancement</h4>
        <div className="axe-runes-row"><span>Next Tier</span><b>{preview.next?.name||'Max Tier'}</b></div>
        <div className="axe-runes-row"><span>Next Bonus</span><b>{preview.next ? readableStat(preview.next.stat)+' +'+num(preview.next.value):'—'}</b></div>
        <div className="axe-runes-row"><span>Matching Runes</span><b>{count} / 2</b></div>
        <div className="axe-runes-row"><span>Success Rate</span><b>{preview.ok?Math.round(preview.chance*100)+'%':'—'}</b></div>
        <div className="axe-runes-row"><span><Coins size={13}/> Gold Cost</span><b>{preview.ok?num(preview.silver):'—'}</b></div>
        <div className="axe-runes-row"><span>Owned Gold</span><b>{num(wallet.gold)}</b></div>
        <p>On failure, one rune and the Gold are spent; one original rune survives.</p>
      </>}
      {notice && <p role="status" className="axe-runes-notice">{notice}</p>}
    </aside>
    {review && <div className="axe-runes-confirm-backdrop" role="presentation">
      <div className="axe-runes-confirm" role="dialog" aria-modal="true" aria-label="Confirm rune action">
        <h3>{review==='equip'?'Equip rune?':review==='remove'?'Remove equipped rune?':'Upgrade rune?'}</h3>
        <p>{review==='equip' ? selected?.name+' will be inserted into '+target?.name+'.'
          : review==='remove' ? installed?.name+' will be returned to inventory.'
          : 'Spend two '+selected?.name+' runes and '+num(preview.silver)+' Gold for a '+Math.round(preview.chance*100)+'% upgrade chance?'}</p>
        <div><button type="button" onClick={()=>setReview(null)}>Cancel</button>
          <button type="button" onClick={applyAction}>Yes, confirm</button></div>
      </div>
    </div>}
  </section>;
}
