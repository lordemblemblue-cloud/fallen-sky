// Character-scoped, opt-in, one-shot Blacksmith batch orchestration.
// The canonical transaction gateway remains the ONLY writer. This controller
// never invents a success roll, pays materials, or modifies equipment itself.
const validId = id => typeof id === 'string' && id.length > 0;
// Blacksmith v2 (docs/game3d/BLACKSMITH_V2_20261118.md): the shared Combine rule decides the
// match (same rarity, item level, slot and subtype); this adds the player's protections.
const AUTO_MODES = Object.freeze(['combine', 'reinforcement', 'enchant', 'over_enchant']);
// modes whose failures a Stabilizer can protect (Enchant %, Over-Enchant)
const PROTECTABLE = new Set(['reinforcement', 'over_enchant']);

export function isSafeCombineDonor(target, donor, compatible) {
  return Boolean(target && donor && validId(target.instanceId) && validId(donor.instanceId)
    && target.instanceId !== donor.instanceId
    && !donor.equipped && !donor.locked && !donor.favorite && !donor.favorited
    && !donor.isFavorite && !donor.vanityOnly
    && typeof compatible === 'function' && compatible(target, donor));
}

export function filterForgeInventory({ mode, target, items = [], materialStacks = [],
  required = {}, compatible = () => false, resourceCategory = () => null, showAll = false } = {}) {
  const all = [...items, ...materialStacks];
  if (!target || showAll) return all;
  if (mode === 'combine') return items.filter(item => isSafeCombineDonor(target, item, compatible));
  if (mode === 'reinforcement' || mode === 'enchant' || mode === 'over_enchant') {
    const keys = new Set(Object.keys(required));
    return materialStacks.filter(item => keys.has(item.id ?? item.templateId)
      && (!item.resourceCategory || item.resourceCategory === resourceCategory(item.id ?? item.templateId)));
  }
  return all;
}

export async function runBlacksmithAutoBatch({
  mode, targetId, getTarget, getDonors, getPreview, compatible, getResourceCount,
  transact, getIdentity, cancelled = () => false, onAttempt = () => {},
  allowProtection = false, minSuccess = 0.90, maxAttempts = 12,
} = {}) {
  if (!AUTO_MODES.includes(mode) || !validId(targetId)
    || [getTarget, getDonors, getPreview, getResourceCount, transact, getIdentity,
      cancelled, onAttempt].some(fn => typeof fn !== 'function')
    || !Number.isFinite(minSuccess) || minSuccess < 0 || minSuccess > 1
    || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 24) {
    return { ok: false, attempts: 0, successes: 0, reason: 'invalid_auto_configuration' };
  }
  const identity = getIdentity();
  let attempts = 0;
  let successes = 0;
  let reason = 'attempt_limit';
  while (attempts < maxAttempts) {
    if (cancelled()) { reason = 'stopped'; break; }
    if (getIdentity() !== identity) { reason = 'character_changed'; break; }
    const target = getTarget(targetId);
    if (!target || target.instanceId !== targetId || target.locked || target.vanityOnly) {
      reason = 'target_unavailable'; break;
    }
    let donor = null;
    if (mode === 'combine') {
      donor = getDonors().find(item => isSafeCombineDonor(target, item, compatible)) || null;
      if (!donor) { reason = 'no_compatible_donors'; break; }
    }
    let preview = getPreview(mode, target, donor, false);
    if (!preview?.canAdvance) { reason = preview?.reason || 'maximum_or_ineligible'; break; }
    const chance = Number(preview.chance);
    if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
      reason = 'unknown_success_probability'; break;
    }
    let useProtection = false;
    if (mode !== 'combine' && chance < minSuccess) {
      if (!PROTECTABLE.has(mode) || !allowProtection) { reason = 'risk_threshold'; break; }
      const protectedPreview = getPreview(mode, target, donor, true);
      // A protected high-risk attempt MUST consume a genuine Stabilizer.
      if (!protectedPreview?.canAdvance || Number(protectedPreview.cost?.mat_protection) < 1) {
        reason = 'protection_not_supported'; break;
      }
      preview = protectedPreview;
      useProtection = true;
    }
    const cost = preview.cost || {};
    const resources = Object.entries(cost);
    if (!resources.every(([id, amount]) => Number.isSafeInteger(amount)
        && amount > 0 && getResourceCount(id) >= amount)) {
      reason = useProtection ? 'protection_or_materials_exhausted' : 'materials_exhausted';
      break;
    }
    if (cancelled() || getIdentity() !== identity) { reason = 'stopped_or_character_changed'; break; }
    // Only one approved gateway operation at a time, with fresh inputs every step.
    const result = await transact(mode, {
      itemId: targetId,
      ...(mode === 'combine' ? { donorId: donor.instanceId } : {}),
      ...(mode === 'enchant' ? { slotIndex: preview.slotIndex } : {}),
      ...(useProtection ? { options: { protectedAttempt: true } } : {}),
    });
    attempts++;
    if (result?.ok) successes++;
    onAttempt({ attempts, successes, result, donorId: donor?.instanceId || null,
      protectedAttempt: useProtection });
    // Failed rolls may spend materials, but must never auto-repeat blindly.
    if (!result?.ok) {
      if (mode === 'combine' && result?.outcome === 'failure' && result?.donorConsumed !== true) {
        // Canonical failed Combine keeps its donor. Retry only within this
        // explicitly confirmed, bounded batch; re-evaluate next attempt.
        continue;
      }
      reason = result?.reason || result?.outcome || 'attempt_failed'; break;
    }
    // Prevent a dishonest/stale gateway from repeatedly accepting the same donor.
    if (mode === 'combine' && result.donorConsumed !== true) {
      reason = 'donor_consumption_unconfirmed'; break;
    }
  }
  return { ok: true, attempts, successes, reason };
}
