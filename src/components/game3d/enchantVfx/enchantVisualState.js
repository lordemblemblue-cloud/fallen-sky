// The live adapter between the game's stores and the enchantment visual rules.
// Reads only: the enchant store (equipment/enchantmentStore.jsx) stays the source of truth, and
// nothing here changes items, odds, costs, caps or stats.
import { useEffect, useState } from 'react';
import {
  MAX_ENCH_LEVEL, getItemEnchantments, getItemOverEnchant, getItemReinforcement, subscribeEnchantments,
} from '../equipment/enchantmentStore';
import {
  AXE_OVER_ENCHANT_CONFIG, getAXEEnhancementStatMultiplier, previewReinforcement,
} from '../axe/equipment/AXEItemEnhancementSystem';
import { buildArmorEnchantMap, storedEnchantRecordsReader } from './enchantEquipment.mjs';
import { enchantPercentFromRecords, resolveEnchantVisualStyle } from './enchantVisualRules.mjs';
import { getEnchantQuality, setEnchantQuality } from './enchantQuality.js';

export const getItemEnchantRecords = (instanceId) => ({
  reinforcement: getItemReinforcement(instanceId),
  enchantments: getItemEnchantments(instanceId),
  overEnchant: getItemOverEnchant(instanceId),
});

const instanceIdOf = (item) => (typeof item === 'string' ? item : item?.instanceId || item?.id || null);

/** The item's enchantment percentage (unclamped; the renderers clamp to 0..200). */
export function getItemEnchantPercent(item) {
  const id = instanceIdOf(item);
  return id ? enchantPercentFromRecords(getItemEnchantRecords(id), getAXEEnhancementStatMultiplier) : 0;
}

export const enchantCategoryOf = (item) =>
  (String(item?.slot || item?.category || '').toLowerCase() === 'weapon' ? 'weapon' : 'armor');

/**
 * The enchantment percentage a SUCCESSFUL operation would give (Blacksmith preview), computed with
 * the game's own rules: the reinforcement preview's next step, +1 level in the next open enchant
 * slot, or +1 over-enchant level. null when the operation cannot advance or does not change it.
 */
export function projectEnchantPercent(item, operation) {
  const id = instanceIdOf(item);
  if (!id) return null;
  const records = getItemEnchantRecords(id);
  const next = { ...records, enchantments: [...(records.enchantments || [])] };
  if (operation === 'reinforcement') {
    const preview = previewReinforcement(records.reinforcement || {}, { item });
    if (!preview.canAdvance) return null;
    next.reinforcement = { ...records.reinforcement, percent: preview.nextPercent };
  } else if (operation === 'enchant') {
    const slot = next.enchantments.findIndex((level) => Number(level) < MAX_ENCH_LEVEL);
    if (slot < 0) return null;
    next.enchantments[slot] = Number(next.enchantments[slot] || 0) + 1;
  } else if (operation === 'over_enchant') {
    const level = Number(records.overEnchant?.level || 0);
    if (level >= AXE_OVER_ENCHANT_CONFIG.maxLevel) return null;
    next.overEnchant = { ...records.overEnchant, level: level + 1 };
  } else {
    return null;
  }
  return enchantPercentFromRecords(next, getAXEEnhancementStatMultiplier);
}

/** Resolved visual style for an owned item (or a proposed percentage for previews). */
export function getItemEnchantStyle(item, { percent = null, quality = getEnchantQuality() } = {}) {
  return resolveEnchantVisualStyle({
    rarity: item?.rarity,
    percent: percent ?? getItemEnchantPercent(item),
    category: enchantCategoryOf(item),
    quality,
  });
}

/** { [armor slot]: { instanceId, pieceId, rarity, percent } } for the ACTIVE character's items. */
export function getArmorEnchantMap(items) {
  return buildArmorEnchantMap(items, { recordsFor: getItemEnchantRecords, multiplier: getAXEEnhancementStatMultiplier });
}

/** The same map for another roster character, read from its saved records. */
export function getStoredArmorEnchantMap(items, { user, characterId, storage = globalThis.localStorage } = {}) {
  if (!characterId) return {};
  return buildArmorEnchantMap(items, {
    recordsFor: storedEnchantRecordsReader(storage, user, characterId),
    multiplier: getAXEEnhancementStatMultiplier,
  });
}

export { subscribeEnchantments };

/**
 * Per-frame readers (the held weapon) use this cache: one store read per item until the next
 * enchant/reinforce/over-enchant change or character switch, no allocations in between.
 */
export function createEnchantPercentCache() {
  const cache = new Map();
  const unsubscribe = subscribeEnchantments(() => cache.clear());
  return {
    get(item) {
      const id = instanceIdOf(item);
      if (!id) return 0;
      let value = cache.get(id);
      if (value === undefined) { value = getItemEnchantPercent(id); cache.set(id, value); }
      return value;
    },
    dispose() { unsubscribe?.(); cache.clear(); },
  };
}

/** Re-render on any enchant/reinforce/over-enchant change (and on character switch). */
export function useEnchantRevision() {
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeEnchantments(() => setRevision((value) => value + 1)), []);
  return revision;
}

// Console/QA handle: game3dEnchantVfx.percent(item), .style(item), .setQuality('mobile'|'desktop'|null)
if (typeof window !== 'undefined' && !window.game3dEnchantVfx) {
  window.game3dEnchantVfx = {
    percent: getItemEnchantPercent,
    style: getItemEnchantStyle,
    armorMap: getArmorEnchantMap,
    quality: getEnchantQuality,
    setQuality: setEnchantQuality,
  };
}
