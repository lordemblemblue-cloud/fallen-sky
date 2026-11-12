// Armor pack: equipment templates for the owner's armor sets.
// Each piece is an ordinary AXE equipment item in an existing equipment slot (helm, chest, gloves, legs,
// boots, cape, wings). Its appearance names the armor piece the fitted-armor pipeline ships
// (`<set>_<armor slot>`, e.g. nightscale_helmet; see the armor pipeline contract), which the Game 3D
// armor bridge shows on the player. These templates are LOOT ONLY: they are not starter items
// (inventoryData.jsx INVENTORY), so nobody is granted them on load.
// Pure data: no React, no aliases, importable from node tests.

// The armor pipeline's slot names (customization contract) for each equipment slot.
export const AXE_ARMOR_SLOT_BY_EQUIPMENT_SLOT = Object.freeze({
  helm: 'helmet',
  chest: 'chest',
  gloves: 'gloves',
  legs: 'pants',
  boots: 'boots',
  cape: 'cape',
  wings: 'wings',
});

export const AXE_ARMOR_MANIFEST_URL = '/models/characters/fused/armor/manifest.json';

export const AXE_ARMOR_PACK_SETS = Object.freeze([
  { id: 'dune_scavenger', label: 'Dune Scavenger', rarity: 'uncommon', pieces: [
    ['helm', 'Dune Scavenger Hood'], ['chest', 'Dune Scavenger Jerkin'], ['legs', 'Dune Scavenger Trousers'],
    ['gloves', 'Dune Scavenger Wraps'], ['boots', 'Dune Scavenger Boots'], ['cape', 'Dune Scavenger Shroud']] },
  { id: 'nightscale', label: 'Nightscale', rarity: 'rare', pieces: [
    ['helm', 'Nightscale Visor'], ['chest', 'Nightscale Cuirass'], ['legs', 'Nightscale Greaves'],
    ['gloves', 'Nightscale Talons'], ['boots', 'Nightscale Treads'], ['cape', 'Nightscale Starcloak']] },
  { id: 'frostwarden', label: 'Frostwarden', rarity: 'rare', pieces: [
    ['helm', 'Frostwarden Helm'], ['chest', 'Frostwarden Hauberk'], ['legs', 'Frostwarden Legguards'],
    ['gloves', 'Frostwarden Gauntlets'], ['boots', 'Frostwarden Boots'], ['cape', 'Frostwarden Mantle']] },
  { id: 'crimson_drake', label: 'Crimson Drake', rarity: 'elite', pieces: [
    ['helm', 'Crimson Drake Skullhelm'], ['chest', 'Crimson Drake Scalemail'], ['legs', 'Crimson Drake Tassets'],
    ['gloves', 'Crimson Drake Claws'], ['boots', 'Crimson Drake Boots'], ['cape', 'Crimson Drake Mantle']] },
  { id: 'ravenfeather', label: 'Ravenfeather', rarity: 'elite', pieces: [
    ['chest', 'Ravenfeather Jerkin'], ['legs', 'Ravenfeather Breeches'], ['gloves', 'Ravenfeather Bracers'],
    ['boots', 'Ravenfeather Boots'], ['cape', 'Ravenfeather Mantle']] },
  { id: 'silver_seraph', label: 'Silver Seraph', rarity: 'legendary', pieces: [
    ['helm', 'Silver Seraph Helm'], ['chest', 'Silver Seraph Breastplate'], ['legs', 'Silver Seraph Faulds'],
    ['gloves', 'Silver Seraph Gauntlets'], ['boots', 'Silver Seraph Sabatons'], ['cape', 'Silver Seraph Cloak']] },
  { id: 'seraphic_crown', label: 'Seraphic Crown', rarity: 'legendary', pieces: [['helm', 'Seraphic Winged Crown']] },
  { id: 'azure_seraph', label: 'Azure Seraph', rarity: 'legendary', pieces: [['wings', 'Azure Seraph Wings']] },
].map((set) => Object.freeze({
  ...set,
  pieces: Object.freeze(set.pieces.map(([slot, label]) => Object.freeze({
    slot, label, armorSlot: AXE_ARMOR_SLOT_BY_EQUIPMENT_SLOT[slot], pieceId: `${set.id}_${AXE_ARMOR_SLOT_BY_EQUIPMENT_SLOT[slot]}`,
  }))),
})));

// Flat stats only (no crit/percent rates), a step above the matching starter piece. Drops scale them
// by rarity, quality band and the hero's level exactly like other gear drops (AXEArmorLootSystem.js).
export const AXE_ARMOR_SLOT_BASE_STATS = Object.freeze({
  helm: Object.freeze({ defense: 2, maxHP: 10 }),
  chest: Object.freeze({ defense: 4, maxHP: 24 }),
  gloves: Object.freeze({ attack: 2, defense: 1 }),
  legs: Object.freeze({ defense: 3, maxHP: 14 }),
  boots: Object.freeze({ evasion: 2, maxHP: 8 }),
  cape: Object.freeze({ defense: 1, maxHP: 8 }),
  wings: Object.freeze({ maxHP: 8, evasion: 1 }),
});

const TYPE = { helm: 'Helm', chest: 'Chest', gloves: 'Gloves', legs: 'Legs', boots: 'Boots', cape: 'Cape', wings: 'Wings' };

export const armorTemplateId = (pieceId) => `armor_${pieceId}`;

export function makeAXEArmorTemplate(set, piece) {
  return {
    id: armorTemplateId(piece.pieceId),
    templateId: armorTemplateId(piece.pieceId),
    name: piece.label,
    type: `${TYPE[piece.slot]} — ${set.label}`,
    slot: piece.slot,
    category: piece.slot,
    rarity: set.rarity,
    qualityBand: 0,
    mastery: 1,
    tier: 1,
    atk: '—',
    durability: '100/100',
    level: 1,
    baseStats: { ...AXE_ARMOR_SLOT_BASE_STATS[piece.slot] },
    rolledStats: {},
    reinforcement: { level: 0, percent: 0 },
    enchantment: { level: 0 },
    sockets: [],
    aura: null,
    core: null,
    bindState: 'unbound',
    tradeable: true,
    equipped: false,
    locked: false,
    appearance: { assetId: `axe_armor_${piece.pieceId}`, armorPiece: piece.pieceId, armorSet: set.id, armorSlot: piece.armorSlot },
  };
}

// Templates grouped by equipment category, the same shape as inventoryData.jsx INVENTORY.
export const AXE_ARMOR_PACK_GEAR = Object.freeze(AXE_ARMOR_PACK_SETS.reduce((byCategory, set) => {
  for (const piece of set.pieces) (byCategory[piece.slot] ||= []).push(Object.freeze(makeAXEArmorTemplate(set, piece)));
  return byCategory;
}, {}));

export const AXE_ARMOR_PACK_TEMPLATES = Object.freeze(Object.values(AXE_ARMOR_PACK_GEAR).flat());

export function getAXEArmorTemplate(templateId) {
  return AXE_ARMOR_PACK_TEMPLATES.find((t) => t.id === templateId) || null;
}

// The armor piece an item shows ({ slot: armor slot, id: piece id }), or null for ordinary gear.
// The piece must belong to the item's own equipment slot, so a doctored save cannot put a cape on a helm.
export function getAXEArmorPiece(item) {
  const id = item?.appearance?.armorPiece;
  if (typeof id !== 'string') return null;
  for (const set of AXE_ARMOR_PACK_SETS) {
    const piece = set.pieces.find((p) => p.pieceId === id);
    if (piece) return piece.slot === (item.slot || item.category) ? { slot: piece.armorSlot, id } : null;
  }
  return null;
}

// Equipped armor pieces by armor slot: { helmet: 'nightscale_helmet', pants: 'frostwarden_pants', ... }.
export function equippedAXEArmorPieces(items = []) {
  const bySlot = {};
  for (const item of items) {
    if (!item?.equipped) continue;
    const piece = getAXEArmorPiece(item);
    if (piece && !bySlot[piece.slot]) bySlot[piece.slot] = piece.id;
  }
  return bySlot;
}

// The 'game3d:armor-equip' events that turn the `previous` worn map into `next`:
// changed slots only, `id: null` for a piece taken off.
export function diffAXEArmorEquip(previous = {}, next = {}) {
  const events = [];
  for (const slot of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    const id = next[slot] || null;
    if ((previous[slot] || null) !== id) events.push({ slot, id });
  }
  return events;
}
