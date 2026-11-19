// AXE Prompt 038 — service transaction gateway.
// All equipment services validate REAL owned item instances before mutating.
// The authoritative bridge still wins when mounted; this browser fallback now
// preserves the same inventory/resource semantics for local development.

import {
  canAffordMaterials,
  enchantSlot,
  getItemOverEnchant,
  getItemReinforcement,
  getOverEnchantCost,
  getReinforcementCost,
  overEnchantItem,
  reinforceItem,
  setServerUpgradeRecord,
} from '../../equipment/enchantmentStore';
import {
  applyAXECombine,
  applyAXERefine,
  applyAXEStage,
  applyAXEUltimate,
  getAXEAdvancementState,
  setAXEAdvancementRecord,
} from '../equipment/AXEItemAdvancementStore';
import { AXE_OVER_ENCHANT_CONFIG, getAXEReinforcementCap } from '../equipment/AXEItemEnhancementSystem';
import { DONOR_UPGRADES, SERVER_ROLLED_UPGRADES } from '../../../../../base44/shared/itemUpgradeLedger.ts';
import {
  drillAXESocket,
  getAXESocketState,
  insertGemIntoAXEItem,
} from '../equipment/AXESocketGemStore';
import { applyAXEItemAura, getAXEItemAura, rerollAXEItemAura } from '../equipment/AXEEquipmentAuraStore';
import {
  applyAXEGearTierRecordToItem,
  applyAXEWeaponLegacyInventoryTransaction,
  canConsumeAXEEquipmentItem,
  consumeAXEEquipmentItem,
  destroyAXEEquipmentItem,
  getAXEEquipmentItem,
  persistAXEEquipmentInventory,
} from '../equipment/AXEEquipmentInventoryStore';
import { previewAXEGearTierUp, readAXEGearTierRecord } from '../../../../../base44/shared/axeGearTiers.ts';
import { isGearTiersEnabled } from '../loot/AXEGearTierFlag.mjs';
import {
  consumeLootItemById,
  consumeLootUnits,
  getLootItemCount,
  addLootToInventory,
} from '../../lootStore';
import { getAXEAscensionCost, getAXECombineCost, getAXEServiceInventoryCost } from './AXEServiceEconomy';
import { canAffordAXEServiceCost, consumeAXEServiceCost, getAXEServiceResourceCount, getAXEServiceResourceCategory } from './AXEServiceResources';
import {
  getNextStage, isAXEAscensionRarity, isAXELegacyStageRarity, validateAXEAscensionDonor, validateCombine,
  AXE_REFINE_CONFIG, AXE_ULTIMATE_CONFIG,
} from '../equipment/AXEItemAdvancementSystem';
import { AXE_GEM_DEFINITIONS, canInsertAXEGem, getAXEGemUpgradePreview } from '../equipment/AXESocketGemSystem';
import { getShopState, spendGold, addGold } from '../../shop/shopStore';
import { getPlayerHUD } from '../../playerHUDStore';
import { getAXEServiceEligibility } from './AXEServiceEligibility';
import { appendAXEServiceAudit, createAXEServiceTransactionId } from './AXEServiceAuditStore';
import { characterScopedStorage, getActiveId, getStorageUser } from '../../characterStorage';

const getOwned = (itemId) => getAXEEquipmentItem(itemId);

const requireOwned = (itemId) => {
  const item = getOwned(itemId);
  return item
    ? { ok: true, item }
    : { ok: false, reason: 'ITEM_NOT_OWNED', itemId };
};

// Shared cost source is canonical: a gem or unrelated inventory entry with
// the same ID cannot substitute for a material/evolution item.
const canAfford = canAffordAXEServiceCost;
const consumeCost = consumeAXEServiceCost;

const withOwnedItem = (payload, fn, serviceId = null) => {
  const check = requireOwned(payload.itemId || payload.item?.instanceId || payload.item?.id);
  if (!check.ok) return check;
  if (serviceId) {
    const eligible = getAXEServiceEligibility(serviceId, check.item);
    if (!eligible.eligible) return { ok: false, reason: eligible.reason };
  }
  return fn(check.item);
};

// What Combine and Ascension check before anything is paid or rolled, on this device or on
// the server: an owned target, a separate owned donor the player has not locked or equipped,
// the Blacksmith v2 donor rules, and the most the attempt can cost.
function checkDonorUpgrade(serviceId, payload) {
  const check = requireOwned(payload.itemId || payload.item?.instanceId || payload.item?.id);
  if (!check.ok) return check;
  const item = check.item;
  const eligible = getAXEServiceEligibility(serviceId, item);
  if (!eligible.eligible) return { ok: false, reason: eligible.reason };
  const advancement = getAXEAdvancementState(item.instanceId);
  if (serviceId === 'stage') {
    if (!getNextStage(advancement.stage)) return { ok: false, reason: 'MAX_STAGE' };
    if (isAXELegacyStageRarity(item)) {
      const cost = getAXEAscensionCost({ item, advancement });
      return canAfford(cost) ? { ok: true, item, donor: null, cost } : { ok: false, reason: 'insufficient_materials', cost };
    }
    if (!isAXEAscensionRarity(item)) return { ok: false, reason: 'ASCENSION_RARITY_NOT_ELIGIBLE' };
  }
  const donorId = payload.donorId || payload.donor?.instanceId || payload.donor?.id;
  if (!donorId) return { ok: false, reason: 'DONOR_REQUIRED' };
  const donorCheck = canConsumeAXEEquipmentItem(donorId);
  if (!donorCheck.ok) return { ok: false, reason: donorCheck.reason };
  const donor = donorCheck.item;
  const valid = serviceId === 'combine'
    ? validateCombine({ ...item, combine: advancement.combine }, donor)
    : validateAXEAscensionDonor(item, donor);
  if (!valid.ok) return valid;
  const cost = serviceId === 'combine' ? getAXECombineCost() : getAXEAscensionCost({ item });
  if (!canAfford(cost)) return { ok: false, reason: 'insufficient_materials', cost };
  return { ok: true, item, donor, cost };
}

const localHandlers = {
  upgrade_gem: (payload) => {
    const preview = getAXEGemUpgradePreview(payload.gemId);
    if (!preview.eligible) return { ok: false, reason: preview.reason };
    // Each attempt is one actual pair of identical gems, never an abstract stack.
    if (getLootItemCount(payload.gemId, 'gem') < 2) return { ok: false, reason: 'NEED_TWO_MATCHING_GEMS' };
    if (getShopState().gold < preview.silver) return { ok: false, reason: 'INSUFFICIENT_SILVER' };
    const payment = spendGold(preview.silver);
    if (!payment.ok) return payment;
    const rolledSuccess = Math.random() < preview.chance;
    const consumed = consumeLootItemById(payload.gemId, rolledSuccess ? 2 : preview.failureConsumes, 'gem');
    if (!consumed.ok) {
      addGold(preview.silver); // Never charge Silver if the input gems were not consumed.
      return consumed;
    }
    if (rolledSuccess) {
      addLootToInventory({ ...preview.nextGem, category: 'gem' });
    }
    return {
      ok: rolledSuccess, outcome: rolledSuccess ? 'success' : 'failure',
      chance: preview.chance, nextGemId: rolledSuccess ? preview.nextId : null,
      cost: { silver: preview.silver, [payload.gemId]: consumed.consumed },
      reason: rolledSuccess ? null : 'GEM_FUSION_FAILED',
    };
  },
  reinforcement: (payload) => withOwnedItem(payload, (item) =>
    reinforceItem(item.instanceId, payload.options || {})
  , 'reinforcement'),

  enchant: (payload) => withOwnedItem(payload, (item) =>
    enchantSlot(item.instanceId, payload.slotIndex ?? 0)
  , 'enchant'),

  over_enchant: (payload) => withOwnedItem(payload, (item) =>
    overEnchantItem(item.instanceId, payload.options || {})
  , 'over_enchant'),

  // Combine (Blacksmith v2): a donor of the same rarity, item level, slot and subtype. The fee
  // (free for now) is paid on every attempt; a success uses up the donor, a failure keeps it.
  combine: (payload) => {
    const ready = checkDonorUpgrade('combine', payload);
    if (!ready.ok) return ready;
    const { item, donor, cost } = ready;
    const paid = consumeCost(cost);
    if (!paid.ok) return paid;
    const previous = { ...getAXEAdvancementState(item.instanceId).combine };
    const result = applyAXECombine(item, donor, payload.options || {});
    if (result.ok && result.donorConsumed) {
      const consumed = consumeAXEEquipmentItem(donor.instanceId);
      if (!consumed.ok) {
        // never a free stage when the donor could not be taken
        setAXEAdvancementRecord(item.instanceId, 'combine', previous);
        return { ok: false, reason: 'DONOR_CONSUME_FAILED', cost };
      }
    }
    return { ...result, donorId: donor.instanceId, donorConsumed: !!(result.ok && result.donorConsumed), cost };
  },

  // The legacy recipe is distinct from Combine Stage and retains the target
  // instance, enchantments, sockets and Stage 12 progression.
  weapon_legacy: (payload) => withOwnedItem(payload, (item) => {
    const advancement = getAXEAdvancementState(item.instanceId);
    const reinforcement = getItemReinforcement(item.instanceId);
    return applyAXEWeaponLegacyInventoryTransaction({
      itemId: item.instanceId,
      donorIds: payload.operation === 'claim' ? [] : payload.donorIds,
      operation: payload.operation || 'prepare',
      combineCount: Number(advancement.combine?.count || 0),
      reinforcementPercent: Number(reinforcement.percent || 0),
      playerLevel: Number(getPlayerHUD()?.level || 1),
    });
  }, 'weapon_legacy'),

  // Ascension (Blacksmith v2), Rare / Elite / Legendary: one owned, unlocked, unequipped donor
  // of the same rarity and slot/subtype with an equal or lower item level per attempt. The fee
  // is paid on every attempt and the catalyst on a success (both free for now); a success uses
  // up the donor, a failure keeps the donor and the rank. Chosen keeps its materials-only
  // stage (the Chosen set's x2/x3 counts Stage IV pieces). Every other rarity: off.
  stage: (payload) => {
    const ready = checkDonorUpgrade('stage', payload);
    if (!ready.ok) return ready;
    const { item, donor } = ready;
    const advancement = getAXEAdvancementState(item.instanceId);
    if (isAXELegacyStageRarity(item)) {
      const cost = getAXEAscensionCost({ item, advancement });
      const paid = consumeCost(cost);
      if (!paid.ok) return paid;
      return { ...applyAXEStage(item.instanceId), cost };
    }
    const previous = { ...advancement.stage };
    const result = applyAXEStage(item.instanceId, { donor });
    if (result.reason) return result;
    const cost = getAXEAscensionCost({ item, success: !!result.ok });
    const paid = consumeCost(cost);
    if (!paid.ok) {
      if (result.ok) setAXEAdvancementRecord(item.instanceId, 'stage', previous);
      return paid;
    }
    if (result.ok) {
      const consumed = consumeAXEEquipmentItem(donor.instanceId);
      if (!consumed.ok) {
        // never a free rank when the donor could not be taken
        setAXEAdvancementRecord(item.instanceId, 'stage', previous);
        return { ok: false, reason: 'ASCENSION_DONOR_DEBIT_FAILED', cost };
      }
    }
    return { ...result, donorId: donor.instanceId, donorConsumed: !!result.ok, cost };
  },

  refine: (payload) => withOwnedItem(payload, (item) => {
    const advancement = getAXEAdvancementState(item.instanceId);
    if (Number(advancement.refine?.level || 0) >= AXE_REFINE_CONFIG.maxLevel) {
      return { ok: false, reason: 'MAX_REFINE' };
    }
    const protectedAttempt = !!payload.options?.protectedAttempt;
    const cost = getAXEServiceInventoryCost('refine', { advancement, protectedAttempt });
    const paid = consumeCost(cost);
    if (!paid.ok) return paid;

    const result = applyAXERefine(item.instanceId, payload.options || {});
    if (result.destroyed) destroyAXEEquipmentItem(item.instanceId, 'refine_failure');
    return { ...result, cost };
  }, 'refine'),

  ultimate: (payload) => withOwnedItem(payload, (item) => {
    const advancement = getAXEAdvancementState(item.instanceId);
    if (Number(advancement.ultimate?.level || 0) >= AXE_ULTIMATE_CONFIG.maxLevel) {
      return { ok: false, reason: 'MAX_ULTIMATE' };
    }
    const protectedAttempt = !!payload.options?.protectedAttempt;
    const cost = getAXEServiceInventoryCost('ultimate', { advancement, protectedAttempt });
    const paid = consumeCost(cost);
    if (!paid.ok) return paid;

    const result = applyAXEUltimate(item, payload.options || {});
    return { ...result, cost };
  }, 'ultimate'),

  sockets: (payload) => withOwnedItem(payload, (item) => {
    const sockets = getAXESocketState(item.instanceId);
    if ((sockets.sockets?.length || 0) >= Number(sockets.maxSockets || 0)) {
      return { ok: false, reason: 'MAX_SOCKETS' };
    }
    const protectedAttempt = !!payload.options?.protectedAttempt;
    const cost = getAXEServiceInventoryCost('sockets', { sockets, protectedAttempt });
    const paid = consumeCost(cost);
    if (!paid.ok) return paid;

    const result = drillAXESocket(item.instanceId, item, payload.options || {});
    return { ...result, cost };
  }, 'sockets'),

  insert_gem: (payload) => withOwnedItem(payload, (item) => {
    if (!payload.gemId) return { ok: false, reason: 'GEM_MISSING' };
    if (getAXEServiceResourceCount(payload.gemId) < 1 || getAXEServiceResourceCategory(payload.gemId) !== 'gem') {
      return { ok: false, reason: 'GEM_NOT_OWNED', gemId: payload.gemId };
    }

    const sockets = getAXESocketState(item.instanceId);
    const valid = canInsertAXEGem({ ...item, ...sockets }, payload.socketIndex, payload.gemId);
    if (!valid.ok) return valid;

    // Consume the gem before writing the socket so a failed inventory debit
    // cannot leave a free socketed stat bonus. Restore it if the write fails.
    const consumed = consumeLootItemById(payload.gemId, 1, 'gem');
    if (!consumed.ok) return consumed;
    const result = insertGemIntoAXEItem(
      item.instanceId,
      { ...item, ...sockets },
      payload.socketIndex,
      payload.gemId,
    );
    if (!result.ok) addLootToInventory({ ...AXE_GEM_DEFINITIONS[payload.gemId], category: 'gem' });
    return result;
  }, 'insert_gem'),

  equipment_aura: (payload) => withOwnedItem(payload, (item) => {
    const cost = getAXEServiceInventoryCost('equipment_aura');
    const paid = consumeCost(cost);
    if (!paid.ok) return paid;
    const result = getAXEItemAura(item.instanceId)
      ? rerollAXEItemAura(item, payload.options || {})
      : applyAXEItemAura(item, payload.options || {});
    return { ...result, cost };
  }, 'equipment_aura'),

  // Gear tiers (setting; docs/game3d/GEAR_TIERS_20261119.md): the item moves to its next level step
  // (45 -> 55), with the next step's stats and, past a band edge, its look. Defaults: Upgrade Stones
  // only, always succeeds; Combine, Enchant and Ascension carry over (same instance id).
  tier_up: (payload) => withOwnedItem(payload, (item) => {
    if (!isGearTiersEnabled()) return { ok: false, reason: 'GEAR_TIERS_OFF' };
    const preview = previewAXEGearTierUp(item, { heroLevel: heroLevelNow() });
    if (!preview.ok) return { ok: false, reason: preview.reason, requiredLevel: preview.requiredLevel ?? null };
    const paid = consumeCost(preview.cost);
    if (!paid.ok) return paid;
    if (Math.random() > preview.chance) return { ok: false, outcome: 'failure', cost: preview.cost, chance: preview.chance };
    const before = readAXEGearTierRecord(item);
    const applied = applyAXEGearTierRecordToItem(item.instanceId, preview.record);
    if (!applied.ok) return applied;
    return { ok: true, outcome: 'success', cost: preview.cost, chance: preview.chance, before, after: preview.record,
      from: preview.from, to: preview.to, lookChanges: preview.lookChanges };
  }, 'tier_up'),
};

// the hero's level, which a tier-up's next step must not exceed
function heroLevelNow() {
  return Math.max(1, Math.floor(Number(getPlayerHUD()?.level) || 1));
}

// ---- server-rolled upgrades (docs/game3d/SERVER_UPGRADES.md) ----
// Reinforcement, over-enchant, refine and ultimate are rolled and paid by the server when
// the Character Vault registers its dice here (character/CharacterVaultSync). This device
// then pays the same units the server spent and keeps the server's result for the item.
let diceSource = null;

export function setAXEServiceDiceSource(fn) {
  diceSource = typeof fn === 'function' ? fn : null;
  return () => { if (diceSource === fn) diceSource = null; };
}

const setUpgradeRecord = (serviceId, itemId, record) => (
  serviceId === 'reinforcement' || serviceId === 'over_enchant'
    ? setServerUpgradeRecord(serviceId, itemId, record)
    : serviceId === 'tier_up'
      ? applyAXEGearTierRecordToItem(itemId, record).ok
      : setAXEAdvancementRecord(itemId, serviceId, record)
);

// what the game refuses anyway, checked before a roll is spent on it
function checkBeforeServerRoll(serviceId, payload) {
  if (DONOR_UPGRADES.includes(serviceId)) return checkDonorUpgrade(serviceId, payload);
  const check = requireOwned(payload.itemId || payload.item?.instanceId || payload.item?.id);
  if (!check.ok) return check;
  const eligible = getAXEServiceEligibility(serviceId, check.item);
  if (!eligible.eligible) return { ok: false, reason: eligible.reason };
  const id = check.item.instanceId;
  const protectedAttempt = !!payload.options?.protectedAttempt;
  const advancement = getAXEAdvancementState(id);
  let cost = null;
  let affordable = true;
  if (serviceId === 'reinforcement') {
    if (Number(getItemReinforcement(id).percent || 0) >= getAXEReinforcementCap(check.item)) return { ok: false, reason: 'max_reinforcement' };
    cost = getReinforcementCost(id, { protectedAttempt });
    affordable = canAffordMaterials(cost);
  } else if (serviceId === 'over_enchant') {
    if (Number(getItemOverEnchant(id).level || 0) >= AXE_OVER_ENCHANT_CONFIG.maxLevel) return { ok: false, reason: 'max_over_enchant' };
    cost = getOverEnchantCost(id, { protectedAttempt });
    affordable = canAffordMaterials(cost);
  } else if (serviceId === 'refine') {
    if (Number(advancement.refine?.level || 0) >= AXE_REFINE_CONFIG.maxLevel) return { ok: false, reason: 'MAX_REFINE' };
    cost = getAXEServiceInventoryCost('refine', { advancement, protectedAttempt });
    affordable = canAfford(cost);
  } else if (serviceId === 'ultimate') {
    if (Number(advancement.ultimate?.level || 0) >= AXE_ULTIMATE_CONFIG.maxLevel) return { ok: false, reason: 'MAX_ULTIMATE' };
    if (!AXE_ULTIMATE_CONFIG.eligibleRarities.includes(String(check.item.rarity || '').toLowerCase())) return { ok: false, reason: 'RARITY_NOT_ELIGIBLE' };
    cost = getAXEServiceInventoryCost('ultimate', { advancement, protectedAttempt });
    affordable = canAfford(cost);
  } else if (serviceId === 'tier_up') {
    if (!isGearTiersEnabled()) return { ok: false, reason: 'GEAR_TIERS_OFF' };
    const preview = previewAXEGearTierUp(check.item, { heroLevel: heroLevelNow() });
    if (!preview.ok) return { ok: false, reason: preview.reason, requiredLevel: preview.requiredLevel ?? null };
    cost = preview.cost;
    affordable = canAfford(cost);
  }
  if (!affordable) return { ok: false, reason: 'insufficient_materials', cost };
  return { ok: true, item: check.item };
}

// null: this character rolls on this device (anonymous play, the pre-character slot)
async function runServerRolledUpgrade(serviceId, payload, expectedIdentity) {
  const ready = checkBeforeServerRoll(serviceId, payload);
  if (!ready.ok) return ready;
  const itemId = ready.item.instanceId;
  // the server rolls on its copy of the save, which must hold this item (starter items may
  // still be only in memory)
  persistAXEEquipmentInventory();
  const donorId = ready.donor?.instanceId || null;
  const dice = await diceSource({
    serviceId,
    itemId,
    ...(donorId ? { donorId } : {}),
    protectedAttempt: !!payload.options?.protectedAttempt,
    transactionId: payload.transactionId,
  });
  // A late answer belongs to the character who asked. Never pay or write it
  // into the newly selected character's stores; Character Vault reconciles it
  // when the original character returns.
  if (transactionIdentity() !== expectedIdentity) return { ok: false, reason: 'CHARACTER_CHANGED' };
  if (dice?.local) return null;
  if (!dice?.ok || !dice.result) return { ok: false, reason: dice?.reason || 'upgrades_need_a_server_connection' };
  const rolled = dice.result;
  if (rolled.reason) return { ok: false, reason: rolled.reason }; // the server rolled nothing

  // the server paid with these units from its copy of the save; this device pays the same
  consumeLootUnits(rolled.spent || [], rolled.cost || {});
  // the server's result is the item's
  if (rolled.destroyed) {
    if (getOwned(itemId)) destroyAXEEquipmentItem(itemId, 'refine_failure');
  } else {
    setUpgradeRecord(serviceId, itemId, rolled.after);
  }
  // the server used up the donor (Combine / Ascension success): it is gone here too
  if (rolled.donorConsumed && rolled.donorId && getOwned(rolled.donorId)) {
    consumeAXEEquipmentItem(rolled.donorId, { allowEquipped: true, allowLocked: true });
  }
  return {
    ok: !!rolled.ok,
    outcome: rolled.outcome || null,
    cost: rolled.cost || null,
    chance: rolled.chance ?? null,
    before: rolled.before || null,
    after: rolled.after || null,
    ...(rolled.destroyed ? { destroyed: true } : {}),
    ...(DONOR_UPGRADES.includes(serviceId) ? { donorId: rolled.donorId || null, donorConsumed: !!rolled.donorConsumed } : {}),
    serverRolled: true,
  };
}

const inFlight = new Set();
const receiptStorage = characterScopedStorage('axe_service_receipts_v1');
const receiptCaches = new Map();
const transactionIdentity = () => JSON.stringify([getStorageUser(), getActiveId()]);
const loadReceipts = (identity) => {
  if (!receiptCaches.has(identity)) {
    try {
      const raw = JSON.parse(receiptStorage.get() || '[]');
      receiptCaches.set(identity, new Map(Array.isArray(raw) ? raw.slice(-200) : []));
    } catch { receiptCaches.set(identity, new Map()); }
  }
  return receiptCaches.get(identity);
};
const transactionFingerprint = (serviceId, payload, itemId) => JSON.stringify({
  serviceId, itemId,
  donorId: payload.donorId || payload.donor?.instanceId || payload.donor?.id || null,
  slotIndex: payload.slotIndex ?? null, socketIndex: payload.socketIndex ?? null,
  donorIds: Array.isArray(payload.donorIds) ? [...payload.donorIds].sort() : [],
  operation: payload.operation || null,
  gemId: payload.gemId || null, protectedAttempt: !!payload.options?.protectedAttempt,
});

export async function executeAXEServiceTransaction(serviceId, payload = {}) {
  const itemId = payload.itemId || payload.item?.instanceId || payload.item?.id || null;
  const identity = transactionIdentity();
  const requestedAt = Date.now();
  const transactionId = payload.transactionId
    || createAXEServiceTransactionId(serviceId, itemId);
  const fingerprint = transactionFingerprint(serviceId, payload, itemId);
  const receipts = loadReceipts(identity);
  const receipt = receipts.get(transactionId);
  if (receipt) return receipt.fingerprint === fingerprint
    ? { ...receipt.result, replayed: true }
    : { ok: false, reason: 'TRANSACTION_ID_REUSED', transactionId };
  // A donor being consumed cannot simultaneously be upgraded in another panel.
  // Serialize all services for each instance, rather than just the same action.
  const donorId = payload.donorId || payload.donor?.instanceId || payload.donor?.id;
  const donorIds = Array.isArray(payload.donorIds) ? payload.donorIds : [];
  const lockKeys = [...new Set([itemId || 'global', ...(donorId ? [donorId] : []), ...donorIds])]
    .map((id) => `${identity}::${id}`);
  lockKeys.push(`${identity}::transaction::${transactionId}`);
  // Different equipment still spends the same material inventory. Keep this
  // character's asynchronous requests in order until the server answer is
  // applied; other players and characters have their own independent lock.
  lockKeys.push(`${identity}::inventory`);
  if (lockKeys.some((key) => inFlight.has(key))) return { ok: false, reason: 'TRANSACTION_IN_PROGRESS', transactionId };
  lockKeys.forEach((key) => inFlight.add(key));
  try {
    let result;
    let authoritative = false;

    if (
      typeof window !== 'undefined' &&
      typeof window.__axeAuthoritativeServiceRequest === 'function'
    ) {
      authoritative = true;
      result = await window.__axeAuthoritativeServiceRequest({
        transactionId,
        serviceId,
        payload: { ...payload, transactionId },
        requestedAt,
      });
    } else {
      if (diceSource && SERVER_ROLLED_UPGRADES.includes(serviceId)) {
        result = await runServerRolledUpgrade(serviceId, { ...payload, transactionId }, identity);
        authoritative = !!result?.serverRolled;
      }
      if (result === undefined || result === null) {
        const handler = localHandlers[serviceId];
        result = handler
          ? await handler({ ...payload, transactionId })
          : { ok: false, reason: 'SERVICE_TRANSACTION_NOT_AVAILABLE' };
      }
    }

    if (transactionIdentity() !== identity) return { ok: false, reason: 'CHARACTER_CHANGED', transactionId };
    const normalized = { ...(result || { ok: false, reason: 'EMPTY_TRANSACTION_RESULT' }), transactionId };
    // Remember only completed operations (including a real failed roll), not a
    // connection refusal the player should be able to retry. This device's
    // receipt prevents applying a repeated server result/payment twice.
    if (normalized.ok || normalized.outcome || normalized.serverRolled) {
      receipts.set(transactionId, { fingerprint, result: normalized });
      while (receipts.size > 200) receipts.delete(receipts.keys().next().value);
      receiptStorage.set(JSON.stringify([...receipts]));
    }
    appendAXEServiceAudit({
      transactionId,
      serviceId,
      itemId,
      requestedAt,
      completedAt: Date.now(),
      authoritative,
      ok: !!normalized.ok,
      outcome: normalized.outcome || null,
      reason: normalized.reason || null,
      cost: normalized.cost || null,
    });

    return { ...normalized, transactionId };
  } catch (error) {
    if (transactionIdentity() !== identity) return { ok: false, reason: 'CHARACTER_CHANGED', transactionId };
    appendAXEServiceAudit({
      transactionId,
      serviceId,
      itemId,
      requestedAt,
      completedAt: Date.now(),
      authoritative: false,
      ok: false,
      reason: error?.message || 'TRANSACTION_EXCEPTION',
    });
    return {
      ok: false,
      reason: 'TRANSACTION_EXCEPTION',
      message: error?.message || String(error),
      transactionId,
    };
  } finally {
    lockKeys.forEach((key) => inFlight.delete(key));
  }
}
