// Combat Foundation 3.0: one actor-ordered strike intent and small replay cache.
// This is a per-session sequencing contract, NOT a transactional datastore.
// Mutating two DuelSession rows in competing server processes still needs CAS.
export const DUEL_PROTOCOL_VERSION = 3;
export const MAX_RECENT_COMBAT_INTENTS = 12;
export const MAX_INTENT_SEQUENCE_ADVANCE = 32;
export const MAX_DUEL_EVENT_HISTORY = 50;
export function validateCombatIntent({intentId,intentSeq,lastSeq=0,recent=[]}={}) {
  if (typeof intentId!=='string' || !/^axehi[a-zA-Z0-9_-]{8,65}$/.test(intentId))
    return {ok:false,reason:'invalid_intent_id'};
  if (!Number.isSafeInteger(intentSeq) || intentSeq<1)
    return {ok:false,reason:'invalid_intent_sequence'};
  const match=(Array.isArray(recent)?recent:[]).find(entry=>entry?.intentId===intentId);
  if (match) {
    return intentSeq===match.seq ? {ok:true,replay:true,entry:match}
      : {ok:false,reason:'intent_reuse'};
  }
  const prev=Number.isSafeInteger(lastSeq)&&lastSeq>0?lastSeq:0;
  if (intentSeq<=prev) return {ok:false,reason:'stale_intent_sequence'};
  if (intentSeq-prev>MAX_INTENT_SEQUENCE_ADVANCE)
    return {ok:false,reason:'intent_sequence_jump'};
  return {ok:true,replay:false};
}
export function rememberCombatIntent(recent,entry) {
  const list=(Array.isArray(recent)?recent:[])
    .filter(item=>item?.intentId!==entry.intentId);
  list.push(entry);
  return list.slice(-MAX_RECENT_COMBAT_INTENTS);
}
export function sortAndDedupeCombatReceipts(receipts) {
  const unique=new Map();
  for (const receipt of Array.isArray(receipts)?receipts:[]) {
    if (!receipt || typeof receipt.id!=='string' || !Number.isFinite(receipt.at)) continue;
    if (!unique.has(receipt.id)) unique.set(receipt.id,receipt);
  }
  return [...unique.values()].sort((a,b)=>a.at-b.at||
    (Number(a.seq)||0)-(Number(b.seq)||0)||a.id.localeCompare(b.id));
}
