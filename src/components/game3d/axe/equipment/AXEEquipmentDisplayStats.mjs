// Pure equipment-details projection. Match the flat/rate distinction in
// AXEEquipmentRuntimeStats.js without changing saved items or adding power.
// This is *only* the reinforcement/enchant/over-enchant contribution preview;
// combat's soul, advancement, gems, auras and set bonuses are layered later.
export const AXE_PREVIEW_RATE_STATS = new Set([
  'critChance', 'criticalChance', 'critDamage', 'criticalDamage',
  'critDefense', 'criticalDefense', 'attackPct', 'damagePct',
  'defensePct', 'hpPct', 'maxHPPct', 'chiPct', 'maxChiPct',
]);

export function getAXEEquipmentDisplayStats(item, enhancementMultiplier = 1) {
  if (!item) return [];
  const merged = new Map();
  // Rolled stats ADD to base stats; spreading them over base stats silently
  // hid part of an item's actual contribution when both use the same key.
  for (const stats of [item.baseStats || item.stats || {}, item.rolledStats || {}]) {
    for (const [stat, rawValue] of Object.entries(stats)) {
      const value = Number(rawValue);
      if (!Number.isFinite(value) || value === 0) continue;
      merged.set(stat, (merged.get(stat) || 0) + value);
    }
  }
  const scale = Number.isFinite(Number(enhancementMultiplier))
    ? Math.max(1, Number(enhancementMultiplier)) : 1;
  return Array.from(merged, ([stat, base]) => {
    const rate = AXE_PREVIEW_RATE_STATS.has(stat);
    const current = rate ? base : base * scale;
    return { stat, base, current, difference: current - base, rate };
  });
}
