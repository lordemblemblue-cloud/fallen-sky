// AXE Prompt 020 persistence / transaction adapter.
// Character-scoped and subscribable so advancement changes immediately feed
// Services, equipment details and live combat stats.

import { characterScopedStorage, subscribeCharacterChange } from '../../characterStorage';
import {
  resolveCombine,
  resolveStageAdvance,
  resolveRefine,
  resolveUltimate,
} from './AXEItemAdvancementSystem';
import { getItemReinforcement } from '../../equipment/enchantmentStore';
import { getAXEReinforcementCap } from './AXEItemEnhancementSystem';
import { getAXEEquipmentItem } from './AXEEquipmentInventoryStore';
import {isAXEFarmingRarity} from '../loot/AXEFarmingGearTiers.mjs';
import {previewAXEAscensionFeed} from './AXEAscensionFeedingRules.mjs';

const storage = characterScopedStorage('axe_item_advancement_v2');
const auditStorage = characterScopedStorage('axe_item_advancement_audit_v2');

function loadJSON(store, fallback) {
  try {
    const raw = store.get();
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

let state = loadJSON(storage, {});
let audit = loadJSON(auditStorage, []);
const listeners = new Set();

function snapshot() {
  return {
    state: JSON.parse(JSON.stringify(state || {})),
    audit: [...audit],
  };
}

function save() {
  storage.set(JSON.stringify(state));
  auditStorage.set(JSON.stringify(audit.slice(-250)));
}

function emit() {
  save();
  const snap = snapshot();
  listeners.forEach((fn) => fn(snap));
}

subscribeCharacterChange(() => {
  state = loadJSON(storage, {});
  audit = loadJSON(auditStorage, []);
  const snap = snapshot();
  listeners.forEach((fn) => fn(snap));
});

function tx(type, itemId, payload, result) {
  const entry = {
    id: `axe_tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    itemId,
    payload,
    result: {
      ok: !!result?.ok,
      outcome: result?.outcome || result?.reason || null,
    },
    at: Date.now(),
  };
  audit = [...audit, entry].slice(-250);
  return entry;
}

export function subscribeAXEItemAdvancement(fn) {
  listeners.add(fn);
  fn(snapshot());
  return () => listeners.delete(fn);
}

export function getAXEAdvancementState(itemId) {
  return state[itemId] || {
    combine: { count: 0 },
    stage: { rank: 0, id: 'stage_0', label: 'Base' },
    refine: { level: 0 },
    ultimate: { level: 0, sealed: false },
  };
}

export function getAXEAdvancementAudit() {
  return [...audit];
}

export function applyAXECombine(target, donor, options = {}) {
  const itemId = target?.instanceId || target?.id;
  if (!itemId) return { ok: false, reason: 'ITEM_MISSING' };
  const current = getAXEAdvancementState(itemId);
  const donorWithIdentity = donor
    ? { ...donor, instanceId: donor.instanceId || donor.id, templateId: donor.templateId || donor.id }
    : donor;
  const targetWithIdentity = {
    ...target,
    instanceId: itemId,
    templateId: target?.templateId || target?.id,
    combine: current.combine,
  };
  const result = resolveCombine(targetWithIdentity, donorWithIdentity, options);
  if (result.ok) {
    state = {
      ...state,
      [itemId]: { ...current, combine: result.target.combine },
    };
  }
  tx('combine', itemId, { donorId: donorWithIdentity?.instanceId || null }, result);
  emit();
  return result;
}

export function applyAXEStage(itemId, options = {}) {
  if (!itemId) return {ok:false,reason:'ITEM_MISSING'};
  const current=getAXEAdvancementState(itemId);
  const item=getAXEEquipmentItem(itemId);
  if(!item)return {ok:false,reason:'ITEM_NOT_OWNED'};
  // Existing starter/legacy grades retain the older materials-only pathway.
  const feedRequired=isAXEFarmingRarity(item.rarity);
  const donor=options.feedDonor;
  const feeding=feedRequired?previewAXEAscensionFeed(item,current.stage,donor):null;
  if(feedRequired&&!feeding?.ok)return feeding||{ok:false,reason:'DONOR_REQUIRED'};
  const savedReinforcementPercent=Math.max(0,Number(getItemReinforcement(itemId)?.percent||0));
  const reinforcementPercent=Math.min(savedReinforcementPercent,getAXEReinforcementCap(item));
  let stage=current.stage;
  const ranksToGain=feedRequired?feeding.grantedRanks:1;
  const imprints=[];
  // Only genuine rank growth captures additional reinforcement-based imprints.
  // Same-level partial feeds never grant a free Ascension.
  for(let i=0;i<ranksToGain;i++){
    const step=resolveStageAdvance(stage,{successChance:1,item,reinforcementPercent});
    if(!step.ok)return step;
    stage=step.record;imprints.push(step.imprint);
  }
  if(feedRequired){
    stage={...stage,feedProgress:feeding.progressAfter,
      fedItems:Math.max(0,Number(current.stage?.fedItems)||0)+1};
  }
  if(!feedRequired&&ranksToGain===1&&stage===current.stage)
    return {ok:false,reason:'MAX_STAGE'};
  state={...state,[itemId]:{...current,stage}};
  const result={ok:true,outcome:feedRequired
      ?(ranksToGain?'ascension_upgraded':'ascension_feed_saved'):'success',
    record:stage,imprints,grantedRanks:ranksToGain,
    donorConsumed:feedRequired,feedProgress:stage.feedProgress||0,
    nextRequirement:Math.min(4,Number(stage.rank||0)+1)};
  tx('stage',itemId,{donorId:donor?.instanceId||null},result);
  emit();
  return result;
}

export function applyAXERefine(itemId, options = {}) {
  if (!itemId) return { ok: false, reason: 'ITEM_MISSING' };
  const current = getAXEAdvancementState(itemId);
  const result = resolveRefine(current.refine, options);
  if (!result.destroyed) {
    state = { ...state, [itemId]: { ...current, refine: result.record } };
  } else {
    state = {
      ...state,
      [itemId]: { ...current, refine: { ...current.refine, destroyed: true } },
    };
  }
  tx('refine', itemId, { protectedAttempt: !!options.protectedAttempt }, result);
  emit();
  return result;
}

export function applyAXEUltimate(item, options = {}) {
  const itemId = item?.instanceId || item?.id;
  if (!itemId) return { ok: false, reason: 'ITEM_MISSING' };
  const current = getAXEAdvancementState(itemId);
  const result = resolveUltimate(item, current.ultimate, options);
  state = { ...state, [itemId]: { ...current, ultimate: result.record } };
  tx('ultimate', itemId, { protectedAttempt: !!options.protectedAttempt }, result);
  emit();
  return result;
}


// The server's record for an item's refine or ultimate (itemUpgrade,
// docs/game3d/SERVER_UPGRADES.md): the game rolls on it and keeps the server's result.
export function setAXEAdvancementRecord(itemId, field, record) {
  if (!itemId || !record || !['refine', 'ultimate','stage'].includes(field)) return false;
  const current = getAXEAdvancementState(itemId);
  state = { ...state, [itemId]: { ...current, [field]: { ...record } } };
  emit();
  return true;
}

export function purgeAXEAdvancementState(itemId) {
  if (!itemId || !state[itemId]) return false;
  const next = { ...state };
  delete next[itemId];
  state = next;
  tx('purge', itemId, {}, { ok: true, outcome: 'item_removed' });
  emit();
  return true;
}

if (typeof window !== 'undefined' && !window.__axeAdvancementLifecycleHook) {
  window.__axeAdvancementLifecycleHook = true;
  window.addEventListener('axeEquipmentItemRemoved', (event) => {
    purgeAXEAdvancementState(event?.detail?.instanceId);
  });
}
