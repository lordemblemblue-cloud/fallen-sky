// Chosen is the singular best-in-game prestige equipment set.
// It is NEVER rolled by normal monster loot, nor granted merely because a
// character has a Halo or a Mythical set. A future authoritative forge must
// deliberately convert each owned item to the Chosen grade and set identity.
export const AXE_CHOSEN_SET_ID = 'AXE_Set_Chosen';
export const AXE_CHOSEN_REQUIRED_SLOTS = Object.freeze([
  'helm','chest','gloves','legs','boots','cape',
]);
export const AXE_CHOSEN_BASE_SET_BONUS_PCT = 100;
export const AXE_CHOSEN_ASCENDED_SET_BONUS_PCT = 200;
export const AXE_CHOSEN_FULL_ASCENSION_RANK = 4;

const finite = n => Number.isFinite(Number(n)) ? Number(n) : 0;

/**
 * Only six distinct, equipped, genuine Chosen-grade pieces can activate the
 * all-stat set effect. All six need successful Stage/Ascension +4 records for
 * the enhanced effect. Never trust an arbitrary item.ascensionRank shortcut.
 * Item-level rarity names or evolution *potential* cannot award Chosen power.
 */
export function getAXEChosenSetStatus(items = []) {
  const slots = new Map();
  const seenIds = new Set();
  for (const item of items || []) {
    if (!item?.equipped || item.setId !== AXE_CHOSEN_SET_ID ||
      String(item.rarity || '').toLowerCase() !== 'chosen') continue;
    const id = item.instanceId;
    if (!id || seenIds.has(id) || !AXE_CHOSEN_REQUIRED_SLOTS.includes(item.slot) ||
      slots.has(item.slot)) continue;
    seenIds.add(id);
    slots.set(item.slot, item);
  }
  const pieces = AXE_CHOSEN_REQUIRED_SLOTS.map(slot => slots.get(slot)).filter(Boolean);
  const missingSlots = AXE_CHOSEN_REQUIRED_SLOTS.filter(slot => !slots.has(slot));
  const complete = missingSlots.length === 0;
  const ascendedPieces = pieces.filter(item =>
    finite(item.advancement?.stage?.rank) >= AXE_CHOSEN_FULL_ASCENSION_RANK).length;
  const fullyAscended = complete && ascendedPieces === AXE_CHOSEN_REQUIRED_SLOTS.length;
  return {
    setId: AXE_CHOSEN_SET_ID,
    equippedPieces: pieces.length,
    requiredPieces: AXE_CHOSEN_REQUIRED_SLOTS.length,
    missingSlots,
    itemIds: pieces.map(item => item.instanceId),
    ascendedPieces,
    complete,
    fullyAscended,
    bonusPct: !complete ? 0 : fullyAscended ?
      AXE_CHOSEN_ASCENDED_SET_BONUS_PCT : AXE_CHOSEN_BASE_SET_BONUS_PCT,
  };
}

// Applied after existing attribute, equipment, percentage-pool and character
// Ascension calculations. Applying the bonus at two stages would multiply the
// same set twice (e.g. doubling STR and then doubling STR-derived attack again).
// All core stats and *displayed* primary attributes are scaled exactly once.
// Chance/rate stats remain inside combat balance caps, rather than granting
// >100% crit/dodge or circumventing the critical-defense ceiling.
const CORE_STATS = Object.freeze([
  'damage','totalDamage','physicalDamage','elementalDamage',
  'defense','maxHP','chi','attackSuccess','attackBlock',
  'attributionAttack','attributionDefense','hpRegen','manaRegen',
]);
const EFFECTIVE_ATTRIBUTES = Object.freeze([
  'strength','dexterity','constitution','focus','agility','vitality','spirit',
]);
export function applyAXEChosenSetToDerived(derived, bonusPct = 0) {
  if (!derived) return derived;
  const pct = finite(bonusPct);
  if (pct !== 100 && pct !== 200) return derived;
  const factor = 1 + pct / 100;
  const next = {...derived};
  for (const stat of CORE_STATS) {
    if (Number.isFinite(next[stat])) next[stat] *= factor;
  }
  if (derived.effective && typeof derived.effective === 'object') {
    next.effective = {...derived.effective};
    for (const stat of EFFECTIVE_ATTRIBUTES) {
      if (Number.isFinite(next.effective[stat])) next.effective[stat] *= factor;
    }
  }
  // Rate caps are absolute; Chosen can't invalidate the game's hit/crit math.
  if (Number.isFinite(next.critChance))
    next.critChance = Math.min(50, next.critChance * factor);
  if (Number.isFinite(next.criticalDamage))
    next.criticalDamage = Math.min(1, next.criticalDamage * factor);
  if (Number.isFinite(next.criticalDefense))
    next.criticalDefense = Math.min(0.6, next.criticalDefense * factor);
  if (Number.isFinite(next.evasionPct))
    next.evasionPct = Math.min(70, next.evasionPct * factor);
  if (Number.isFinite(next.attackSpeedPct))
    next.attackSpeedPct = Math.min(40, next.attackSpeedPct * factor);
  return {
    ...next,
    chosenSet: {
      bonusPct: pct,
      factor,
      fullyAscended: pct === AXE_CHOSEN_ASCENDED_SET_BONUS_PCT,
    },
  };
}
