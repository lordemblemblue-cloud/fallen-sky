// Combat Foundation 5.9 — private server-side authored quest objective policy.
// Mirrors a SMALL approved subset of AXE quests. Client quest progress,
// Game3DCharacterSave and browser rewards NEVER qualify as verified evidence.
const QUESTS=Object.freeze({
 'axe_q_first_patrol':Object.freeze({
  objectives:Object.freeze([{type:'enemy_killed',key:'patrol_kills',target:3,
    tier:'normal'}]),awards:Object.freeze([]),
 }),
 'axe_q_first_elite':Object.freeze({
  requires:'axe_q_first_patrol',
  objectives:Object.freeze([{type:'enemy_killed',key:'elite_kill',target:1,
    tier:'elite'}]),awards:Object.freeze([]),
 }),
 'axe_q_cave_scout':Object.freeze({
  requires:'axe_q_first_patrol',
  objectives:Object.freeze([{type:'location_discovered',key:'find_cave',
    target:1,location:'AXE_POI_CaveEntrance'}]),awards:Object.freeze([]),
 }),
});
export const TRUSTED_QUEST_POLICY_VERSION='axe-private-quest-policy-v1';
export const trustedQuestDefinition=questId=>QUESTS[questId]||null;
const ID=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(v);
const eventType=e=>e?.type==='enemy_killed'&&
  ['normal','elite'].includes(e.tier) ||
  e?.type==='location_discovered'&&ID(e.location);
export function evaluateServerQuestObjectives({questId,events,priorCompleted=[]}={}){
 const quest=trustedQuestDefinition(questId);
 if(!quest)return {ok:false,code:'quest_not_allowlisted'};
 if(!Array.isArray(events)||events.length>250||
    !Array.isArray(priorCompleted)||priorCompleted.length>128||
    (quest.requires&&!priorCompleted.includes(quest.requires)))
  return {ok:false,code:'quest_prerequisites_or_event_bounds'};
 const counters=Object.fromEntries(quest.objectives.map(o=>[o.key,0]));
 const seen=new Set();
 for(const event of events){
  if(!ID(event?.eventId)||!Number.isSafeInteger(event?.serverTick)||
     event.serverTick<0||!eventType(event))
    return {ok:false,code:'invalid_server_event'};
  // Distinct event IDs only: a repeated kill cannot satisfy multiple kills.
  if(seen.has(event.eventId))return {ok:false,code:'duplicate_event'};
  seen.add(event.eventId);
  for(const rule of quest.objectives){
   if(rule.type!==event.type)continue;
   if(rule.tier&&event.tier!==rule.tier)continue;
   if(rule.location&&event.location!==rule.location)continue;
   counters[rule.key]=Math.min(rule.target,counters[rule.key]+1);
  }
 }
 const complete=quest.objectives.every(o=>counters[o.key]===o.target);
 return {ok:true,questId,policyVersion:TRUSTED_QUEST_POLICY_VERSION,
  counters,complete,
  // Evidence must still come from a trusted backend event journal.
  serverEventAuthenticityVerified:false,awardEligible:false,
  xpGranted:false,itemsGranted:false};
}
