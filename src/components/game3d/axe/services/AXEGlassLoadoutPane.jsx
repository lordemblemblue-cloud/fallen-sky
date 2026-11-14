import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Check, Crown, Gem, Package, Shield, Shirt, Sword } from 'lucide-react';
import {
  getAllAXEEquipmentItems, subscribeAXEEquipmentInventory,
  equipAXEInventoryItem, unequipAXEInventoryItem,
} from '../equipment/AXEEquipmentInventoryStore';
import { AXE_EQUIPMENT_SLOT_DEFS, getAXEEquipmentSetState } from '../equipment/AXEEquipmentSystem';
import { getAXEEnhancementStatMultiplier } from '../equipment/AXEItemEnhancementSystem';
import { getAXEEquipmentDisplayStats } from '../equipment/AXEEquipmentDisplayStats.mjs';
import { subscribeEnchantments } from '../../equipment/enchantmentStore';
import { getCompanionState, subscribeCompanion, equipCompanionGear, unequipCompanionGear }
  from '../../companionStore';
import { COMPANION_GEAR, getCompanionById } from '../../companionData';
import { getPlayerHUD } from '../../playerHUDStore';
import './AXEGlassLoadoutPane.css';
import './AXEAppearanceWorkspace.css';
import AXECompanionFusionButton from './AXECompanionFusionButton';

const PlayerModel = lazy(() => import('../../equipment/EquipmentPreview3D'));
const CompanionModel = lazy(() => import('../../equipment/CompanionPreview3D'));

// Two visible rows of five. The source slots, item IDs and permitted counts
// come from the canonical equipment contract; this is a VIEW, not a second loadout.
export const PLAYER_DISPLAY_SLOTS = Object.freeze([
  ['weapon', 0], ['helm', 0], ['chest', 0], ['gloves', 0], ['legs', 0],
  ['boots', 0], ['ring', 0], ['ring', 1], ['necklace', 0], ['cape', 0],
]);
const fmt = value => Number(value || 0).toLocaleString('en-US',{maximumFractionDigits:2});
const caption = value => String(value || '').replaceAll('_',' ').replace(/\b\w/g, m=>m.toUpperCase());
function useLive(subscribe, get) {
  const [state,setState] = useState(get);
  useEffect(() => subscribe(setState), [subscribe]);
  return state;
}
function IconFor({ item, size=28 }) {
  const picture = item?.imageUrl || item?.iconUrl || item?.appearanceImage;
  if (picture && (picture.startsWith('/') || /^https:\/\//.test(picture)))
    return <img alt="" loading="lazy" src={picture}/>;
  const key = item?.slot || item?.category;
  return key === 'weapon' ? <Sword size={size}/> :
    key === 'ring' || key === 'necklace' || key === 'charm' ? <Gem size={size}/> :
      key === 'helm' ? <Crown size={size}/> : <Shield size={size}/>;
}
export default function AXEGlassLoadoutPane({ actor='player', onNotice=()=>{} }) {
  const isPlayer = actor === 'player';
  const [items,setItems] = useState(getAllAXEEquipmentItems);
  const companion = useLive(subscribeCompanion,getCompanionState);
  // This snapshot notifies Appearance immediately when Blacksmith finishes an
  // upgrade and rehydrates on a character switch.
  const enhancements = useLive(subscribeEnchantments, () => ({
    reinforcement: {}, enchantments: {}, overEnchant: {},
  }));
  const [selectedId,setSelectedId] = useState(null);
  const [filter,setFilter] = useState('All');
  const [focusedSlot,setFocusedSlot] = useState('');
  const activeCompanion = getCompanionById(companion.activeCompanionId);
  useEffect(() => subscribeAXEEquipmentInventory(state => setItems(state.items)), []);
  useEffect(() => { setSelectedId(null); setFocusedSlot(''); setFilter('All'); }, [actor,companion.activeCompanionId]);

  const list = useMemo(() => isPlayer
    ? items.filter(item => AXE_EQUIPMENT_SLOT_DEFS[item.slot])
    : activeCompanion
      ? activeCompanion.gearSlots.flatMap(slot => (COMPANION_GEAR[slot] || [])
          .map(item => ({...item,slot,category:slot,instanceId:item.id})))
      : [], [isPlayer,items,activeCompanion]);
  const equipped = isPlayer ? list.filter(item=>item.equipped) : list.filter(item =>
    companion.gear?.[activeCompanion?.id]?.[item.slot] === item.id);
  const categories = [...new Set(list.map(item => item.slot))];
  const visible = list.filter(item => (filter === 'All' || filter === item.slot)
    && (!focusedSlot || item.slot === focusedSlot));
  const selected = visible.find(item => (item.instanceId || item.id) === selectedId) || visible[0] || null;
  const isEquipped = selected && (isPlayer ? !!selected.equipped
    : companion.gear?.[activeCompanion?.id]?.[selected.slot] === selected.id);
  const selectedInstanceId = selected?.instanceId;
  const enhancementMultiplier = isPlayer && selectedInstanceId
    ? getAXEEnhancementStatMultiplier({
      reinforcement: enhancements?.reinforcement?.[selectedInstanceId],
      enchantments: enhancements?.enchantments?.[selectedInstanceId],
      overEnchant: enhancements?.overEnchant?.[selectedInstanceId],
    }) : 1;
  const itemStats = getAXEEquipmentDisplayStats(selected, enhancementMultiplier);
  const displaySlots = isPlayer ? PLAYER_DISPLAY_SLOTS :
    (activeCompanion?.gearSlots || []).map(slot => [slot,0]);
  const slotItem = (slot,index) => equipped.filter(item=>item.slot === slot)[index] || null;
  const chooseSlot = slot => {
    setFocusedSlot(value=>value===slot?'':slot);
    setSelectedId(null);
  };
  const performItem = (item, allowUnequip = false) => {
    if (!item) return;
    // Double-click always equips the clicked tile; the details button may toggle.
    // Resolve against item itself, not a selected state which may be stale.
    const worn = isPlayer ? !!item.equipped
      : companion.gear?.[activeCompanion?.id]?.[item.slot] === item.id;
    if (worn && !allowUnequip) {
      onNotice('Already equipped.');
      return;
    }
    const result = isPlayer ? (worn
      ? unequipAXEInventoryItem(item.instanceId)
      : equipAXEInventoryItem(item.instanceId,{level:getPlayerHUD().level}))
      : !activeCompanion ? {ok:false,reason:'NO_COMPANION'}
      : worn ? unequipCompanionGear(activeCompanion.id,item.slot)
        : equipCompanionGear(activeCompanion.id,item.slot,item.id);
    onNotice(result?.ok === false ?
      (result.message || caption(result.reason) || 'Unable to equip') :
      (worn ? 'Equipment removed.' : 'Equipment equipped.'));
  };
  const setState = isPlayer ? getAXEEquipmentSetState(items) : null;

  return <div className="axe-app-layout axe-glass-loadout" data-equipment-actor={actor}>
    <aside className="axe-app-rail axe-glass-loadout-rail" aria-label="Equipment slot filters">
      <div className="axe-app-rail-glyph"><Package size={21}/><small>Gear</small></div>
      {categories.map(slot => <button type="button" key={slot} aria-pressed={focusedSlot===slot}
        title={'Filter '+caption(slot)} onClick={()=>chooseSlot(slot)}>
        <IconFor item={{slot}} size={22}/>
        <span className="axe-app-rail-name">{caption(slot)}</span>
      </button>)}
      <button type="button" aria-label="Show all equipment" onClick={() => {
        setFocusedSlot(''); setFilter('All'); }}>All</button>
    </aside>
    <section className="axe-app-model-stage axe-glass-loadout-stage"
      aria-label={isPlayer ? 'Player 3D viewer with equipment slots':'Companion 3D viewer with equipment slots'}>
      <div className="axe-app-model-glow" aria-hidden="true"/>
      {['left','right'].map((side) => <div key={side}
        className={'axe-app-viewer-gear axe-app-viewer-gear--'+side}>
        {displaySlots.filter((_,i)=>side==='left' ? i < Math.ceil(displaySlots.length/2)
          : i>=Math.ceil(displaySlots.length/2)).map(([slot,slotIndex])=>{
            const current=slotItem(slot,slotIndex);
            return <button key={slot+slotIndex} type="button" className="axe-app-viewer-slot"
              aria-pressed={focusedSlot === slot}
              title={(current?.name || caption(slot)) + ' · '+(current?'Equipped':'Empty')}
              onClick={()=>chooseSlot(slot)}>
              <span className="axe-app-viewer-slot-art"><IconFor item={current || {slot}}/></span>
              <small>{caption(slot)}{slotIndex ? ' '+(slotIndex+1):''}</small>
              <span className="axe-app-viewer-item-name">{current?.name || '—'}</span>
            </button>;
          })}
      </div>)}
      <div className="axe-app-model-center"><Suspense fallback={<p className="axe-app-loading">Loading model…</p>}>
        <div className="axe-app-model-host">{isPlayer ? <PlayerModel/> :
          activeCompanion ? <CompanionModel key={activeCompanion.id}/> :
            <p className="axe-app-loading">No active companion selected</p>}</div>
      </Suspense></div>
      {!isPlayer && <AXECompanionFusionButton onNotice={onNotice}/>}
      <div className="axe-app-model-caption"><strong>
        {isPlayer ? 'Player Equipment' : activeCompanion?.name || 'Companion Equipment'}</strong>
        <span>{equipped.length} pieces equipped</span></div>
    </section>
    <main className="axe-app-main-stack" aria-label={isPlayer ? "Owned equipment inventory" : "Available companion gear catalog"}>
      <section className="axe-app-card axe-app-inventory">
        <header className="axe-app-card-heading"><Package size={20}/><h3>Inventory</h3>
          <small>{visible.length} / {list.length}</small></header>
        <div className="axe-app-card-content">
          <div className="axe-app-inventory-browser">
          <div className="axe-app-inventory-filters" role="group" aria-label="Equipment inventory filter">
            <button type="button" aria-pressed={filter==='All'} onClick={()=>{setFilter('All');setFocusedSlot('');}}>All</button>
            {categories.map(slot=><button type="button" key={slot} aria-pressed={filter===slot}
              onClick={()=>{setFilter(slot);setFocusedSlot('');}}>{caption(slot)}</button>)}
          </div>
          <div className="axe-app-inventory-grid" role="list">
            {visible.map(item=><button type="button" role="listitem"
              className="axe-app-inventory-tile" key={item.instanceId || item.id}
              aria-pressed={selected?.instanceId===item.instanceId}
              onClick={()=>setSelectedId(item.instanceId || item.id)}
              onDoubleClick={()=>{setSelectedId(item.instanceId || item.id);performItem(item);}}
              title={'Double-click to equip '+item.name}>
              <span className="axe-app-inventory-art"><IconFor item={item}/></span>
              <span className="axe-app-inventory-name">{item.name}</span>
              <small>{caption(item.slot)}</small>
              {(isPlayer ? item.equipped :
                companion.gear?.[activeCompanion?.id]?.[item.slot]===item.id) &&
                  <Check size={15} className="axe-app-equipped-check"/>}
            </button>)}
            {!visible.length && <p className="axe-app-inventory-empty">No available equipment in this category.</p>}
          </div>
          </div>
        </div>
      </section>
    </main>
    <aside className="axe-app-right-stack" aria-label="Equipment details and set progress">
      <section className="axe-app-card axe-glass-loadout-details">
        <header className="axe-app-card-heading"><Gem size={20}/><h3>{selected?.name || 'Equipment Details'}</h3>
          <small>{selected?.rarity || '—'}</small></header>
        <div className="axe-app-card-content">
          {selected ? <>
            <div className="axe-glass-item-hero"><IconFor item={selected} size={43}/>
              <div><strong>{selected.name}</strong><small>{caption(selected.slot)} · {caption(selected.rarity || 'common')}</small></div>
            </div>
            <h4>Item Stats <small>{isPlayer ? 'Reinforcement + enchantments' : 'Base stats'}</small></h4>
            {itemStats.map(({stat,base,current,difference})=><div className="axe-app-bonus-row" key={stat}>
              <span>{caption(stat)}</span><b>+{fmt(current)}
                {difference !== 0 && <small className="axe-glass-base-stat" title="Value before reinforcement, enchantment and over-enchant">Base +{fmt(base)}</small>}
              </b>
            </div>)}
            {!itemStats.length && <p className="axe-app-description">No stat modifiers on this piece.</p>}
            {isPlayer && enhancementMultiplier > 1 && <p className="axe-app-description axe-glass-upgrade-preview">
              Equipment enhancement ×{fmt(enhancementMultiplier)} applied to flat item stats.
              Other bonuses (gems, soul, sets and advancement) are calculated separately in combat.
            </p>}
            {isPlayer && <div className="axe-glass-set-display">
              <h4>Equipment Set <small>{equipped.length} equipped</small></h4>
              <div className="axe-glass-ten-slots">
                {PLAYER_DISPLAY_SLOTS.map(([slot,index])=>{
                  const wearing=slotItem(slot,index);
                  return <button type="button" key={slot+index} title={wearing?.name || caption(slot)+' empty'}
                    onClick={()=>chooseSlot(slot)} aria-label={caption(slot)+(index? ' '+(index+1):'')+
                      ': '+(wearing?.name || 'Empty')}>
                    <IconFor item={wearing || {slot}} size={22}/>
                    <small>{slot==='ring' ? 'Ring '+(index+1) : caption(slot)}</small>
                    {wearing && <Check size={13}/>}
                  </button>;
                })}
              </div>
              <div className="axe-app-bonus-row"><span>Equipped display slots</span>
                <b>{PLAYER_DISPLAY_SLOTS.filter(([slot,index])=>!!slotItem(slot,index)).length} / 10</b></div>
              {(setState?.activeSets || []).map(set => <div key={set.setId+set.grade}
                className="axe-glass-set-progress">
                <strong>{set.setName}</strong>
                <span>{set.equippedPieces} equipped · {set.activeThresholds.length
                  ? 'Active tiers '+set.activeThresholds.join(', ') : 'No active set tier'}</span>
              </div>)}
            </div>}
            <button type="button" className="axe-app-unified-equip axe-glass-equip" onClick={()=>performItem(selected,true)}>
              <Shirt size={18}/>{isEquipped ? 'Unequip' : 'Equip'}
            </button>
            {!isPlayer && <p className="axe-app-description">
              This companion uses its actual saved gear loadout. Only catalog gear supported
              by this companion can be equipped; unsupported visual attachments are not invented.</p>}
          </> : <p className="axe-app-description">Select owned equipment to see its stats and equip options.</p>}
        </div>
      </section>
    </aside>
  </div>;
}
