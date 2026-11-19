// AXE Prompt 019 — reinforcement, enchantment and over-enchantment.
// These are intentionally separate systems with separate progression records.
// Numerical values are provisional and data-driven; UI/services consume this
// contract rather than embedding risk/cost rules.
//
// Blacksmith v2 (owner-approved, 2026-11-18; docs/game3d/BLACKSMITH_V2_20261118.md):
// Reinforcement IS the item's Enchant 0–200 %, shown in the Blacksmith's Enchant tab. Every
// rarity can reach 200 %. A failed attempt loses 3 points (never below 0) at every level and
// never breaks the item. The four +10 enchant slots and Over-Enchant are unchanged.

type Rec = Record<string, any>;
type RollOptions = { roll?: number; protectedAttempt?: boolean };

const clamp01 = (v: unknown): number => Math.max(0, Math.min(1, Number(v) || 0));

export const AXE_REINFORCEMENT_CONFIG = Object.freeze({
  stepPercent: 5,
  maxPercent: 200, // Enchant 0–200 %: the ceiling of every rarity unless rarityCaps says otherwise
  safeThroughPercent: 40, // success is certain up to here, then falls towards minimumSuccessChance
  baseSuccessChance: 0.96,
  minimumSuccessChance: 0.28,
  // a failed attempt loses this many points, never below floorPercent; nothing breaks
  failurePenaltyPercent: 3,
  floorPercent: 0,
  // Mythic is future-only in the owner's handoff: its drops (Lv 180+ bosses) keep their
  // existing 120 % ceiling until the owner decides; every other rarity reaches 200 %.
  rarityCaps: Object.freeze({ mythic: 120, mystical: 120 } as Record<string, number>),
});

export const AXE_ENCHANTMENT_CONFIG = Object.freeze({
  slots: 4,
  maxLevelPerSlot: 10,
  safeLevelPerSlot: 5,
});

export const AXE_OVER_ENCHANT_CONFIG = Object.freeze({
  maxLevel: 10,
  baseSuccessChance: 0.72,
  minimumSuccessChance: 0.18,
  fractureStartsAt: 4,
});

// The item's Enchant ceiling (a config value per rarity; 200 % unless listed).
export function getAXEReinforcementCap(item: Rec | null | undefined): number {
  const rarity = String(item?.rarity || '').trim().toLowerCase();
  const listed = AXE_REINFORCEMENT_CONFIG.rarityCaps[rarity];
  return Number.isFinite(listed) ? listed : AXE_REINFORCEMENT_CONFIG.maxPercent;
}

export function reinforcementSuccessChance(currentPercent: unknown, maxPercent: number = AXE_REINFORCEMENT_CONFIG.maxPercent): number {
  const pct = Math.max(0, Number(currentPercent) || 0);
  if (pct <= AXE_REINFORCEMENT_CONFIG.safeThroughPercent) return 1;
  const span = Math.max(
    1,
    maxPercent - AXE_REINFORCEMENT_CONFIG.safeThroughPercent,
  );
  const t = clamp01((pct - AXE_REINFORCEMENT_CONFIG.safeThroughPercent) / span);
  return Math.max(
    AXE_REINFORCEMENT_CONFIG.minimumSuccessChance,
    AXE_REINFORCEMENT_CONFIG.baseSuccessChance - t * 0.68,
  );
}

// What a failed attempt leaves: 3 points less, never below 0.
export function reinforcementFailurePercent(currentPercent: unknown): number {
  const pct = Math.max(0, Number(currentPercent) || 0);
  return Math.max(
    AXE_REINFORCEMENT_CONFIG.floorPercent,
    pct - AXE_REINFORCEMENT_CONFIG.failurePenaltyPercent,
  );
}

export function previewReinforcement(record: Rec = {}, { item = null }: { item?: Rec | null } = {}) {
  const ceiling = getAXEReinforcementCap(item);
  const currentPercent = Math.max(0, Number(record.percent || 0));
  const nextPercent = Math.min(
    ceiling,
    currentPercent + AXE_REINFORCEMENT_CONFIG.stepPercent,
  );
  const failurePercent = reinforcementFailurePercent(currentPercent);
  return {
    currentPercent,
    nextPercent,
    failurePercent,
    successChance: reinforcementSuccessChance(currentPercent, ceiling),
    maxPercent: ceiling,
    canAdvance: currentPercent < ceiling,
    failureOutcomes: failurePercent < currentPercent ? ['downgrade'] : ['no_change'],
  };
}

export function resolveReinforcement(record: Rec = {}, {
  roll = Math.random(),
  protectedAttempt = false,
  item = null,
}: RollOptions & { item?: Rec | null } = {}) {
  const preview = previewReinforcement(record, { item });
  if (!preview.canAdvance) return { ok: false, reason: 'max_reinforcement', record: { ...record } };

  if (roll <= preview.successChance) {
    return {
      ok: true,
      outcome: 'success',
      chance: preview.successChance,
      record: { ...record, percent: preview.nextPercent },
    };
  }

  // a Stabilizer (protected attempt) keeps the current Enchant on a failure
  if (protectedAttempt) {
    return { ok: false, outcome: 'protected', chance: preview.successChance, record: { ...record } };
  }

  if (preview.failurePercent < preview.currentPercent) {
    return {
      ok: false,
      outcome: 'downgrade',
      chance: preview.successChance,
      record: { ...record, percent: preview.failurePercent },
    };
  }

  return { ok: false, outcome: 'no_change', chance: preview.successChance, record: { ...record } };
}

export function overEnchantSuccessChance(level: unknown): number {
  const t = clamp01((Number(level) || 0) / AXE_OVER_ENCHANT_CONFIG.maxLevel);
  return Math.max(
    AXE_OVER_ENCHANT_CONFIG.minimumSuccessChance,
    AXE_OVER_ENCHANT_CONFIG.baseSuccessChance - t * 0.54,
  );
}

export function resolveOverEnchant(record: Rec = {}, {
  roll = Math.random(),
  protectedAttempt = false,
}: RollOptions = {}) {
  const level = Number(record.level || 0);
  if (level >= AXE_OVER_ENCHANT_CONFIG.maxLevel) {
    return { ok: false, reason: 'max_over_enchant', record: { ...record } };
  }

  const successChance = overEnchantSuccessChance(level);
  if (roll <= successChance) {
    return {
      ok: true,
      outcome: 'success',
      record: { ...record, level: level + 1, fractured: false },
    };
  }

  if (protectedAttempt) {
    return { ok: false, outcome: 'protected', record: { ...record } };
  }

  if (level >= AXE_OVER_ENCHANT_CONFIG.fractureStartsAt) {
    return {
      ok: false,
      outcome: 'fracture',
      record: { ...record, level: Math.max(0, level - 1), fractured: true },
    };
  }

  return { ok: false, outcome: 'no_change', record: { ...record } };
}

// The Enchant family's share of an item's stats: 1 + Enchant % / 100 + 1 % per slot level
// + 2.5 % per Over-Enchant level. It also drives the enchantment light (enchantVfx). Item
// stats ADD this share of the original roll (AXEItemStatBreakdown.mjs); nothing multiplies it.
export function getAXEEnhancementStatMultiplier({
  reinforcement = {},
  enchantments = [],
  overEnchant = {},
}: { reinforcement?: Rec; enchantments?: unknown[]; overEnchant?: Rec } = {}) {
  const reinforcementPct = Math.max(0, Number(reinforcement?.percent || 0));
  const enchantLevels = (enchantments || []).reduce((sum: number, value) => sum + (Number(value) || 0), 0);
  const overLevel = Math.max(0, Number(overEnchant?.level || 0));

  return 1
    + reinforcementPct / 100
    + enchantLevels * 0.01
    + overLevel * 0.025;
}
