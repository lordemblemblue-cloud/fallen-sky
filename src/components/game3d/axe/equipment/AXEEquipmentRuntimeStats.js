// Runtime equipment-stat resolver.
// Bridges real owned/equipped item instances into the live player combat model.
// Every equipment service (reinforcement, enchant, over-enchant, combine, stage,
// refine, ultimate, sockets/gems, aura and sets) feeds this one calculation.

import { getEquippedAXEItems } from './AXEEquipmentInventoryStore';
import { getAXEWeaponLegacyDamageMultiplier, getAXEWeaponLegacyEchoPct } from './AXEWeaponLegacyForge';
import { getAXESoulRegaliaBonuses } from '../progression/AXESoulRegaliaStore';
import { getItemEnchantments, getItemOverEnchant, getItemReinforcement } from '../../equipment/enchantmentStore';
import { getAXEAdvancementState } from './AXEItemAdvancementStore';
import { getAXESocketState } from './AXESocketGemStore';
import { collectAXEGemStats } from './AXESocketGemSystem';
import { getAXEEquipmentRune, getAXEEquipmentRuneStats } from './AXEEquipmentRuneStore';
import { getAXEItemAura } from './AXEEquipmentAuraStore';
import { collectAXEAuraStats } from './AXEEquipmentAuraSystem';
import { evaluateAXESetBonuses } from './AXESetBonusSystem';
import {getAXEFarmingAscendedIdentity} from '../loot/AXEFarmingGearTiers.mjs';
import { getAXESetAscensionRank } from './AXESetAscensionRules.mjs';
import { evaluateAXEAuxiliaryBonuses } from './AXEAuxiliaryGearSystem';
import { AXE_ITEM_STAT_CONFIG, AXE_RATE_STATS, computeAXEItemStatBreakdown } from './AXEItemStatBreakdown.mjs';

// Provisional balance only (Blacksmith v2: each share is ADDED from the item's original
// roll, AXEItemStatBreakdown.mjs). Kept under this name for older readers.
export const AXE_ADVANCEMENT_STAT_CONFIG = Object.freeze({
  combinePerSuccess: AXE_ITEM_STAT_CONFIG.combinePerStage,
  refinePerLevel: AXE_ITEM_STAT_CONFIG.refinePerLevel,
  ultimatePerLevel: AXE_ITEM_STAT_CONFIG.ultimatePerLevel,
});

// An owned item's records, read from the live stores (one place for every screen).
export function getAXEOwnedItemRecords(item) {
  const itemId = item?.instanceId;
  return {
    reinforcement: getItemReinforcement(itemId),
    enchantments: getItemEnchantments(itemId),
    overEnchant: getItemOverEnchant(itemId),
    advancement: getAXEAdvancementState(itemId),
    legacyDamageMultiplier: getAXEWeaponLegacyDamageMultiplier(item),
  };
}

// The one per-item stat breakdown (original + Combine + Enchant + Ascend ...), from the live
// stores; `overrides` replaces records for a preview (the Blacksmith's projected result).
export function getAXEOwnedItemStatBreakdown(item, overrides = {}) {
  if (!item) return computeAXEItemStatBreakdown(null);
  return computeAXEItemStatBreakdown(item, { ...getAXEOwnedItemRecords(item), ...overrides });
}

const makeOutput = () => ({
  attr: {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    focus: 0,
    spirit: 0,
  },
  flat: {
    hp: 0,
    chi: 0,
    damage: 0,
    defense: 0,
    critChance: 0,
    critDamage: 0,
    criticalDefense: 0,
    attributionAttack: 0,
    attributionDefense: 0,
    attackSuccess: 0,
    attackBlock: 0,
  },
  multipliers: {
    damagePct: 0,
    defensePct: 0,
    hpPct: 0,
    chiPct: 0,
  },
  items: [],
  activeSets: [],
  activeAuxSets: [],
  chosenSet: null,
});

function addStat(out, key, rawValue, scale = 1) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value === 0) return;
  const scaled = value * scale;

  switch (key) {
    case 'strength':
      out.attr.strength += scaled; break;
    case 'dexterity':
    case 'agility':
      out.attr.dexterity += scaled; break;
    case 'constitution':
    case 'vitality':
      out.attr.constitution += scaled; break;
    case 'focus':
    case 'spirit':
      out.attr.focus += scaled;
      out.attr.spirit += scaled;
      break;

    case 'attack':
    case 'damage':
    case 'attackPower':
    case 'physicalAttack':
      out.flat.damage += scaled; break;
    case 'defense':
    case 'defensePower':
      out.flat.defense += scaled; break;
    case 'hp':
    case 'maxHP':
      out.flat.hp += scaled; break;
    case 'chi':
    case 'maxChi':
    case 'mana':
      out.flat.chi += scaled; break;
    case 'critChance':
    case 'criticalChance':
      out.flat.critChance += scaled; break;
    // Equipment data (items, sets, auxiliary gear, item auras) writes crit damage and crit
    // defense in percentage points; the stat sheet uses ratios (0.10 = +10%). Values below 1
    // were read as ratios before, so a 0.5% item gave 50% crit defense.
    case 'critDamage':
    case 'criticalDamage':
      out.flat.critDamage += scaled / 100; break;
    case 'critDefense':
    case 'criticalDefense':
      out.flat.criticalDefense += scaled / 100;
      break;
    case 'attributeAttack':
    case 'attributionAttack':
      out.flat.attributionAttack += scaled; break;
    case 'attributeDefense':
    case 'attributionDefense':
      out.flat.attributionDefense += scaled; break;
    case 'accuracy':
    case 'attackSuccess':
      out.flat.attackSuccess += scaled; break;
    case 'evasion':
    case 'attackBlock':
      out.flat.attackBlock += scaled; break;

    case 'attackPct':
    case 'damagePct':
      out.multipliers.damagePct += scaled; break;
    case 'defensePct':
      out.multipliers.defensePct += scaled; break;
    case 'maxHPPct':
    case 'hpPct':
      out.multipliers.hpPct += scaled; break;
    case 'maxChiPct':
    case 'chiPct':
      out.multipliers.chiPct += scaled; break;
    default:
      break;
  }
}

// Percentage stats (crit chance, crit damage, crit defense, +x% stats) are rates: item level,
// rarity rolls, Combine and Enchant scale flat stats, never these (Ascension grows them
// relatively, AXEItemStatBreakdown.mjs). A ring's 0.5% crit used to grow with every upgrade
// until one ring gave about half a hero's crit chance.
export { AXE_RATE_STATS };
export const isAXERateStat = (key) => AXE_RATE_STATS.has(key);

function addStats(out, stats = {}, scale = 1) {
  for (const [key, value] of Object.entries(stats || {})) {
    addStat(out, key, value, isAXERateStat(key) ? 1 : scale);
  }
}

// Upgrade the effective stat contribution only, never mutate a saved item's base rolls.
// Rates and gem/aura values also gain the soul modifier, unlike standard item enhancement.
const soulEffectiveStats = (stats = {}, percent = 0) =>
  Object.fromEntries(Object.entries(stats || {}).map(([k, v]) =>
    [k, Number.isFinite(Number(v)) ? Number(v) * (1 + percent / 100) : v]));

export function getAXEEquipmentRuntimeBonuses() {
  const out = makeOutput();
  const equipped = getEquippedAXEItems();
  const soul = getAXESoulRegaliaBonuses();

  const liveItems = equipped.map((item) => {
    const itemId = item.instanceId;
    const records = getAXEOwnedItemRecords(item);
    const { reinforcement, enchantments, overEnchant, advancement } = records;
    const ascendedRank=Math.min(4,Math.max(0,Number(advancement.stage?.rank)||0));
    const socketState = getAXESocketState(itemId);
    const aura = getAXEItemAura(itemId);
    const infusionPct = Number(soul.itemInfusion?.[itemId] || 0);

    // The item's own stats, once: original roll + Combine + Enchant + Ascend (+ Refine,
    // Ultimate, Weapon Legacy on its attack, the armor perk on its defense), each a share of the
    // original roll and added, never compounded (Blacksmith v2). Soul infusion then scales the
    // item's whole contribution, as before.
    const breakdown = computeAXEItemStatBreakdown(item, records);
    for (const row of breakdown.rows) addStat(out, row.stat, row.total * (1 + infusionPct / 100));

    addStats(out, soulEffectiveStats(collectAXEGemStats({ ...item, ...socketState }), infusionPct), 1);
    addStats(out, soulEffectiveStats(getAXEEquipmentRuneStats(itemId), infusionPct), 1);
    addStats(out, soulEffectiveStats(collectAXEAuraStats(aura), infusionPct), 1);

    const liveItem = {
      ...item,
      sockets: socketState.sockets,
      maxSockets: socketState.maxSockets,
      aura,
      ultimateRuneId: getAXEEquipmentRune(itemId),
      reinforcement,
      enchantments,
      overEnchant,
      advancement,
    };

    const shares = breakdown.sources;
    out.items.push({
      itemId,
      name: getAXEFarmingAscendedIdentity(item,ascendedRank)?.displayName||item.name,
      slot: item.slot,
      // the per-system shares of the original roll, added together (Blacksmith v2)
      enhancementMultiplier: shares.enchantMultiplier,
      combinePct: shares.combinePct,
      enchantPct: shares.enchantPct,
      ascensionPct: shares.ascendPct,
      finalCoreMultiplier: 1 + (shares.combinePct + shares.enchantPct + shares.ascendPct + shares.refinePct + shares.ultimatePct) / 100,
      statBreakdown: breakdown.rows,
      setAscensionRank: getAXESetAscensionRank(liveItem),
      soulInfusionPct: Number(soul.itemInfusion?.[itemId] || 0),
      legacyWeaponDamageBonusPct: Math.round((getAXEWeaponLegacyDamageMultiplier(item) - 1) * 10000) / 100,
      separateEchoAttackPct: getAXEWeaponLegacyEchoPct(item),
    });
    return liveItem;
  });

  // Set and auxiliary threshold bonuses are applied after per-piece scaling.
  const sets = evaluateAXESetBonuses(liveItems);
  addStats(out, sets.stats, 1);
  out.activeSets = sets.activeSets || [];
  // This is informational until the derived-stat pipeline applies the
  // Chosen full-set multiplier exactly once. Do not multiply items here too.
  out.chosenSet = sets.chosen || null;

  const auxiliary = evaluateAXEAuxiliaryBonuses(liveItems);
  addStats(out, auxiliary.setStats, 1);
  out.activeAuxSets = auxiliary.activeSets || [];

  return out;
}

export function applyAXEEquipmentFinalMultipliers(derived, multipliers = {}) {
  if (!derived) return derived;
  const damageMult = 1 + Math.max(-0.95, Number(multipliers.damagePct || 0) / 100);
  const defenseMult = 1 + Math.max(-0.95, Number(multipliers.defensePct || 0) / 100);
  const hpMult = 1 + Math.max(-0.95, Number(multipliers.hpPct || 0) / 100);
  const chiMult = 1 + Math.max(-0.95, Number(multipliers.chiPct || 0) / 100);

  const damage = Math.max(1, Math.round(Number(derived.damage || derived.totalDamage || 1) * damageMult));
  return {
    ...derived,
    damage,
    totalDamage: damage,
    physicalDamage: Math.max(1, Math.round(Number(derived.physicalDamage || damage) * damageMult)),
    defense: Math.max(0, Number(derived.defense || 0) * defenseMult),
    maxHP: Math.max(1, Math.round(Number(derived.maxHP || 1) * hpMult)),
    chi: Math.max(0, Math.round(Number(derived.chi || 0) * chiMult)),
    equipmentMultipliers: {
      damagePct: Number(multipliers.damagePct || 0),
      defensePct: Number(multipliers.defensePct || 0),
      hpPct: Number(multipliers.hpPct || 0),
      chiPct: Number(multipliers.chiPct || 0),
    },
  };
}
