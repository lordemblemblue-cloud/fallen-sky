import {
  AXE_ENCHANTMENT_CONFIG,
  getAXEReinforcementCap,
  AXE_OVER_ENCHANT_CONFIG,
  AXE_REINFORCEMENT_CONFIG,
  overEnchantSuccessChance,
  previewReinforcement,
} from '../equipment/AXEItemEnhancementSystem';
import {
  AXE_REFINE_CONFIG,
  AXE_ULTIMATE_CONFIG,
  combineSuccessChance,
  getNextStage,
  getAXEAscensionImprintBonus,
  getAXEEquipmentAscensionBonus,
  refineSuccessChance,
  ultimateSuccessChance,
  validateCombine,
} from '../equipment/AXEItemAdvancementSystem';
import { canInsertAXEGem, drillSuccessChance } from '../equipment/AXESocketGemSystem';
import {
  getAXEOverEnchantCost,
  getAXEReinforcementCost,
  getAXEServiceInventoryCost,
} from './AXEServiceEconomy';

// Read-only previews of the existing rules. This module never rolls, pays or
// updates an item; the transaction gateway remains the only operation entry.
export function isAXECompatibleDonor(target, donor, advancement = {}) {
  if (!target || !donor || donor.locked || donor.equipped) return false;
  return validateCombine({
    ...target,
    templateId: target.templateId || target.id,
    combine: advancement.combine,
  }, { ...donor, templateId: donor.templateId || donor.id }).ok;
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
    const next = previewReinforcement(reinforcement, { item });
    return { ...preview, canAdvance: next.canAdvance,
      cost: getAXEReinforcementCost(reinforcement.percent, { protectedAttempt }),
      chance: next.successChance, outcome: `${next.currentPercent}% → ${next.nextPercent}%`,
      risk: protectedAttempt ? 'Protection prevents a downgrade. Materials are spent on every attempt.'
        : Number(reinforcement.percent || 0) >= AXE_REINFORCEMENT_CONFIG.downgradeStartsPercent
          ? 'Failure can reduce reinforcement by 5%. Materials are spent on every attempt.'
          : 'Failure leaves reinforcement unchanged. Materials are spent on every attempt.' };
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
    const count = Number(advancement.combine?.count || 0);
    return { ...preview, canAdvance: isAXECompatibleDonor(item, donor, advancement),
      chance: combineSuccessChance(count), outcome: `Combine ${count} → ${count + 1}`,
      risk: 'A successful Combine permanently consumes the selected donor. A failed attempt keeps the donor.',
      confirmation: donor ? `Combine ${item.name} with ${donor.name}? Success permanently consumes donor ${donor.instanceId}.` : null,
      reason: donor ? 'This donor cannot be combined with the target.' : 'Choose a separate, unlocked, unequipped matching donor.' };
  }
  if (serviceId === 'stage') {
    const next = getNextStage(advancement.stage || {});
    const pct = Number(reinforcement.percent || 0);
    const cap = getAXEReinforcementCap(item);
    const validPct = Number.isFinite(pct) && pct >= 0 && pct <= cap;
    const gain = next && validPct ? getAXEAscensionImprintBonus(next.rank, pct) : 0;
    return { ...preview, canAdvance: !!next && validPct, chance: 1,
      ascensionCap: cap, ascensionPercent: pct,
      ascensionBonus: getAXEEquipmentAscensionBonus(advancement.stage),
      nextAscensionGain: gain,
      outcome: next ? (advancement.stage?.label || 'Base') + ' → ' + next.label + ' (+' + (gain * 100).toFixed(2) + '% core stats)'
        : 'Maximum: four Ascensions',
      risk: !validPct ? 'Reinforcement exceeds this rarity cap. This item cannot Ascend.'
        : 'Each stage permanently locks its Reinforcement-based bonus. Reinforce before Ascending for a larger imprint.' };
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
