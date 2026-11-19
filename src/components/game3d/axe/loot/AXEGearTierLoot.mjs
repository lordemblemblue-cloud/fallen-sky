// Monster gear on the level 1–155 ladders (docs/game3d/GEAR_TIERS_20261119.md). Used by
// AXEEquipmentLootSystem.js only while the gear-tier setting is on (AXEGearTierFlag.mjs).
// A drop is: a rarity from the monster level's weights, the rarity's step at or below the monster
// level, one of the 12 item types, a random quality band and the existing random affixes, on the
// step's template (its look, placeholder model and icon). Pure: node tests import it directly.
import {
  AXE_GEAR_ITEM_TYPES, axeGearRarityLabel, computeAXEGearBaseStats, getAXEGearDropLevel, getAXEGearRarityWeights,
  makeAXEGearTemplate,
} from '../../../../../base44/shared/axeGearTiers.ts';
import { AXE_PROCEDURAL_SET_FAMILIES, rollAXELevelAffixes } from './AXELevelGearProgression.mjs';
import { AXE_FARMING_SET_BY_GRADE } from '../equipment/AXEFarmingSetProfiles.mjs';
import { makeAXEFarmingItemPerks } from '../equipment/AXEFarmingItemPerks.mjs';

// Real art for a look, once it exists: { [lookId]: { modelUrl, modelFormat, iconUrl } }. Every step
// of the look shows it; until then items carry their placeholder keys and the game's slot icons.
export const AXE_GEAR_LOOK_ASSETS = Object.freeze({});

export const AXE_GEAR_TIER_QUALITY_BANDS = Object.freeze([0, 5, 10, 15, 20]);
const ARMOR_SLOTS = new Set(['helm', 'chest', 'gloves', 'legs', 'boots', 'cape']);
const unit = (rng) => Math.max(0, Math.min(0.999999999, Number(rng()) || 0));

function pickWeighted(weights, rng) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (!total) return null;
  let roll = unit(rng) * total;
  for (const [key, w] of entries) { roll -= w; if (roll < 0) return key; }
  return entries[entries.length - 1][0];
}

// The art a look shows (placeholder keys until AXE_GEAR_LOOK_ASSETS has the real files).
export function getAXEGearLookArt(lookId, assets = AXE_GEAR_LOOK_ASSETS) {
  const art = assets?.[lookId] || null;
  return { modelUrl: art?.modelUrl || null, modelFormat: art?.modelFormat || (art?.modelUrl ? 'glb' : null), iconUrl: art?.iconUrl || null };
}

// One equipment drop from a monster of `monsterLevel` (the caller has already rolled the drop chance).
export function buildAXEGearTierDrop({
  rng = Math.random, monsterLevel = 1, enemyTier = 'normal', isBoss = false, sourceId = 'enemy', assets = AXE_GEAR_LOOK_ASSETS,
} = {}) {
  const level = Math.max(1, Math.floor(Number(monsterLevel) || 1));
  const rarity = pickWeighted(getAXEGearRarityWeights(level, { enemyTier, isBoss }), rng);
  const step = rarity ? getAXEGearDropLevel(rarity, level) : null;
  if (!rarity || step == null) return null;
  const type = AXE_GEAR_ITEM_TYPES[Math.floor(unit(rng) * AXE_GEAR_ITEM_TYPES.length)];
  const template = makeAXEGearTemplate(rarity, type.id, step);
  const qualityBand = AXE_GEAR_TIER_QUALITY_BANDS[Math.floor(unit(rng) * AXE_GEAR_TIER_QUALITY_BANDS.length)];
  const baseStats = computeAXEGearBaseStats(type.id, rarity, step, qualityBand);
  const rolledStats = rollAXELevelAffixes({ slot: type.slot, rarity, level: step, qualityBand, rng });
  // Rare / Elite / Legendary armor can belong to a set, as before
  const families = AXE_FARMING_SET_BY_GRADE[rarity] || AXE_PROCEDURAL_SET_FAMILIES;
  const family = ['rare', 'elite', 'legendary'].includes(rarity) && ARMOR_SLOTS.has(type.slot) && unit(rng) < 0.62
    ? families[Math.floor(unit(rng) * families.length)] : null;
  const name = family ? template.name.replace(`${axeGearRarityLabel(rarity)} `, `${axeGearRarityLabel(rarity)} ${family.name} `) : template.name;
  const art = getAXEGearLookArt(template.lookId, assets);
  const sourceTag = String(sourceId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    dropId: `axe_gear_drop_${sourceTag}`,
    id: template.id, templateId: template.templateId, name,
    category: 'equipment', equipmentCategory: template.slot,
    rarity, qualityBand, icon: type.slot === 'weapon' ? '⚔️' : '🛡️',
    equipmentItem: {
      id: template.id, templateId: template.templateId, name,
      type: type.label, slot: type.slot, category: type.slot,
      ...(type.family ? { masteryWeaponId: type.family, weaponFamily: type.family } : {}),
      rarity, rarityLabel: axeGearRarityLabel(rarity), qualityBand,
      level: step, itemLevel: step, requiredLevel: template.requiredLevel, monsterLevelAtDrop: level,
      baseStats, rolledStats,
      setId: family?.id || null,
      abilityPerks: makeAXEFarmingItemPerks({ slot: type.slot, rarity }),
      gearTier: { ...template.gearTier },
      lookId: template.lookId, modelKey: template.modelKey, iconKey: template.iconKey, placeholderArt: !art.modelUrl,
      iconUrl: art.iconUrl, modelUrl: art.modelUrl, modelFormat: art.modelFormat,
      appearance: null, visualPending: !art.modelUrl,
      equipped: false, locked: false, sockets: [], aura: null,
      bindState: 'unbound', tradeable: true,
    },
  };
}
