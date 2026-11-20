// UI intent only: selecting an owned inventory ingredient chooses the appropriate
// Blacksmith operation; forge execution and item payment remain gateway-owned.
// Combine uses a matching EQUIPMENT donor, not a fictional Combine Stone.
export const BLACKSMITH_INGREDIENT_INTENTS = Object.freeze({
  mat_reinforce: Object.freeze({ tab: 'enchant', enchantMode: 'percent', label: 'Enchant' }),
  mat_essence: Object.freeze({ tab: 'enchant', enchantMode: 'slots', label: 'Enchant Slots' }),
  mat_crystal: Object.freeze({ tab: 'enchant', enchantMode: 'slots', label: 'Enchant Slots' }),
  mat_starlight: Object.freeze({ tab: 'enchant', enchantMode: 'slots', label: 'Enchant Slots' }),
  mat_over_enchant: Object.freeze({ tab: 'over_enchant', label: 'Over-Enchant' }),
});

export function resolveBlacksmithIngredientIntent(id) {
  return BLACKSMITH_INGREDIENT_INTENTS[String(id || '')] || null;
}

export function isBlacksmithOverEnchantReady(item, reinforcement, capForItem) {
  if (!item || typeof capForItem !== 'function') return false;
  const cap = Number(capForItem(item));
  const percent = Number(reinforcement?.percent || 0);
  return Number.isFinite(cap) && cap > 0 && Number.isFinite(percent) && percent >= cap;
}

export function blacksmithAttemptMessage(operation, result, fallback = '') {
  const success = Boolean(result?.ok);
  const message = String(fallback || result?.message || result?.reason || result?.outcome || '').trim();
  const label = operation === 'reinforcement' ? 'Enchant'
    : operation === 'enchant' ? 'Enchant Slots'
      : operation === 'over_enchant' ? 'Over-Enchant'
        : operation === 'combine' ? 'Combine'
          : 'Forge';
  return { success, operation, label, text: message || (success ? 'Upgrade successful.' : 'Attempt failed.') };
}
