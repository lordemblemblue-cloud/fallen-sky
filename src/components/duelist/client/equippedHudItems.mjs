// A purely presentational projection of the match server's purchased equipment.
// Unknown, duplicate, invalid and extra entries never produce an image URL.
import { SHOP_ITEMS, SHOP_RULES, ownedItem } from '../core/shop.mjs';

const byId = new Map(SHOP_ITEMS.map((item) => [item.id, item]));
export const HUD_EQUIPMENT_SLOTS = SHOP_RULES.slots;

/** Always produce six stable HUD slots. Each owned item resolves to the same art
 * and tier shown in the battle shop. No persistent equipment or GLB is involved. */
export function equippedHudSlots(entries) {
  const slots = [];
  const seen = new Set();
  for (const raw of Array.isArray(entries) ? entries : []) {
    const owned = ownedItem(raw);
    if (!owned || seen.has(owned.id)) continue;
    const item = byId.get(owned.id);
    if (!item) continue;
    seen.add(owned.id);
    slots.push({
      id: item.id,
      name: item.name,
      tier: owned.tier,
      art: '/duelist/items/' + item.id + '.svg',
      category: item.category,
      passive: owned.tier === 3 ? item.passive.text : null,
    });
    if (slots.length >= HUD_EQUIPMENT_SLOTS) break;
  }
  while (slots.length < HUD_EQUIPMENT_SLOTS) slots.push(null);
  return slots;
}
