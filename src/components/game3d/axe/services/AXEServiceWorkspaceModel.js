import {
  AXE_ENCHANTMENT_CONFIG,
  AXE_OVER_ENCHANT_CONFIG,
  AXE_REINFORCEMENT_CONFIG,
  overEnchantSuccessChance,
  previewReinforcement,
} from '../equipment/AXEItemEnhancementSystem';
import {
  AXE_COMBINE_CONFIG,
  AXE_EQUIPMENT_ASCENSION_CONFIG,
  AXE_REFINE_CONFIG,
  AXE_ULTIMATE_CONFIG,
  ascensionSuccessChance,
  combineSuccessChance,
  getAXEAscensionMaxBonus,
  getNextStage,
  isAXEAscensionRarity,
  isAXELegacyStageRarity,
  refineSuccessChance,
  ultimateSuccessChance,
  validateAXEAscensionDonor,
  validateCombine,
} from '../equipment/AXEItemAdvancementSystem';
import { canInsertAXEGem, drillSuccessChance } from '../equipment/AXESocketGemSystem';
import {
  getAXEAscensionCost,
  getAXECombineCost,
  getAXEOverEnchantCost,
  getAXEReinforcementCost,
  getAXEServiceInventoryCost,
} from './AXEServiceEconomy';

// the player-facing reason a donor is refused (Blacksmith v2 donor rules)
const DONOR_REASONS = Object.freeze({
  ITEM_MISSING: 'Choose a separate matching donor.',
  SAME_INSTANCE: 'The donor must be a different item.',
  DONOR_PROTECTED: 'Equipped, locked and favourite items are never used as donors.',
  GRADE_MISMATCH: 'The donor must have the same rarity.',
  LEVEL_MISMATCH: 'The donor must have the same item level.',
  SLOT_MISMATCH: 'The donor must be for the same slot.',
  SUBTYPE_MISMATCH: 'The donor must be the same type (weapon family).',
  MAX_COMBINE: 'This item is at Combine +12.',
  ASCENSION_RARITY_NOT_ELIGIBLE: 'Only Rare, Elite and Legendary equipment can ascend.',
  DONOR_REQUIRED: 'Choose one matching donor to sacrifice.',
  ASCENSION_RARITY_MISMATCH: 'The donor must have the same rarity.',
  ASCENSION_SLOT_MISMATCH: 'The donor must be for the same slot.',
  ASCENSION_SUBTYPE_MISMATCH: 'The donor must be the same type (weapon family).',
  DONOR_LEVEL_TOO_HIGH: 'The donor’s item level must be equal or lower.',
  MAX_STAGE: 'This item is at Ascension +4.',
});
export const describeAXEDonorReason = (reason) => DONOR_REASONS[reason] || String(reason || '').replaceAll('_', ' ').toLowerCase();
const costText = (cost = {}) => (Object.keys(cost).length
  ? Object.entries(cost).map(([id, count]) => `${count} × ${id.replaceAll('_', ' ')}`).join(', ') : 'free');
const pct = (chance) => `${Math.round(Number(chance || 0) * 1000) / 10}%`;

// Read-only previews of the existing rules. This module never rolls, pays or
// updates an item; the transaction gateway remains the only operation entry.
export function isAXECompatibleDonor(target, donor, advancement = {}) {
  if (!target || !donor) return false;
  return validateCombine({ ...target, combine: advancement?.combine }, donor).ok;
}

// a donor Ascension accepts for this target (same rarity and slot/subtype, level equal or lower)
export function isAXEAscensionDonor(target, donor) {
  return validateAXEAscensionDonor(target, donor).ok;
}

export function getAXEServiceOperationPreview(serviceId, {
  item,
  reinforcement = {},
  enchantments = [],
  overEnchant = {},
  advancement = {},
  sockets = {},
  aura = null,
  protectedAttempt = false,
  slotIndex = 0,
  enchantCost = {},
  donor = null,
  gemId = null,
  socketIndex = 0,
} = {}) {
  const preview = {
    canAdvance: !!item,
    cost: getAXEServiceInventoryCost(serviceId, { advancement, sockets, protectedAttempt }),
    chance: null,
    outcome: '',
    risk: '',
    confirmation: null,
  };
  if (!item) return { ...preview, reason: 'Choose owned equipment.' };
  if (serviceId === 'reinforcement') {
    // the item's Enchant 0–200 % (Blacksmith v2)
    const next = previewReinforcement(reinforcement, { item });
    const lose = next.currentPercent - next.failurePercent;
    return { ...preview, canAdvance: next.canAdvance,
      cost: getAXEReinforcementCost(reinforcement.percent, { protectedAttempt }),
      chance: next.successChance, currentPercent: next.currentPercent, nextPercent: next.nextPercent,
      failurePercent: protectedAttempt ? next.currentPercent : next.failurePercent, maxPercent: next.maxPercent,
      outcome: next.canAdvance ? `Enchant ${next.currentPercent}% → ${next.nextPercent}%` : `Enchant ${next.currentPercent}% (maximum ${next.maxPercent}%)`,
      reason: next.canAdvance ? undefined : `This item is at its ${next.maxPercent}% Enchant maximum.`,
      risk: protectedAttempt ? 'A Stabilizer keeps the current Enchant on a failure. Materials are spent on every attempt.'
        : lose > 0
          ? `A failure lowers Enchant by ${lose} point${lose === 1 ? '' : 's'} (${next.currentPercent}% → ${next.failurePercent}%). The item never breaks; Combine and Ascension are kept. Materials are spent on every attempt.`
          : `A failure leaves Enchant at ${next.currentPercent}%. The item never breaks. Materials are spent on every attempt.`,
      failureRule: `−${AXE_REINFORCEMENT_CONFIG.failurePenaltyPercent} points on a failure, never below ${AXE_REINFORCEMENT_CONFIG.floorPercent}%` };
  }
  if (serviceId === 'enchant') {
    const level = Number(enchantments[slotIndex] || 0);
    return { ...preview, canAdvance: level < AXE_ENCHANTMENT_CONFIG.maxLevelPerSlot,
      cost: enchantCost, chance: 1, outcome: `Slot ${slotIndex + 1}: +${level} → +${Math.min(AXE_ENCHANTMENT_CONFIG.maxLevelPerSlot, level + 1)}`,
      risk: 'The selected slot advances one level after its materials are paid.' };
  }
  if (serviceId === 'over_enchant') {
    const level = Number(overEnchant.level || 0);
    return { ...preview, canAdvance: level < AXE_OVER_ENCHANT_CONFIG.maxLevel,
      cost: getAXEOverEnchantCost(level, { protectedAttempt }),
      chance: overEnchantSuccessChance(level), outcome: `+${level} → +${Math.min(AXE_OVER_ENCHANT_CONFIG.maxLevel, level + 1)}`,
      risk: protectedAttempt ? 'Protection prevents fracture. Materials are spent on every attempt.'
        : level >= AXE_OVER_ENCHANT_CONFIG.fractureStartsAt
          ? 'Failure fractures the item and reduces Over-Enchant by one level.'
          : 'Failure leaves the item unchanged. Materials are spent on every attempt.' };
  }
  if (serviceId === 'combine') {
    // Combine +0..+12 (Blacksmith v2): same rarity, item level, slot and subtype
    const count = Number(advancement.combine?.count || 0);
    const validation = donor ? validateCombine({ ...item, combine: advancement.combine }, donor)
      : count >= AXE_COMBINE_CONFIG.maxCombines ? { ok: false, reason: 'MAX_COMBINE' } : { ok: false, reason: 'ITEM_MISSING' };
    const cost = getAXECombineCost();
    return { ...preview, canAdvance: validation.ok, cost,
      chance: count < AXE_COMBINE_CONFIG.maxCombines ? combineSuccessChance(count) : null,
      currentStage: count, nextStage: Math.min(AXE_COMBINE_CONFIG.maxCombines, count + 1),
      outcome: count >= AXE_COMBINE_CONFIG.maxCombines ? 'Combine +12 (maximum)' : `Combine +${count} → +${count + 1}`,
      risk: `A success uses up the donor and adds ${Math.round(AXE_COMBINE_CONFIG.statPerStage * 100)}% of the item's original stats. A failure keeps the donor and the stage; only the fee (${costText(cost)}) is charged.`,
      confirmation: donor ? `Combine ${item.name} with ${donor.name}? A success uses up ${donor.name}; a failure keeps it.` : null,
      reason: describeAXEDonorReason(validation.reason) };
  }
  if (serviceId === 'stage') {
    // Ascension +0..+4 (Blacksmith v2): Rare / Elite / Legendary, one donor per attempt
    const rank = Math.max(0, Number(advancement.stage?.rank || 0));
    const next = getNextStage(advancement.stage || {});
    if (isAXELegacyStageRarity(item)) {
      const cost = getAXEAscensionCost({ item, advancement });
      return { ...preview, canAdvance: !!next, cost, chance: next ? 1 : null, legacyStage: true, requiresDonor: false,
        currentRank: rank, nextRank: next?.rank ?? null,
        outcome: next ? `Chosen stage +${rank} → +${next.rank}` : 'Maximum: Stage IV',
        risk: 'The Chosen set’s older stage path: Evolution Stones, always succeeds, no donor and no item-stat change.',
        reason: next ? undefined : 'This item is at Stage IV.' };
    }
    if (!isAXEAscensionRarity(item)) {
      return { ...preview, canAdvance: false, cost: {}, chance: null, requiresDonor: true, currentRank: rank, nextRank: null,
        outcome: 'Ascension is for Rare, Elite and Legendary equipment',
        risk: 'Common and Unique ascension is off; Mythical is not available yet.',
        reason: describeAXEDonorReason('ASCENSION_RARITY_NOT_ELIGIBLE') };
    }
    const validation = !next ? { ok: false, reason: 'MAX_STAGE' } : validateAXEAscensionDonor(item, donor);
    const chance = ascensionSuccessChance(rank);
    const cost = getAXEAscensionCost({ item, success: true });
    const config = AXE_EQUIPMENT_ASCENSION_CONFIG;
    return { ...preview, canAdvance: validation.ok, cost, chance, requiresDonor: true,
      currentRank: Math.min(4, rank), nextRank: next?.rank ?? null,
      maxBonusPct: getAXEAscensionMaxBonus(item) * 100,
      successChances: config.successChanceByRank,
      outcome: !next ? 'Ascension +4 (maximum)'
        : donor && validation.ok ? `Ascension +${rank} → +${next.rank} · ${pct(chance)} · sacrifice ${donor.name}`
          : `Ascension +${rank} → +${next.rank} · ${pct(chance)}`,
      risk: `A success uses up the donor. A failure keeps the donor and the rank; only the fee (${costText(config.fee)}) is charged${Object.keys(config.catalyst).length ? (config.catalystOnFailure ? ' and the catalyst' : '') : ''}.`,
      confirmation: donor && validation.ok ? `Ascend ${item.name} with ${donor.name}? ${pct(chance)} chance. A success uses up ${donor.name}; a failure keeps it.` : null,
      reason: describeAXEDonorReason(validation.reason) };
  }
  if (serviceId === 'refine') {
    const level = Number(advancement.refine?.level || 0);
    const destructive = !protectedAttempt && level >= AXE_REFINE_CONFIG.destructionStartsLevel;
    return { ...preview, canAdvance: level < AXE_REFINE_CONFIG.maxLevel,
      chance: refineSuccessChance(level), outcome: `+${level} → +${Math.min(AXE_REFINE_CONFIG.maxLevel, level + 1)}`,
      risk: protectedAttempt ? 'Protection keeps the item and its current level on failure.'
        : destructive ? 'Failure permanently destroys this equipment, including its upgrades and sockets.'
          : level >= AXE_REFINE_CONFIG.downgradeStartsLevel ? 'Failure reduces Refine by one level.' : 'Failure leaves the item unchanged.',
      confirmation: destructive ? `Refine ${item.name}? Failure permanently destroys this real equipment instance and all its upgrades.` : null };
  }
  if (serviceId === 'ultimate') {
    const level = Number(advancement.ultimate?.level || 0);
    return { ...preview, canAdvance: level < AXE_ULTIMATE_CONFIG.maxLevel,
      chance: ultimateSuccessChance(level), outcome: `+${level} → +${Math.min(AXE_ULTIMATE_CONFIG.maxLevel, level + 1)}`,
      risk: protectedAttempt ? 'Protection keeps the current Ultimate state on failure.'
        : level >= AXE_ULTIMATE_CONFIG.sealStartsLevel ? 'Failure seals the item’s Ultimate state.' : 'Failure leaves Ultimate unchanged.' };
  }
  if (serviceId === 'sockets') return { ...preview,
    canAdvance: Number(sockets.sockets?.length || 0) < Number(sockets.maxSockets || 0),
    chance: drillSuccessChance(sockets.sockets?.length, sockets.maxSockets),
    outcome: 'Open one additional socket.', risk: 'Materials are spent on every drilling attempt. Failure does not destroy equipment.' };
  if (serviceId === 'insert_gem') {
    const eligibility = canInsertAXEGem({ ...item, ...sockets }, socketIndex, gemId);
    return { ...preview, canAdvance: eligibility.ok, chance: 1,
      cost: gemId ? { [gemId]: 1 } : {}, outcome: `Insert into socket ${socketIndex + 1}.`,
      risk: 'One owned gem is consumed and attached to the selected empty socket.',
      reason: eligibility.reason?.replaceAll('_', ' ') };
  }
  if (serviceId === 'equipment_aura') return { ...preview,
    outcome: aura ? 'Reroll the equipment’s Aura effects.' : 'Apply equipment Aura.',
    risk: aura ? 'Reroll replaces the current Aura effects. The existing Aura tier is retained.' : 'Effects are rolled by the existing equipment Aura system.' };
  return preview;
}

export const AXE_SERVICE_DRAG_TYPE = 'application/x-axe-owned-equipment';

export function readAXEServiceDrop(dataTransfer) {
  try {
    const raw = dataTransfer?.getData(AXE_SERVICE_DRAG_TYPE);
    const value = JSON.parse(raw || 'null');
    return typeof value?.instanceId === 'string' ? value.instanceId : null;
  } catch { return null; }
}
