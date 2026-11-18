// Ascension and sets (Blacksmith v2, owner-approved 2026-11-18;
// docs/game3d/BLACKSMITH_V2_20261118.md): Ascension raises only the ascended item's OWN
// stats (AXEItemStatBreakdown.mjs). Set bonuses are never multiplied by Ascension any more
// (the old +25 % of the set bonus per stage is gone). The ranks below drive visuals only:
// the ascended set aura. The Chosen set keeps its own x2 / x3 rule (AXEChosenSetRules.mjs).
export const AXE_SET_ASCENSION_MAX_RANK = 4;

export function getAXESetAscensionRank(item) {
  const value = Number(item?.advancement?.stage?.rank);
  return Number.isInteger(value)
    ? Math.max(0, Math.min(AXE_SET_ASCENSION_MAX_RANK, value)) : 0;
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
