// One canonical resource lookup for the Blacksmith. Loot inventory is stored
// as per-category individual units, and a matching ID in the wrong category
// must never satisfy or pay a material/gem requirement.
import { LOOT_TABLE, getLootItemCount, consumeLootItemById } from '../../lootStore';

const COST_CATEGORIES = new Set(['material', 'evolution', 'gem']);
const categoryById = new Map(
  LOOT_TABLE.filter(item => COST_CATEGORIES.has(item.category))
    .map(item => [item.id, item.category]),
);

export const getAXEServiceResourceCategory = id => categoryById.get(id) || null;

export function getAXEServiceResourceCount(id) {
  const category = getAXEServiceResourceCategory(id);
  return category ? getLootItemCount(id, category) : 0;
}

export function canAffordAXEServiceCost(cost = {}) {
  return Object.entries(cost).every(([id, count]) =>
    getAXEServiceResourceCategory(id) &&
    Number.isSafeInteger(count) && count > 0 &&
    getAXEServiceResourceCount(id) >= count
  );
}

export function consumeAXEServiceCost(cost = {}) {
  if (!canAffordAXEServiceCost(cost)) {
    return { ok: false, reason: 'INSUFFICIENT_MATERIALS', cost };
  }
  for (const [id, count] of Object.entries(cost)) {
    const consumed = consumeLootItemById(id, count, getAXEServiceResourceCategory(id));
    if (!consumed.ok) return consumed;
  }
  return { ok: true };
}
