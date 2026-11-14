// Data-first, model-independent AXE gear progression for the clone.
// 'uncommon' remains the existing engine rarity ID for user-facing Unique gear.
// Evolution routes are POTENTIAL FUTURE CRAFTS, not a free upgrade on pickup.
// No Chosen gear is rolled from ordinary enemies.
export const AXE_GEAR_LEVEL_TIERS = Object.freeze([
  { min: 1, max: 10, weights: {common: 100} },
  { min: 11, max: 20, weights: {common: 72, uncommon: 24, rare: 4} },
  { min: 21, max: 30, weights: {common: 48, uncommon: 42, rare: 10} },
  { min: 31, max: 40, weights: {common: 30, uncommon: 48, rare: 22} },
  { min: 41, max: 50, weights: {common: 15, uncommon: 25, rare: 60} },
  { min: 51, max: 119, weights: {uncommon: 10, rare: 90} },
  { min: 120, max: 129, weights: {rare: 35, elite: 65} },
  { min: 130, max: 139, weights: {rare: 25, elite: 75} },
  { min: 140, max: 149, weights: {rare: 15, elite: 85} },
  { min: 150, max: 179, weights: {elite: 28, legendary: 72} },
  // Mythical is only in the high-level boss/elite pool; ordinary mobs roll
  // elite or legendary and cannot skip the prestige journey by RNG alone.
  { min: 180, max: Infinity, weights: {elite: 20, legendary: 80} },
].map(band => Object.freeze({...band, weights: Object.freeze(band.weights)})));

export const AXE_EVOLUTION_PATHS = Object.freeze({
  rare_elite: Object.freeze({ current: 'rare', next: 'elite', minLevel: 45, recipe: 'unreleased' }),
  elite_legendary: Object.freeze({ current: 'elite', next: 'legendary', minLevel: 120, recipe: 'unreleased' }),
  legendary_mythic: Object.freeze({ current: 'legendary', next: 'mythic', minLevel: 150, recipe: 'unreleased' }),
  mythic_chosen: Object.freeze({ current: 'mythic', next: 'chosen', minLevel: 150, recipe: 'prestige_locked' }),
});

export const AXE_PROCEDURAL_SET_FAMILIES = Object.freeze([
  Object.freeze({
    id: 'AXE_Set_Skyrend', name: 'Skyrend', uniqueEffect: Object.freeze({ aerialDamagePct: 20 }),
    desc: 'Two matching pieces: +20% aerial strike damage (PvE only).',
  }),
  Object.freeze({
    id: 'AXE_Set_Wildhunt', name: 'Wildhunt', uniqueEffect: Object.freeze({ mobDamagePct: 15 }),
    desc: 'Two matching pieces: +15% damage against ordinary mobs (not bosses or players).',
  }),
  Object.freeze({
    id: 'AXE_Set_Arcanist', name: 'Arcanist', uniqueEffect: Object.freeze({ virtualAbilityPoints: 3 }),
    desc: 'Two matching pieces: +3 virtual damage-ability points at 3% per point (+9% skill damage).',
  }),
]);

const boundedLevel = level => Math.max(1, Math.min(10000, Math.floor(Number(level) || 1)));
const unit = rng => Math.max(0, Math.min(0.999999999, Number(rng()) || 0));
export function getAXELevelGearBand(level = 1) {
  const l = boundedLevel(level);
  const bracket = AXE_GEAR_LEVEL_TIERS.find(b => l >= b.min && l <= b.max) || AXE_GEAR_LEVEL_TIERS[0];
  const min = l < 150 ? (l < 51 ? Math.floor((l - 1) / 10) * 10 + 1 : Math.floor((l - 1) / 10) * 10 + 1) : Math.floor((l - 1) / 10) * 10 + 1;
  return { min, max: min + 9, stage: bracket.min, weights: {...bracket.weights} };
}
export function getAXELevelRarityWeights(level = 1, { enemyTier = 'normal', isBoss = false } = {}) {
  const l = boundedLevel(level);
  const bracket = AXE_GEAR_LEVEL_TIERS.find(b => l >= b.min && l <= b.max) || AXE_GEAR_LEVEL_TIERS[0];
  const weights = {...bracket.weights};
  // Elite mobs and bosses shift odds toward the rarer ALLOWED grades.
  const threat = isBoss || ['boss','worldBoss','gateBoss','caveBoss','miniBoss'].includes(enemyTier)
    ? 1.6 : ['elite','champion'].includes(enemyTier) ? 1.22 : 1;
  const ranks = ['common','uncommon','rare','elite','legendary','mythic'];
  for (const grade of Object.keys(weights)) weights[grade] *= Math.pow(threat, ranks.indexOf(grade));
  if (l >= 180 && threat > 1) {
    weights.mythic = isBoss || enemyTier === 'boss' || enemyTier === 'worldBoss' ? 3 : 0.6;
  }
  return weights;
}
export function rollAXELevelRarity(level = 1, options = {}) {
  const weights = getAXELevelRarityWeights(level, options);
  const entries = Object.entries(weights).filter(([,w]) => w > 0);
  const total = entries.reduce((n,[,w]) => n+w,0);
  let v = unit(options.rng || Math.random) * total;
  for (const [grade,w] of entries) { v-=w; if (v<0) return grade; }
  return entries.at(-1)?.[0] || 'common';
}

// The evolution marker is a *latent item tag*. It never changes a rarity,
// pays a recipe, or bestows Mythic/Chosen status until a forge is implemented.
export function rollAXEEvolutionPath(rarity, level, rng = Math.random) {
  const l = boundedLevel(level);
  const chance = unit(rng);
  if (rarity === 'rare' && l >= 45 && chance < 0.16) return 'rare_elite';
  if (rarity === 'elite' && l >= 120 && chance < 0.12) return 'elite_legendary';
  if (rarity === 'legendary' && l >= 150 && chance < 0.08) return 'legendary_mythic';
  if (rarity === 'mythic') return 'mythic_chosen';
  return null;
}

// Flat affixes use known combat stat keys. Rate keys are deliberately small
// percentage-point bonuses and NEVER scale with the full level multiplier.
const AFFIXES = Object.freeze({
  weapon: ['attack','strength','focus','critChance'],
  helm: ['defense','maxHP','constitution','critDefense'],
  chest: ['defense','maxHP','constitution','strength'],
  gloves: ['attack','defense','dexterity','critChance'],
  legs: ['defense','maxHP','constitution','evasion'],
  boots: ['evasion','maxHP','dexterity','defense'],
  cape: ['defense','maxHP','focus','critDefense'],
  ring: ['attack','critChance','spirit','defense'],
  necklace: ['maxHP','maxChi','focus','critDefense'],
});
export const AXE_GEAR_RARITY_SCALE = Object.freeze({
  common: 1, uncommon: 1.08, rare: 1.18, elite: 1.32, legendary: 1.52, mythic: 1.85,
});
export function rollAXELevelAffixes({slot='chest',rarity='common',level=1,qualityBand=0,rng=Math.random}={}) {
  const pools = [...(AFFIXES[slot] || AFFIXES.chest)];
  const count = {common:0,uncommon:1,rare:1,elite:2,legendary:3,mythic:3}[rarity] ?? 0;
  const chosen = {};
  const l = boundedLevel(level);
  for (let i=0;i<Math.min(count,pools.length);i++) {
    const pick = Math.floor(unit(rng)*pools.length);
    const stat = pools.splice(pick,1)[0];
    const roll = 0.55 + 0.45*unit(rng);
    const rarityFactor = AXE_GEAR_RARITY_SCALE[rarity] || 1;
    if (stat === 'critChance' || stat === 'critDefense') {
      chosen[stat] = Number((Math.min(1.5, (0.18 + l*0.0025)*rarityFactor) * roll).toFixed(2));
    } else {
      const base = stat === 'maxHP' ? 6 : stat === 'maxChi' ? 4 : 1;
      const grown = base*(1 + (l-1)*0.04)*rarityFactor*(1 + Number(qualityBand||0)/100)*roll;
      chosen[stat] = Math.max(1,Math.round(grown));
    }
  }
  return chosen;
}

// A complete Mythical set, maxed existing 0–200 Halo, level 150+ and explicit
// final trial approval are ALL prerequisites. The generator NEVER auto-awards Chosen.
export function getAXEChosenUnlockStatus({
  level=1, haloLevel=0, mythicalSetPieces=0, requiredSetPieces=5,
  finalTrialComplete=false, additionalCriteriaComplete=false,
}={}) {
  const missing=[];
  if (boundedLevel(level)<150) missing.push('endgame_level');
  if (Number(haloLevel)<200) missing.push('halo_not_maxed');
  if (Number(mythicalSetPieces)<Math.max(2,Number(requiredSetPieces)||5)) missing.push('mythical_set_incomplete');
  if (!finalTrialComplete) missing.push('final_trial_incomplete');
  if (!additionalCriteriaComplete) missing.push('additional_criteria_unconfirmed');
  return { eligible:missing.length===0, missing, prestige:'chosen', autoGrant:false };
}
