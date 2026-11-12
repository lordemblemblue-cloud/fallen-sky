import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Gem, Package, Shield, Swords, Sparkles, Zap, Layers, Diamond, CircleDot, Dumbbell, SlidersHorizontal } from 'lucide-react';
import { getAllAXEEquipmentItems, subscribeAXEEquipmentInventory } from '../equipment/AXEEquipmentInventoryStore';
import { getLootInventory, subscribeLootInventory } from '../../lootStore';
import {
  getItemEnchantments, getItemReinforcement, getItemOverEnchant, getCostForNextLevel,
  MAX_ENCH_LEVEL, MATERIALS, subscribeEnchantments,
} from '../../equipment/enchantmentStore';
import { getAXEAdvancementState, subscribeAXEItemAdvancement } from '../equipment/AXEItemAdvancementStore';
import { getAXESocketState, subscribeAXESockets } from '../equipment/AXESocketGemStore';
import { getAXEEnhancementStatMultiplier, getAXEReinforcementCap } from '../equipment/AXEItemEnhancementSystem';
import { AXE_ADVANCEMENT_STAT_CONFIG } from '../equipment/AXEEquipmentRuntimeStats';
import { getNextStage, getAXEAscensionImprintBonus, getAXEEquipmentAscensionBonus, getAXEEquipmentAscensionRateBonus, AXE_EQUIPMENT_ASCENSION_CONFIG } from '../equipment/AXEItemAdvancementSystem';
import { getAXEServiceOperationPreview, isAXECompatibleDonor } from './AXEServiceWorkspaceModel';
import { executeAXEServiceTransaction } from './AXEServiceTransactionGateway';
import { getAXEServiceResourceCount, getAXEServiceResourceCategory } from './AXEServiceResources';
import { getAXEOverEnchantCost } from './AXEServiceEconomy';
import { getActiveId, getStorageUser, subscribeCharacterChange } from '../../characterStorage';
import { isSafeCombineDonor, filterForgeInventory, runBlacksmithAutoBatch } from './AXEBlacksmithAutoForge';
import AXEBlacksmithWorkflowPanel from './AXEBlacksmithWorkflowPanel';
import AXEWeaponLegacyForgePane from './AXEWeaponLegacyForgePane';
import { getAXEWeaponLegacyDamageMultiplier } from '../equipment/AXEWeaponLegacyForge';
import AXEGemForgePane from './AXEGemForgePane';
import { AXE_GEM_DEFINITIONS } from '../equipment/AXESocketGemSystem';
import AXECoreForgePane from './AXECoreForgePane';
import AXERuneForgePane from './AXERuneForgePane';
import './AXEBlacksmithImageWorkspace.css';

// Exact user-approved transparent Blacksmith glass artwork; the PNG contains
// no sample weapon, inventory items, world scenery, or hard-coded stat values.
// All item and resource values are rendered from the live character stores.
const APPROVED_IMAGE =
  'https://media.base44.com/images/public/6876751a602125f45f1861b9/575c48e1e_ornate_blacksmith_forging_interface.png';

const FILTERS = ['All', 'Weapons', 'Armor', 'Accessories', 'Materials'];
const SOCKET_FILTERS = ['All', 'Equipment', 'Weapons', 'Armor', 'Accessories', 'Gems', 'Socket Materials'];
const SOCKET_RESOURCE_IDS = new Set(['mat_crystal']);
const SOCKET_EQUIPMENT_SLOTS = new Set(
  Object.values(AXE_GEM_DEFINITIONS).flatMap(gem => gem.allowedSlots || []),
);
const ARMOR = new Set(['helm', 'chest', 'gloves', 'legs', 'boots']);
const ACCESSORIES = new Set(['ring', 'necklace', 'accessory', 'trinket']);

export function isReadyToOverenchant(itemId) {
  if (!itemId) return false;
  const levels = getItemEnchantments(itemId);
  return levels.length > 0 && levels.every(level => Number(level) >= MAX_ENCH_LEVEL);
}

function getKind(item) {
  const slot = item.slot || item.category || '';
  if (slot === 'weapon') return 'Weapons';
  if (ARMOR.has(slot)) return 'Armor';
  if (ACCESSORIES.has(slot)) return 'Accessories';
  return 'All';
}

function InventorySymbol({ item }) {
  const kind = getKind(item);
  return kind === 'Weapons' ? <Swords size={23} /> : kind === 'Armor' ? <Shield size={23} />
    : kind === 'Accessories' ? <Gem size={23} /> : <Package size={23} />;
}

const MATERIAL_NAMES = new Map(MATERIALS.map(entry => [entry.id, entry.name]));
const BLACKSMITH_TABS = [
  { id: 'enchant', label: 'Enchant', operation: 'enchant', Icon: ArrowUpRight },
  { id: 'over_enchant', label: 'Over-Enchant', operation: 'over_enchant', Icon: Zap },
  { id: 'combine', label: 'Combine Stage', operation: 'combine', Icon: Layers },
  { id: 'ascend', label: 'Ascend', operation: 'stage', Icon: Diamond },
  { id: 'sockets', label: 'Sockets & Gems', operation: 'sockets', Icon: Gem },
  { id: 'core', label: 'Core', operation: 'core', Icon: CircleDot },
  { id: 'runes', label: 'Ultimate', operation: 'runes', Icon: Sparkles },
];
const OPERATION_DESCRIPTIONS = {
  enchant: 'Strengthen individual enchantment slots on this equipment.',
  over_enchant: 'Further enhance equipment after every enchantment slot reaches its maximum.',
  combine: 'Combine Stage 1–12 remains unchanged. Weapon Legacy is a separate 4-weapon or 12-piece reward below.',
  ascend: 'Four Ascensions. Each one permanently captures a stronger stat bonus from the equipment’s current Reinforcement percentage.',
  sockets: 'Open a socket and insert a compatible owned gem using the existing forge controls.',
};
const asNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const fmt = value => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString();
const itemArt = item => item?.imageUrl || item?.iconUrl || item?.image || null;

// Read the real item plus the SAME enhancement and advancement coefficients as
// combat. A gear item's attack is not a fictitious generic "power" score.
const ATTACK_KEYS = ['attack', 'damage', 'attackPower', 'physicalAttack', 'maxAtk'];
function itemAttackBase(item) {
  const stats = { ...item.baseStats };
  for (const [key, value] of Object.entries(item.rolledStats || {})) {
    stats[key] = (Number(stats[key]) || 0) + (Number(value) || 0);
  }
  const key = ATTACK_KEYS.find(name => Number.isFinite(Number(stats[name])));
  return key ? Number(stats[key]) : null;
}

// This selection is based on the item's real stat keys, not an invented
// generic Power score. Flat stats use core scaling; rate stats get only the
// strictly capped Ascension rate adjustment used by live combat.
const ASCENSION_STAT_KEYS = Object.freeze([
  ...ATTACK_KEYS, 'defense', 'defensePower', 'hp', 'maxHP',
  'strength', 'dexterity', 'constitution', 'focus', 'spirit',
  'critChance', 'criticalChance', 'critDamage', 'criticalDamage',
]);
const ASCENSION_RATE_KEYS = new Set(['critChance','criticalChance','critDamage','criticalDamage']);
function ascensionStatPreview(item, enhancement, current, projected, canProject) {
  const stats = { ...(item?.baseStats || {}) };
  for (const [key, raw] of Object.entries(item?.rolledStats || {})) {
    stats[key] = (Number(stats[key]) || 0) + (Number(raw) || 0);
  }
  const key = ASCENSION_STAT_KEYS.find(k => Number.isFinite(Number(stats[k])));
  if (!key) return null;
  const value = Number(stats[key]);
  const isRate = ASCENSION_RATE_KEYS.has(key);
  const currentScale = isRate ? 1 + getAXEEquipmentAscensionRateBonus(current.stage)
    : enhancement * advancementScale(current);
  const nextScale = isRate ? 1 + getAXEEquipmentAscensionRateBonus(projected.stage)
    : enhancement * advancementScale(projected);
  return { label: key, isRate,
    current: Math.round(value * currentScale * 100) / 100,
    next: canProject ? Math.round(value * nextScale * 100) / 100 : null };
}

function advancementScale(state) {
  return 1
    + Number(state.combine?.count || 0) * AXE_ADVANCEMENT_STAT_CONFIG.combinePerSuccess
    + getAXEEquipmentAscensionBonus(state.stage)
    + Number(state.refine?.level || 0) * AXE_ADVANCEMENT_STAT_CONFIG.refinePerLevel
    + Number(state.ultimate?.level || 0) * AXE_ADVANCEMENT_STAT_CONFIG.ultimatePerLevel;
}

export function getAXEBlacksmithReadout(item, operation = 'enchant', donor = null) {
  if (!item?.instanceId) return null;
  const id = item.instanceId;
  const enchantments = getItemEnchantments(id);
  const reinforcement = getItemReinforcement(id);
  const overEnchant = getItemOverEnchant(id);
  const advancement = getAXEAdvancementState(id);
  const sockets = getAXESocketState(id);
  const nextEnchantSlot = enchantments.findIndex(level => Number(level) < MAX_ENCH_LEVEL);
  const selectedSlot = Math.max(0, nextEnchantSlot);
  const preview = getAXEServiceOperationPreview(operation, {
    item, enchantments, reinforcement, overEnchant, advancement, sockets,
    slotIndex: selectedSlot,
    enchantCost: getCostForNextLevel(enchantments[selectedSlot] || 0),
    donor,
  });
  const before = getAXEEnhancementStatMultiplier({ reinforcement, enchantments, overEnchant });
  const nextEnchantments = [...enchantments];
  let projectedOver = overEnchant;
  let projectedAdvancement = advancement;
  let canProject = Boolean(preview.canAdvance);
  if (operation === 'enchant' && nextEnchantSlot >= 0) {
    nextEnchantments[nextEnchantSlot] = Number(nextEnchantments[nextEnchantSlot] || 0) + 1;
  } else if (operation === 'over_enchant' && preview.canAdvance) {
    projectedOver = { ...overEnchant, level: Number(overEnchant.level || 0) + 1 };
  } else if ((operation === 'stage' || operation === 'ascend') && preview.canAdvance) {
    const next = getNextStage(advancement.stage);
    const pct = Number(reinforcement.percent || 0);
    const imprint = next && { rank: next.rank, reinforcementPercent: pct,
      bonus: getAXEAscensionImprintBonus(next.rank, pct),
      ruleVersion: AXE_EQUIPMENT_ASCENSION_CONFIG.ruleVersion };
    projectedAdvancement = { ...advancement,
      stage: next ? { ...advancement.stage, ...next,
        imprints: [...(advancement.stage?.imprints || []), imprint] } : advancement.stage };
  } else if (operation === 'combine' || operation === 'sockets') {
    // Donor/gem/ascension effects are not calculated from made-up numbers.
    canProject = false;
  }
  const after = getAXEEnhancementStatMultiplier({
    reinforcement, enchantments: nextEnchantments, overEnchant: projectedOver,
  });
  const attackBase = itemAttackBase(item);
  const currentAttack = attackBase === null ? null :
    Math.round(attackBase * before * advancementScale(advancement) * getAXEWeaponLegacyDamageMultiplier(item));
  const projectedAttack = currentAttack === null || !canProject ? null :
    Math.round(attackBase * after * advancementScale(projectedAdvancement) * getAXEWeaponLegacyDamageMultiplier(item));
  const enchantTotal = enchantments.reduce((sum, level) => sum + Number(level || 0), 0);
  const slotCapacity = enchantments.length * MAX_ENCH_LEVEL;
  const statPreview = ascensionStatPreview(item, before, advancement,
    projectedAdvancement, canProject && (operation === 'stage' || operation === 'ascend'));
  return {
    itemLevel: Number(item.itemLevel ?? item.level ?? 1),
    enchantSlot: selectedSlot,
    currentAttack, projectedAttack,
    enchantTotal, projectedEnchant: canProject && operation === 'enchant' ? enchantTotal + 1 : enchantTotal,
    chance: preview.chance, cost: preview.cost || {},
    overEnchantLevel: Number(overEnchant.level || 0),
    // The original meter says "Ascension Readiness": represent the owned
    // item's persisted stage, not an imaginary ascension or enchant score.
    readiness: Math.min(100, Math.max(0, Number(advancement.stage?.rank || 0) / 4 * 100)),
    enchantTotalMax: slotCapacity,
    stage: advancement.stage?.label || 'Base',
    stageRank: Math.min(4, Number(advancement.stage?.rank || 0)),
    legacyStage: Number(advancement.stage?.rank || 0) > 4,
    ascensionBonus: getAXEEquipmentAscensionBonus(advancement.stage),
    nextAscensionBonus: preview?.nextAscensionGain ?? null,
    ascensionStatPreview: statPreview,
    reinforcementPercent: Number(reinforcement.percent || 0),
    reinforcementCap: getAXEReinforcementCap(item),
    preview,
  };
}

// Rebuild the canonical preview from owned state before EVERY batch attempt.
function liveAutoPreview(serviceId, item, donor = null, protectedAttempt = false) {
  const id = item.instanceId;
  const enchantments = getItemEnchantments(id);
  const slotIndex = Math.max(0, enchantments.findIndex(level => Number(level) < MAX_ENCH_LEVEL));
  const preview = getAXEServiceOperationPreview(serviceId, {
    item, donor, enchantments, slotIndex,
    reinforcement: getItemReinforcement(id), overEnchant: getItemOverEnchant(id),
    advancement: getAXEAdvancementState(id), sockets: getAXESocketState(id),
    protectedAttempt, enchantCost: getCostForNextLevel(enchantments[slotIndex] || 0),
  });
  return { ...preview, slotIndex,
    canAdvance: preview.canAdvance && (serviceId !== 'over_enchant' || isReadyToOverenchant(id)),
  };
}

export default function AXEBlacksmithImageWorkspace({
  mode, onClose, stationMessage = '', EquipmentPanel, ProgressionPanel, onSelectedItem, onTransaction,
}) {
  const initialTab = mode.serviceId === 'stage' ? 'ascend'
    : mode.serviceId === 'ultimate' || mode.serviceId === 'runes' ? 'runes'
    : ['enchant','over_enchant','combine','sockets','core'].includes(mode.serviceId) ? mode.serviceId : 'enchant';
  const closeRef = useRef(null);
  // This close button is inside the lazily loaded forge art. Give it focus once
  // the art mounts, since the shared shell's effect may run before Suspense resolves.
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, []);
  const [items, setItems] = useState(() => getAllAXEEquipmentItems());
  const [loot, setLoot] = useState(() => getLootInventory());
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState('All');
  const [kindFilter, setKindFilter] = useState('All');
  const [rarityFilter, setRarityFilter] = useState('All');
  const [selectedId, setSelectedId] = useState(mode.itemId || '');
  const [donorId, setDonorId] = useState('');
  const [forging, setForging] = useState(false);
  const [confirmCombine, setConfirmCombine] = useState(false);
  const [forgeNotice, setForgeNotice] = useState('');
  const [tab, setTab] = useState(initialTab);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoProtection, setAutoProtection] = useState(false);
  const [minSuccess, setMinSuccess] = useState(90);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchPending, setBatchPending] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [socketFilter, setSocketFilter] = useState('Equipment');
  const [socketGemId, setSocketGemId] = useState('');
  const [socketDonorGemId, setSocketDonorGemId] = useState('');
  const [socketSelectionTarget, setSocketSelectionTarget] = useState('primary');
  const [socketMode, setSocketMode] = useState('insert');
  const cancelledBatch = useRef(false);
  const batchRunningRef = useRef(false);

  useEffect(() => subscribeAXEEquipmentInventory(snapshot => setItems(snapshot?.items || getAllAXEEquipmentItems())), []);
  useEffect(() => subscribeLootInventory(snapshot => setLoot(snapshot || getLootInventory())), []);
  useEffect(() => subscribeEnchantments(() => setRevision(v => v + 1)), []);
  useEffect(() => subscribeAXEItemAdvancement(() => setRevision(v => v + 1)), []);
  useEffect(() => subscribeAXESockets(() => setRevision(v => v + 1)), []);
  useEffect(() => { if (mode.itemId) setSelectedId(mode.itemId); }, [mode.itemId]);
  useEffect(() => subscribeCharacterChange(() => {
    cancelledBatch.current = true;
    setSelectedId(''); setDonorId(''); setSelectedMaterialId('');
    setSocketGemId(''); setSocketDonorGemId(''); setSocketSelectionTarget('primary');
    setSocketFilter('Equipment'); setSocketMode('insert');
    setAutoEnabled(false); setBatchPending(false);
  }), []);
  useEffect(() => () => { cancelledBatch.current = true; }, []);
  useEffect(() => {
    if (['enchant','over_enchant','combine','sockets','core'].includes(mode.serviceId)) setTab(mode.serviceId);
    else if (mode.serviceId === 'stage') setTab('ascend');
    else if (mode.serviceId === 'ultimate' || mode.serviceId === 'runes') setTab('runes');
  }, [mode.serviceId]);
  useEffect(() => {
    if (selectedId && !items.some(item => item.instanceId === selectedId)) setSelectedId('');
    if (donorId && !items.some(item => item.instanceId === donorId)) setDonorId('');
  }, [items, selectedId, donorId]);
  useEffect(() => { setConfirmCombine(false); setForgeNotice(''); }, [tab, selectedId, donorId]);
  useEffect(() => {
    cancelledBatch.current = true;
    setBatchPending(false);
    setSelectedMaterialId('');
    setShowAll(false);
  }, [tab, selectedId]);

  const selectedItem = items.find(item => item.instanceId === selectedId) || null;
  const donorItem = items.find(item => item.instanceId === donorId && item.instanceId !== selectedId) || null;
  const materialStacks = useMemo(() => {
    const stacks = new Map();
    for (const [category, records] of Object.entries(loot || {})) {
      if (!['material', 'gem', 'evolution'].includes(category)) continue;
      for (const record of records || []) {
        const id = record.id || record.templateId;
        if (!id) continue;
        const key = category + ':' + id;
        const amount = Math.max(1, asNumber(record.quantity || record.count || 1));
        const previous = stacks.get(key);
        const gem = category === 'gem' ? AXE_GEM_DEFINITIONS[id] : null;
        stacks.set(key, previous
          ? { ...previous, quantity: previous.quantity + amount }
          : { ...record, name:gem?.name || record.name || id,
              instanceId: key, material: true, resourceCategory: category, quantity: amount,
              gemIcon:gem?.icon || null });
      }
    }
    return [...stacks.values()];
  }, [loot]);
  const inventoryCount = items.length + materialStacks.length;
  const overReady = Boolean(selectedItem && isReadyToOverenchant(selectedItem.instanceId));
  // Recompute persisted enchantment, stage and gem previews on their subscriptions.
  void revision;
  // Ascend reuses the existing server-compatible Stage I-V transaction.
  const forgeTab = ['enchant','over_enchant','combine','sockets','ascend'].includes(tab);
  const readout = selectedItem && forgeTab ? getAXEBlacksmithReadout(selectedItem, tab === 'ascend' ? 'stage' : tab,
    tab === 'combine' ? donorItem : null) : null;
  const progressState = selectedItem ? getAXEAdvancementState(selectedItem.instanceId) : null;
  const socketState = selectedItem ? getAXESocketState(selectedItem.instanceId) : null;
  const materials = readout ? Object.entries(readout.cost || {}).slice(0, 4) : [];
  const workflowMode = ['combine', 'enchant', 'over_enchant'].includes(tab);
  const compatibleDonors = useMemo(() => selectedItem && tab === 'combine'
    ? items.filter(candidate => isSafeCombineDonor(selectedItem, candidate,
      (target, donor) => isAXECompatibleDonor(target, donor, progressState)))
    : [], [items, selectedId, tab, revision]);
  useEffect(() => {
    if (tab !== 'combine' || !autoEnabled || !selectedItem || batchBusy) return;
    if (donorItem && compatibleDonors.some(item => item.instanceId === donorItem.instanceId)) return;
    setDonorId(compatibleDonors[0]?.instanceId || '');
  }, [tab, autoEnabled, selectedId, donorId, items, revision, batchBusy]);
  const relevantCost = readout ? {
    ...(readout.cost || {}),
    ...(tab === 'over_enchant' && autoProtection &&
      Number(readout.chance) < minSuccess / 100 ? {
        mat_protection: getAXEOverEnchantCost(getItemOverEnchant(selectedId)?.level,
          { protectedAttempt: true }).mat_protection,
      } : {}),
  } : {};
  const inventoryRelevantCost = tab === 'over_enchant' ? { ...relevantCost, mat_protection: 1 } : relevantCost;
  const materialRequirements = Object.entries(relevantCost).map(([id, required]) =>
    [id, required, getAXEServiceResourceCount(id)]);
  const stagedMaterial = materialStacks.find(item => item.id === selectedMaterialId) || null;
  const rarities = useMemo(() => [...new Set(items
    .map(item => String(item.rarity || item.tier || '').trim().toLowerCase())
    .filter(Boolean))].sort(), [items]);
  const displayed = useMemo(() => {
    if (workflowMode && selectedItem && !showAll) return filterForgeInventory({
      mode: tab, target: selectedItem, items, materialStacks, required: inventoryRelevantCost,
      resourceCategory: getAXEServiceResourceCategory,
      compatible: (target, donor) => isAXECompatibleDonor(target, donor, progressState),
    });
    if (tab === 'sockets') {
      const equipment = ['All','Equipment','Weapons','Armor','Accessories'].includes(socketFilter)
        ? items.filter(item => SOCKET_EQUIPMENT_SLOTS.has(item.slot)
          && (['All','Equipment'].includes(socketFilter) || getKind(item) === socketFilter))
        : [];
      const resources = materialStacks.filter(item =>
        (item.resourceCategory === 'gem' && !!AXE_GEM_DEFINITIONS[item.id] &&
          ['All','Gems'].includes(socketFilter))
        || (SOCKET_RESOURCE_IDS.has(item.id) && ['All','Socket Materials'].includes(socketFilter)));
      const selected = socketMode === 'upgrade' ? resources.filter(item => item.resourceCategory === 'gem')
        : [...equipment, ...resources];
      return selected.filter(item => rarityFilter === 'All' || item.material
        || String(item.rarity || item.tier || '').toLowerCase() === rarityFilter);
    }
    const equipment = filter === 'Materials' ? []
      : (filter === 'All' ? items : items.filter(item => getKind(item) === filter))
        .filter(item => kindFilter !== 'Materials')
        .filter(item => rarityFilter === 'All'
          || String(item.rarity || item.tier || '').trim().toLowerCase() === rarityFilter);
    const stacks = (filter === 'All' || filter === 'Materials')
      && kindFilter !== 'Equipment' && rarityFilter === 'All' ? materialStacks : [];
    return [...equipment, ...stacks];
  }, [items, materialStacks, filter, kindFilter, rarityFilter, selectedId, tab, showAll, revision, autoProtection, minSuccess, socketFilter, socketMode]);
  const gridSlots = Array.from({ length: Math.max(200, displayed.length) }, (_, index) => displayed[index] || null);
  const selectedTab = BLACKSMITH_TABS.find(entry => entry.id === tab) || BLACKSMITH_TABS[0];
  const currentStage = progressState?.stage?.label || 'Base';
  const progress = selectedItem ? Math.max(0, Math.min(100, asNumber(progressState?.stage?.rank) / 4 * 100)) : 0;
  const percent = readout?.chance == null ? null : Math.round(readout.chance * 100);
  const status = !selectedItem ? 'Choose a piece of equipment from Inventory'
    : tab === 'over_enchant' && !overReady ? 'Finish standard Enchant before Over-Enchant'
    : tab === 'combine' && !donorItem ? 'Choose a separate matching donor in the second square'
    : readout?.preview?.reason && !readout.preview.canAdvance ? readout.preview.reason
    : readout?.preview?.outcome || 'Ready to review forge requirements';
  const currentValue = tab === 'ascend' ? Math.min(4, asNumber(progressState?.stage?.rank))
    : tab === 'combine' ? asNumber(progressState?.combine?.count)
    : tab === 'sockets' ? asNumber(socketState?.sockets?.length)
    : tab === 'over_enchant' ? asNumber(getItemOverEnchant(selectedId)?.level)
    : readout?.enchantTotal || 0;
  const nextValue = tab === 'ascend' || tab === 'combine' || tab === 'sockets' || tab === 'over_enchant'
    ? (readout?.preview?.canAdvance ? currentValue + 1 : null)
    : tab === 'enchant' ? readout?.projectedEnchant : null;

  const pickTab = next => {
    cancelledBatch.current = true;
    setBatchPending(false);
    setAutoEnabled(false);
    setDonorId('');
    setTab(next);
    mode.controller.selectOperation(next === 'ascend' ? 'stage' : next);
  };
  const selectItem = entry => {
    if (batchRunningRef.current || forging) return;
    if (entry.material) {
      if (tab === 'sockets' && entry.resourceCategory === 'gem' && AXE_GEM_DEFINITIONS[entry.id]) {
        // The two gem squares are selection targets for the same owned stack
        // in the canonical inventory; no duplicate item instance is created.
        if (socketMode === 'upgrade' && socketSelectionTarget === 'donor') {
          setSocketDonorGemId(entry.id);
        } else {
          setSocketGemId(entry.id);
          setSocketDonorGemId('');
        }
        return;
      }
      if (selectedItem && (tab === 'enchant' || tab === 'over_enchant') &&
          Object.hasOwn(inventoryRelevantCost, entry.id)) setSelectedMaterialId(entry.id);
      return;
    }
    if (tab === 'combine' && selectedItem && entry.instanceId !== selectedId &&
        isSafeCombineDonor(selectedItem, entry, (target, donor) =>
          isAXECompatibleDonor(target, donor, progressState))) setDonorId(entry.instanceId);
    else {
      setSelectedId(entry.instanceId);
      setDonorId('');
    }
    // Inventory selection never begins a transaction.
    onSelectedItem?.(entry);
  };
  const contextSelect = (event, entry) => {
    event.preventDefault();
    // On touchscreens and keyboards the existing click selection still works.
    selectItem(entry);
  };

  const setForgeSlot = (slot, itemId) => {
    const owned = items.find(entry => entry.instanceId === itemId);
    if (!owned) { setForgeNotice('Choose an owned equipment item.'); return; }
    if (slot === 'target') {
      setSelectedId(owned.instanceId);
      if (owned.instanceId === donorId) setDonorId('');
    } else if (slot === 'donor' && owned.instanceId !== selectedId &&
        selectedItem && isSafeCombineDonor(selectedItem, owned, (target, donor) =>
          isAXECompatibleDonor(target, donor, progressState))) setDonorId(owned.instanceId);
    else { setForgeNotice('The donor must be a separate equipment item.'); return; }
    onSelectedItem?.(owned);
  };
  const dropInto = (event, slot) => {
    event.preventDefault();
    const itemId = event.dataTransfer.getData('application/x-axe-owned-equipment')
      || event.dataTransfer.getData('text/plain');
    setForgeSlot(slot, itemId);
  };
  const canForge = forgeTab && !!selectedItem
    && (tab !== 'over_enchant' || overReady)
    && (tab !== 'combine' || (!!donorItem &&
      isSafeCombineDonor(selectedItem, donorItem,
        (target, donor) => isAXECompatibleDonor(target, donor, progressState))))
    && !!readout?.preview?.canAdvance;
  const beginForge = async () => {
    if (!canForge || forging || batchRunningRef.current) return;
    if (tab === 'combine' && !confirmCombine) {
      setConfirmCombine(true);
      setForgeNotice('A successful combine consumes the donor. Confirm to begin forging.');
      return;
    }
    setForging(true);
    setForgeNotice('Forging…');
    try {
      const result = await executeAXEServiceTransaction(tab === 'ascend' ? 'stage' : tab, {
        itemId: selectedItem.instanceId,
        ...(tab === 'combine' ? { donorId: donorItem.instanceId } : {}),
        ...(tab === 'enchant' ? { slotIndex: readout.enchantSlot } : {}),
      });
      onTransaction?.(result);
      setForgeNotice(result.outcome || result.message || result.reason?.replaceAll('_', ' ')
        || (result.ok ? 'Forging completed.' : 'Forging could not be completed.'));
      if (result.donorConsumed) setDonorId('');
      setRevision(current => current + 1);
    } catch (error) {
      setForgeNotice(error?.message || 'Forging could not be completed.');
    } finally {
      setForging(false);
      setConfirmCombine(false);
    }
  };
  const runAuto = async () => {
    if (!autoEnabled || !workflowMode || !selectedItem || forging || batchRunningRef.current) return;
    if (!batchPending) {
      setBatchPending(true);
      setForgeNotice('Confirm the batch: up to 12 real transactions; successful combines consume donors.');
      return;
    }
    setBatchPending(false);
    cancelledBatch.current = false;
    batchRunningRef.current = true;
    setBatchBusy(true);
    setForgeNotice('Processing confirmed batch…');
    try {
      const completed = await runBlacksmithAutoBatch({
        mode: tab, targetId: selectedItem.instanceId,
        getTarget: id => getAllAXEEquipmentItems().find(item => item.instanceId === id),
        getDonors: getAllAXEEquipmentItems,
        compatible: (target, donor) => isAXECompatibleDonor(
          target, donor, getAXEAdvancementState(target.instanceId)),
        getPreview: liveAutoPreview,
        getResourceCount: getAXEServiceResourceCount,
        getIdentity: () => String(getStorageUser()) + ':' + String(getActiveId()),
        cancelled: () => cancelledBatch.current,
        minSuccess: minSuccess / 100,
        allowProtection: autoProtection,
        maxAttempts: 12,
        transact: async (operation, payload) => {
          const result = await executeAXEServiceTransaction(operation, payload);
          onTransaction?.(result);
          return result;
        },
        onAttempt: ({ result, attempts, donorId: consumedId }) => {
          setRevision(value => value + 1);
          if (result?.donorConsumed && consumedId) setDonorId('');
          setForgeNotice('Attempt ' + attempts + ': ' +
            (result?.message || result?.outcome || result?.reason || 'completed'));
        },
      });
      setForgeNotice(completed.attempts + ' attempt(s), ' + completed.successes +
        ' success(es). Stopped: ' + String(completed.reason).replaceAll('_', ' ') + '.');
    } catch (error) {
      setForgeNotice(error?.message || 'The auto-forge batch was interrupted.');
    } finally {
      setBatchBusy(false);
      batchRunningRef.current = false;
      setConfirmCombine(false);
      setRevision(value => value + 1);
    }
  };
  const clearTarget = () => {
    if (batchRunningRef.current) return;
    setSelectedId(''); setDonorId(''); setSelectedMaterialId('');
  };
  return <div className="axe-blacksmith-viewport" aria-label="Blacksmith glass forge">
    <div className="axe-blacksmith-image-stage" data-forge-tab={tab}>
      <img className="axe-blacksmith-reference" src={APPROVED_IMAGE}
        alt="" aria-hidden="true" draggable={false} />
      {/* The original PNG also contains painted boxes and a ring. The current
          single-glass skin hides that old layer and draws live UI instead. */}
      <header className="axe-blacksmith-live-heading">
        <h2>Blacksmith</h2><p>Forge of Ascension</p>
      </header>
      {/* The Blacksmith title plaque is already drawn into the approved art.
          Close from the plaque itself; do not mount a second Close header. */}
      <button type="button" ref={closeRef} className="axe-blacksmith-title-close"
        data-service-close onClick={onClose} aria-label="Close Blacksmith"
        title="Close Blacksmith"><span aria-hidden="true">×</span></button>
      {/* The workstation availability message stays available for assistive
          technology without taking an entire extra row above the forge. */}
      {stationMessage && <span className="axe-blacksmith-workstation-status"
        role="status" aria-live="polite">{stationMessage}</span>}

      <nav className="axe-blacksmith-image-tabs" aria-label="Blacksmith operations">
        {BLACKSMITH_TABS.map(({ id, label, Icon }) => <button type="button" key={id}
          aria-pressed={tab === id} onClick={() => pickTab(id)} title={label} disabled={batchBusy}>
          <Icon size={24} strokeWidth={1.65} aria-hidden="true" /><span>{label}</span>
        </button>)}
      </nav>

      {tab === 'core' && <AXECoreForgePane />}
      {tab === 'runes' && <AXERuneForgePane />}
      {workflowMode && <AXEBlacksmithWorkflowPanel
        mode={tab} target={selectedItem} donor={donorItem}
        compatibleDonors={compatibleDonors} requirements={materialRequirements}
        selectedMaterial={stagedMaterial} materialSelection={selectedMaterialId}
        readout={readout} canForge={canForge} confirmCombine={confirmCombine}
        autoEnabled={autoEnabled} onToggleAuto={setAutoEnabled}
        autoProtection={autoProtection} onToggleProtection={setAutoProtection}
        minSuccess={minSuccess} onChangeThreshold={setMinSuccess}
        onSelectDonor={item => setForgeSlot('donor', item.instanceId)}
        onClearTarget={clearTarget} onClearDonor={() => setDonorId('')}
        onDropSlot={dropInto}
        onMaterial={id => {
          if (Object.hasOwn(inventoryRelevantCost, id)) setSelectedMaterialId(id);
        }}
        onForge={beginForge} onAuto={runAuto}
        onStop={() => { cancelledBatch.current = true; setForgeNotice('Stopping after the current attempt…'); }}
        busy={forging} batchBusy={batchBusy} batchPending={batchPending}
        onCancelBatch={() => setBatchPending(false)}
        notice={forgeNotice || status} onChangeMode={pickTab}
      />}

      <section className="axe-blacksmith-inventory-shell" aria-label="Blacksmith inventory">
        <div className="axe-blacksmith-inventory-toolbar">
          <div className="axe-blacksmith-inventory-heading">
            <Package size={19} aria-hidden="true" />
            <h3>Inventory</h3>
            <span className="axe-blacksmith-item-count" aria-live="polite"
              aria-label={inventoryCount + ' occupied inventory slots of 200'}>
              <Dumbbell size={15} aria-hidden="true" />{inventoryCount} / 200
            </span>
          </div>
          {tab === 'sockets' && <span className="axe-blacksmith-socket-filter-hint" role="status">
            {socketFilter === 'Equipment' ? 'Equipment selection' : socketFilter === 'Gems' ? 'Owned gems' : socketFilter === 'Socket Materials' ? 'Socket materials' : socketFilter}
          </span>}
          {workflowMode && selectedItem && <button type="button" className="axe-blacksmith-show-all"
          aria-pressed={showAll} onClick={() => setShowAll(value => !value)}>
          {showAll ? 'Show compatible' : 'Show all'} inventory
        </button>}
        <div className="axe-blacksmith-inventory-selectors">
            <SlidersHorizontal size={15} aria-hidden="true" />
            <label>Type
              <select aria-label="Inventory item type" disabled={tab === 'sockets' && socketMode === 'upgrade'}
                value={tab === 'sockets'
                  ? ['Equipment','Gems','Socket Materials'].includes(socketFilter) ? socketFilter : 'All'
                  : kindFilter}
                onChange={event => {
                  const next = event.target.value;
                  if (tab === 'sockets') {
                    setSocketFilter(next); setRarityFilter('All'); return;
                  }
                  setKindFilter(next);
                  if (next === 'Materials') setRarityFilter('All');
                }}>
                <option value="All">All items</option>
                <option value="Equipment">Equipment</option>
                {tab === 'sockets' ? <>
                  <option value="Gems">Gems</option>
                  <option value="Socket Materials">Socket materials</option>
                </> : <option value="Materials">Materials</option>}
              </select>
            </label>
            <label>Rarity
              <select aria-label="Inventory rarity" value={rarityFilter}
                onChange={event => setRarityFilter(event.target.value)}
                disabled={tab === 'sockets' ? socketFilter === 'Socket Materials' : kindFilter === 'Materials'}>
                <option value="All">All rarities</option>
                {rarities.map(rarity => <option value={rarity} key={rarity}>
                  {rarity.slice(0, 1).toUpperCase() + rarity.slice(1)}
                </option>)}
              </select>
            </label>
          </div>
        </div>
      <div className="axe-blacksmith-image-filters" role="group" aria-label="Inventory filters">
        {(tab === 'sockets'
          ? socketMode === 'upgrade' ? ['Gems'] : SOCKET_FILTERS
          : FILTERS).map(label => <button type="button" key={label}
          aria-pressed={tab === 'sockets' ? socketFilter === label : filter === label}
          onClick={() => tab === 'sockets' ? setSocketFilter(label) : setFilter(label)}>{label}</button>)}
      </div>

      <div className="axe-blacksmith-image-inventory" role="list" aria-label="Owned items and materials">
        {gridSlots.map((entry, index) => entry ? <button type="button" role="listitem" key={entry.instanceId}
          className="axe-blacksmith-image-item"
          aria-pressed={tab === 'sockets' && entry.resourceCategory === 'gem'
            ? (socketMode === 'upgrade' && socketSelectionTarget === 'donor'
              ? socketDonorGemId === entry.id : socketGemId === entry.id)
            : !entry.material && (selectedId === entry.instanceId || (tab === 'combine' && donorId === entry.instanceId))}
          draggable={!entry.material}
          onDragStart={event => {
            if (!entry.material) {
              event.dataTransfer.setData('application/x-axe-owned-equipment', entry.instanceId);
              event.dataTransfer.setData('text/plain', entry.instanceId);
              event.dataTransfer.effectAllowed = 'copy';
            }
          }}
          onClick={() => selectItem(entry)} onDoubleClick={() => selectItem(entry)}
          onContextMenu={event => contextSelect(event, entry)}
          title={(entry.name || entry.id) + ' — right-click to place in Forge'}>
          {entry.gemIcon && tab === 'sockets' ? <span className="axe-blacksmith-gem-icon" aria-hidden="true">{entry.gemIcon}</span>
            : itemArt(entry) ? <img className="axe-blacksmith-item-image" src={itemArt(entry)}
            alt="" loading="lazy" /> : <InventorySymbol item={entry} />}
          <span className="axe-blacksmith-slot-name">{entry.name || entry.id}</span>
          {entry.material && <span className="axe-blacksmith-slot-quantity">{fmt(entry.quantity)}</span>}
        </button> : <span key={'empty-'+index} className="axe-blacksmith-empty-slot" role="presentation" />)}
      </div>

      </section>

      {tab === 'combine' && <div className="axe-blacksmith-combine-slots" aria-label="Combine Stage equipment slots">
        {[
          { id: 'target', label: 'Target', item: selectedItem },
          { id: 'donor', label: 'Donor', item: donorItem },
        ].map(({ id, label, item }) => <div key={id} className="axe-blacksmith-combine-slot-wrap">
          <button type="button" className="axe-blacksmith-combine-slot"
            aria-label={label + ' equipment slot' + (item ? ': ' + item.name : ': empty')}
            onDragOver={event => event.preventDefault()} onDrop={event => dropInto(event, id)}
            onClick={() => { if (id === 'target') { setSelectedId(''); setDonorId(''); } else setDonorId(''); }}
            title={item ? 'Clear ' + label : 'Choose equipment from inventory'}>
            {item ? itemArt(item) ? <img src={itemArt(item)} alt="" /> : <InventorySymbol item={item} /> : <span aria-hidden="true">+</span>}
          </button>
          <small>{label}</small>
        </div>)}
      </div>}
      <div className="axe-blacksmith-forge-ring" aria-hidden="true">
        <i className="axe-blacksmith-forge-glyph axe-blacksmith-forge-glyph--top">✦</i>
        <i className="axe-blacksmith-forge-glyph axe-blacksmith-forge-glyph--left">✧</i>
        <i className="axe-blacksmith-forge-glyph axe-blacksmith-forge-glyph--right">✧</i>
        <i className="axe-blacksmith-forge-glyph axe-blacksmith-forge-glyph--bottom">✦</i>
      </div>
      <div className="axe-blacksmith-center-preview" role="status" aria-label={
        selectedItem ? 'Selected equipment in forge: ' + selectedItem.name : 'Forge is empty'}>
        {selectedItem && <>
          <div className="axe-blacksmith-item-rarity">{selectedItem.rarity || selectedItem.tier || 'Equipment'}</div>
          <h3>{selectedItem.name || 'Equipment'}</h3>
          <div className="axe-blacksmith-item-level">Lv. {fmt(selectedItem.itemLevel ?? selectedItem.level ?? 1)}</div>
          <div className="axe-blacksmith-center-art">
            {itemArt(selectedItem) ? <img src={itemArt(selectedItem)} alt="" /> : <InventorySymbol item={selectedItem} />}
          </div>
        </>}
      </div>

      <section className="axe-blacksmith-operation-panel" aria-label={selectedTab.label + ' details'}>
        <div className="axe-blacksmith-operation-heading">
          <small>Forge Operation</small><h3>{selectedTab.label}</h3>
          <p>{OPERATION_DESCRIPTIONS[tab]}</p>
        </div>
        <div className="axe-blacksmith-projected-block">
          <strong>Selected Equipment</strong>
          <div className="axe-blacksmith-dynamic-row">
            <span>{selectedItem ? selectedItem.name : 'Equipment'}</span>
            <b>{selectedItem ? 'Lv. ' + fmt(selectedItem.itemLevel ?? selectedItem.level ?? 1) : '—'}</b>
          </div>
          <div className="axe-blacksmith-dynamic-row">
            <span>{tab === 'combine' ? 'Combine count' : tab === 'sockets' ? 'Sockets opened'
              : tab === 'over_enchant' ? 'Over-Enchant' : tab === 'ascend' ? 'Equipment Stage' : 'Enchantment'}</span>
            <b>{selectedItem ? (tab === 'ascend' ? 'Stage ' : '+') + fmt(currentValue) : '—'}</b>
            <span className="axe-blacksmith-arrow">→</span>
            <b>{nextValue == null ? '—' : (tab === 'ascend' ? 'Stage ' : '+') + fmt(nextValue)}</b>
          </div>
          <div className="axe-blacksmith-dynamic-row">
            <span>Attack</span><b>{fmt(readout?.currentAttack)}</b>
            <span className="axe-blacksmith-arrow">→</span>
            <b>{fmt(readout?.projectedAttack)}</b>
          </div>
          <p className="axe-blacksmith-operation-hint" role="status">{forgeNotice || status}</p>
        </div>
        <div className="axe-blacksmith-materials-block">
          <strong>Required Materials</strong>
          {materials.length ? materials.map(([id, required]) => {
            const owned = getAXEServiceResourceCount(id);
            return <div key={id} className="axe-blacksmith-material-row">
              <span>{MATERIAL_NAMES.get(id) || id.replaceAll('_', ' ')}</span>
              <b className={owned < required ? 'is-short' : ''}>{fmt(owned)} / {fmt(required)}</b>
            </div>;
          }) : <p>{!selectedItem ? 'Select owned equipment to display its real costs.'
            : tab === 'combine' ? 'Choose a matching donor in the second slot.'
            : 'No materials listed for this operation.'}</p>}
        </div>
        <div className="axe-blacksmith-success">
          <span>Success Rate</span>
          <b>{percent == null ? '—' : percent + '%'}</b>
          <div className="axe-blacksmith-success-track"><i style={{ width: (percent || 0) + '%' }} /></div>
        </div>
        {tab === 'ascend' && <div className="axe-blacksmith-extra-details" aria-label="Ascension reinforcement and stat imprint details">
          <h4>Ascension Imprint — Four Stages</h4>
          <div><span>Rarity</span><b>{selectedItem?.rarity || '—'}</b></div>
          <div><span>Current Reinforcement</span><b>{fmt(readout?.reinforcementPercent)}%</b></div>
          <div><span>Rarity reinforcement maximum</span><b>{fmt(readout?.reinforcementCap)}%</b></div>
          <div><span>Ascensions used</span><b>{fmt(readout?.stageRank)} / 4</b></div>
          <div><span>Locked flat-stat bonus</span><b>+{((readout?.ascensionBonus || 0) * 100).toFixed(2)}%</b></div>
          <div><span>Next imprint adds</span><b>{readout?.nextAscensionBonus == null ? 'MAX'
            : '+' + (readout.nextAscensionBonus * 100).toFixed(2) + '%'}</b></div>
          {readout?.ascensionStatPreview && <div><span>{readout.ascensionStatPreview.label}</span>
            <b>{fmt(readout.ascensionStatPreview.current)}{readout.ascensionStatPreview.isRate ? '%' : ''}
              {' → '}{fmt(readout.ascensionStatPreview.next)}{readout.ascensionStatPreview.isRate ? '%' : ''}</b>
          </div>}
          <p>Reinforce first for stronger bonuses. Each Ascension permanently records the percentage used; later upgrades cannot change an earlier imprint.</p>
        </div>}
        {workflowMode && <div className="axe-blacksmith-extra-details" aria-label="Detailed upgrade information">
          <h4>Equipment &amp; Forge Details</h4>
          <div><span>Rarity</span><b>{selectedItem?.rarity || selectedItem?.tier || '—'}</b></div>
          <div><span>Item level</span><b>{selectedItem ? fmt(selectedItem.itemLevel ?? selectedItem.level ?? 1) : '—'}</b></div>
          <div><span>Equipment stage</span><b>{selectedItem ? currentStage : '—'}</b></div>
          <div><span>Combine successes</span><b>{selectedItem ? fmt(progressState?.combine?.count || 0) : '—'}</b></div>
          {tab === 'combine' && <>
            <div><span>Matching donors</span><b>{compatibleDonors.length}</b></div>
            <div><span>Selected donor</span><b>{donorItem?.name || 'None'}</b></div>
            <p>Same template, rarity and item level only. Equipped, locked, and favorited items are excluded.</p>
          </>}
          {tab === 'enchant' && <div><span>Enchant level</span>
            <b>{selectedItem ? fmt(readout?.enchantTotal) + ' / ' + fmt(readout?.enchantTotalMax) : '—'}</b></div>}
          {tab === 'over_enchant' && <>
            <div><span>Over-Enchant</span><b>{selectedItem ? '+' + fmt(getItemOverEnchant(selectedId).level) : '—'}</b></div>
            <div><span>Stabilizers owned</span><b>{fmt(getAXEServiceResourceCount('mat_protection'))}</b></div>
            <div><span>Auto-stop below</span><b>{fmt(minSuccess)}% success</b></div>
          </>}
          <div><span>Automatic processing</span><b>{autoEnabled ? 'Armed — confirmation required' : 'Off'}</b></div>
          <p className={tab === 'over_enchant' ? 'axe-forge-detail-warning' : ''}>
            {readout?.preview?.risk || 'Choose an item to see the actual result and requirements.'}
          </p>
        </div>}
        {tab === 'combine' && <AXEWeaponLegacyForgePane
          target={selectedItem}
          items={items}
          combineCount={Number(progressState?.combine?.count || 0)}
          reinforcementPercent={Number(readout?.reinforcementPercent || 0)}
          onTransaction={result => {
            setRevision(value => value + 1);
            onTransaction?.(result);
          }} />}
      </section>

      <section className="axe-blacksmith-progression-panel" aria-label="Equipment progression">
        <h3>Equipment Progression</h3>
        <div className="axe-blacksmith-current-projected" aria-label="Actual combat attack projection">
        <span>Current Attack <b>{fmt(readout?.currentAttack)}</b></span>
        <span aria-hidden="true">→</span>
        <span>Projected Attack <b>{fmt(readout?.projectedAttack)}</b></span>
      </div>
      <div className="axe-blacksmith-stats-strip" aria-label="Equipment progress">
        <span>Attack <b>{fmt(readout?.currentAttack)}</b></span>
        <span>Item Level <b>{selectedItem ? fmt(selectedItem.itemLevel ?? selectedItem.level ?? 1) : '—'}</b></span>
        <span>{tab === 'sockets' ? 'Sockets' : 'Enchantment'} <b>{selectedItem
          ? tab === 'sockets' ? asNumber(socketState?.sockets?.length) + ' / ' + (socketState?.maxSockets || 4)
            : '+' + fmt(readout?.enchantTotal ?? getItemEnchantments(selectedId).reduce((n,v)=>n+asNumber(v),0)) : '—'}</b></span>
      </div>
      <div className="axe-blacksmith-readiness" aria-label="Equipment stage progression">
        <div><span>{selectedItem ? currentStage : 'No selected equipment'}</span>
          <b>{selectedItem ? 'Stage ' + Math.min(4, asNumber(progressState?.stage?.rank)) + ' / 4' : '—'}</b></div>
        <div className="axe-blacksmith-readiness-track"><i style={{ width: progress + '%' }} /></div>
      </div>
      </section>

      {tab === 'sockets' && <AXEGemForgePane
        selectedItemId={selectedId} selectedGemId={socketGemId} selectedDonorGemId={socketDonorGemId}
        mode={socketMode} activeSelectionTarget={socketSelectionTarget}
        onChangeMode={next => {
          setSocketMode(next); setSocketSelectionTarget('primary'); setSocketDonorGemId('');
          setSocketFilter(next === 'upgrade' ? 'Gems' : 'Equipment'); setRarityFilter('All');
        }}
        onSelectDonorGem={setSocketDonorGemId}
        onFocusInventory={(next, target = 'primary') => {
          setSocketSelectionTarget(target); setSocketFilter(next); setRarityFilter('All');
        }}
        onTransaction={onTransaction} />}
      {tab !== 'core' && tab !== 'runes' && !workflowMode &&
        <button type="button" className="axe-blacksmith-begin-forge"
          onClick={beginForge} disabled={!canForge || forging} aria-busy={forging}>
          {forging ? 'Forging…' : 'Forge'}
        </button>}
    </div>
  </div>;
}
