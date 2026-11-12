// AXE Prompt 020 — combine, stage, refine and ultimate item progression.
// Separate from reinforcement/enchant/over-enchant. All balance values are
// provisional and data-driven.

import { getAXEReinforcementCap } from './axeItemEnhancement.ts';

type Rec = Record<string, any>;
type RollOptions = { roll?: number; protectedAttempt?: boolean };

export const AXE_COMBINE_CONFIG = Object.freeze({
  maxCombines: 12,
  sameTemplateRequired: true,
  sameGradeRequired: true,
  baseSuccessChance: 0.9,
  minimumSuccessChance: 0.35,
});

export const AXE_STAGE_CONFIG = Object.freeze({
  stages: Object.freeze([
    { id: 'stage_0', rank: 0, label: 'Base' },
    { id: 'stage_1', rank: 1, label: 'Stage I' },
    { id: 'stage_2', rank: 2, label: 'Stage II' },
    { id: 'stage_3', rank: 3, label: 'Stage III' },
    { id: 'stage_4', rank: 4, label: 'Stage IV' },
    // Stage V is a legacy terminal record; new equipment gets four Ascensions.
    { id: 'stage_5', rank: 5, label: 'Stage V (Legacy)' },
  ]),
});

// Bounded, additive stage imprints: flat attack/defense/attributes grow more
// at higher Reinforcement percentages, but rate stats (crit chance, percent
// multipliers) receive only a small, separately capped increase.
export const AXE_EQUIPMENT_ASCENSION_CONFIG = Object.freeze({
  maxAscensions: 4,
  stageBonuses: Object.freeze([0.055, 0.075, 0.10, 0.135]),
  ruleVersion: 'equipment-ascension-imprint-v1',
});

export function getAXEAscensionImprintFactor(reinforcementPercent: unknown): number {
  const pct = Math.max(0, Math.min(200, Number(reinforcementPercent) || 0));
  return pct <= 120 ? 0.5 + pct / 240 : 1 + (pct - 120) * 0.65 / 80;
}

export function getAXEAscensionImprintBonus(rank: number, reinforcementPercent: unknown): number {
  const base = AXE_EQUIPMENT_ASCENSION_CONFIG.stageBonuses[rank - 1];
  return Number.isFinite(base) ? Math.round(base * getAXEAscensionImprintFactor(reinforcementPercent) * 10000) / 10000 : 0;
}

// Previously saved Stage I-V equipment keeps its legacy 8% per rank where no
// imprint was ever recorded; new levels record the exact reinforcement at forge.
export function getAXEEquipmentAscensionBonus(stage: Rec = {}): number {
  const rank = Math.max(0, Math.min(5, Math.trunc(Number(stage.rank) || 0)));
  const entries = Array.isArray(stage.imprints) ? stage.imprints : [];
  const imprintedRanks = new Set<number>();
  let sum = 0;
  for (const entry of entries) {
    const n = Number(entry?.rank);
    if (!Number.isSafeInteger(n) || n < 1 || n > rank || imprintedRanks.has(n)) continue;
    const amount = Number(entry?.bonus);
    if (!Number.isFinite(amount) || amount < 0 || amount > 0.25) continue;
    imprintedRanks.add(n);
    sum += amount;
  }
  for (let n = 1; n <= rank; n++) if (!imprintedRanks.has(n)) sum += 0.08;
  return Math.min(1, Math.round(sum * 10000) / 10000);
}

// A small improvement to percentage-type properties, deliberately separate
// from flat-stat scaling to avoid runaway critical-strike chance.
export function getAXEEquipmentAscensionRateBonus(stage: Rec = {}): number {
  return Math.min(0.16, getAXEEquipmentAscensionBonus(stage) * 0.25);
}

export const AXE_REFINE_CONFIG = Object.freeze({
  maxLevel: 15,
  safeThroughLevel: 5,
  downgradeStartsLevel: 8,
  destructionStartsLevel: 12,
  baseSuccessChance: 0.92,
  minimumSuccessChance: 0.2,
});

export const AXE_ULTIMATE_CONFIG = Object.freeze({
  eligibleRarities: Object.freeze(['legendary', 'heroic']),
  maxLevel: 10,
  baseSuccessChance: 0.68,
  minimumSuccessChance: 0.16,
  sealStartsLevel: 4,
});

const clamp01 = (v: unknown): number => Math.max(0, Math.min(1, Number(v) || 0));

export function combineSuccessChance(count: unknown = 0): number {
  const t = clamp01((Number(count) || 0) / AXE_COMBINE_CONFIG.maxCombines);
  return Math.max(
    AXE_COMBINE_CONFIG.minimumSuccessChance,
    AXE_COMBINE_CONFIG.baseSuccessChance - t * 0.55,
  );
}

export function validateCombine(target: Rec | null | undefined, donor: Rec | null | undefined) {
  if (!target || !donor) return { ok: false, reason: 'ITEM_MISSING' };
  if (target.instanceId && donor.instanceId && target.instanceId === donor.instanceId) {
    return { ok: false, reason: 'SAME_INSTANCE' };
  }
  if (
    AXE_COMBINE_CONFIG.sameTemplateRequired &&
    target.templateId &&
    donor.templateId &&
    target.templateId !== donor.templateId
  ) return { ok: false, reason: 'TEMPLATE_MISMATCH' };

  if (
    AXE_COMBINE_CONFIG.sameGradeRequired &&
    target.rarity &&
    donor.rarity &&
    target.rarity !== donor.rarity
  ) return { ok: false, reason: 'GRADE_MISMATCH' };

  const count = Number(target.combine?.count || 0);
  if (count >= AXE_COMBINE_CONFIG.maxCombines) return { ok: false, reason: 'MAX_COMBINE' };
  return { ok: true };
}

export function resolveCombine(target: Rec, donor: Rec, { roll = Math.random() }: RollOptions = {}) {
  const valid = validateCombine(target, donor);
  if (!valid.ok) return { ...valid, ok: false, target };

  const current = Number(target.combine?.count || 0);
  const chance = combineSuccessChance(current);
  if (roll > chance) {
    return { ok: false, outcome: 'failure', chance, target: { ...target } };
  }

  return {
    ok: true,
    outcome: 'success',
    chance,
    donorConsumed: true,
    target: {
      ...target,
      combine: { count: current + 1 },
    },
  };
}

export function getNextStage(record: Rec = {}) {
  const current = Number(record.rank || 0);
  if (!Number.isSafeInteger(current) || current < 0 ||
    current >= AXE_EQUIPMENT_ASCENSION_CONFIG.maxAscensions) return null;
  return AXE_STAGE_CONFIG.stages.find((s) => s.rank === current + 1) || null;
}

export function resolveStageAdvance(record: Rec = {}, {
  successChance = 1, roll = Math.random(), item = null, reinforcementPercent = 0,
}: { successChance?: number; roll?: number; item?: Rec | null; reinforcementPercent?: number } = {}) {
  const next = getNextStage(record);
  if (!next) return { ok: false, reason: 'MAX_STAGE', record: { ...record } };
  const pct = Number(reinforcementPercent);
  if (!Number.isFinite(pct) || pct < 0 || pct > getAXEReinforcementCap(item)) {
    return { ok: false, reason: 'REINFORCEMENT_EXCEEDS_RARITY_CAP', record: { ...record } };
  }
  if (roll > Number(successChance)) return { ok: false, outcome: 'failure', record: { ...record } };
  const imprint = Object.freeze({ rank: next.rank, reinforcementPercent: pct,
    bonus: getAXEAscensionImprintBonus(next.rank, pct),
    ruleVersion: AXE_EQUIPMENT_ASCENSION_CONFIG.ruleVersion });
  const imprints = Array.isArray(record.imprints) ? record.imprints.filter((v: Rec) => v?.rank !== next.rank) : [];
  return { ok: true, outcome: 'success', imprint,
    record: { ...record, ...next, imprints: [...imprints, imprint] } };
}

export function refineSuccessChance(level: unknown = 0): number {
  const t = clamp01((Number(level) || 0) / AXE_REFINE_CONFIG.maxLevel);
  return Math.max(
    AXE_REFINE_CONFIG.minimumSuccessChance,
    AXE_REFINE_CONFIG.baseSuccessChance - t * 0.72,
  );
}

export function resolveRefine(record: Rec = {}, {
  roll = Math.random(),
  protectedAttempt = false,
}: RollOptions = {}) {
  const level = Number(record.level || 0);
  if (level >= AXE_REFINE_CONFIG.maxLevel) return { ok: false, reason: 'MAX_REFINE', record: { ...record } };

  const chance = refineSuccessChance(level);
  if (roll <= chance) {
    return { ok: true, outcome: 'success', chance, record: { ...record, level: level + 1 } };
  }

  if (protectedAttempt) return { ok: false, outcome: 'protected', chance, record: { ...record } };

  if (level >= AXE_REFINE_CONFIG.destructionStartsLevel) {
    return { ok: false, outcome: 'destroyed', chance, destroyed: true, record: { ...record } };
  }

  if (level >= AXE_REFINE_CONFIG.downgradeStartsLevel) {
    return {
      ok: false,
      outcome: 'downgrade',
      chance,
      record: { ...record, level: Math.max(AXE_REFINE_CONFIG.safeThroughLevel, level - 1) },
    };
  }

  return { ok: false, outcome: 'no_change', chance, record: { ...record } };
}

export function ultimateSuccessChance(level: unknown = 0): number {
  const t = clamp01((Number(level) || 0) / AXE_ULTIMATE_CONFIG.maxLevel);
  return Math.max(
    AXE_ULTIMATE_CONFIG.minimumSuccessChance,
    AXE_ULTIMATE_CONFIG.baseSuccessChance - t * 0.52,
  );
}

export function resolveUltimate(item: Rec | null | undefined, record: Rec = {}, {
  roll = Math.random(),
  protectedAttempt = false,
}: RollOptions = {}) {
  if (!AXE_ULTIMATE_CONFIG.eligibleRarities.includes(String(item?.rarity || '').toLowerCase())) {
    return { ok: false, reason: 'RARITY_NOT_ELIGIBLE', record: { ...record } };
  }

  const level = Number(record.level || 0);
  if (level >= AXE_ULTIMATE_CONFIG.maxLevel) {
    return { ok: false, reason: 'MAX_ULTIMATE', record: { ...record } };
  }

  const chance = ultimateSuccessChance(level);
  if (roll <= chance) {
    return { ok: true, outcome: 'success', chance, record: { level: level + 1, sealed: false } };
  }

  if (protectedAttempt) return { ok: false, outcome: 'protected', chance, record: { ...record } };

  if (level >= AXE_ULTIMATE_CONFIG.sealStartsLevel) {
    return { ok: false, outcome: 'sealed', chance, record: { ...record, sealed: true } };
  }

  return { ok: false, outcome: 'no_change', chance, record: { ...record } };
}

export function previewAXEAdvancement(type: string, payload: Rec = {}) {
  switch (type) {
    case 'combine':
      return { type, validation: validateCombine(payload.target, payload.donor), chance: combineSuccessChance(payload.target?.combine?.count || 0) };
    case 'stage':
      return { type, next: getNextStage(payload.record || {}) };
    case 'refine':
      return { type, chance: refineSuccessChance(payload.record?.level || 0), currentLevel: payload.record?.level || 0 };
    case 'ultimate':
      return { type, chance: ultimateSuccessChance(payload.record?.level || 0), currentLevel: payload.record?.level || 0 };
    default:
      return { type, error: 'UNKNOWN_ADVANCEMENT' };
  }
}
