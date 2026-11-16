import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Check, Crown, Gem, Package, Search, Shield, Shirt, Sword, X } from 'lucide-react';
import {
  getAllAXEEquipmentItems, subscribeAXEEquipmentInventory,
  equipAXEInventoryItem, unequipAXEInventoryItem,
} from '../equipment/AXEEquipmentInventoryStore';
import { AXE_EQUIPMENT_SLOT_DEFS, getAXEEquipmentSetState } from '../equipment/AXEEquipmentSystem';
import { getAXESetDefinition } from '../equipment/AXESetBonusSystem';
import { getAXEEnhancementStatMultiplier } from '../equipment/AXEItemEnhancementSystem';
import { getAXEEquipmentDisplayStats } from '../equipment/AXEEquipmentDisplayStats.mjs';
import {getAXEFarmingAscendedIdentity} from '../loot/AXEFarmingGearTiers.mjs';
import { filterInventoryWithSearch } from './AXEInventorySearch.mjs';
import { subscribeEnchantments } from '../../equipment/enchantmentStore';
import { getAXEAdvancementState, subscribeAXEItemAdvancement } from '../equipment/AXEItemAdvancementStore';
import { AXE_CHOSEN_SET_ID } from '../equipment/AXEChosenSetRules.mjs';
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
const caption = value => String(value || '').replaceAll('_',' ').split(' ').map(word => word ? word[0].toUpperCase() + word.slice(1) : '').join(' ');
const setEffectCaption = (effects = {}) => Object.entries(effects).map(([key,value]) =>
  key==='aerialDamagePct' ? '+'+value+'% aerial PvE damage' :
  key==='mobDamagePct' ? '+'+value+'% normal mob damage' :
  key==='virtualAbilityPoints' ? '+'+value+' virtual skill points ('+(value*3)+'% skill damage)' :
  caption(key)+' +'+value).join(' · ');
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
  // Set progress must read the same item Ascension records as combat. An
  // inventory item alone does not carry a fresh stage rank after Blacksmith.
  const advancements = useLive(subscribeAXEItemAdvancement, () => ({state:{}}));
  const [selectedId,setSelectedId] = useState(null);
  const [filter,setFilter] = useState('All');
  const [search,setSearch] = useState('');
  const [focusedSlot,setFocusedSlot] = useState('');
  const activeCompanion = getCompanionById(companion.activeCompanionId);
  useEffect(() => subscribeAXEEquipmentInventory(state => setItems(state.items)), []);
  useEffect(() => { setSelectedId(null); setFocusedSlot(''); setFilter('All'); setSearch(''); }, [actor,companion.activeCompanionId]);

  const list = useMemo(() => isPlayer
    ? items.filter(item => AXE_EQUIPMENT_SLOT_DEFS[item.slot])
    : activeCompanion
      ? activeCompanion.gearSlots.flatMap(slot => (COMPANION_GEAR[slot] || [])
          .map(item => ({...item,slot,category:slot,instanceId:item.id})))
      : [], [isPlayer,items,activeCompanion]);
  const equipped = isPlayer ? list.filter(item=>item.equipped) : list.filter(item =>
    companion.gear?.[activeCompanion?.id]?.[item.slot] === item.id);
  const categories = [...new Set(list.map(item => item.slot))];
  const visible = filterInventoryWithSearch(list, {
    category:focusedSlot || filter, categoryKey:'slot', search,
  });
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
  const prestigeFor=item=>isPlayer&&item
    ? getAXEFarmingAscendedIdentity(item,
      (advancements?.state?.[item.instanceId]||getAXEAdvancementState(item.instanceId))?.stage?.rank)
    :null;
  const selectedPrestige=prestigeFor(selected);
  const displaySlots = isPlayer ? PLAYER_DISPLAY_SLOTS :
    (activeCompanion?.gearSlots || []).map(slot => [slot,0]);
  const slotItem = (slot,index) => equipped.filter(item=>item.slot === slot)[index] || null;
  const chooseSlot = slot => {
    if (isPlayer) {
      setFocusedSlot(value=>value===slot?'':slot);
      setFilter('All');
    } else {
      setFilter(value=>value===slot?'All':slot);
      setFocusedSlot('');
    }
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
  const setState = isPlayer ? getAXEEquipmentSetState(items.map(item => ({
    ...item,
    advancement: advancements?.state?.[item.instanceId] ||
      getAXEAdvancementState(item.instanceId),
  }))) : null;

  const inventoryToolbar = (
    <div className="axe-app-inventory-toolbar" role="search" aria-label="Search and filter owned equipment">
            <div className="axe-app-inventory-search">
              <Search size={16} aria-hidden="true"/>
              <label htmlFor={'axe-equipment-search-'+actor} className="sr-only">Search equipment</label>
              <input id={'axe-equipment-search-'+actor} type="search" value={search}
                onChange={event=>setSearch(event.target.value)}
                placeholder="Search equipment…" aria-label="Search equipment by name or rarity"/>
              {search && <button type="button" onClick={()=>setSearch('')}
                aria-label="Clear equipment search"><X size={14}/></button>}
            </div>
            <label className="axe-app-inventory-category">
              <span className="sr-only">Equipment category</span>
              <select aria-label="Equipment category" value={focusedSlot||filter}
                onChange={event=>{
                  setFilter(event.target.value);
                  setFocusedSlot('');
                  setSelectedId(null);
                }}>
                <option value="All">All Equipment</option>
                {categories.map(slot=><option key={slot} value={slot}>{caption(slot)}</option>)}
              </select>
            </label>
          </div>
  );

  return <div className="axe-app-layout axe-glass-loadout" data-equipment-actor={actor}>
    <aside className="axe-app-rail axe-glass-loadout-rail" aria-label="Equipment slot filters">
      <div className="axe-app-rail-glyph"><Package size={21}/><small>Gear</small></div>
      {categories.map(slot => <button type="button" key={slot} aria-pressed={isPlayer ? focusedSlot===slot : filter===slot}
        title={'Filter '+caption(slot)} onClick={()=>chooseSlot(slot)}>
        <IconFor item={{slot}} size={22}/>
        <span className="axe-app-rail-name">{caption(slot)}</span>
      </button>)}
      <button type="button" aria-label="Show all equipment" onClick={() => {
        setFocusedSlot(''); setFilter('All'); }}>All</button>
    </aside>
    <section className="axe-app-model-stage axe-glass-loadout-stage"
      aria-label={isPlayer ? 'Player 3D viewer with equipment slots':'Companion 3D viewer'}>
      <div className="axe-app-model-glow" aria-hidden="true"/>
      {isPlayer && ['left','right'].map((side) => <div key={side}
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
          <small>{visible.length} / {list.length}</small>
          {!isPlayer && inventoryToolbar}</header>
        <div className="axe-app-card-content">
          <div className="axe-app-inventory-browser">
          {isPlayer && inventoryToolbar}
          <div className="axe-app-inventory-grid" role="list">
            {visible.map(item=><button type="button" role="listitem"
              className={'axe-app-inventory-tile'+(prestigeFor(item)?' axe-inventory-prestige':'')}
              style={prestigeFor(item)?{
                '--prestige-a':prestigeFor(item).primary,'--prestige-b':prestigeFor(item).secondary,
              }:undefined} key={item.instanceId || item.id}
              aria-pressed={selected?.instanceId===item.instanceId}
              onClick={()=>setSelectedId(item.instanceId || item.id)}
              onDoubleClick={()=>{setSelectedId(item.instanceId || item.id);performItem(item);}}
              title={'Double-click to equip '+item.name}>
              <span className="axe-app-inventory-art"><IconFor item={item}/></span>
              <span className="axe-app-inventory-name">{prestigeFor(item)?.displayName||item.name}</span>
              <small>{caption(item.slot)}</small>
              {(isPlayer ? item.equipped :
                companion.gear?.[activeCompanion?.id]?.[item.slot]===item.id) &&
                  <Check size={15} className="axe-app-equipped-check"/>}
            </button>)}
            {!visible.length && <p className="axe-app-inventory-empty">No equipment matches the current search or category.</p>}
          </div>
          </div>
        </div>
      </section>
    </main>
    <aside className="axe-app-right-stack" aria-label="Equipment details and set progress">
      <section className="axe-app-card axe-glass-loadout-details">
        <header className="axe-app-card-heading"><Gem size={20}/><h3>{selectedPrestige?.displayName||selected?.name||'Equipment Details'}</h3>
          <small>{selected?.rarityLabel || caption(selected?.rarity || '—')}</small></header>
        <div className="axe-app-card-content">
          {selected ? <>
            <div className={'axe-glass-item-hero'+(selectedPrestige?' axe-inventory-prestige':'')}
              style={selectedPrestige?{
                '--prestige-a':selectedPrestige.primary,'--prestige-b':selectedPrestige.secondary,
              }:undefined}><IconFor item={selected} size={43}/>
              <div><strong>{selectedPrestige?.displayName||selected.name}</strong><small>{caption(selected.slot)} · {selected.rarityLabel || caption(selected.rarity || 'common')} · Level {selected.itemLevel || 1}</small></div>
            </div>
            {selected.setId && getAXESetDefinition(selected.setId) && <p className="axe-app-description">
              Set: {getAXESetDefinition(selected.setId).name} · Equip matching pieces for set effects.
            </p>}
            {isPlayer && selected.instanceId && getAXEAdvancementState(selected.instanceId)?.stage?.rank > 0 &&
              <p className="axe-app-description">
                Ascension +{getAXEAdvancementState(selected.instanceId).stage.rank}/4 ·
                {getAXEAdvancementState(selected.instanceId).stage.rank>=4
                  ?' Prestige aura and enhanced item bonuses unlocked.'
                  :' Additional sacrifices strengthen this equipment and its matching set.'}
              </p>}
            {selected.evolutionPath && <p className="axe-app-description">
              Evolution potential: {caption(selected.evolutionPath)} · future Blacksmith recipe required.
            </p>}
            {selected.visualPending && <p className="axe-app-description">
              3D model pending · equipment stats, ownership and set progress are active.
            </p>}
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
                  ? 'Active tiers '+set.activeThresholds.join(', ') : 'No active set tier'}
                  {set.nextThreshold ? ' · Next at '+set.nextThreshold+' pieces' : ''}</span>
                {Object.keys(set.conditionalBonuses || {}).length > 0 &&
                  <small className="axe-glass-set-special">{setEffectCaption(set.conditionalBonuses)}</small>}
                {set.setId !== AXE_CHOSEN_SET_ID && (set.activeThresholds || []).map(threshold => {
                  const tier = set.ascensionByThreshold?.[threshold];
                  return tier ? <small key={threshold} className="axe-glass-set-special">
                    {threshold}-piece set bonus: Ascension +{tier.rank}/4 · +{tier.bonusPct}% of its original value
                  </small> : null;
                })}
                {set.fullAuraRank > 0 && <small className="axe-glass-set-special">
                  Spiritual full-set aura unlocked · Ascension +{set.fullAuraRank}
                </small>}
                {set.setId === AXE_CHOSEN_SET_ID && <small className="axe-glass-set-special">
                  Chosen {set.equippedPieces}/{set.requiredPieces} pieces · {set.ascendedPieces}/{set.requiredPieces}
                  {' '}at Ascension +4 · {set.chosenBonusPct
                    ? '+'+set.chosenBonusPct+'% core stats active' : 'Complete all six for +100% core stats'}
                </small>}
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