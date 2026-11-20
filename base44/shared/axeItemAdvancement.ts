// AXE Prompt 020 — combine, stage, refine and ultimate item progression.
// Separate from reinforcement/enchant/over-enchant. All balance values are
// provisional and data-driven.
//
// Blacksmith v2 (owner-approved, 2026-11-18; docs/game3d/BLACKSMITH_V2_20261118.md):
//  • Combine +0..+12: the donor has the same rarity, item level, slot and subtype as the
//    target (weapon family `masteryWeaponId`; armor and jewelry by slot), not necessarily the
//    same template. Each stage adds 2 % of the item's original roll. A failure keeps the
//    stage and the donor. The fee is a config value (free for now).
//  • Ascension +0..+4 (Rare, Elite, Legendary): one donor per attempt (same rarity and
//    slot/subtype, item level equal or lower), success +1 100 % / +2 80 % / +3 65 % / +4 50 %,
//    a failure keeps the donor and the rank. Each rank adds the original roll × (Rare 0.15 /
//    Elite 0.75 / Legendary 1.0) × rank / 4 to the item's OWN stats; set bonuses, skills and
//    other items are untouched.
// The game (local characters) and the server (itemUpgrade) resolve both with these rules.

type Rec = Record<string, any>;
type RollOptions = { roll?: number; protectedAttempt?: boolean };

// ---- item identity used by the donor rules ----
export const itemIdOf = (item: Rec | null | undefined): string => String(item?.instanceId || item?.id || '');
export const itemRarityOf = (item: Rec | null | undefined): string => String(item?.rarity || item?.tier || '').trim().toLowerCase();
export const itemSlotOf = (item: Rec | null | undefined): string => String(item?.slot || item?.category || '').trim().toLowerCase();
export const itemTemplateOf = (item: Rec | null | undefined): string => String(item?.templateId || item?.id || '');
export function itemLevelOf(item: Rec | null | undefined): number {
  const n = Number(item?.itemLevel ?? item?.level ?? 1);
  return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
}

// The subtype a donor must share: a weapon's family (sword, dual_blades, bow, sky); every
// other slot is its own subtype (gloves with gloves, rings with rings). null: a weapon that
// does not say its family (only the same template can match it then).
export function getAXEItemSubtype(item: Rec | null | undefined): string | null {
  const slot = itemSlotOf(item);
  if (!slot) return null;
  if (slot !== 'weapon') return slot;
  const family = String(item?.masteryWeaponId || '').trim().toLowerCase();
  return family ? `weapon:${family}` : null;
}

// a donor the player keeps out of upgrades
export const isAXEProtectedDonor = (donor: Rec | null | undefined): boolean => Boolean(
  donor?.equipped || donor?.locked || donor?.favorite || donor?.favorited || donor?.isFavorite || donor?.vanityOnly);

function sameSubtype(target: Rec, donor: Rec): boolean {
  const a = getAXEItemSubtype(target);
  const b = getAXEItemSubtype(donor);
  if (a && b) return a === b;
  if (a || b) return false;
  return itemTemplateOf(target) !== '' && itemTemplateOf(target) === itemTemplateOf(donor);
}

export const AXE_COMBINE_CONFIG = Object.freeze({
  maxCombines: 12,
  sameGradeRequired: true,
  sameItemLevelRequired: true,
  sameSlotRequired: true,
  sameSubtypeRequired: true,
  baseSuccessChance: 0.9,
  minimumSuccessChance: 0.35,
  // each stage adds this share of the item's ORIGINAL roll (base + rolled stats), not compounded
  statPerStage: 0.02,
  // charged on every attempt, success or failure (loot item id -> count); free for now
  fee: Object.freeze({} as Record<string, number>),
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

export const AXE_EQUIPMENT_ASCENSION_CONFIG = Object.freeze({
  maxAscensions: 4,
  ruleVersion: 'equipment-ascension-v2',
  eligibleRarities: Object.freeze(['rare', 'elite', 'legendary']),
  // the item's own numeric stats gain original × maxBonus × rank / 4
  maxBonusByRarity: Object.freeze({ rare: 0.15, elite: 0.75, legendary: 1.0 } as Record<string, number>),
  // future only, disabled: no drops, UI, combat or crafting support (a config placeholder)
  futureRarities: Object.freeze({ mythic: Object.freeze({ maxBonus: 1.5, enabled: false }) } as Record<string, { maxBonus: number; enabled: boolean }>),
  // chance of the attempt that reaches +1, +2, +3, +4
  successChanceByRank: Object.freeze([1, 0.8, 0.65, 0.5]),
  // charged on every attempt (loot item id -> count); free for now
  fee: Object.freeze({} as Record<string, number>),
  // consumed on success; on a failure only when catalystOnFailure is true; free for now
  catalyst: Object.freeze({} as Record<string, number>),
  catalystOnFailure: false,
  // The Chosen set's ×2 / ×3 rule (AXEChosenSetRules.mjs, unchanged) counts Stage IV pieces.
  // Chosen keeps its older materials-only stage path, which adds no item stats.
  legacyStageRarities: Object.freeze(['chosen']),
});

const clamp01 = (v: unknown): number => Math.max(0, Math.min(1, Number(v) || 0));
const clampRank = (rank: unknown): number => Math.max(0, Math.min(AXE_EQUIPMENT_ASCENSION_CONFIG.maxAscensions, Math.trunc(Number(rank) || 0)));

export const isAXEAscensionRarity = (item: Rec | null | undefined): boolean =>
  AXE_EQUIPMENT_ASCENSION_CONFIG.eligibleRarities.includes(itemRarityOf(item));
export const isAXELegacyStageRarity = (item: Rec | null | undefined): boolean =>
  AXE_EQUIPMENT_ASCENSION_CONFIG.legacyStageRarities.includes(itemRarityOf(item));

// The share of the original roll an item's Ascension adds (0 for rarities without approved values).
export function getAXEAscensionMaxBonus(item: Rec | null | undefined): number {
  const value = AXE_EQUIPMENT_ASCENSION_CONFIG.maxBonusByRarity[itemRarityOf(item)];
  return Number.isFinite(value) ? value : 0;
}

// (rounded so Rare +3 is exactly 11.25 %, not 11.249999…)
export function getAXEAscensionBonusFraction(item: Rec | null | undefined, rank: unknown): number {
  return Math.round(getAXEAscensionMaxBonus(item) * clampRank(rank) / AXE_EQUIPMENT_ASCENSION_CONFIG.maxAscensions * 1e10) / 1e10;
}

// null at +4 (or a legacy Stage V record)
export function ascensionSuccessChance(currentRank: unknown): number | null {
  const rank = Math.max(0, Math.trunc(Number(currentRank) || 0));
  if (rank >= AXE_EQUIPMENT_ASCENSION_CONFIG.maxAscensions) return null;
  return AXE_EQUIPMENT_ASCENSION_CONFIG.successChanceByRank[rank] ?? null;
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

export function combineSuccessChance(count: unknown = 0): number {
  const t = clamp01((Number(count) || 0) / AXE_COMBINE_CONFIG.maxCombines);
  return Math.max(
    AXE_COMBINE_CONFIG.minimumSuccessChance,
    AXE_COMBINE_CONFIG.baseSuccessChance - t * 0.55,
  );
}

// target.combine is the target's combine record ({ count })
export function validateCombine(target: Rec | null | undefined, donor: Rec | null | undefined) {
  if (!target || !donor) return { ok: false, reason: 'ITEM_MISSING' };
  if (itemIdOf(target) && itemIdOf(target) === itemIdOf(donor)) return { ok: false, reason: 'SAME_INSTANCE' };
  if (isAXEProtectedDonor(donor)) return { ok: false, reason: 'DONOR_PROTECTED' };
  if (AXE_COMBINE_CONFIG.sameGradeRequired && itemRarityOf(target) !== itemRarityOf(donor)) {
    return { ok: false, reason: 'GRADE_MISMATCH' };
  }
  if (AXE_COMBINE_CONFIG.sameItemLevelRequired && itemLevelOf(target) !== itemLevelOf(donor)) {
    return { ok: false, reason: 'LEVEL_MISMATCH' };
  }
  if (AXE_COMBINE_CONFIG.sameSlotRequired && itemSlotOf(target) !== itemSlotOf(donor)) {
    return { ok: false, reason: 'SLOT_MISMATCH' };
  }
  if (AXE_COMBINE_CONFIG.sameSubtypeRequired && !sameSubtype(target, donor)) {
    return { ok: false, reason: 'SUBTYPE_MISMATCH' };
  }
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
    // a failure keeps the stage and the donor; only the fee is charged
    return { ok: false, outcome: 'failure', chance, donorConsumed: false, target: { ...target } };
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

// The same rule on an item's combine record (the server's ledger keeps records).
export function resolveCombineRecord(record: Rec = {}, item: Rec | null | undefined, donor: Rec | null | undefined, { roll = Math.random() }: RollOptions = {}) {
  const result = resolveCombine({ ...(item || {}), combine: { count: Number(record?.count || 0) } }, donor as Rec, { roll });
  if (result.reason) return { ok: false, reason: result.reason, record: { ...record } };
  return {
    ok: !!result.ok,
    outcome: result.outcome,
    chance: result.chance,
    donorConsumed: !!result.donorConsumed,
    record: result.ok ? { ...record, count: result.target.combine.count } : { ...record },
  };
}

export function getNextStage(record: Rec = {}) {
  const current = Number(record.rank || 0);
  if (!Number.isSafeInteger(current) || current < 0 ||
    current >= AXE_EQUIPMENT_ASCENSION_CONFIG.maxAscensions) return null;
  return AXE_STAGE_CONFIG.stages.find((s) => s.rank === current + 1) || null;
}

// One donor per attempt: same rarity, same slot and subtype, item level equal or lower.
export function validateAXEAscensionDonor(target: Rec | null | undefined, donor: Rec | null | undefined) {
  if (!target) return { ok: false, reason: 'ITEM_MISSING' };
  if (!isAXEAscensionRarity(target)) return { ok: false, reason: 'ASCENSION_RARITY_NOT_ELIGIBLE' };
  if (!donor) return { ok: false, reason: 'DONOR_REQUIRED' };
  if (!itemIdOf(target) || !itemIdOf(donor) || itemIdOf(target) === itemIdOf(donor)) return { ok: false, reason: 'SAME_INSTANCE' };
  if (isAXEProtectedDonor(donor)) return { ok: false, reason: 'DONOR_PROTECTED' };
  if (itemRarityOf(donor) !== itemRarityOf(target)) return { ok: false, reason: 'ASCENSION_RARITY_MISMATCH' };
  if (itemSlotOf(donor) !== itemSlotOf(target)) return { ok: false, reason: 'ASCENSION_SLOT_MISMATCH' };
  if (!sameSubtype(target, donor)) return { ok: false, reason: 'ASCENSION_SUBTYPE_MISMATCH' };
  if (itemLevelOf(donor) > itemLevelOf(target)) return { ok: false, reason: 'DONOR_LEVEL_TOO_HIGH' };
  return { ok: true };
}

// a fresh stage record (older records' imprints / feed progress are not carried forward)
const stageRecord = (next: Rec) => ({ rank: next.rank, id: next.id, label: next.label });

// One Ascension attempt on an item's stage record. Rare / Elite / Legendary: one donor,
// the configured odds; a failure keeps the donor and the rank. Chosen: the older
// materials-only path (always succeeds, no donor). Every other rarity: off.
export function resolveAscensionRecord(record: Rec = {}, item: Rec | null | undefined, donor: Rec | null | undefined, { roll = Math.random() }: RollOptions = {}) {
  if (!item) return { ok: false, reason: 'ITEM_MISSING', record: { ...record } };
  const next = getNextStage(record);
  if (!next) return { ok: false, reason: 'MAX_STAGE', record: { ...record } };
  if (isAXELegacyStageRarity(item)) {
    return { ok: true, outcome: 'success', chance: 1, legacy: true, donorConsumed: false, record: { ...record, ...stageRecord(next) } };
  }
  const valid = validateAXEAscensionDonor(item, donor);
  if (!valid.ok) return { ...valid, record: { ...record } };
  const chance = ascensionSuccessChance(record.rank) ?? 0;
  if (roll > chance) {
    return { ok: false, outcome: 'failure', chance, donorConsumed: false, record: { ...record } };
  }
  return { ok: true, outcome: 'success', chance, donorConsumed: true, record: stageRecord(next) };
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
      return { type, next: getNextStage(payload.record || {}), chance: ascensionSuccessChance(payload.record?.rank || 0),
        validation: validateAXEAscensionDonor(payload.target, payload.donor) };
    case 'refine':
      return { type, chance: refineSuccessChance(payload.record?.level || 0), currentLevel: payload.record?.level || 0 };
    case 'ultimate':
      return { type, chance: ultimateSuccessChance(payload.record?.level || 0), currentLevel: payload.record?.level || 0 };
    default:
      return { type, error: 'UNKNOWN_ADVANCEMENT' };
  }
}
