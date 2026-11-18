// Fallen Sky enchantment visuals: the ONE set of rules every renderer reads.
// Source: the owner's handoff workbook "Fallen Sky Enchantment VFX" (spec v1.0, 2026-11-18).
//
// - The enchantment PERCENT picks the stage: palette, light intensity and motion.
// - RARITY is an independent axis: inlay density, accents, layering and the VFX budget.
// - Armor and weapons are separate renderers (armorEnchantGlow.js, weaponEnchantVfx.js) that consume
//   these rules. Armor light stays inside the piece's own surface (no aura, ever); weapons add a tight
//   aura and a few sparks.
// - Visual only. Nothing here changes enchant odds, costs, caps, stats or combat.
// Pure data and functions: no React, no three.js, importable from node tests.

export const ENCHANT_VISUAL_MAX_PERCENT = 200;

const freezeDeep = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
};

// "Enchant Levels" sheet. min = the breakpoint; the stage runs until the next breakpoint.
// emissive (H) and motion (I) are the sheet's normalized proposals (visual scalars, not buffs).
export const ENCHANT_VISUAL_STAGES = freezeDeep([
  {
    index: 0, stageId: '0', key: 'none', min: 0, label: 'Unenchanted', paletteName: 'No enchant glow',
    colors: null, emissive: 0, motion: 0, reach: 0,
    armorLight: 'None. The original material is untouched.',
    weaponAura: 'None',
  },
  {
    index: 1, stageId: '30', key: 'lit_glass', min: 30, label: 'Lit Glass', paletteName: 'Pale sky-white-blue',
    colors: { primary: '#c4e6ff', secondary: '#86c8ff', tertiary: '#ffffff' }, emissive: 0.18, motion: 0.12, reach: 0.5,
    armorLight: 'Subtle light trapped under the engraving; very slow pulse or a still sheen.',
    weaponAura: 'Faint tight corona',
  },
  {
    index: 2, stageId: '59', key: 'verdant_spark', min: 59, label: 'Verdant Spark', paletteName: 'Green fiery-electric',
    colors: { primary: '#22ff74', secondary: '#8cff2e', tertiary: '#d8ffe6' }, emissive: 0.34, motion: 0.25, reach: 0.62,
    armorLight: 'Soft green electrical flow along the etched channels; an occasional slow ripple.',
    weaponAura: 'Green close-outline aura',
  },
  {
    index: 3, stageId: '90', key: 'golden_spark', min: 90, label: 'Golden Spark', paletteName: 'Yellow fiery-electric',
    colors: { primary: '#ffc414', secondary: '#ff8410', tertiary: '#fff0ad' }, emissive: 0.52, motion: 0.43, reach: 0.74,
    armorLight: 'Yellow electric filaments through the inlay; a clear patterned pulse, no harsh flicker.',
    weaponAura: 'Short yellow corona',
  },
  {
    index: 4, stageId: '120', key: 'azure_current', min: 120, label: 'Azure Current', paletteName: 'Electric blue',
    colors: { primary: '#1f74ff', secondary: '#18b8ff', tertiary: '#c4e3ff' }, emissive: 0.7, motion: 0.61, reach: 0.86,
    armorLight: 'Bright blue lines and runic nodes; a travelling current with restrained secondary arcs.',
    weaponAura: 'Blue aura with controlled sparks',
  },
  {
    index: 5, stageId: '150', key: 'chosen_radiance', min: 150, label: 'Chosen Radiance', paletteName: 'Sky blue, white and icy silver',
    colors: { primary: '#58bfff', secondary: '#dff3ff', tertiary: '#aac4d8' }, emissive: 0.88, motion: 0.83, reach: 0.96,
    armorLight: 'Layered glass-like white-blue core with luminous highlights; smooth multi-channel flow.',
    weaponAura: 'Layered sky-white-blue sheath',
  },
  {
    index: 6, stageId: '200', key: 'ascended_resonance', min: 200, label: 'Ascended Resonance', paletteName: 'Silver, crimson and blue',
    colors: { primary: '#d6dfea', secondary: '#ff1048', tertiary: '#1f6bff' }, emissive: 1, motion: 1, reach: 1,
    armorLight: 'Silver inner glow with separate crimson and blue channels (never blended to purple); slow, synchronized.',
    weaponAura: 'Silver, crimson and blue aura',
  },
]);

export const ENCHANT_STAGE_BREAKPOINTS = Object.freeze(ENCHANT_VISUAL_STAGES.map((stage) => stage.min));

// "Rarity Rules" sheet. vfxMultiplier is the sheet's column I. coverage = the share of a piece's
// ornament texels that may carry light (never the whole material). Mythical is deliberately absent.
export const ENCHANT_VISUAL_RARITIES = freezeDeep({
  common: {
    id: 'common', label: 'Common', detailRank: 0, family: 'basic', vfxMultiplier: 0.35,
    coverage: 0.045, sharpness: 0.5, accent: null, accentAmount: 0, layers: 1, nodes: 0, glass: 0,
    weapon: { aura: 0.12, auraLayers: 1, sparks: 0, sparksFrom: Infinity },
    summary: 'Basic: a tiny highlight on existing edges. Stays minimal at every stage.',
  },
  unique: {
    id: 'unique', label: 'Unique', detailRank: 1, family: 'basic', vfxMultiplier: 0.45,
    coverage: 0.06, sharpness: 0.62, accent: null, accentAmount: 0, layers: 1, nodes: 0, glass: 0,
    weapon: { aura: 0.18, auraLayers: 1, sparks: 0, sparksFrom: Infinity },
    summary: 'Basic+: the Common look with a single clearer inlay accent.',
  },
  rare: {
    id: 'rare', label: 'Rare', detailRank: 2, family: 'refined', vfxMultiplier: 0.65,
    coverage: 0.09, sharpness: 0.72, accent: '#3fd3ff', accentAmount: 0.35, layers: 2, nodes: 0, glass: 0,
    weapon: { aura: 0.45, auraLayers: 1, sparks: 4, sparksFrom: 120 },
    summary: 'Refined: crisp cyan-accented filigree on clean light pathways.',
  },
  elite: {
    id: 'elite', label: 'Elite', detailRank: 3, family: 'intricate', vfxMultiplier: 0.82,
    coverage: 0.12, sharpness: 0.82, accent: '#7b5cff', accentAmount: 0.42, layers: 3, nodes: 0.6, glass: 0,
    weapon: { aura: 0.7, auraLayers: 2, sparks: 7, sparksFrom: 90 },
    summary: 'Intricate: more engraved paths with violet/indigo secondary light and pulsing nodes.',
  },
  legendary: {
    id: 'legendary', label: 'Legendary', detailRank: 4, family: 'prestige', vfxMultiplier: 1,
    coverage: 0.16, sharpness: 0.9, accent: '#ffc75a', accent2: '#eef3fa', accentAmount: 0.35, layers: 4, nodes: 1, glass: 0.32,
    weapon: { aura: 0.9, auraLayers: 3, sparks: 10, sparksFrom: 59 },
    summary: 'Prestige: the richest inlay, gold/platinum accents and a multi-layer glass glow, still no halo.',
  },
});

export const ENCHANT_VISUAL_RARITY_ORDER = Object.freeze(['common', 'unique', 'rare', 'elite', 'legendary']);

// The repository's rarity spellings (base44/shared/axeItemEnhancement.ts caps, loot tables, armor
// packs) mapped onto the five visual ranks. Keep the item's own spelling everywhere else.
// Mythic/mystical items exist in the cap table, but the Mythical visual is not enabled, so they
// borrow the highest enabled budget instead of exposing a Mythical look.
const RARITY_ALIASES = Object.freeze({
  common: 'common', basic: 'common', normal: 'common',
  uncommon: 'unique', unique: 'unique',
  rare: 'rare', rare_elite: 'rare',
  elite: 'elite', elite_set: 'elite', epic: 'elite',
  legendary: 'legendary', heroic: 'legendary', chosen: 'legendary', ascendant: 'legendary',
  ascended: 'legendary', mythic: 'legendary', mystical: 'legendary', mythical: 'legendary',
});

export function resolveEnchantRarity(rarity) {
  const key = String(rarity ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ENCHANT_VISUAL_RARITIES[RARITY_ALIASES[key] || 'common'];
}

// Clamp a stored or derived percentage to the visual range: corrupt, negative or missing
// values show nothing; anything above 200 shows the 200 stage (there is no extra tier).
export function normalizeEnchantPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // two decimals: the stat multiplier is a float (1.59 - 1 = 0.58999...), never let that drop a stage
  return Math.min(ENCHANT_VISUAL_MAX_PERCENT, Math.round(n * 100) / 100);
}

// The largest breakpoint at or below the normalized percentage.
export function resolveEnchantStage(percent) {
  const p = normalizeEnchantPercent(percent);
  let found = ENCHANT_VISUAL_STAGES[0];
  for (const stage of ENCHANT_VISUAL_STAGES) if (p >= stage.min) found = stage;
  return found;
}

export function nextEnchantStage(percent) {
  const current = resolveEnchantStage(percent);
  return ENCHANT_VISUAL_STAGES[current.index + 1] || null;
}

/**
 * The item's enchantment percentage for visuals: its total enhancement bonus, i.e.
 * (getAXEEnhancementStatMultiplier(...) - 1) * 100 = reinforcement % + 1 per enchant-slot level
 * + 2.5 per over-enchant level. Every Blacksmith upgrade that raises the item's stats moves its light.
 * `multiplier` is that shared stat function (base44/shared/axeItemEnhancement.ts), passed in so this
 * module stays dependency-free. Returns the unclamped value (the UI shows it; renderers clamp).
 */
export function enchantPercentFromRecords({ reinforcement = {}, enchantments = [], overEnchant = {} } = {}, multiplier) {
  if (typeof multiplier === 'function') {
    const m = Number(multiplier({ reinforcement, enchantments, overEnchant }));
    return Number.isFinite(m) ? Math.max(0, Math.round((m - 1) * 10000) / 100) : 0;
  }
  const reinforcementPct = Math.max(0, Number(reinforcement?.percent) || 0);
  const levels = (enchantments || []).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const over = Math.max(0, Number(overEnchant?.level) || 0);
  return Math.max(0, Math.round((reinforcementPct + levels + over * 2.5) * 100) / 100);
}

// Armor slots use the armor pipeline's names (src/components/onboarding/avatarCustomization.js
// ARMOR_SLOTS). flow: where the light starts and which way it travels on the piece.
// emphasis scales the piece's light against the chest, the primary focal point.
export const ENCHANT_ARMOR_SLOT_RULES = freezeDeep({
  chest: { slot: 'chest', flow: 'sternum_out', emphasis: 1, cloth: false,
    note: 'Central plate lights first, then the surrounding lines. Never the whole chest.' },
  gloves: { slot: 'gloves', flow: 'wrist_out', emphasis: 0.72, cloth: false,
    note: 'Wrist band to the back of the hand to the fingertips. No hand halo.' },
  pants: { slot: 'pants', flow: 'top_down', emphasis: 0.78, cloth: false,
    note: 'Down the thigh plates, knee guards and seams; no silhouette outline.' },
  boots: { slot: 'boots', flow: 'top_down', emphasis: 0.7, cloth: false,
    note: 'Front shin inlay and ankle edge. No footprints or ground flames.' },
  cape: { slot: 'cape', flow: 'top_down', emphasis: 0.66, cloth: true,
    note: 'Embroidery, border and clasp; bends with the cloth, both sides, never the whole cape.' },
  helmet: { slot: 'helmet', flow: 'top_down', emphasis: 0.8, cloth: false,
    note: 'Optional: the existing helmet slot reuses the trim treatment; no crown or halo.' },
});

export const ENCHANT_QUALITY_PROFILES = freezeDeep({
  desktop: { id: 'desktop', sparkScale: 1, auraLayersMax: 3, glass: true, nodes: true },
  mobile: { id: 'mobile', sparkScale: 0.5, auraLayersMax: 1, glass: false, nodes: true },
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

/**
 * The complete visual description for one item instance.
 * category: 'armor' (surface light only) or 'weapon' (surface light + tight aura + sparks).
 */
export function resolveEnchantVisualStyle({ rarity, percent, category = 'armor', slot = null, quality = 'desktop' } = {}) {
  const value = normalizeEnchantPercent(percent);
  const stage = resolveEnchantStage(value);
  const rank = resolveEnchantRarity(rarity);
  const profile = ENCHANT_QUALITY_PROFILES[quality] || ENCHANT_QUALITY_PROFILES.desktop;
  const active = stage.index > 0;
  const weapon = category === 'weapon';
  const slotRule = weapon ? null : ENCHANT_ARMOR_SLOT_RULES[slot] || null;
  const emissiveGain = active ? clamp01(stage.emissive * rank.vfxMultiplier) : 0;
  const sparkBase = active && value >= rank.weapon.sparksFrom && stage.index >= 2 ? rank.weapon.sparks : 0;
  return {
    active,
    percent: value,
    category: weapon ? 'weapon' : 'armor',
    slot: slotRule?.slot || slot || null,
    stageId: stage.stageId,
    stageKey: stage.key,
    stageIndex: stage.index,
    stageLabel: stage.label,
    paletteName: stage.paletteName,
    palette: stage.colors,
    rarity: rank.id,
    rarityLabel: rank.label,
    detailRank: rank.detailRank,
    coverage: rank.coverage,
    sharpness: rank.sharpness,
    accent: active ? rank.accent : null,
    accent2: active ? rank.accent2 || null : null,
    accentAmount: active ? rank.accentAmount : 0,
    layers: rank.layers,
    nodes: profile.nodes ? rank.nodes : 0,
    glass: profile.glass ? rank.glass : 0,
    emissiveGain,
    stageEmissive: stage.emissive,
    vfxMultiplier: rank.vfxMultiplier,
    motion: active ? stage.motion : 0,
    reach: active ? stage.reach : 0,
    emphasis: slotRule ? slotRule.emphasis : 1,
    flow: weapon ? 'grip_to_tip' : slotRule?.flow || 'top_down',
    // Armor never gets an external aura (Data Contract invariant).
    externalAura: weapon && active ? {
      strength: clamp01(rank.weapon.aura * (0.35 + 0.65 * stage.emissive)),
      layers: Math.min(rank.weapon.auraLayers, profile.auraLayersMax),
    } : false,
    sparks: weapon ? Math.floor(sparkBase * profile.sparkScale) : 0,
    quality: profile.id,
  };
}

/** Before/after for a proposed change (Blacksmith preview). */
export function describeEnchantChange({ rarity, before, after, category = 'armor' } = {}) {
  const from = resolveEnchantVisualStyle({ rarity, percent: before, category });
  const to = resolveEnchantVisualStyle({ rarity, percent: after, category });
  return { from, to, stageChanges: from.stageId !== to.stageId, next: nextEnchantStage(after) };
}
