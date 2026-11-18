// AXE Prompt 018 inventory seed data.
// Existing UI reads this object directly; each entry now includes enough metadata
// for the AXE equipment adapter to validate/evaluate item instances.

import { Swords, Shield, Shirt, HardHat, Footprints, Hand, Gem, Sparkles, Wind, Layers3 } from 'lucide-react';
import { makeAXEDevArmorItems } from '../axe/equipment/AXEArmorPackCatalog.js';

export const CATEGORY_ICONS = {
  weapon: Swords,
  helm: HardHat,
  chest: Shirt,
  gloves: Hand,
  legs: Shield,
  boots: Footprints,
  accessory: Gem,
  trinket: Sparkles,
  cape: Layers3,
  wings: Wind,
  costume: Shirt,
  auxiliary: Sparkles,
};

const gear = (item) => ({
  rarity: 'common',
  qualityBand: 0,
  baseStats: {},
  rolledStats: {},
  reinforcement: { level: 0, percent: 0 },
  enchantment: { level: 0 },
  sockets: [],
  aura: null,
  core: null,
  bindState: 'unbound',
  tradeable: true,
  ...item,
});

export const INVENTORY = {
  weapon: [
    gear({ id: 'wp_truesword', name: 'True Heart — Sword', type: 'Weapon — Sword', slot: 'weapon', masteryWeaponId: 'sword', axeWeaponRole: 'offensive', mastery: 7, tier: 1, atk: '2-3', durability: '99/100', level: 1, equipped: true, locked: false, rarity: 'rare', qualityBand: 10, baseStats: { attack: 6 } }),
    gear({ id: 'wp_dagger', name: 'Whisper Dagger', type: 'Weapon — Dagger', slot: 'weapon', masteryWeaponId: 'dual_blades', axeWeaponRole: 'defensive', mastery: 3, tier: 1, atk: '1-2', durability: '88/100', level: 1, equipped: false, locked: false, baseStats: { attack: 6 } }),
    gear({ id: 'wp_fan', name: 'Painted Fan', type: 'Weapon — Fan', slot: 'weapon', masteryWeaponId: 'sky', axeWeaponRole: 'offensive', mastery: 2, tier: 1, atk: '1-2', durability: '92/100', level: 1, equipped: false, locked: false, baseStats: { attack: 6, spirit: 2 } }),
  ],
  helm: [
    gear({ id: 'hl_hood', name: "Wanderer's Hood", type: 'Helm', slot: 'helm', mastery: 1, tier: 1, atk: '—', durability: '70/100', level: 1, equipped: true, locked: false, baseStats: { defense: 1, maxHP: 8 } }),
  ],
  chest: [
    gear({ id: 'ch_robe', name: 'Linen Robe', type: 'Chest', slot: 'chest', mastery: 1, tier: 1, atk: '—', durability: '95/100', level: 1, equipped: true, locked: false, baseStats: { defense: 3, maxHP: 20 } }),
  ],
  gloves: [
    gear({ id: 'gl_wraps', name: 'Cloth Wraps', type: 'Gloves', slot: 'gloves', mastery: 1, tier: 1, atk: '—', durability: '80/100', level: 1, equipped: true, locked: false, baseStats: { attack: 2 } }),
  ],
  legs: [
    gear({ id: 'lg_pants', name: 'Travel Pants', type: 'Legs', slot: 'legs', mastery: 1, tier: 1, atk: '—', durability: '78/100', level: 1, equipped: true, locked: false, baseStats: { defense: 2, maxHP: 12 } }),
  ],
  boots: [
    gear({ id: 'bt_boots', name: 'Soft Boots', type: 'Boots', slot: 'boots', mastery: 1, tier: 1, atk: '—', durability: '82/100', level: 1, equipped: true, locked: false, baseStats: { evasion: 2, maxHP: 6 } }),
  ],
  accessory: [
    gear({ id: 'ac_ring1', name: 'Brass Ring', type: 'Ring', slot: 'ring', mastery: 1, tier: 1, atk: '—', durability: '100/100', level: 1, equipped: true, locked: false, baseStats: { critChance: 0.5 } }),
    gear({ id: 'ac_ring2', name: 'Silver Ring', type: 'Ring', slot: 'ring', mastery: 2, tier: 1, atk: '—', durability: '100/100', level: 1, equipped: false, locked: false, rarity: 'uncommon', qualityBand: 5, baseStats: { critChance: 0.75 } }),
    gear({ id: 'ac_neck', name: 'Jade Necklace', type: 'Necklace', slot: 'necklace', mastery: 1, tier: 1, atk: '—', durability: '100/100', level: 1, equipped: false, locked: false, baseStats: { spirit: 1, maxChi: 5, maxHP: 6 } }),
  ],
  trinket: [
    gear({ id: 'tr_coin', name: 'Lucky Coin', type: 'Trinket', slot: 'trinket', mastery: 1, tier: 1, atk: '—', durability: '—', level: 1, equipped: true, locked: false, baseStats: { luck: 1 } }),
  ],
  cape: [
    gear({ id: 'cape_trainee', name: 'Trainee Cape', type: 'Cape', slot: 'cape', mastery: 1, tier: 1, atk: '—', durability: '—', level: 1, equipped: false, locked: false, baseStats: { defense: 1, critDefense: 0.5 }, appearance: { assetId: 'axe_cape_trainee' } }),
  ],
  wings: [
    gear({ id: 'wing_starter', name: 'Starter Wings', type: 'Wings', slot: 'wings', mastery: 1, tier: 1, atk: '—', durability: '—', level: 1, equipped: false, locked: false, baseStats: { maxHP: 5 }, appearance: { assetId: 'axe_wings_starter' } }),
  ],
  costume: [
    gear({ id: 'costume_wanderer', name: 'Wanderer Outfit', type: 'Costume', slot: 'costume', mastery: 1, tier: 1, atk: '—', durability: '—', level: 1, equipped: false, locked: false, baseStats: {}, appearance: { assetId: 'axe_costume_wanderer' } }),
  ],
  auxiliary: [
    gear({ id: 'aux_skyguard_sig', name: 'Skyguard Sigil', type: 'Auxiliary I', slot: 'auxiliary', rarity: 'rare', qualityBand: 10, level: 1, equipped: true, locked: false, auxSetId: 'AXE_AuxSet_Skyguard', baseStats: { defense: 2, maxHP: 8 } }),
    gear({ id: 'aux_skyguard_talisman', name: 'Skyguard Talisman', type: 'Auxiliary II', slot: 'auxiliary', rarity: 'rare', qualityBand: 10, level: 1, equipped: true, locked: false, auxSetId: 'AXE_AuxSet_Skyguard', baseStats: { critDefense: 0.5, spirit: 1 } }),
    gear({ id: 'aux_skyguard_emblem', name: 'Skyguard Emblem', type: 'Auxiliary III', slot: 'auxiliary', rarity: 'elite', qualityBand: 15, level: 1, equipped: false, locked: false, auxSetId: 'AXE_AuxSet_Skyguard', baseStats: { attack: 2, defense: 2 } }),
    gear({ id: 'aux_skyguard_relic', name: 'Skyguard Relic', type: 'Auxiliary IV', slot: 'auxiliary', rarity: 'heroic', qualityBand: 20, level: 1, equipped: false, locked: false, auxSetId: 'AXE_AuxSet_Skyguard', baseStats: { attack: 3, maxHP: 12 } }),
  ],
};

// Owner-approved ranged testing item. This adds to, and never replaces,
// existing inventory props, category contents or character-owned objects.
// The same item identifier and model path are used in main Game 3D.
INVENTORY.weapon.push(gear({
  id: 'test_training_bow', name: 'Training Bow',
  type: 'Weapon — Bow', slot: 'weapon', category: 'weapon',
  masteryWeaponId: 'bow', weaponFamily: 'bow', axeWeaponRole: 'ranged',
  iconUrl: '/game3d/test-gear/training-bow.svg',
  modelUrl: '/game3d/test-gear/training-bow.glb', modelFormat: 'glb',
  rarity: 'common', mastery: 1, tier: 1, level: 1,
  atk: '2-4', baseStats: { attack: 3 },
  durability: '100/100', introducedVersion: 2,
  source: 'test_loadout', tradeable: false, equipped: false,
}));

// Clone preview only: the six *original* Crescent Moon pieces are seeded as
// ordinary, unequipped, nontradeable equipment. A V3 migration grants them ONCE
// to existing clone characters; normal upgrade/enchant stores work by instanceId.
// They never enter drops or the main/live repository. No automatic re-grants
// after a consumed/discarded item.
for (const item of makeAXEDevArmorItems()) {
  INVENTORY[item.slot].push(gear({
    ...item,
    source: 'clone_crescent_moon_preview',
    devGrant: false,
    introducedVersion: 3,
    equipped: false,
    tradeable: false,
  }));
}

// Owner weapon pack (public/game3d/weapons): summoned into the hand by weapons/playerWeaponSummon.js.
// Introduced once through the versioned starter migration — V4, because clone characters already
// received the V3 Crescent Moon pieces — bound and untradeable, with the same starter-level stats as
// the existing starter weapons. Visuals grant no stats.
INVENTORY.weapon.push(...[
  { id: 'wp_pack_energy_sword', name: 'Energy Sword', type: 'Weapon — Sword', model: 'energy_sword', family: 'sword', role: 'offensive', archetype: 'close_combat', baseStats: { attack: 6 }, atk: '2-3' },
  { id: 'wp_pack_odachi', name: 'Odachi', type: 'Weapon — Greatsword', model: 'odachi', family: 'sword', role: 'offensive', archetype: 'single_hit', baseStats: { attack: 6 }, atk: '2-4' },
  { id: 'wp_pack_fantasy_sword', name: 'Fantasy Sword', type: 'Weapon — Sword', model: 'fantasy_sword', family: 'sword', role: 'offensive', archetype: 'close_combat', baseStats: { attack: 6 }, atk: '2-3' },
  { id: 'wp_pack_fantasy_bow', name: 'Fantasy Bow', type: 'Weapon — Bow', model: 'fantasy_bow', family: 'bow', role: 'ranged', archetype: 'ranged', baseStats: { attack: 5 }, atk: '4-6' },
  { id: 'wp_pack_violet_bow', name: 'Violet Fantasy Bow', type: 'Weapon — Bow', model: 'violet_bow', family: 'bow', role: 'ranged', archetype: 'ranged', baseStats: { attack: 5 }, atk: '4-6' },
  { id: 'wp_pack_ornate_bow', name: 'Ornate Bow', type: 'Weapon — Bow', model: 'ornate_bow', family: 'bow', role: 'ranged', archetype: 'ranged', baseStats: { attack: 5 }, atk: '4-6' },
].map(({ model, family, role, ...weapon }) => gear({
  ...weapon,
  slot: 'weapon',
  category: 'weapon',
  masteryWeaponId: family,
  weaponFamily: family,
  axeWeaponRole: role,
  appearance: { weaponModelId: model },
  rarity: 'common',
  mastery: 1,
  tier: 1,
  level: 1,
  durability: '100/100',
  introducedVersion: 4,
  source: 'weapon_pack',
  bindState: 'bound',
  tradeable: false,
  equipped: false,
})));

// Armor pack (fitted armor layers): loot-only templates, deliberately NOT part of INVENTORY above, so
// new and existing characters are never granted them as starters. They drop from monsters
// (axe/loot/AXEArmorLootSystem.js) and enter AXEEquipmentInventoryStore on pickup.
export { AXE_ARMOR_PACK_GEAR as ARMOR_PACK_GEAR } from '../axe/equipment/AXEArmorPackCatalog.js';

export const getEquippedItem = (categoryId) =>
  (INVENTORY[categoryId] || []).find((it) => it.equipped) || null;

export const getAllEquippedInCategory = (categoryId) =>
  (INVENTORY[categoryId] || []).filter((it) => it.equipped);
