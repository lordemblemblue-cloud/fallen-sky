import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Gem, Package, Shield, Swords, Sparkles, Zap, Layers, Diamond, CircleDot, Dumbbell, SlidersHorizontal, ChevronsUp } from 'lucide-react';
import { getAllAXEEquipmentItems, getAXEEquipmentItem, subscribeAXEEquipmentInventory } from '../equipment/AXEEquipmentInventoryStore';
import { applyAXEGearTierRecord, axeGearRarityLabel, getAXEGearItemType } from '../../../../../base44/shared/axeGearTiers.ts';
import { isGearTiersEnabled } from '../loot/AXEGearTierFlag.mjs';
import { getPlayerHUD } from '../../playerHUDStore';
import { LOOT_TABLE, getLootInventory, subscribeLootInventory } from '../../lootStore';
import {
  getItemEnchantments, getItemReinforcement, getItemOverEnchant, getCostForNextLevel,
  MAX_ENCH_LEVEL, MATERIALS, subscribeEnchantments,
} from '../../equipment/enchantmentStore';
import { getAXEAdvancementState, subscribeAXEItemAdvancement } from '../equipment/AXEItemAdvancementStore';
import { getAXESocketState, subscribeAXESockets } from '../equipment/AXESocketGemStore';
import { AXE_REINFORCEMENT_CONFIG, getAXEReinforcementCap } from '../equipment/AXEItemEnhancementSystem';
import { getAXEOwnedItemStatBreakdown } from '../equipment/AXEEquipmentRuntimeStats';
import { axeBreakdownAttack, formatAXEFlatNumber, formatAXEItemStatTooltip } from '../equipment/AXEItemStatBreakdown.mjs';
import AXEItemStatBreakdownList from '../equipment/AXEItemStatBreakdownList';
import {
  AXE_COMBINE_CONFIG, AXE_EQUIPMENT_ASCENSION_CONFIG, getAXEAscensionMaxBonus, isAXEAscensionRarity, isAXELegacyStageRarity,
} from '../equipment/AXEItemAdvancementSystem';
import { describeAXEDonorReason, getAXEServiceOperationPreview, isAXEAscensionDonor, isAXECompatibleDonor } from './AXEServiceWorkspaceModel';
import { executeAXEServiceTransaction } from './AXEServiceTransactionGateway';
import { getAXEServiceResourceCount, getAXEServiceResourceCategory } from './AXEServiceResources';
import { getAXEOverEnchantCost, getAXEReinforcementCost } from './AXEServiceEconomy';
import { getActiveId, getStorageUser, subscribeCharacterChange } from '../../characterStorage';
import { isSafeCombineDonor, filterForgeInventory, runBlacksmithAutoBatch } from './AXEBlacksmithAutoForge';
import AXEBlacksmithWorkflowPanel from './AXEBlacksmithWorkflowPanel';
import AXETestWeaponTuner from './AXETestWeaponTuner';
import AXEWeaponLegacyForgePane from './AXEWeaponLegacyForgePane';
import {getAXEFarmingAscendedIdentity} from '../loot/AXEFarmingGearTiers.mjs';
import AXEGemForgePane from './AXEGemForgePane';
import { AXE_GEM_DEFINITIONS } from '../equipment/AXESocketGemSystem';
import AXECoreForgePane from './AXECoreForgePane';
import AXERuneForgePane from './AXERuneForgePane';
import EnchantLightPreview from '../../enchantVfx/EnchantLightPreview';
import { projectEnchantPercent } from '../../enchantVfx/enchantVisualState.js';
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

// enchant materials first, then every other loot item by its display name (e.g. Upgrade Stone)
const MATERIAL_NAMES = new Map([...LOOT_TABLE.map(entry => [entry.id, entry.name]), ...MATERIALS.map(entry => [entry.id, entry.name])]);
const BLACKSMITH_TABS = [
  { id: 'enchant', label: 'Enchant', operation: 'reinforcement', Icon: ArrowUpRight },
  { id: 'over_enchant', label: 'Over-Enchant', operation: 'over_enchant', Icon: Zap },
  { id: 'combine', label: 'Combine', operation: 'combine', Icon: Layers },
  { id: 'ascend', label: 'Ascend', operation: 'stage', Icon: Diamond },
  // gear tiers (setting, off by default; docs/game3d/GEAR_TIERS_20261119.md)
  ...(isGearTiersEnabled() ? [{ id: 'tier', label: 'Tier Up', operation: 'tier_up', Icon: ChevronsUp }] : []),
  { id: 'sockets', label: 'Sockets & Gems', operation: 'sockets', Icon: Gem },
  { id: 'core', label: 'Core', operation: 'core', Icon: CircleDot },
  { id: 'runes', label: 'Ultimate', operation: 'runes', Icon: Sparkles },
];
// Blacksmith v2 (docs/game3d/BLACKSMITH_V2_20261118.md)
const OPERATION_DESCRIPTIONS = {
  enchant: 'Enchant 0–200 %: each success adds 5 points. A failure loses 3 points (never below 0 %) and never breaks the item. The four +10 slots and Over-Enchant also add to the item and its enchant light.',
  over_enchant: 'Further enhance equipment after every enchantment slot reaches its maximum.',
  combine: 'Combine +0–12 with a donor of the same rarity, item level, slot and type. Each stage adds 2 % of the original stats. A failure keeps the stage and the donor. Weapon Legacy is a separate reward below.',
  ascend: 'Ascension +0–4 for Rare, Elite and Legendary: one donor per attempt (same rarity and type, item level equal or lower). It raises this item’s own stats only; a failure keeps the donor and the rank.',
  tier: 'Tier Up moves this item to its next level step (e.g. Lv 45 → 55) with that step’s stats; past a band edge it takes the next look. Combine, Enchant and Ascension are kept.',
  sockets: 'Open a socket and insert a compatible owned gem using the existing forge controls.',
};
const asNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const fmt = value => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString();
const fmtStat = value => value == null || !Number.isFinite(Number(value)) ? '—' : formatAXEFlatNumber(value);
const pctText = chance => chance == null ? '—' : (Math.round(Number(chance) * 1000) / 10) + '%';
const itemArt = item => item?.imageUrl || item?.iconUrl || item?.image || null;
// the service a tab runs: the Enchant tab runs the Enchant % (reinforcement) or the four slots
export const blacksmithOperationFor = (tab, enchantMode = 'percent') =>
  tab === 'enchant' ? (enchantMode === 'slots' ? 'enchant' : 'reinforcement')
    : tab === 'ascend' ? 'stage' : tab === 'tier' ? 'tier_up' : tab;
const heroLevel = () => Math.max(1, Math.floor(Number(getPlayerHUD()?.level) || 1));
// hover text for an owned item: its stats from the one breakdown (`Attack 1,000 (+150) = 1,150`)
const itemTooltip = item => {
  try { return formatAXEItemStatTooltip(getAXEOwnedItemStatBreakdown(item), { title: item.name }); } catch { return item?.name || ''; }
};

// The forge readout: the item's stats from the SAME per-item breakdown combat uses, now and
// after a successful attempt of `operation` (Blacksmith v2: every upgrade adds a share of the
// original roll; nothing compounds).
export function getAXEBlacksmithReadout(item, operation = 'reinforcement', donor = null) {
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
    heroLevel: heroLevel(),
  });
  const combineStage = Number(advancement.combine?.count || 0);
  const rank = Number(advancement.stage?.rank || 0);
  // the records after a SUCCESS (Combine and Ascend project even before a donor is chosen)
  let projected = null;
  if (operation === 'reinforcement' && preview.canAdvance) {
    projected = { reinforcement: { ...reinforcement, percent: preview.nextPercent } };
  } else if (operation === 'enchant' && nextEnchantSlot >= 0) {
    const next = [...enchantments];
    next[nextEnchantSlot] = Number(next[nextEnchantSlot] || 0) + 1;
    projected = { enchantments: next };
  } else if (operation === 'over_enchant' && preview.canAdvance) {
    projected = { overEnchant: { ...overEnchant, level: Number(overEnchant.level || 0) + 1 } };
  } else if (operation === 'combine' && combineStage < AXE_COMBINE_CONFIG.maxCombines) {
    projected = { advancement: { ...advancement, combine: { count: combineStage + 1 } } };
  } else if (operation === 'stage' && isAXEAscensionRarity(item) && rank < AXE_EQUIPMENT_ASCENSION_CONFIG.maxAscensions) {
    projected = { advancement: { ...advancement, stage: { ...advancement.stage, rank: rank + 1 } } };
  }
  // gear tiers: the same item one step up (its Combine, Enchant and Ascension apply to the new roll)
  const tieredItem = operation === 'tier_up' && preview.tierPreview?.ok
    ? applyAXEGearTierRecord(item, preview.tierPreview.record) : null;
  const breakdown = getAXEOwnedItemStatBreakdown(item);
  const after = tieredItem ? getAXEOwnedItemStatBreakdown(tieredItem)
    : projected ? getAXEOwnedItemStatBreakdown(item, projected) : null;
  const enchantTotal = enchantments.reduce((sum, level) => sum + Number(level || 0), 0);
  const slotCapacity = enchantments.length * MAX_ENCH_LEVEL;
  const attack = axeBreakdownAttack(breakdown);
  const projectedAttack = after ? axeBreakdownAttack(after) : null;
  return {
    itemLevel: Number(item.itemLevel ?? item.level ?? 1),
    enchantSlot: selectedSlot,
    currentAttack: attack, projectedAttack: projectedAttack != null && projectedAttack !== attack ? projectedAttack : null,
    statRows: breakdown.rows, projectedRows: after?.rows || null, sources: breakdown.sources,
    enchantTotal, projectedEnchant: operation === 'enchant' && nextEnchantSlot >= 0 ? enchantTotal + 1 : enchantTotal,
    chance: preview.chance, cost: preview.cost || {},
    overEnchantLevel: Number(overEnchant.level || 0),
    // "Ascension Readiness": the owned item's persisted rank, not an invented score
    readiness: Math.min(100, Math.max(0, rank / 4 * 100)),
    enchantTotalMax: slotCapacity,
    stage: advancement.stage?.label || 'Base',
    stageRank: Math.min(4, rank),
    legacyStage: rank > 4,
    combineStage,
    ascendMaxPct: getAXEAscensionMaxBonus(item) * 100,
    reinforcementPercent: Number(reinforcement.percent || 0),
    reinforcementCap: getAXEReinforcementCap(item),
    preview,
  };
}

// what the forge says after an attempt: the result in the item's own numbers
function describeForgeResult(operation, result, before, after) {
  if (!result) return 'Forging could not be completed.';
  if (!result.ok && !result.outcome) {
    const reason = String(result.message || describeAXEDonorReason(result.reason) || 'Forging could not be completed.');
    return 'Not completed — ' + reason.replaceAll('_', ' ');
  }
  if (operation === 'reinforcement') {
    return result.ok ? `Success: Enchant ${before.percent}% → ${after.percent}%.`
      : result.outcome === 'protected' ? `Failed: the Stabilizer kept Enchant at ${after.percent}%.`
        : `Failed: Enchant ${before.percent}% → ${after.percent}%. The item is intact.`;
  }
  if (operation === 'combine') {
    return result.ok ? `Success: Combine +${before.combine} → +${after.combine}. The donor was used up.`
      : `Failed: Combine stays +${after.combine}. The donor was kept.`;
  }
  if (operation === 'stage') {
    if (result.legacy) return `Chosen stage +${before.rank} → +${after.rank}.`;
    return result.ok ? `Success: Ascension +${before.rank} → +${after.rank}. The donor was used up.`
      : `Failed: Ascension stays +${after.rank}. The donor was kept.`;
  }
  if (operation === 'tier_up') {
    return result.ok ? `Success: Lv ${before.level} → Lv ${after.level}${result.lookChanges ? ' with its next look' : ''}. Combine, Enchant and Ascension were kept.`
      : `Failed: the item stays Lv ${after.level}.`;
  }
  return result.ok ? 'Forging completed.' : String(result.outcome || 'Forging could not be completed.').replaceAll('_', ' ');
}
const recordsOf = id => ({
  percent: Number(getItemReinforcement(id)?.percent || 0),
  combine: Number(getAXEAdvancementState(id)?.combine?.count || 0),
  rank: Number(getAXEAdvancementState(id)?.stage?.rank || 0),
  level: Number(getAXEEquipmentItem(id)?.itemLevel ?? getAXEEquipmentItem(id)?.level ?? 1),
});

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
// operations whose failure a Stabilizer can protect
const PROTECTABLE = new Set(['reinforcement', 'over_enchant']);

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
  // The Enchant tab: the item's Enchant % (reinforcement, 0–200; shown first, Blacksmith v2)
  // or its four +10 slots, one switch away in the same tab
  const [enchantMode, setEnchantMode] = useState('percent');
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoProtection, setAutoProtection] = useState(false);
  const [minSuccess, setMinSuccess] = useState(90);
  const [autoTarget, setAutoTarget] = useState(100);
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
    else if (mode.serviceId === 'reinforcement') setTab('enchant');
    else if (mode.serviceId === 'stage') setTab('ascend');
    else if (mode.serviceId === 'ultimate' || mode.serviceId === 'runes') setTab('runes');
    if (mode.serviceId === 'reinforcement') setEnchantMode('percent');
  }, [mode.serviceId]);
  useEffect(() => {
    if (selectedId && !items.some(item => item.instanceId === selectedId)) setSelectedId('');
    if (donorId && !items.some(item => item.instanceId === donorId)) setDonorId('');
  }, [items, selectedId, donorId]);
  // a used-up donor leaves the donor slot; the forge's result message stays on screen
  const keepNoticeRef = useRef(false);
  useEffect(() => {
    setConfirmCombine(false);
    if (keepNoticeRef.current) { keepNoticeRef.current = false; return; }
    setForgeNotice('');
  }, [tab, enchantMode, selectedId, donorId]);
  useEffect(() => {
    cancelledBatch.current = true;
    setBatchPending(false);
    setSelectedMaterialId('');
    setShowAll(false);
  }, [tab, enchantMode, selectedId]);

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
  // The service this tab runs (Enchant tab: Enchant % or slots; Ascend: the stage service).
  const operation = blacksmithOperationFor(tab, enchantMode);
  useEffect(() => {
    // Each operation has its own meaningful destination; never carry 200%
    // across to a +10 enchant slot, or a +12 Combine rank.
    setAutoTarget(operation === 'reinforcement' ? 100
      : operation === 'enchant' ? 20
        : operation === 'over_enchant' ? 4 : 4);
    setBatchPending(false);
  }, [operation]);
  const percentMode = operation === 'reinforcement';
  const forgeTab = ['enchant','over_enchant','combine','sockets','ascend','tier'].includes(tab);
  const readout = selectedItem && forgeTab ? getAXEBlacksmithReadout(selectedItem, operation,
    tab === 'combine' || tab === 'ascend' ? donorItem : null) : null;
  const ascendEligible = Boolean(selectedItem && isAXEAscensionRarity(selectedItem));
  const progressState = selectedItem ? getAXEAdvancementState(selectedItem.instanceId) : null;
  const prestigeStyle=selectedItem ? getAXEFarmingAscendedIdentity(selectedItem,progressState?.stage?.rank) : null;
  const socketState = selectedItem ? getAXESocketState(selectedItem.instanceId) : null;
  const materials = readout ? Object.entries(readout.cost || {}).slice(0, 4) : [];
  const workflowMode = ['combine', 'enchant', 'over_enchant'].includes(tab);
  const compatibleDonors = useMemo(() => selectedItem && tab === 'combine'
    ? items.filter(candidate => isSafeCombineDonor(selectedItem, candidate,
      (target, donor) => isAXECompatibleDonor(target, donor, progressState)))
    : [], [items, selectedId, tab, revision]);
  const ascensionDonors=useMemo(()=>selectedItem && tab==='ascend' && isAXEAscensionRarity(selectedItem)
      ? items.filter(candidate=>isAXEAscensionDonor(selectedItem,candidate))
      :[],[items,selectedId,tab,revision]);
  useEffect(() => {
    if (tab !== 'combine' || !autoEnabled || !selectedItem || batchBusy) return;
    if (donorItem && compatibleDonors.some(item => item.instanceId === donorItem.instanceId)) return;
    setDonorId(compatibleDonors[0]?.instanceId || '');
  }, [tab, autoEnabled, selectedId, donorId, items, revision, batchBusy]);
  const relevantCost = readout ? {
    ...(readout.cost || {}),
    ...(PROTECTABLE.has(operation) && autoProtection &&
      Number(readout.chance) < minSuccess / 100 ? {
        mat_protection: (operation === 'over_enchant'
          ? getAXEOverEnchantCost(getItemOverEnchant(selectedId)?.level, { protectedAttempt: true })
          : getAXEReinforcementCost(getItemReinforcement(selectedId)?.percent, { protectedAttempt: true })).mat_protection,
      } : {}),
  } : {};
  const inventoryRelevantCost = PROTECTABLE.has(operation) ? { ...relevantCost, mat_protection: 1 } : relevantCost;
  const materialRequirements = Object.entries(relevantCost).map(([id, required]) =>
    [id, required, getAXEServiceResourceCount(id)]);
  const stagedMaterial = materialStacks.find(item => item.id === selectedMaterialId) || null;
  const rarities = useMemo(() => [...new Set(items
    .map(item => String(item.rarity || item.tier || '').trim().toLowerCase())
    .filter(Boolean))].sort(), [items]);
  const displayed = useMemo(() => {
    if (workflowMode && selectedItem && !showAll) return filterForgeInventory({
      mode: operation, target: selectedItem, items, materialStacks, required: inventoryRelevantCost,
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
  }, [items, materialStacks, filter, kindFilter, rarityFilter, selectedId, tab, operation, showAll, revision, autoProtection, minSuccess, socketFilter, socketMode]);
  const gridSlots = Array.from({ length: Math.max(200, displayed.length) }, (_, index) => displayed[index] || null);
  const selectedTab = BLACKSMITH_TABS.find(entry => entry.id === tab) || BLACKSMITH_TABS[0];
  const progress = selectedItem ? Math.max(0, Math.min(100, asNumber(progressState?.stage?.rank) / 4 * 100)) : 0;
  const percent = readout?.chance == null ? null : Math.round(readout.chance * 100);
  const status = !selectedItem ? 'Choose a piece of equipment from Inventory'
    : tab === 'over_enchant' && !overReady ? 'Finish standard Enchant before Over-Enchant'
    : tab === 'combine' && !donorItem ? 'Choose a separate matching donor in the second square'
    : tab === 'ascend' && ascendEligible && !donorItem && readout?.preview?.nextRank ? 'Choose matching equipment to sacrifice'
    : readout?.preview?.reason && !readout.preview.canAdvance ? readout.preview.reason
    : readout?.preview?.outcome || 'Ready to review forge requirements';
  const currentValue = tab === 'ascend' ? Math.min(4, asNumber(progressState?.stage?.rank))
    : tab === 'tier' ? asNumber(readout?.itemLevel)
    : tab === 'combine' ? asNumber(progressState?.combine?.count)
    : tab === 'sockets' ? asNumber(socketState?.sockets?.length)
    : tab === 'over_enchant' ? asNumber(getItemOverEnchant(selectedId)?.level)
    : percentMode ? asNumber(readout?.reinforcementPercent)
    : readout?.enchantTotal || 0;
  const nextValue = tab === 'ascend'
    ? (readout?.preview?.nextRank ?? null)
    : tab === 'tier' ? (readout?.preview?.nextLevel ?? null)
    : tab === 'combine' ? (currentValue < AXE_COMBINE_CONFIG.maxCombines ? currentValue + 1 : null)
    : tab === 'sockets' || tab === 'over_enchant'
    ? (readout?.preview?.canAdvance ? currentValue + 1 : null)
    : percentMode ? (readout?.preview?.canAdvance ? readout.preview.nextPercent : null)
    : tab === 'enchant' ? readout?.projectedEnchant : null;
  const valueText = value => value == null ? '—'
    : tab === 'ascend' ? '+' + fmt(value) : tab === 'tier' ? 'Lv ' + fmt(value)
      : percentMode ? fmt(value) + '%' : '+' + fmt(value);

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
    if(tab==='ascend' && selectedItem && isAXEAscensionDonor(selectedItem,entry))
      setDonorId(entry.instanceId);
    else if (tab === 'combine' && selectedItem && entry.instanceId !== selectedId &&
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
    && (tab !== 'ascend' || !ascendEligible || (!!donorItem && isAXEAscensionDonor(selectedItem, donorItem)))
    && !!readout?.preview?.canAdvance;
  const beginForge = async () => {
    if (!canForge || forging || batchRunningRef.current) return;
    if ((tab === 'combine' || (tab==='ascend' && ascendEligible)) && !confirmCombine) {
      setConfirmCombine(true);
      setForgeNotice((readout?.preview?.confirmation || (tab === 'ascend'
        ? 'A successful Ascension uses up the donor; a failure keeps it.'
        : 'A successful Combine uses up the donor; a failure keeps it.')) + ' Press Forge again to confirm.');
      return;
    }
    setForging(true);
    setForgeNotice('Forging…');
    try {
      const before = recordsOf(selectedItem.instanceId);
      const result = await executeAXEServiceTransaction(operation, {
        itemId: selectedItem.instanceId,
        ...(['combine','ascend'].includes(tab) && donorItem ? { donorId: donorItem.instanceId } : {}),
        ...(operation === 'enchant' ? { slotIndex: readout.enchantSlot } : {}),
      });
      onTransaction?.(result);
      setForgeNotice(describeForgeResult(operation, result, before, recordsOf(selectedItem.instanceId)));
      if (result.donorConsumed) { keepNoticeRef.current = true; setDonorId(''); }
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
      setForgeNotice('Confirm up to 12 attempts towards your selected target. Successful combines consume donors.');
      return;
    }
    setBatchPending(false);
    cancelledBatch.current = false;
    batchRunningRef.current = true;
    setBatchBusy(true);
    setForgeNotice('Processing confirmed batch…');
    try {
      const completed = await runBlacksmithAutoBatch({
        mode: operation, targetId: selectedItem.instanceId,
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
        targetProgress: autoTarget,
        getProgress: (mode, id) => mode === 'reinforcement'
          ? Number(getItemReinforcement(id)?.percent || 0)
          : mode === 'enchant'
            ? getItemEnchantments(id).reduce((sum, level) => sum + Number(level || 0), 0)
            : mode === 'over_enchant' ? Number(getItemOverEnchant(id)?.level || 0)
              : Number(getAXEAdvancementState(id)?.combine?.count || 0),
        maxAttempts: 12,
        transact: async (operation, payload) => {
          const result = await executeAXEServiceTransaction(operation, payload);
          onTransaction?.(result);
          return result;
        },
        onAttempt: ({ result, attempts, donorId: consumedId }) => {
          setRevision(value => value + 1);
          if (result?.donorConsumed && consumedId) { keepNoticeRef.current = true; setDonorId(''); }
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
          aria-label={label} aria-pressed={tab === id} onClick={() => pickTab(id)}
          title={label} disabled={batchBusy || forging}>
          <Icon size={24} strokeWidth={1.65} aria-hidden="true" />
          <span className="axe-blacksmith-visually-hidden">{label}</span>
        </button>)}
      </nav>

      {tab === 'core' && <AXECoreForgePane />}
      {tab === 'runes' && <AXERuneForgePane />}
      {workflowMode && <AXEBlacksmithWorkflowPanel
        mode={tab} operation={operation} enchantMode={enchantMode}
        onChangeEnchantMode={next => { if (!batchRunningRef.current) { setEnchantMode(next); setAutoEnabled(false); } }}
        target={selectedItem} donor={donorItem}
        compatibleDonors={compatibleDonors} requirements={materialRequirements}
        selectedMaterial={stagedMaterial} materialSelection={selectedMaterialId}
        getMaterialName={id => MATERIAL_NAMES.get(id) || id.replaceAll('_', ' ')}
        readout={readout} canForge={canForge} confirmCombine={confirmCombine}
        autoEnabled={autoEnabled} onToggleAuto={next => { setAutoEnabled(next); setBatchPending(false); }}
        autoProtection={autoProtection} onToggleProtection={setAutoProtection}
        minSuccess={minSuccess} onChangeThreshold={setMinSuccess}
        autoTarget={autoTarget} onChangeAutoTarget={value => { setAutoTarget(value); setBatchPending(false); }}
        onSelectDonor={item => setForgeSlot('donor', item.instanceId)}
        onClearTarget={clearTarget} onClearDonor={() => setDonorId('')}
        onDropSlot={dropInto}
        onFocusInventory={() => {
          document.querySelector('.axe-blacksmith-image-inventory button')?.focus({ preventScroll: true });
        }}
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
            : !entry.material && (selectedId === entry.instanceId || ((tab === 'combine' || tab === 'ascend') && donorId === entry.instanceId))}
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
          title={(entry.material ? (entry.name || entry.id) : itemTooltip(entry)) + '\nRight-click to place in Forge'}>
          {entry.gemIcon && tab === 'sockets' ? <span className="axe-blacksmith-gem-icon" aria-hidden="true">{entry.gemIcon}</span>
            : itemArt(entry) ? <img className="axe-blacksmith-item-image" src={itemArt(entry)}
            alt="" loading="lazy" /> : <InventorySymbol item={entry} />}
          <span className="axe-blacksmith-slot-name">{entry.name || entry.id}</span>
          {entry.material && <span className="axe-blacksmith-slot-quantity">{fmt(entry.quantity)}</span>}
        </button> : <span key={'empty-'+index} className="axe-blacksmith-empty-slot" role="presentation" />)}
      </div>

      </section>

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
          <h3 className={prestigeStyle?'axe-forge-ascended-name':''}
            style={prestigeStyle?{'--prestige-a':prestigeStyle.primary,'--prestige-b':prestigeStyle.secondary}:undefined}>
            {prestigeStyle?.displayName||selectedItem.name||'Equipment'}</h3>
          <div className="axe-blacksmith-item-level">Lv. {fmt(selectedItem.itemLevel ?? selectedItem.level ?? 1)}</div>
          <div className={'axe-blacksmith-center-art'+(prestigeStyle?' axe-forge-ascended-art':'')}>
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
            <span>{tab === 'combine' ? 'Combine' : tab === 'sockets' ? 'Sockets opened'
              : tab === 'over_enchant' ? 'Over-Enchant' : tab === 'ascend' ? 'Ascension'
                : tab === 'tier' ? 'Item level' : percentMode ? 'Enchant' : 'Enchant slots'}</span>
            <b>{selectedItem ? valueText(currentValue) : '—'}</b>
            <span className="axe-blacksmith-arrow">→</span>
            <b>{valueText(nextValue)}</b>
          </div>
          {percentMode && selectedItem && readout?.preview?.canAdvance && <div className="axe-blacksmith-dynamic-row">
            <span>On a failure</span><b>{fmt(readout.preview.failurePercent)}%</b>
            <span className="axe-blacksmith-arrow" aria-hidden="true"> </span><b>never breaks</b>
          </div>}
          <div className="axe-blacksmith-dynamic-row">
            <span>Attack</span><b>{fmtStat(readout?.currentAttack)}</b>
            <span className="axe-blacksmith-arrow">→</span>
            <b>{fmtStat(readout?.projectedAttack)}</b>
          </div>
          <p className="axe-blacksmith-operation-hint" role="status">{forgeNotice || status}</p>
          {selectedItem && (workflowMode
            ? <details className="axe-blacksmith-advanced"><summary>Full stat breakdown</summary>
                <AXEItemStatBreakdownList rows={readout?.statRows || []}
                  projected={readout?.projectedRows} label="Item stats now and after a success"
                  className="axe-blacksmith-stat-breakdown" />
              </details>
            : <AXEItemStatBreakdownList rows={readout?.statRows || []}
                projected={readout?.projectedRows} label="Item stats now and after a success"
                className="axe-blacksmith-stat-breakdown" />)}
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
            : tab === 'combine' ? 'Fee: free. Choose a matching donor in the second slot.'
            : tab === 'ascend' && ascendEligible
              ? 'Fee and catalyst: free. Choose one matching donor below.'
              : 'No materials listed for this operation.'}</p>}
        </div>
        <div className="axe-blacksmith-success">
          <span>Success Rate</span>
          <b>{percent == null ? '—' : percent + '%'}</b>
          <div className="axe-blacksmith-success-track"><i style={{ width: (percent || 0) + '%' }} /></div>
        </div>
        {/* Enchantment light before and after a successful attempt: the same rules as the worn item. */}
        {selectedItem && forgeTab && <EnchantLightPreview item={selectedItem} compact
          proposedPercent={['reinforcement', 'enchant', 'over_enchant'].includes(operation) ? projectEnchantPercent(selectedItem, operation) : null} />}
        {tab === 'tier' && <div className="axe-blacksmith-extra-details" aria-label="Tier Up rules">
          <h4>Tier Up — level steps</h4>
          {(() => {
            const info = readout?.preview?.tierInfo;
            const type = info ? getAXEGearItemType(info.typeId) : null;
            if (!selectedItem) return <p>Choose an item to see its next level step.</p>;
            if (!info) return <p>This item is not on a gear-tier ladder (Common, Unique, Rare, Elite and Legendary weapons, armor and jewelry are).</p>;
            return <>
              <div><span>Ladder</span><b>{axeGearRarityLabel(info.rarity)} {type?.label || info.typeId}</b></div>
              <div><span>Step now</span><b>{info.step == null ? 'below the first step' : 'Lv ' + fmt(info.step)}{info.offLadder ? ' (item Lv ' + fmt(info.level) + ')' : ''}</b></div>
              <div><span>Next step</span><b>{info.atMax ? 'Top step reached' : 'Lv ' + fmt(info.nextStep)}</b></div>
              {!info.atMax && <div><span>Hero level needed</span><b>{fmt(readout?.preview?.requiredLevel)}</b></div>}
              {!info.atMax && <div><span>Look</span><b>{info.system ? (info.lookChanges ? 'Changes to the next band’s look' : 'Same look') : 'Keeps its own model'}</b></div>}
              <div><span>Success</span><b>{pctText(readout?.preview?.chance ?? (info.atMax ? null : 1))}</b></div>
              <p>Combine, Enchant, Ascension, sockets and aura stay on the item. Base stats become the next step’s at the item’s own quality; rolled stats keep their roll and grow with the level.</p>
            </>;
          })()}
        </div>}
        {tab === 'ascend' && <div className="axe-blacksmith-extra-details" aria-label="Ascension rules and donor">
          <h4>Ascension — up to +4</h4>
          <div><span>Rarity</span><b>{selectedItem?.rarity || '—'}</b></div>
          <div><span>Ascension</span><b>+{fmt(readout?.stageRank)} / 4</b></div>
          {selectedItem && ascendEligible && <>
            <div><span>Item stats at +4</span><b>+{fmt(readout?.ascendMaxPct)}% of the original roll</b></div>
            <div><span>Success chance</span><b>{readout?.preview?.nextRank
              ? '+' + readout.preview.nextRank + ': ' + pctText(readout.preview.chance) : 'Maximum reached'}</b></div>
            <div><span>Odds by rank</span><b>{AXE_EQUIPMENT_ASCENSION_CONFIG.successChanceByRank
              .map((chance, index) => '+' + (index + 1) + ' ' + pctText(chance)).join(' · ')}</b></div>
            <label className="axe-blacksmith-feed-selector">
              Sacrifice equipment
              <select value={ascensionDonors.some(item=>item.instanceId===donorId)?donorId:''}
                aria-label="Select equipment to sacrifice for Ascension"
                onChange={event=>{setDonorId(event.target.value);setConfirmCombine(false);}}>
                <option value="">Choose same rarity and type, level {fmt(selectedItem.itemLevel ?? selectedItem.level ?? 1)} or lower…</option>
                {ascensionDonors.map(item=><option key={item.instanceId} value={item.instanceId}>
                  {item.name} · Lv. {fmt(item.itemLevel??item.level)}
                </option>)}
              </select>
            </label>
            <div><span>Compatible donors owned</span><b>{ascensionDonors.length}</b></div>
            <div><span>Fee / catalyst</span><b>Free</b></div>
            <p>One donor per attempt: same rarity and type (weapon family; armor and jewelry by slot), item level equal or lower. A success uses up the donor; a failure keeps the donor and the rank. Combine and Enchant are not needed and are never reset. Set bonuses are not changed.</p>
          </>}
          {selectedItem && !ascendEligible && <p>{isAXELegacyStageRarity(selectedItem)
            ? 'Chosen keeps its own stage path for the Chosen set (Evolution Stones, no donor, no item-stat change).'
            : 'Ascension is for Rare, Elite and Legendary equipment. Common and Unique ascension is off; Mythical is not available yet.'}</p>}
        </div>}
        {workflowMode && <details className="axe-blacksmith-advanced" aria-label="Detailed upgrade information">
          <summary>Advanced Equipment &amp; Forge Details</summary>
          <div className="axe-blacksmith-extra-details">
          <div><span>Rarity</span><b>{selectedItem?.rarity || selectedItem?.tier || '—'}</b></div>
          <div><span>Item level</span><b>{selectedItem ? fmt(selectedItem.itemLevel ?? selectedItem.level ?? 1) : '—'}</b></div>
          <div><span>Ascension</span><b>{selectedItem ? '+' + fmt(readout?.stageRank ?? 0) : '—'}</b></div>
          <div><span>Combine</span><b>{selectedItem ? '+' + fmt(progressState?.combine?.count || 0) + ' / ' + AXE_COMBINE_CONFIG.maxCombines : '—'}</b></div>
          {tab === 'combine' && <>
            <div><span>Matching donors</span><b>{compatibleDonors.length}</b></div>
            <div><span>Selected donor</span><b>{donorItem?.name || 'None'}</b></div>
            <div><span>Fee</span><b>Free</b></div>
            <p>Same rarity, item level, slot and type (weapon family; armor and jewelry by slot), not necessarily the same item. Equipped, locked and favourite items are excluded.</p>
          </>}
          {tab === 'enchant' && <>
            <div><span>Enchant</span><b>{selectedItem ? fmt(readout?.reinforcementPercent) + '% / ' + fmt(readout?.reinforcementCap) + '%' : '—'}</b></div>
            <div><span>Enchant slots</span>
              <b>{selectedItem ? fmt(readout?.enchantTotal) + ' / ' + fmt(readout?.enchantTotalMax) : '—'}</b></div>
            {percentMode && <div><span>On a failure</span><b>−{AXE_REINFORCEMENT_CONFIG.failurePenaltyPercent} points, never below 0%</b></div>}
          </>}
          {tab === 'over_enchant' && <>
            <div><span>Over-Enchant</span><b>{selectedItem ? '+' + fmt(getItemOverEnchant(selectedId).level) : '—'}</b></div>
            <div><span>Stabilizers owned</span><b>{fmt(getAXEServiceResourceCount('mat_protection'))}</b></div>
            <div><span>Auto-stop below</span><b>{fmt(minSuccess)}% success</b></div>
          </>}
          <div><span>Automatic processing</span><b>{autoEnabled ? 'Armed — confirmation required' : 'Off'}</b></div>
          <p className={tab === 'over_enchant' ? 'axe-forge-detail-warning' : ''}>
            {readout?.preview?.risk || 'Choose an item to see the actual result and requirements.'}
          </p>
          </div>
        </details>}
        {tab === 'combine' && <AXEWeaponLegacyForgePane
          target={selectedItem}
          items={items}
          combineCount={Number(progressState?.combine?.count || 0)}
          reinforcementPercent={Number(readout?.reinforcementPercent || 0)}
          onTransaction={result => {
            setRevision(value => value + 1);
            onTransaction?.(result);
          }} />}
        {/* Optional test tools no longer compete with the two primary slots. */}
        <details className="axe-blacksmith-advanced">
          <summary>Test weapon settings</summary>
          <AXETestWeaponTuner item={selectedItem} />
        </details>
      </section>

      <section className="axe-blacksmith-progression-panel" aria-label="Equipment progression">
        <h3>Equipment Progression</h3>
        <div className="axe-blacksmith-current-projected" aria-label="Actual combat attack projection">
        <span>Current Attack <b>{fmtStat(readout?.currentAttack)}</b></span>
        <span aria-hidden="true">→</span>
        <span>Projected Attack <b>{fmtStat(readout?.projectedAttack)}</b></span>
      </div>
      <div className="axe-blacksmith-stats-strip" aria-label="Equipment progress">
        <span>Attack <b>{fmtStat(readout?.currentAttack)}</b></span>
        <span>Item Level <b>{selectedItem ? fmt(selectedItem.itemLevel ?? selectedItem.level ?? 1) : '—'}</b></span>
        <span>{tab === 'sockets' ? 'Sockets' : 'Enchant'} <b>{selectedItem
          ? tab === 'sockets' ? asNumber(socketState?.sockets?.length) + ' / ' + (socketState?.maxSockets || 4)
            : fmt(readout?.reinforcementPercent ?? getItemReinforcement(selectedId)?.percent ?? 0) + '% · slots +'
              + fmt(readout?.enchantTotal ?? getItemEnchantments(selectedId).reduce((n,v)=>n+asNumber(v),0)) : '—'}</b></span>
      </div>
      <div className="axe-blacksmith-readiness" aria-label="Equipment ascension progression">
        <div><span>{selectedItem ? (prestigeStyle?.displayName || 'Ascension') : 'No selected equipment'}</span>
          <b>{selectedItem ? '+' + Math.min(4, asNumber(progressState?.stage?.rank)) + ' / 4' : '—'}</b></div>
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
