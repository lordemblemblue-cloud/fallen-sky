// Pure equipment-details projection of the one per-item stat breakdown
// (AXEItemStatBreakdown.mjs, Blacksmith v2): the viewer shows exactly what combat adds.
// `records` is the item's { reinforcement, enchantments, overEnchant, advancement,
// legacyDamageMultiplier }; a bare number is read as an Enchant-only multiplier (older
// callers and companion gear). Soul, gems, auras and set bonuses are layered by combat.
import { AXE_RATE_STATS, computeAXEItemStatBreakdown } from './AXEItemStatBreakdown.mjs';

export const AXE_PREVIEW_RATE_STATS = AXE_RATE_STATS;

export function getAXEEquipmentDisplayStats(item, records = 1) {
  if (!item) return [];
  const options = records && typeof records === 'object'
    ? records
    : { enhancementMultiplier: Number.isFinite(Number(records)) ? Math.max(1, Number(records)) : 1 };
  return computeAXEItemStatBreakdown(item, options).rows.map((row) => ({
    stat: row.stat, base: row.original, current: row.total, difference: row.bonus, rate: row.rate,
  }));
}
