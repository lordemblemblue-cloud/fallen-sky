// Combat / Quest Foundation 15.1 — PRIVATE, source-only evidence handoff.
// Consumes the SAME 13.6 encounter, not browser events or a second simulator.
// A candidate is NOT an earned quest kill: 13.6 explicitly emits
// serverKillCommitted:false until a durable, transactional kill writer exists.
// No public API, progress mutation, payout, event publication or BFF here.
export const QUEST_EVIDENCE_151=Object.freeze({
 version:'15.1', maxBatchEvents:100, maxActiveQuests:32,
 maxObjectivesPerQuest:16, maxLeaseMs:30000,
});
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const validWho=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const n=x=>Number.isSafeInteger(x)&&x>=0;
const copy=x=>Object.freeze({...x});
const denied=reason=>Object.freeze({ok:false,version:'15.1',
 reason,privateServerOnly:true,proposalOnly:true,
 appliedQuestProgress:false,rewardsIssued:false,productionReady:false});
function trustedLease(l,scope,time,pinnedFence){
 return l?.ok===true&&l.source==='trusted-world-instance-lease'&&
 l.exclusive===true&&l.committed===true&&
 ['instanceId','instanceEpoch','holderId','ownerId','characterId',
  'mapFingerprint'].every(key=>l[key]===scope[key])&&
 n(l.fencingToken)&&l.fencingToken>0&&
 (pinnedFence===null||pinnedFence===l.fencingToken)&&
 n(l.expiresAt)&&l.expiresAt>time&&
 l.expiresAt-time<=QUEST_EVIDENCE_151.maxLeaseMs;
}
function trustedQuests(state,scope){
 if(state?.ok!==true||state.provenance!=='trusted-server-quest-snapshot'||
  ['instanceId','instanceEpoch','ownerId','characterId','mapFingerprint']
   .some(k=>state[k]!==scope[k])||
  !Array.isArray(state.accepted)||state.accepted.length>QUEST_EVIDENCE_151.maxActiveQuests)
  return null;
 const ids=new Set(),out=[];
 for(const q of state.accepted){
  if(!validId(q?.id)||ids.has(q.id)||!Array.isArray(q.objectives)||
    q.objectives.length>QUEST_EVIDENCE_151.maxObjectivesPerQuest)return null;
  ids.add(q.id);
  const objectiveIds=new Set(),objectives=[];
  for(let i=0;i<q.objectives.length;i++){
   const o=q.objectives[i],oid=o?.id||`objective_${i}`;
   if(!validId(oid)||objectiveIds.has(oid)||
    !['kill','kill_tier','defeat_boss','collect_item','discover_location',
     'interact','talk','escort','defend','capture','craft','enter_cave',
     'faction_war','explore'].includes(o?.type)||
    (o?.tier!==undefined&&!['normal','elite','champion','miniBoss'].includes(o.tier))||
    (o?.type==='kill_tier'&&!o.tier)||
    (o?.targetId!==undefined&&!validId(o.targetId))||
    !Number.isSafeInteger(o?.count)||o.count<1||o.count>10000)return null;
   objectiveIds.add(oid);
   // Supported objective types only; other legitimate objectives remain in
   // their original quest engine, never treated as enemy kills.
   if(o.type==='kill'||o.type==='kill_tier')
    objectives.push(Object.freeze({id:oid,type:o.type,
     tier:o.tier||null,targetId:o.targetId||null}));
  }
  out.push(Object.freeze({id:q.id,objectives:Object.freeze(objectives)}));
 }
 return out;
}
const validScope=s=>s&&validId(s.instanceId)&&validId(s.instanceEpoch)&&
 validId(s.holderId)&&validWho(s.ownerId)&&validWho(s.characterId)&&
 hex(s.mapFingerprint);

// Both dependencies must be privileged, server-injected functions that read
// the existing DB lease and character's accepted quest snapshot. A browser
// cannot supply their results through a parameter to review().
export function createGame3DPrivateQuestEvidence151({
 encounter,scope,verifyExclusiveLease,readTrustedQuestState,now=Date.now
}={}){
 if(!validScope(scope)||!encounter||
   encounter.version!=='13.6'||encounter.privateServerOnly!==true||
   encounter.instanceId!==scope.instanceId||
   encounter.mapFingerprint!==scope.mapFingerprint||
   typeof encounter.getEventsAfter!=='function'||
   typeof encounter.snapshot!=='function'||
   typeof verifyExclusiveLease!=='function'||
   typeof readTrustedQuestState!=='function'||typeof now!=='function')
  throw Error('15.1 requires pinned private encounter, lease and quest authority');
 const pinned=copy(scope);
 const initial=encounter.snapshot();
 if(initial?.instanceId!==pinned.instanceId||
    !n(initial.eventSeq)||initial.rewardsIssued!==false||
    initial.productionReady!==false)
   throw Error('15.1 invalid private encounter baseline');
 let cursor=initial.eventSeq,fenced=false,fenceToken=null;
 let tail=Promise.resolve();
 const serialize=fn=>{
  const p=tail.then(fn,fn);
  tail=p.then(()=>undefined,()=>undefined);
  return p;
 };
 const review=()=>serialize(async()=>{
  if(fenced)return denied('private_quest_evidence_fenced');
  const at=now();
  if(!n(at)){fenced=true;return denied('invalid_private_clock')}
  let lease,qs;
  try{
   lease=await verifyExclusiveLease(pinned);
   if(!trustedLease(lease,pinned,at,fenceToken)){
    fenced=true;return denied('private_quest_lease_lost');
   }
   if(fenceToken===null)fenceToken=lease.fencingToken;
   qs=trustedQuests(await readTrustedQuestState(pinned),pinned);
   if(!qs){fenced=true;return denied('untrusted_character_quest_state')}
  }catch{fenced=true;return denied('private_quest_authority_unavailable')}
  let snap,events;
  try{
   snap=encounter.snapshot();
   events=encounter.getEventsAfter(cursor);
  }catch{fenced=true;return denied('private_combat_evidence_unavailable')}
  if(snap?.instanceId!==pinned.instanceId||
     snap.rewardsIssued!==false||snap.productionReady!==false||
     !n(snap.eventSeq)||snap.eventSeq<cursor||
     !Array.isArray(snap.enemies)||!Array.isArray(events)||
     events.length>QUEST_EVIDENCE_151.maxBatchEvents){
    fenced=true;return denied('invalid_private_combat_stream');
  }
  const dead=new Map();
  for(const e of snap.enemies){
   if(!validId(e?.id)||typeof e?.alive!=='boolean'||
      !Number.isFinite(e.hp)||dead.has(e.id)){
    fenced=true;return denied('invalid_private_enemy_snapshot');
   }
   dead.set(e.id,e);
  }
  const candidates=[];
  let expected=cursor+1;
  for(const e of events){
   if(e?.seq!==expected||e.instanceId!==pinned.instanceId||
      !n(e.serverTime)||e.xpAuthorized!==false||
      e.lootAuthorized!==false||e.currencyAuthorized!==false){
    fenced=true;return denied('invalid_private_event_chain');
   }
   expected++;
   if(e.kind!=='player_strike'||e.killed!==true)continue;
   // Important: "killed" is a server-computed outcome, but it is NOT a
   // durable quest kill. Reconcile candidates only for future trusted writer.
   if(e.serverKillCommitted!==false||e.enemyHp!==0||
      !validId(e.targetId)||
      !['normal','elite','champion','miniBoss'].includes(e.tier)||
      dead.get(e.targetId)?.alive!==false||
      dead.get(e.targetId)?.hp!==0){
    fenced=true;return denied('uncommitted_kill_evidence_invalid');
   }
   for(const q of qs)for(const o of q.objectives){
    if(o.type==='kill_tier'&&o.tier!==e.tier)continue;
    if(o.targetId&&o.targetId!==e.targetId)continue;
    candidates.push(Object.freeze({
      evidenceId:`${pinned.instanceId}:${pinned.instanceEpoch}:${e.seq}`,
      questId:q.id,objectiveId:o.id,
      enemyId:e.targetId,tier:e.tier,eventSeq:e.seq,
      source:'server-private-encounter-13.6',
      serverKillCommitted:false,questCreditAuthorized:false,
    }));
   }
  }
  if(expected-1!==snap.eventSeq){
   // Event ring eviction/gap, snapshot overrun, or missed reset. Never
   // invent or backfill a kill from current HP after history is missing.
   fenced=true;return denied('private_combat_event_gap');
  }
  cursor=snap.eventSeq;
  return Object.freeze({ok:true,version:'15.1',lastSeq:cursor,
   candidates:Object.freeze(candidates),privateServerOnly:true,
   proposalOnly:true,appliedQuestProgress:false,
   rewardsIssued:false,productionReady:false});
 });
 return Object.freeze({version:'15.1',review,
  privateServerOnly:true,publicRouteInstalled:false,
  questProgressWriterEnabled:false,rewardWriterEnabled:false,
  productionReady:false});
}
