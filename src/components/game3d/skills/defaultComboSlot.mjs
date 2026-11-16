// One-time, non-destructive starting slot for the existing sword three-hit skill.
// This does not unlock the skill, bypass its sword requirement, or overwrite a loadout.
export const THREE_HIT_SWORD_SKILL_ID = 'sword_triple_slash';
export const THREE_HIT_PREFERRED_SLOT = 2; // key 3

export function placeThreeHitSwordCombo(activeSlots) {
  if (!Array.isArray(activeSlots) || activeSlots.includes(THREE_HIT_SWORD_SKILL_ID)) return activeSlots;
  const preferredAvailable = activeSlots[THREE_HIT_PREFERRED_SLOT] == null;
  const slot = preferredAvailable && THREE_HIT_PREFERRED_SLOT < activeSlots.length
    ? THREE_HIT_PREFERRED_SLOT
    : activeSlots.findIndex((id) => id == null);
  if (slot < 0) return activeSlots; // never displace a player's equipped skill
  const next = [...activeSlots];
  next[slot] = THREE_HIT_SWORD_SKILL_ID;
  return next;
}
