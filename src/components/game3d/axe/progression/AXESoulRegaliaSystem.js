// Game 3D Soul Regalia — deterministic, side-effect-free progression rules.
// All percentages are percentage points (+25 means 25%, not x25).
// A set is one family/grade; unrelated sets never combine.
export const SOUL_REGALIA_GRADES = Object.freeze({
  rare: Object.freeze({ label: 'Rare', maxSetPct: 100, maxAscensionPct: 10, style: 'spirit-cloth' }),
  elite: Object.freeze({ label: 'Elite', maxSetPct: 120, maxAscensionPct: 15, style: 'armored-cloth' }),
  chosen: Object.freeze({ label: 'Chosen', maxSetPct: 150, maxAscensionPct: 25, style: 'soul-forged-armor' }),
});
export const SOUL_INFUSION_SLOTS = Object.freeze(['head', 'arms', 'chest', 'legs']);
export const SOUL_PET_GEAR_SLOTS = Object.freeze(['helm', 'chest', 'legs', 'tail', 'core']);
export const SOUL_SKILLS = Object.freeze([
  Object.freeze({ id: 'soul_strike', type: 'single_hit', label: 'Soul Strike' }),
  Object.freeze({ id: 'soul_flurry', type: 'multi_hit', label: 'Soul Flurry' }),
  Object.freeze({ id: 'soul_storm', type: 'aoe', label: 'Soul Storm' }),
]);
export const SOUL_ASPECTS = Object.freeze({
  damage: Object.freeze({ label: 'Damage', color: '#ffb33b', symbol: 'sword' }),
  defense: Object.freeze({ label: 'Defense', color: '#c6d0dd', symbol: 'shield' }),
  vitality: Object.freeze({ label: 'Vitality', color: '#bd263b', symbol: 'heart' }),
  spirit: Object.freeze({ label: 'Spirit', color: '#3c9eff', symbol: 'star' }),
});
const pct = (n, max = 100) => Math.min(max, Math.max(0, Number.isFinite(Number(n)) ? Number(n) : 0));
const STAGE_RARE = Object.freeze([0, 40, 80, 90, 95, 100]);
const SLOT_TO_BODY = Object.freeze({
  weapon: 'arms', gloves: 'arms', helm: 'head', chest: 'chest',
  legs: 'legs', boots: 'legs',
});
export const getSoulBodySlot = (slot) => SLOT_TO_BODY[slot] || null;

// Exactly two pieces per stage; S1R = 40%, S2R = 80%, S5R = 100%.
// Elite and Chosen use the same shape at 120% and 150% completion.
export function resolveSoulSet(equippedItems = []) {
  const families = new Map();
  for (const item of equippedItems || []) {
    if (!item || item.equipped === false) continue;
    const grade = item.soulSet?.grade || item.regaliaGrade;
    const family = item.soulSet?.family || item.regaliaFamily;
    if (!SOUL_REGALIA_GRADES[grade] || typeof family !== 'string' || !family.trim()) continue;
    const key = grade + ':' + family;
    if (!families.has(key)) families.set(key, { grade, family, slots: new Set(), ids: new Set() });
    const group = families.get(key);
    const id = item.instanceId || item.id;
    // Distinct item instances, valid equipment slots; duplicate gear cannot inflate stages.
    if (!id || !item.slot || group.ids.has(id)) continue;
    group.ids.add(id);
    group.slots.add(item.slot === 'weapon' ? 'weapon:' + id : item.slot === 'ring' ? 'ring:' + id : item.slot);
  }
  const options = [...families.values()].map((group) => {
    const pieceCount = Math.min(10, group.slots.size);
    const stage = Math.min(5, Math.floor(pieceCount / 2));
    const max = SOUL_REGALIA_GRADES[group.grade].maxSetPct;
    return { grade: group.grade, family: group.family, pieceCount, stage,
      code: 'S' + stage + group.grade[0].toUpperCase(),
      setPct: STAGE_RARE[stage] * max / 100, complete: stage === 5 };
  });
  options.sort((a, b) => b.setPct - a.setPct || b.stage - a.stage || a.family.localeCompare(b.family));
  return options[0] || { grade: null, family: null, pieceCount: 0, stage: 0, code: null, setPct: 0, complete: false };
}

export function isSoulCompanionMastered(pet) {
  return !!pet && Number(pet.level) >= 200 && Number(pet.overEnchantPercent) >= 200;
}

export function soulInfusionItemBonusPct(item, soul, activeSet, pet) {
  if (!item || !isSoulCompanionMastered(pet) || !soul?.fused || soul?.bondedPetId !== pet.instanceId) return 0;
  const body = getSoulBodySlot(item.slot);
  if (!body || pct(soul.infusion?.[body]) < 100) return 0;
  const chosen = activeSet?.grade === 'chosen' && activeSet.complete &&
    (item.soulSet?.grade || item.regaliaGrade) === 'chosen' &&
    (item.soulSet?.family || item.regaliaFamily) === activeSet.family &&
    Number(soul.ascension?.chosen || 0) >= 1;
  return chosen ? 50 : 20; // chosen REPLACES 20%; it never becomes 20% + 50%.
}

export function getSoulRegaliaBonuses({ items = [], soul = {}, pet = null, capeEquipped = false } = {}) {
  const set = resolveSoulSet(items);
  const grade = SOUL_REGALIA_GRADES[set.grade];
  const ascensionLevel = set.complete ? Math.min(5, Math.max(0, Number(soul.ascension?.[set.grade] || 0))) : 0;
  const ascensionPct = grade ? grade.maxAscensionPct * ascensionLevel / 5 : 0;
  const fused = !!soul.fused && isSoulCompanionMastered(pet) && soul.bondedPetId === pet.instanceId;
  const allPetGearEnchanted = SOUL_PET_GEAR_SLOTS.every(slot =>
    Number(soul.petGear?.[slot]?.enchantLevel || 0) >= 20);
  // Maxing a registered companion grants +25% even while it fights beside the hero.
  // Fusion is an additional state used for gear infusion and skill eligibility.
  const companionPct = isSoulCompanionMastered(pet) ? 25 : 0;
  const companionGearPct = fused && allPetGearEnchanted ? 5 : 0;
  const capeActive = !!capeEquipped && !!soul.capeUnlocked;
  const capePct = capeActive ? 5 : 0;
  const allStatsPct = set.setPct + ascensionPct + companionPct + companionGearPct + capePct;
  return {
    set, ascensionLevel, ascensionPct, fused, companionPct, companionGearPct,
    capeActive, capePct, allStatsPct,
    // +5 RAW points to each core attribute, not +5% and not +5 to every derived stat.
    capeAttributes: { strength: capeActive ? 5 : 0, dexterity: capeActive ? 5 : 0,
      constitution: capeActive ? 5 : 0, focus: capeActive ? 5 : 0 },
    // +20% chosen-specific armor soul resonance is per item, separate from set completion.
    itemInfusion: Object.fromEntries((items || []).filter(x => x?.instanceId).map(item =>
      [item.instanceId, soulInfusionItemBonusPct(item, soul, set, pet)])),
  };
}

// Skill cards may be looted early; a card in inventory does NOT make the skill usable.
export function getSoulSkillGate(skillId, { items = [], soul = {}, pet = null } = {}) {
  if (!SOUL_SKILLS.some(s => s.id === skillId)) return { ok: false, reason: 'UNKNOWN_SKILL' };
  if (!(soul.ownedSkillCards || []).includes(skillId)) return { ok: false, reason: 'SKILL_CARD_REQUIRED' };
  const set = resolveSoulSet(items);
  if (set.grade !== 'chosen' || !set.complete) return { ok: false, reason: 'CHOSEN_S5_REQUIRED' };
  if (Number(soul.ascension?.chosen || 0) < 1) return { ok: false, reason: 'CHOSEN_ASCENSION_REQUIRED' };
  if (!isSoulCompanionMastered(pet) || !soul.fused || soul.bondedPetId !== pet.instanceId)
    return { ok: false, reason: 'MAX_SOUL_COMPANION_REQUIRED' };
  for (const part of SOUL_INFUSION_SLOTS) {
    if (pct(soul.infusion?.[part]) < 100) return { ok: false, reason: 'SOUL_INFUSION_' + part.toUpperCase() };
    if (!(items || []).some(item => item && item.equipped !== false && getSoulBodySlot(item.slot) === part))
      return { ok: false, reason: 'EQUIPMENT_' + part.toUpperCase() };
  }
  return { ok: true, reason: null };
}

// Render parameters only. No flat billboard or baked-on texture: the renderer
// must attach independent cape/wings/halo meshes and particle/VFX systems.
export function getSoulRegaliaAppearance({ willFraction = 1, wingPercent = 0, aspect = 'spirit', equippedSet } = {}) {
  const energy = pct(willFraction, 1);
  const aura = SOUL_ASPECTS[aspect] || SOUL_ASPECTS.spirit;
  return { capeGlow: energy, capeFadesWithWill: true, capeClothDetachedFromBody: true,
    wingsEnergyUnlocked: Number(wingPercent) >= 200, haloColor: aura.color,
    haloSymbol: aura.symbol, haloSmallWingCount: 2, haloRingCount: 1,
    armorStyle: SOUL_REGALIA_GRADES[equippedSet?.grade]?.style || null };
}
