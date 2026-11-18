// Which enchant record belongs to which worn piece. Pure (node-testable): the inventory items and
// the enchant records are passed in. Always keyed by the ITEM INSTANCE id, never the template id,
// so two copies of the same piece keep their own light.
import { getAXEArmorPiece } from '../axe/equipment/AXEArmorPackCatalog.js';
import { enchantPercentFromRecords } from './enchantVisualRules.mjs';

// The enchant store's storage keys (equipment/enchantmentStore.jsx), scoped per user and character
// as `${key}::${user}::${characterId}` (characterStorage.js).
export const ENCHANT_RECORD_STORAGE_KEYS = Object.freeze({
  enchantments: 'wwm_enchantments_v1',
  reinforcement: 'axe_reinforcement_v1',
  overEnchant: 'axe_over_enchant_v1',
});

/**
 * { [armor slot]: { instanceId, pieceId, rarity, percent } } for the equipped armor pieces.
 * recordsFor(instanceId, item) -> { reinforcement, enchantments, overEnchant };
 * multiplier: getAXEEnhancementStatMultiplier (the stat system's own formula).
 * The first equipped item per slot wins, as in equippedAXEArmorPieces (AXEArmorPackCatalog.js).
 */
export function buildArmorEnchantMap(items = [], { recordsFor = () => ({}), multiplier } = {}) {
  const map = {};
  for (const item of items || []) {
    if (!item?.equipped) continue;
    const piece = getAXEArmorPiece(item);
    if (!piece || map[piece.slot]) continue;
    const instanceId = item.instanceId || item.id || null;
    const records = instanceId ? recordsFor(instanceId, item) || {} : {};
    map[piece.slot] = {
      instanceId,
      pieceId: piece.id,
      rarity: item.rarity || 'common',
      percent: enchantPercentFromRecords(records, multiplier),
    };
  }
  return map;
}

/**
 * A recordsFor() reading another character's saved records straight from storage (the character
 * select screen shows a roster slot that is not the active character). Read-only.
 */
export function storedEnchantRecordsReader(storage, user, characterId) {
  const read = (key) => {
    try {
      const value = JSON.parse(storage?.getItem?.(`${key}::${user}::${characterId}`) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  };
  const enchantments = read(ENCHANT_RECORD_STORAGE_KEYS.enchantments);
  const reinforcement = read(ENCHANT_RECORD_STORAGE_KEYS.reinforcement);
  const overEnchant = read(ENCHANT_RECORD_STORAGE_KEYS.overEnchant);
  return (instanceId) => ({
    enchantments: Array.isArray(enchantments[instanceId]) ? enchantments[instanceId] : [],
    reinforcement: reinforcement[instanceId] || { percent: 0 },
    overEnchant: overEnchant[instanceId] || { level: 0 },
  });
}

/** A stable string for change detection (React effects, memo keys). */
export const armorEnchantKey = (map) => Object.keys(map || {}).sort()
  .map((slot) => `${slot}:${map[slot].instanceId}:${map[slot].pieceId}:${map[slot].rarity}:${map[slot].percent}`).join('|');
