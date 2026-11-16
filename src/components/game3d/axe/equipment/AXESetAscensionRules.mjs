// Ascension raises the matching set's EXISTING bonus: 25% of its original
// numerical value per successful stage, up to +100% (x2) at stage +4.
// This is separate from reinforcement/enchant/over-enchant item power and
// separate from Chosen's exclusive x2/x3 all-core-stat full-set prestige.
export const AXE_SET_ASCENSION_PER_STAGE_PCT = 25;
export const AXE_SET_ASCENSION_MAX_RANK = 4;

export function getAXESetAscensionRank(item) {
  const value = Number(item?.advancement?.stage?.rank);
  return Number.isInteger(value)
    ? Math.max(0, Math.min(AXE_SET_ASCENSION_MAX_RANK, value)) : 0;
}

// A tier requiring N pieces gets the rank of its Nth-most-ascended matching
// equipped piece. One boosted piece can't double an entire set by itself.
// Adding low-rank gear to a 2-piece set never degrades its 2-piece bonus.
export function getAXESetAscensionTier(items = [], threshold = 2) {
  const needed = Math.max(1, Math.floor(Number(threshold) || 2));
  const ranks = (items || []).filter(i => i?.equipped)
    .map(getAXESetAscensionRank).sort((a,b) => b-a);
  const rank = ranks.length >= needed ? ranks[needed - 1] : 0;
  return {
    rank,
    bonusPct: rank * AXE_SET_ASCENSION_PER_STAGE_PCT,
    multiplier: 1 + rank * AXE_SET_ASCENSION_PER_STAGE_PCT / 100,
  };
}

export function scaleAXESetBonus(base = {}, tier = {}) {
  const multiplier = Number(tier.multiplier) || 1;
  return Object.fromEntries(Object.entries(base || {}).map(([key, value]) => {
    const n = Number(value);
    return [key, Number.isFinite(n) ? Number((n * multiplier).toFixed(5)) : value];
  }));
}

// A complete visual set uses all of this family’s authored equipment slots.
// E.g. Ravenfeather has five slots; Chosen and most other sets have six.
// Every unique worn piece must have at least one real Ascension stage.
export function getAXEFullSetAuraRank(items = [], requiredSlots = []) {
  if (!requiredSlots?.length) return 0;
  const bySlot = new Map();
  for (const item of items) if (item?.equipped && !bySlot.has(item.slot)) bySlot.set(item.slot,item);
  if (!requiredSlots.every(slot => bySlot.has(slot))) return 0;
  return Math.min(...requiredSlots.map(slot => getAXESetAscensionRank(bySlot.get(slot))));
}

// Rare, Elite and Legendary set collectors get both individual-item imprints
// and the matching set's stage-scaled bonuses; farmed Elites gain an extra
// small per-piece premium in AXEEquipmentRuntimeStats. Exact rarity caps apply.
// Existing Chosen's dedicated prestige formula remains separate.
export function doesAXEStageIncreaseItemStats(item = {}) {
  if (!item?.setId) return true;
  const rarity=String(item.rarity || '').toLowerCase();
  return ['common','uncommon','unique','rare','rare_elite','elite','legendary'].includes(rarity);
}
