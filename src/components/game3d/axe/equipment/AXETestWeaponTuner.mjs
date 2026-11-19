// Temporary, client-only weapon balance controls for the Game 3D test server.
// No currency, material, item, vault or server-authoritative progression writes.
import { subscribeCharacterChange } from '../../characterStorage';
import { allowsSpiritualPreviewMax } from '../../progression/previewMaxRules.mjs';
import { AXE_ENCHANTMENT_CONFIG, AXE_OVER_ENCHANT_CONFIG, getAXEReinforcementCap } from './AXEItemEnhancementSystem.js';
import {
  AXE_COMBINE_CONFIG, AXE_EQUIPMENT_ASCENSION_CONFIG, AXE_REFINE_CONFIG,
  AXE_ULTIMATE_CONFIG, isAXEAscensionRarity,
} from './AXEItemAdvancementSystem.js';

export const AXE_TEST_WEAPON_FIELDS = Object.freeze([
  'reinforcement', 'slots', 'overEnchant', 'combine', 'ascend', 'refine', 'ultimate',
]);
export const AXE_TEST_WEAPON_ZERO = Object.freeze(
  Object.fromEntries(AXE_TEST_WEAPON_FIELDS.map(key => [key, 0])),
);

// The same exact-host + explicit test environment guard already used by
// the spiritual Max Preview. A query string or a localStorage key cannot enable it.
// This protects the UI, NOT server authority; real upgrades must use itemUpgrade.
export function isAXETestWeaponTunerEnabled({
  hostname = globalThis.location?.hostname || '',
  env = import.meta.env || {},
} = {}) {
  return allowsSpiritualPreviewMax({
    hostname,
    enabled: env.VITE_AXE_GAME3D_PREVIEW_MAX,
    serverEnv: env.VITE_AXE_GAME3D_SERVER_ENV,
    previewHost: env.VITE_AXE_GAME3D_PREVIEW_HOST,
    dev: env.DEV === true,
  });
}

const clamp = (value, low, high) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : low;
};
const progressToCap = (current, cap, percent) => {
  const starting = clamp(current, 0, cap);
  return Math.round(starting + (cap - starting) * clamp(percent, 0, 100) / 100);
};
const weapon = item => Boolean(item?.instanceId &&
  (item.slot === 'weapon' || item.category === 'weapon'));

export function normalizeAXETestWeaponTuning(values = {}) {
  return Object.fromEntries(AXE_TEST_WEAPON_FIELDS.map(key =>
    [key, Math.round(clamp(values?.[key], 0, 100))]));
}

// Pure projection from actual records to a chosen percentage of each legal cap.
// Never changes the original item, rarity, base rolls, donor history or records.
export function projectAXETestWeaponRecords(item, records = {}, values = {}) {
  if (!weapon(item)) return records;
  const tune = normalizeAXETestWeaponTuning(values);
  const original = records.advancement || {};
  const stage = original.stage || {};
  const eligibleAscend = isAXEAscensionRarity(item);
  const eligibleUltimate = AXE_ULTIMATE_CONFIG.eligibleRarities
    .includes(String(item.rarity || '').toLowerCase());
  const enchantments = Array.from({length: AXE_ENCHANTMENT_CONFIG.slots}, (_, i) =>
    progressToCap(records.enchantments?.[i],
      AXE_ENCHANTMENT_CONFIG.maxLevelPerSlot, tune.slots));
  return {
    ...records,
    reinforcement: {
      ...(records.reinforcement || {}),
      percent: progressToCap(records.reinforcement?.percent,
        getAXEReinforcementCap(item), tune.reinforcement),
    },
    enchantments,
    overEnchant: {
      ...(records.overEnchant || {}),
      level: progressToCap(records.overEnchant?.level,
        AXE_OVER_ENCHANT_CONFIG.maxLevel, tune.overEnchant),
    },
    advancement: {
      ...original,
      combine: {
        ...(original.combine || {}),
        count: progressToCap(original.combine?.count,
          AXE_COMBINE_CONFIG.maxCombines, tune.combine),
      },
      // Rare/Elite/Legendary only; Chosen and other rarity paths remain real.
      stage: eligibleAscend ? {
        ...stage,
        rank: progressToCap(stage.rank,
          AXE_EQUIPMENT_ASCENSION_CONFIG.maxAscensions, tune.ascend),
      } : stage,
      refine: {
        ...(original.refine || {}),
        level: progressToCap(original.refine?.level,
          AXE_REFINE_CONFIG.maxLevel, tune.refine),
      },
      ultimate: eligibleUltimate ? {
        ...(original.ultimate || {}),
        level: progressToCap(original.ultimate?.level,
          AXE_ULTIMATE_CONFIG.maxLevel, tune.ultimate),
      } : (original.ultimate || {}),
    },
  };
}

const active = new Map();
const listeners = new Set();
const announce = () => {
  const snapshot = Object.fromEntries([...active].map(([key, value]) => [key, {...value}]));
  for (const fn of listeners) fn(snapshot);
};

export function getAXETestWeaponTuning(itemId) {
  if (!isAXETestWeaponTunerEnabled() || !itemId) return null;
  const item = active.get(itemId);
  return item ? {...item} : null;
}
export function hasAXETestWeaponTuning() {
  return isAXETestWeaponTunerEnabled() && active.size > 0;
}
export function setAXETestWeaponTuning(item, values) {
  if (!isAXETestWeaponTunerEnabled()) return {ok:false,reason:'TEST_SERVER_ONLY'};
  if (!weapon(item)) return {ok:false,reason:'WEAPON_REQUIRED'};
  const tune = normalizeAXETestWeaponTuning(values);
  if (AXE_TEST_WEAPON_FIELDS.every(key => tune[key] === 0)) active.delete(item.instanceId);
  else active.set(item.instanceId, tune);
  announce();
  return {ok:true,values:tune};
}
export function clearAXETestWeaponTuning(itemId = null) {
  if (itemId) active.delete(itemId);
  else active.clear();
  announce();
}
export function subscribeAXETestWeaponTuning(fn) {
  listeners.add(fn);
  fn(Object.fromEntries([...active].map(([key,value]) => [key,{...value}])));
  return () => listeners.delete(fn);
}

// A character switch can never inherit another character's test weapon bonuses.
subscribeCharacterChange(() => clearAXETestWeaponTuning());
