// Armor pack drops (economy-relevant: the values below are the owner-facing drop table).
//
// A kill makes ONE extra roll for an armor-pack piece, after the normal loot and gear rolls, with the
// same seeded rng (every client derives the same drop from the enemy id). On a hit, a rarity is chosen
// with the enemy tier's weights, then one piece uniformly among all pieces of that rarity (so the
// one-piece Seraphic Crown and Azure Seraph Wings are exactly as rare as any one legendary piece).
// Normal enemies never drop elite or legendary pieces. The item enters AXEEquipmentInventoryStore on
// pickup like any other gear drop (WorldLootDrops.jsx).
import { AXE_ARMOR_PACK_SETS, armorTemplateId, makeAXEArmorTemplate } from '../equipment/AXEArmorPackCatalog.js';
import { getAXELevelRarityWeights, rollAXEEvolutionPath, rollAXELevelAffixes } from './AXELevelGearProgression.mjs';

export const AXE_ARMOR_DROP_CONFIG = Object.freeze({
  chanceByTier: Object.freeze({
    normal: 0.015,
    elite: 0.06,
    champion: 0.09,
    miniBoss: 0.15,
    caveBoss: 0.22,
    gateBoss: 0.25,
    worldBoss: 0.35,
    boss: 0.35,
  }),
  rarityWeightsByTier: Object.freeze({
    normal: Object.freeze({ uncommon: 70, rare: 30 }),
    elite: Object.freeze({ uncommon: 35, rare: 45, elite: 20 }),
    champion: Object.freeze({ uncommon: 25, rare: 45, elite: 25, legendary: 5 }),
    boss: Object.freeze({ rare: 35, elite: 40, legendary: 25 }),
  }),
  qualityBands: Object.freeze([0, 5, 10, 15, 20]),
  levelScalePerLevel: 0.06,   // same curve as AXE_LOOT_LEVEL_SCALE_PER_LEVEL in AXEEquipmentLootSystem.js
});

const RARITY_SCALE = { common: 1, uncommon: 1.08, rare: 1.18, elite: 1.32, legendary: 1.52, heroic: 1.8 };
const BOSS_TIERS = new Set(['boss', 'worldBoss', 'caveBoss', 'gateBoss', 'miniBoss']);
const clampRng = (value) => Math.max(0, Math.min(0.999999999, Number(value) || 0));
const isRate = (key) => /pct$/i.test(key) || /crit/i.test(key);

const PIECES_BY_RARITY = AXE_ARMOR_PACK_SETS.reduce((out, set) => {
  for (const piece of set.pieces) (out[set.rarity] ||= []).push({ set, piece });
  return out;
}, {});

function tierOf(enemyTier, isBoss) {
  if (isBoss) return 'boss';
  return AXE_ARMOR_DROP_CONFIG.chanceByTier[enemyTier] != null ? enemyTier : 'normal';
}

function weightsFor(tier, monsterLevel) {
  const w = AXE_ARMOR_DROP_CONFIG.rarityWeightsByTier;
  const raw = BOSS_TIERS.has(tier) ? w.boss : (w[tier] || w.normal);
  const allowed = getAXELevelRarityWeights(monsterLevel, {
    enemyTier:tier,isBoss:BOSS_TIERS.has(tier),
  });
  // Keep original per-enemy armor-pack odds, but never let an early-level mob
  // drop Rare/Elite/Legendary armor before that rarity becomes eligible.
  return Object.entries(raw).filter(([rarity, weight]) =>
    weight > 0 && allowed[rarity] > 0 && PIECES_BY_RARITY[rarity]?.length);
}

// Probability of each piece (by template id) dropping from ONE kill of this tier; for docs and tests.
export function getAXEArmorDropOdds(enemyTier = 'normal', isBoss = false, enemyLevel = 1) {
  const tier = tierOf(enemyTier, isBoss);
  const chance = AXE_ARMOR_DROP_CONFIG.chanceByTier[tier];
  const weights = weightsFor(tier, enemyLevel);
  const total = weights.reduce((t, [, w]) => t + w, 0);
  const odds = {};
  for (const [rarity, w] of weights) {
    const pieces = PIECES_BY_RARITY[rarity];
    for (const { piece } of pieces) odds[armorTemplateId(piece.pieceId)] = chance * (w / total) / pieces.length;
  }
  return { tier, chance, odds };
}

export function rollAXEArmorDrop(enemyTier = 'normal', isBoss = false, {
  rng = Math.random,
  playerLevel = 1,
  enemyLevel = null,
  sourceId = 'enemy',
} = {}) {
  const tier = tierOf(enemyTier, isBoss);
  if (clampRng(rng()) > AXE_ARMOR_DROP_CONFIG.chanceByTier[tier]) return null;
  const monsterLevel = Math.max(1, Math.floor(Number(enemyLevel ?? playerLevel) || 1));
  const weights = weightsFor(tier, monsterLevel);
  const total = weights.reduce((t, [, w]) => t + w, 0);
  if (!total) return null;
  let roll = clampRng(rng()) * total;
  let rarity = weights[weights.length - 1][0];
  for (const [r, w] of weights) {
    roll -= w;
    if (roll <= 0) { rarity = r; break; }
  }
  const pool = PIECES_BY_RARITY[rarity];
  const { set, piece } = pool[Math.floor(clampRng(rng()) * pool.length)];
  const bands = AXE_ARMOR_DROP_CONFIG.qualityBands;
  const qualityBand = bands[Math.floor(clampRng(rng()) * bands.length)];
  const level = monsterLevel;
  const rarityScale = RARITY_SCALE[set.rarity] || 1;
  const statScale = rarityScale * (1 + (level - 1) * AXE_ARMOR_DROP_CONFIG.levelScalePerLevel) * (1 + qualityBand / 100);
  const template = makeAXEArmorTemplate(set, piece);
  const evolutionPath = rollAXEEvolutionPath(rarity, level, rng);
  const rolledStats = rollAXELevelAffixes({slot:piece.slot,rarity,level,qualityBand,rng});
  const setId = set.pieces.length >= 5 && ['rare','elite','legendary'].includes(set.rarity)
    ? 'AXE_Set_Armor_'+set.id : null;
  const baseStats = Object.fromEntries(Object.entries(template.baseStats).map(([key, value]) => [
    key, Number((Number(value) * (isRate(key) ? rarityScale : statScale)).toFixed(Math.abs(Number(value)) < 2 ? 2 : 0)),
  ]));

  return {
    dropId: `axe_armor_drop_${String(sourceId).replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    id: template.id,
    templateId: template.templateId,
    name: template.name,
    category: 'equipment',
    equipmentCategory: piece.slot,
    rarity: set.rarity,
    qualityBand,
    icon: '🛡️',
    equipmentItem: {
      ...template,
      category: piece.slot,
      qualityBand,
      itemLevel: level,
      level,
      baseStats, rolledStats, setId,
      evolutionPath, rarityVariant: evolutionPath,
    },
  };
}
