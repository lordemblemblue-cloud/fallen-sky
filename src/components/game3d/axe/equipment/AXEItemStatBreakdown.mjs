// One per-item stat breakdown (Blacksmith v2, owner-approved 2026-11-18;
// docs/game3d/BLACKSMITH_V2_20261118.md). Combat (AXEEquipmentRuntimeStats.js), the
// Blacksmith readout, the equipment viewer (AXEEquipmentDisplayStats.mjs), the inventory,
// compare and tooltips all read an item's stats from here, so they always agree.
//
// Stats are ADDITIVE. For every stat on the item:
//   original = baseStats + rolledStats (never changed by upgrades)
//   total    = original + Combine + Enchant + Ascend (+ Refine, Ultimate, Weapon Legacy, perk)
// and every delta is a share of the ORIGINAL roll, so no upgrade multiplies another:
//   Combine  original × 2 % × stage (0..12)
//   Enchant  original × (Enchant % / 100 + 1 % per slot level + 2.5 % per Over-Enchant level)
//   Ascend   original × rarity maximum (Rare 0.15, Elite 0.75, Legendary 1.0) × rank / 4
// Rate stats (crit chance, crit damage, % bonuses) are percentage points: Combine and Enchant
// leave them alone; Ascension grows them relatively (8 % at Rare +4 -> +1.2 pp) and chance
// stats stay within their caps. Pure: no stores, importable from node tests.
import { getAXEEnhancementStatMultiplier } from './AXEItemEnhancementSystem.js';
import { AXE_COMBINE_CONFIG, getAXEAscensionBonusFraction, getAXEAscensionMaxBonus } from './AXEItemAdvancementSystem.js';

export const AXE_ITEM_STAT_CONFIG = Object.freeze({
  combinePerStage: AXE_COMBINE_CONFIG.statPerStage,
  refinePerLevel: 0.025,
  ultimatePerLevel: 0.04,
  // the armor perk's own-defense share (AXEFarmingItemPerks.mjs), bounded as before
  armorPerkMaxPct: 12,
  armorPerkAscendedMaxPct: 6,
});

// Percentage-point stats. Upgrades used to grow a ring's 0.5 % crit until one ring gave half
// a hero's crit chance; Combine and Enchant still never touch these.
export const AXE_RATE_STATS = Object.freeze(new Set([
  'critChance', 'criticalChance', 'critDamage', 'criticalDamage', 'critDefense', 'criticalDefense',
  'attackPct', 'damagePct', 'defensePct', 'hpPct', 'maxHPPct', 'chiPct', 'maxChiPct',
]));
export const isAXERateStat = (key) => AXE_RATE_STATS.has(key);
// chance stats can never pass these (percentage points)
export const AXE_CHANCE_STAT_CAPS = Object.freeze({ critChance: 100, criticalChance: 100 });

const ATTACK_KEYS = new Set(['attack', 'damage', 'attackPower', 'physicalAttack']);
const n0 = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
// trims floating-point noise (1.7 - 1 = 0.6999…) without touching real precision
const r9 = (value) => Math.round(value * 1e9) / 1e9;
const clampInt = (value, min, max) => Math.max(min, Math.min(max, Math.trunc(n0(value))));

// original = base + rolled, per stat (a companion piece keeps its stats in `stats`)
export function getAXEItemOriginalStats(item) {
  const merged = new Map();
  if (!item) return merged;
  for (const stats of [item.baseStats || item.stats || {}, item.rolledStats || {}]) {
    for (const [stat, raw] of Object.entries(stats || {})) {
      const value = Number(raw);
      if (!Number.isFinite(value) || value === 0) continue;
      merged.set(stat, (merged.get(stat) || 0) + value);
    }
  }
  return merged;
}

function armorPerkPct(item, rank) {
  const perk = item?.abilityPerks;
  if (perk?.type !== 'armor_defense_pct') return 0;
  const base = Math.max(0, Math.min(AXE_ITEM_STAT_CONFIG.armorPerkMaxPct, n0(perk.basePct)));
  const ascended = rank >= 4 ? Math.max(0, Math.min(AXE_ITEM_STAT_CONFIG.armorPerkAscendedMaxPct, n0(perk.ascendedBonusPct))) : 0;
  return base + ascended;
}

/**
 * @param item the owned item (baseStats, rolledStats, rarity, abilityPerks)
 * @param records { reinforcement, enchantments, overEnchant, advancement, legacyDamageMultiplier }
 *   or { enhancementMultiplier } for a bare Enchant-only preview (older callers)
 */
export function computeAXEItemStatBreakdown(item, {
  reinforcement = {}, enchantments = [], overEnchant = {}, advancement = {},
  legacyDamageMultiplier = 1, enhancementMultiplier = null,
} = {}) {
  const enchantMultiplier = enhancementMultiplier != null && Number.isFinite(Number(enhancementMultiplier))
    ? Math.max(1, Number(enhancementMultiplier))
    : getAXEEnhancementStatMultiplier({ reinforcement: reinforcement || {}, enchantments: enchantments || [], overEnchant: overEnchant || {} });
  const combineStage = clampInt(advancement?.combine?.count, 0, AXE_COMBINE_CONFIG.maxCombines);
  const ascendRank = clampInt(advancement?.stage?.rank, 0, 4);
  const refineLevel = Math.max(0, Math.trunc(n0(advancement?.refine?.level)));
  const ultimateLevel = Math.max(0, Math.trunc(n0(advancement?.ultimate?.level)));
  const share = {
    combine: r9(combineStage * AXE_ITEM_STAT_CONFIG.combinePerStage),
    enchant: r9(Math.max(0, enchantMultiplier - 1)),
    ascend: getAXEAscensionBonusFraction(item, ascendRank),
    refine: r9(refineLevel * AXE_ITEM_STAT_CONFIG.refinePerLevel),
    ultimate: r9(ultimateLevel * AXE_ITEM_STAT_CONFIG.ultimatePerLevel),
    legacy: r9(Math.max(0, n0(legacyDamageMultiplier) - 1)),
  };
  const perkPct = armorPerkPct(item, ascendRank);
  const baseDefense = n0(item?.baseStats?.defense);
  const rows = [];
  for (const [stat, original] of getAXEItemOriginalStats(item)) {
    const rate = AXE_RATE_STATS.has(stat);
    const row = {
      stat, rate, chance: Object.hasOwn(AXE_CHANCE_STAT_CAPS, stat), original,
      combine: rate ? 0 : r9(original * share.combine),
      enchant: rate ? 0 : r9(original * share.enchant),
      ascend: r9(original * share.ascend),
      refine: rate ? 0 : r9(original * share.refine),
      ultimate: rate ? 0 : r9(original * share.ultimate),
      legacy: !rate && ATTACK_KEYS.has(stat) ? r9(original * share.legacy) : 0,
      perk: stat === 'defense' ? r9(baseDefense * perkPct / 100) : 0,
      capped: false,
    };
    const cap = AXE_CHANCE_STAT_CAPS[stat];
    let total = r9(original + row.combine + row.enchant + row.ascend + row.refine + row.ultimate + row.legacy + row.perk);
    if (cap != null && total > cap) {
      row.ascend = r9(Math.max(0, row.ascend - (total - cap)));
      total = Math.max(original, cap);
      row.capped = true;
    }
    row.bonus = r9(total - original);
    row.total = total;
    rows.push(row);
  }
  return {
    rows,
    totals: Object.fromEntries(rows.map((row) => [row.stat, row.total])),
    sources: {
      combineStage, combinePct: r9(share.combine * 100),
      enchantPercent: Math.max(0, n0(reinforcement?.percent)),
      enchantSlotLevels: (enchantments || []).reduce((sum, value) => sum + Math.max(0, n0(value)), 0),
      overEnchantLevel: Math.max(0, n0(overEnchant?.level)),
      enchantPct: r9(share.enchant * 100), enchantMultiplier,
      ascendRank, ascendMaxPct: r9(getAXEAscensionMaxBonus(item) * 100), ascendPct: r9(share.ascend * 100),
      refineLevel, refinePct: r9(share.refine * 100), ultimateLevel, ultimatePct: r9(share.ultimate * 100),
      legacyPct: r9(share.legacy * 100), perkPct,
    },
  };
}

// the sum of an item's attack-type stats (what the Blacksmith shows as Attack)
export function axeBreakdownAttack(breakdown, field = 'total') {
  const rows = (breakdown?.rows || []).filter((row) => ATTACK_KEYS.has(row.stat) || row.stat === 'maxAtk');
  return rows.length ? rows.reduce((sum, row) => sum + n0(row[field]), 0) : null;
}

// ---- presentation: `Attack 1,000 (+150)`, `Crit Chance 8.0% (+1.2 pp)` ----
const LABELS = Object.freeze({
  attack: 'Attack', damage: 'Attack', attackPower: 'Attack', physicalAttack: 'Attack', maxAtk: 'Max Attack',
  defense: 'Defense', defensePower: 'Defense', hp: 'HP', maxHP: 'Max HP', chi: 'Chi', maxChi: 'Max Chi', mana: 'Mana',
  critChance: 'Crit Chance', criticalChance: 'Crit Chance', critDamage: 'Crit Damage', criticalDamage: 'Crit Damage',
  critDefense: 'Crit Defense', criticalDefense: 'Crit Defense', evasion: 'Evasion', accuracy: 'Accuracy',
  attackPct: 'Attack %', damagePct: 'Damage %', defensePct: 'Defense %', hpPct: 'HP %', maxHPPct: 'HP %',
  chiPct: 'Chi %', maxChiPct: 'Chi %', strength: 'Strength', dexterity: 'Dexterity', agility: 'Agility',
  constitution: 'Constitution', vitality: 'Vitality', focus: 'Focus', spirit: 'Spirit',
  attributeAttack: 'Attribute Attack', attributeDefense: 'Attribute Defense',
});
export function axeStatLabel(stat) {
  const key = String(stat || '');
  return LABELS[key] || key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

const round2 = (value) => { const n = Math.round(n0(value) * 100) / 100; return Object.is(n, -0) ? 0 : n; };
export const formatAXEFlatNumber = (value) => round2(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
const formatRateNumber = (value) => round2(value).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

// a stat's value: 1,000 or 8.0%
export const formatAXEStatValue = (value, rate = false) => (rate ? `${formatRateNumber(value)}%` : formatAXEFlatNumber(value));

// an increase: +150 or +1.2 pp (rates are percentage points, never "+15%")
export function formatAXEStatBonus(value, rate = false) {
  const v = round2(value);
  const sign = v < 0 ? '−' : '+';
  return rate ? `${sign}${formatRateNumber(Math.abs(v))} pp` : `${sign}${formatAXEFlatNumber(Math.abs(v))}`;
}

// `Attack 1,000 (+150)`: the original roll, with the upgrades' increase to its right
export function formatAXEStatLine(row) {
  if (!row) return '';
  const head = `${axeStatLabel(row.stat)} ${formatAXEStatValue(row.original, row.rate)}`;
  return Math.abs(round2(row.bonus)) > 0 ? `${head} (${formatAXEStatBonus(row.bonus, row.rate)})` : head;
}

// the per-system increases of one row, in the order the Blacksmith tabs use
export const AXE_STAT_SOURCES = Object.freeze([
  Object.freeze({ id: 'combine', label: 'Combine' }),
  Object.freeze({ id: 'enchant', label: 'Enchant' }),
  Object.freeze({ id: 'ascend', label: 'Ascend' }),
  Object.freeze({ id: 'refine', label: 'Refine' }),
  Object.freeze({ id: 'ultimate', label: 'Ultimate' }),
  Object.freeze({ id: 'legacy', label: 'Legacy' }),
  Object.freeze({ id: 'perk', label: 'Perk' }),
]);
export function axeStatSourceParts(row) {
  return AXE_STAT_SOURCES.filter((source) => Math.abs(round2(row?.[source.id])) > 0)
    .map((source) => ({ ...source, value: row[source.id], text: formatAXEStatBonus(row[source.id], row.rate) }));
}

// Tooltip text for an owned item: one `Attack 1,000 (+150) = 1,150` line per stat.
export function formatAXEItemStatTooltip(breakdown, { title = '' } = {}) {
  const lines = (breakdown?.rows || []).map((row) => {
    const line = formatAXEStatLine(row);
    return Math.abs(round2(row.bonus)) > 0 ? `${line} = ${formatAXEStatValue(row.total, row.rate)}` : line;
  });
  return [title, ...lines].filter(Boolean).join('\n');
}
