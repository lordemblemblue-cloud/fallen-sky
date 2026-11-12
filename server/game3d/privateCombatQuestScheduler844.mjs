// Game 3D Combat / Quest 84.4 — PRIVATE, explicit combat tick -> original
// 15.3 kill commit -> immutable 18.5/84.3 objective reconciliation.
// A trusted backend scheduler must be the EXCLUSIVE owner of its 13.8 world.
// Never mount this file as a browser API, timer, worker or reward writer.
import {createGame3DPrivateQuestProgression185}
 from './privateQuestProgression185.mjs';

const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const KEY=/^[A-Za-z0-9_.:-]{8,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const ACTION=/^qb174-[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const scopeOK=s=>obj(s)&&
 typeof s.ownerId==='string'&&WHO.test(s.ownerId)&&
 typeof s.characterId==='string'&&WHO.test(s.characterId)&&
 typeof s.instanceId==='string'&&KEY.test(s.instanceId)&&
 typeof s.instanceEpoch==='string'&&KEY.test(s.instanceEpoch)&&
 typeof s.holderId==='string'&&KEY.test(s.holderId)&&
 typeof s.mapFingerprint==='string'&&HASH.test(s.mapFingerprint);
// Pin the six validated original world scope fields from one own-data
// descriptor snapshot. Inherited or accessor identities fail before wiring.
const snapshotScope920=candidate=>{
 if(!obj(candidate))return null;
 let desc;
 try{desc=Object.getOwnPropertyDescriptors(candidate)}catch{return null}
 const copy=Object.create(null);
 for(const key of ['ownerId','characterId','holderId',
  'instanceId','instanceEpoch','mapFingerprint']){
  const field=Object.hasOwn(desc,key)?desc[key]:null;
  if(!field||!Object.hasOwn(field,'value'))return null;
  copy[key]=field.value;
 }
 return scopeOK(copy)?Object.freeze(copy):null;
};
// Bind original staging dependencies once. A mutable wrapper must not
// substitute a different world tick, PostgreSQL writer or lease resolver
// after construction has validated the single-authority graph.
const snapshotMethods940=(source,names)=>{
 if(!obj(source))return null;
 let desc;
 try{desc=Object.getOwnPropertyDescriptors(source)}catch{return null}
 const copy=Object.create(null);
 for(const name of names){
  const field=Object.hasOwn(desc,name)?desc[name]:null;
  if(!field||!Object.hasOwn(field,'value')||
     typeof field.value!=='function')return null;
  copy[name]=field.value.bind(source);
 }
 return Object.freeze(copy);
};
const safeCount=(x,max)=>Number.isSafeInteger(x)&&x>=0&&x<=max;
export const GAME3D_844_MAX_REPLAY_PAGES=8;
const denied=(reason,cursor=0,partial=false)=>Object.freeze({
 ok:false,version:'84.4',reason,retryFromEventSeq:cursor,
 partialProjection:partial,progressSynchronized:false,
 rewardsIssued:false,rewardAuthorized:false,questTurnInCommitted:false,
 privateServerOnly:true,productionReady:false,
});

// Pure private sequencer is separately testable. The staging factory below
// constructs the ORIGINAL 18.5 progression for this exact world, so it cannot
// accidentally install the 15.5 second kill writer.
export function createGame3DPrivateCombatQuestPump844({
 owner,encounter,scope,progression,worldStage180,serverRequestContext,
 now=Date.now,enabled=false,
}={}){
 const pinnedScope=snapshotScope920(scope);
 const ownerOps=snapshotMethods940(owner,[
  'advance','release','connect','setInput','submit','poll','disconnect']);
 const progressionOps=snapshotMethods940(progression,[
  'commitWorldKills','reconcileCommittedKills','shutdown']);
 const leaseOps=snapshotMethods940(worldStage180,[
  'resolveCurrentWorldLease183']);
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    !pinnedScope||!obj(serverRequestContext)||
    typeof now!=='function'||
    owner?.version!=='13.8'||owner.privateServerOnly!==true||
    owner.publicTransportInstalled!==false||
    owner.instanceId!==pinnedScope.instanceId||
    !Number.isSafeInteger(owner.fencingToken)||owner.fencingToken<1||
    !ownerOps||
    encounter?.version!=='13.6'||encounter.privateServerOnly!==true||
    encounter.instanceId!==pinnedScope.instanceId||
    encounter.mapFingerprint!==pinnedScope.mapFingerprint||
    progression?.version!=='18.5'||progression.privateServerOnly!==true||
    progression.publicPlayerRouteInstalled!==false||
    progression.independentCombatWriterCreated!==false||
    progression.rewardWriterInstalled!==false||
    !progressionOps||
    worldStage180?.version!=='18.0'||
    worldStage180.privateServerOnly!==true||
    worldStage180.publicPlayerRouteInstalled!==false||
    !leaseOps)
  throw Error('84.4 requires one original, trusted private combat world and progression');

 const pinned=pinnedScope;
 let stopped=false,halted=false,pendingCommit=false,needsReplay=false;
 let shutdownRequested=false;
 let cursor=0,lastEventSeq=0,leasePinned=null,tail=Promise.resolve();
 let unreconciledReceiptEventSeq=0;
 // Verified pages advance the cursor before full success; retain their
 // notifications until a complete replay response can safely be published.
 let unreportedCredits=[],unreportedProcessedReceipts=0;
 let unreportedCreditKeys=new Set();
 const MAX_UNREPORTED_CREDITS_900=4096;
 let lastTrustedTime=0;
 // One checked sample per lease proof: callbacks can throw, change value,
 // or roll backwards. None should authorize an expired world generation.
 const trustedTime=()=>{
  let sample;
  try{sample=now()}catch{return null}
  if(!Number.isSafeInteger(sample)||sample<=0||
     sample<lastTrustedTime)return null;
  lastTrustedTime=sample;
  return sample;
 };
 const closed=()=>denied('private_combat_quest_scheduler_stopped',cursor,
  pendingCommit||needsReplay);
 const serial=(fn,allowShutdown=false)=>{
  // Fence new and queued commands immediately without racing an existing
  // original 13.8 tick or original 15.3 PostgreSQL kill commit.
  if(shutdownRequested&&!allowShutdown)return Promise.resolve(closed());
  const guarded=async()=>{
   if(shutdownRequested&&!allowShutdown)return closed();
   let result;
   try{result=await fn()}catch(error){
    if(shutdownRequested&&!allowShutdown)return closed();
    throw error;
   }
   // An in-flight original operation must settle and reconcile normally,
   // but no late frame, receipt, or progress may escape after shutdown.
   if(shutdownRequested&&!allowShutdown)return closed();
   return result;
  };
  const call=tail.then(guarded,guarded);
  tail=call.then(()=>undefined,()=>undefined);
  return call;
 };
 const same=(a,b)=>!!a&&!!b&&
  ['ownerId','characterId','worldInstanceId','worldEpoch',
   'serverSessionId','actionSessionId','leaseNonce','expiresAtMs']
    .every(key=>a[key]===b[key]);
 const leaseSnapshot872=candidate=>{
  // Only own data descriptors are allowed. Never execute accessors or
  // authorize a lease assembled from inconsistent property reads.
  if(!obj(candidate))return null;
  let descriptors;
  try{descriptors=Object.getOwnPropertyDescriptors(candidate)}
  catch{return null;}
  const proof=Object.create(null);
  for(const name of ['ownerId','characterId','worldInstanceId',
    'worldEpoch','serverSessionId','actionSessionId','leaseNonce',
    'expiresAtMs']){
   const descriptor=descriptors[name];
   if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;
   proof[name]=descriptor.value;
  }
  return Object.freeze(proof);
 };
 const current=async()=>{
  if(stopped||halted)return null;
  let lease;
  try{lease=await leaseOps.resolveCurrentWorldLease183({
   serverRequestContext,
  })}catch{return null;}
  const at=trustedTime();
  const proof=leaseSnapshot872(lease);
  if(at===null||!proof||proof.ownerId!==pinned.ownerId||
     proof.characterId!==pinned.characterId||
     proof.worldInstanceId!==pinned.instanceId||
     proof.worldEpoch!==pinned.instanceEpoch||
     typeof proof.serverSessionId!=='string'||
     !KEY.test(proof.serverSessionId)||
     typeof proof.actionSessionId!=='string'||
     !ACTION.test(proof.actionSessionId)||
     typeof proof.leaseNonce!=='string'||
     !UUID.test(proof.leaseNonce)||
     !Number.isSafeInteger(proof.expiresAtMs)||
     proof.expiresAtMs<=at)
   return null;
  if(leasePinned!==null&&!same(leasePinned,proof))return null;
  if(leasePinned===null)leasePinned=proof;
  return proof;
 };
 const stopReason=()=>stopped?'private_combat_quest_scheduler_stopped':
  halted?'private_combat_quest_scheduler_halted':
  pendingCommit?'pending_world_kill_commit_recovery':
  needsReplay?'quest_reconciliation_required':null;
 const reject=reason=>denied(reason,cursor,pendingCommit||needsReplay);
 // Snapshot an original 84.3 reconciliation page before processing it.
 // Accessors/proxy traps must not publish credits or advance the cursor.
 const ownFields876=(candidate,fields)=>{
  if(!obj(candidate))return null;
  let descriptors;
  try{descriptors=Object.getOwnPropertyDescriptors(candidate)}catch{return null;}
  const proof=Object.create(null);
  for(const name of fields){
   const descriptor=Object.hasOwn(descriptors,name)?descriptors[name]:null;
   if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;
   proof[name]=descriptor.value;
  }
  return proof;
 };
 // Original PG projection is JSON-shaped. Snapshot nested credit and
 // objective data too so post-lease awaits cannot rewrite a credited quest.
 const INVALID_880=Symbol('invalid-original-quest-projection');
 const MAX_SNAPSHOT_FIELDS_950=256;
 const MAX_STRING_CHARS_950=65536;
 const MAX_TOTAL_STRING_CHARS_950=262144;
 const deepData880=(value,depth,budget,seen)=>{
  // Count scalar leaves as well as objects. Otherwise an object holding
  // thousands of primitive fields bypasses the old 8192-node budget.
  if(depth>8||!budget||!Number.isSafeInteger(budget.remaining)||
     --budget.remaining<0)return INVALID_880;
  if(typeof value==='string'){
   const left=budget.charsRemaining===undefined?
    MAX_TOTAL_STRING_CHARS_950:budget.charsRemaining;
   if(!Number.isSafeInteger(left)||value.length>MAX_STRING_CHARS_950||
      value.length>left)return INVALID_880;
   budget.charsRemaining=left-value.length;
   return value;
  }
  if(value===null||typeof value==='boolean'||
     (typeof value==='number'&&Number.isFinite(value))||
     value===undefined)return value;
  if(!obj(value)&&!Array.isArray(value)||seen.has(value))
   return INVALID_880;
  try{
   const prototype=Object.getPrototypeOf(value);
   if(Array.isArray(value)){
    if(prototype!==Array.prototype)return INVALID_880;
   }else if(prototype!==Object.prototype&&prototype!==null)
    return INVALID_880;
   seen.add(value);
   const desc=Object.getOwnPropertyDescriptors(value);
   let copied;
   if(Array.isArray(value)){
    const length=desc.length?.value;
    if(!Number.isSafeInteger(length)||length>4096)return INVALID_880;
    copied=[];
    for(let i=0;i<length;i++){
     const slot=Object.hasOwn(desc,String(i))?desc[String(i)]:null;
     if(!slot||!Object.hasOwn(slot,'value'))return INVALID_880;
     const v=deepData880(slot.value,depth+1,budget,seen);
     if(v===INVALID_880)return INVALID_880;
     copied.push(v);
    }
   }else{
    const keys=Object.keys(desc);
    if(keys.length>MAX_SNAPSHOT_FIELDS_950)return INVALID_880;
    copied=prototype===null?Object.create(null):{};
    for(const key of keys){
     const slot=desc[key];
     if(!Object.hasOwn(slot,'value'))return INVALID_880;
     const v=deepData880(slot.value,depth+1,budget,seen);
     if(v===INVALID_880)return INVALID_880;
     Object.defineProperty(copied,key,{value:v,enumerable:true});
    }
   }
   return Object.freeze(copied);
  }catch{return INVALID_880}
  finally{seen.delete(value)}
 };
 const denseArray876=candidate=>{
  try{
   if(!Array.isArray(candidate)||candidate.length>4096)return null;
   const descriptors=Object.getOwnPropertyDescriptors(candidate);
   const length=descriptors.length?.value;
   if(!Number.isSafeInteger(length)||length!==candidate.length||
      length>4096)return null;
   const snapshot=[];
   const budget={remaining:8192},seen=new WeakSet();
   for(let i=0;i<length;i++){
    const descriptor=Object.hasOwn(descriptors,String(i))?
     descriptors[String(i)]:null;
    if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;
    const copied=deepData880(descriptor.value,0,budget,seen);
    if(copied===INVALID_880)return null;
    snapshot.push(copied);
   }
   return Object.freeze(snapshot);
  }catch{return null;}
 };
 const replayPage876=candidate=>{
  const proof=ownFields876(candidate,['ok','version','rewardAuthorized',
   'rewardsIssued','questTurnInCommitted','processedReceipts',
   'nextEventSeq','hasMore','newCredits','objectives']);
  if(!proof)return null;
  proof.newCredits=denseArray876(proof.newCredits);
  proof.objectives=denseArray876(proof.objectives);
  if(!proof.newCredits||!proof.objectives)return null;
  return Object.freeze(proof);
 };
 const replay=async()=>{
  let after=cursor,progress=null;
  for(let page=0;page<GAME3D_844_MAX_REPLAY_PAGES;page++){
   if(!await current()){
    halted=true;return reject('world_session_changed_during_reconciliation');
   }
   let result;
   try{result=await progressionOps.reconcileCommittedKills({afterEventSeq:after})}
   catch{return reject('private_quest_reconciliation_unavailable')}
   const pageProof=replayPage876(result);
   if(pageProof?.ok!==true||pageProof.version!=='84.3'||
      pageProof.rewardAuthorized!==false||
      pageProof.rewardsIssued!==false||pageProof.questTurnInCommitted!==false||
      !safeCount(pageProof.processedReceipts,16)||
      !Number.isSafeInteger(pageProof.nextEventSeq)||
      pageProof.nextEventSeq<after||pageProof.nextEventSeq>lastEventSeq||
      typeof pageProof.hasMore!=='boolean'||
      !Array.isArray(pageProof.newCredits)||!Array.isArray(pageProof.objectives)||
      (pageProof.hasMore&&(pageProof.processedReceipts===0||
        pageProof.nextEventSeq===after))||
      (pageProof.processedReceipts>0&&pageProof.nextEventSeq===after)||
      // An empty original receipt page cannot move the confirmed cursor
      // or fabricate quest credits. Otherwise future kills could be skipped.
      (pageProof.processedReceipts===0&&
       (pageProof.nextEventSeq!==after||pageProof.newCredits.length!==0)))
    return reject('untrusted_or_incomplete_reconciliation_page');
   if(!await current()){
    halted=true;return reject('world_session_changed_during_reconciliation');
   }
   if(unreportedCredits.length+pageProof.newCredits.length>
      MAX_UNREPORTED_CREDITS_900)
    return reject('reconciliation_credit_buffer_limit');
   // The original 15.2 ledger emits monotonically increasing objective
   // counts. A duplicate identified (quest, objective, count) must not
   // appear twice in one delivered replay, including across recovery.
   const nextCreditKeys=new Set(unreportedCreditKeys);
   let duplicate=false;
   for(const credit of pageProof.newCredits){
    if(!obj(credit)||typeof credit.questId!=='string'||
       typeof credit.objectiveId!=='string'||
       !Number.isSafeInteger(credit.count)||credit.count<1)continue;
    const key=JSON.stringify([credit.questId,credit.objectiveId,
     credit.count]);
    if(nextCreditKeys.has(key)){duplicate=true;break}
    nextCreditKeys.add(key);
   }
   if(duplicate)return reject('duplicate_original_quest_credit_projection');
   unreportedCreditKeys=nextCreditKeys;
   unreportedProcessedReceipts+=pageProof.processedReceipts;
   unreportedCredits.push(...pageProof.newCredits);
   progress=pageProof.objectives;
   after=pageProof.nextEventSeq;
   // The confirmed checkpoint advances only after successful, session-
   // verified pages. On any later error retry from this confirmed cursor.
   cursor=after;
   if(!pageProof.hasMore){
    // A newly inserted original 15.3 kill must appear in a confirmed
    // 84.3 receipt cursor before reporting synchronized Questbook progress.
    if(cursor<unreconciledReceiptEventSeq){
     needsReplay=true;
     return reject('original_kill_receipts_not_reconciled');
    }
    unreconciledReceiptEventSeq=0;
    needsReplay=false;
    const completeCredits=Object.freeze([...unreportedCredits]);
    const completeProcessed=unreportedProcessedReceipts;
    unreportedCredits=[];
    unreportedCreditKeys=new Set();
    unreportedProcessedReceipts=0;
    return Object.freeze({ok:true,version:'84.4',
     processedReceipts:completeProcessed,confirmedEventSeq:cursor,
     newCredits:completeCredits,objectives:Object.freeze([...progress]),
     progressSynchronized:true,privateServerOnly:true,
     rewardsIssued:false,rewardAuthorized:false,
     questTurnInCommitted:false,productionReady:false});
   }
  }
  return reject('reconciliation_page_budget_exhausted');
 };
 // The original 15.3 writer emits at most one receipt per sealed enemy
 // (<=16), strictly ordered by authoritative event sequence. Treat the
 // returned receipt page as data, never as a claimed count.
 const ownData875=(descriptors,name)=>{
  const descriptor=Object.hasOwn(descriptors,name)?descriptors[name]:null;
  return descriptor&&Object.hasOwn(descriptor,'value')?
   descriptor.value:undefined;
 };
 const committedReceiptCount875=(receipts,latestEventSeq)=>{
  try{
   if(!Array.isArray(receipts)||receipts.length>16)return null;
   const slots=Object.getOwnPropertyDescriptors(receipts);
   const count=ownData875(slots,'length');
   if(!Number.isSafeInteger(count)||count>16||
      count!==receipts.length)return null;
   let previous=0;
   const seen=new Set();
   for(let i=0;i<count;i++){
    const row=ownData875(slots,String(i));
    if(!obj(row))return null;
    const data=Object.getOwnPropertyDescriptors(row);
    const receiptId=ownData875(data,'receiptId');
    const eventSeq=ownData875(data,'eventSeq');
    const enemyId=ownData875(data,'enemyId');
    const tier=ownData875(data,'tier');
    if(typeof receiptId!=='string'||
       !/^worldkill-[a-f0-9]{64}$/.test(receiptId)||
       seen.has(receiptId)||
       !Number.isSafeInteger(eventSeq)||eventSeq<=previous||
       eventSeq>latestEventSeq||
       typeof enemyId!=='string'||
       !/^[A-Za-z0-9_.:-]{1,160}$/.test(enemyId)||
       !['normal','elite','champion','miniBoss'].includes(tier))
     return null;
    seen.add(receiptId);
    previous=eventSeq;
   }
   return Object.freeze({count,maxEventSeq:previous});
  }catch{return null;}
 };
 const commit=async()=>{
  let result;
  try{result=await progressionOps.commitWorldKills()}
  catch{return reject('private_world_kill_commit_unavailable')}
  let receiptProof=null;
  try{
   // One own-data 18.5/15.3 commit response proof, never multiple
   // getter-backed reads of receipt or server reward metadata.
   const commitProof=ownFields876(result,['ok','rewardAuthorized',
    'rewardsIssued','lastSeq','receipts']);
   if(commitProof?.ok===true&&commitProof.rewardAuthorized===false&&
      commitProof.rewardsIssued===false&&
      Number.isSafeInteger(commitProof.lastSeq)&&
      commitProof.lastSeq===lastEventSeq)
    receiptProof=committedReceiptCount875(commitProof.receipts,lastEventSeq);
  }catch{}
  if(receiptProof===null)
   return reject('original_world_kill_commit_unverified');
  unreconciledReceiptEventSeq=Math.max(unreconciledReceiptEventSeq,
   receiptProof.maxEventSeq);
  pendingCommit=false;needsReplay=true;
  return Object.freeze({ok:true,receiptCount:receiptProof.count});
 };
 const advance=()=>serial(async()=>{
  const unavailable=stopReason();if(unavailable)return reject(unavailable);
  if(!await current()){
   if(shutdownRequested)return closed();
   halted=true;return reject('world_session_unverified');
  }
  // If the lease proof was still awaiting authorization when shutdown
  // arrived, do not begin a new original world tick.
  if(shutdownRequested)return closed();
  let tick;
  try{tick=await ownerOps.advance()}
  catch{halted=true;return reject('original_private_world_advance_unavailable')}
  // The private 13.8 owner may settle with an unusual response; take one
  // own-data checkpoint snapshot, not multiple dynamic reads or getters.
  const checkpoint=ownFields876(tick,['ok','rewardsIssued',
   'checkpointDigestRecorded','eventSeq']);
  if(checkpoint?.ok!==true||checkpoint.rewardsIssued!==false||
     checkpoint.checkpointDigestRecorded!==true||
     !Number.isSafeInteger(checkpoint.eventSeq)||
     checkpoint.eventSeq<lastEventSeq){
   // A failed original checkpoint may have applied a tick. Never skip it.
   halted=true;return reject('original_private_world_tick_unverified');
  }
  lastEventSeq=checkpoint.eventSeq;
  pendingCommit=true;
  if(!await current()){
   halted=true;return reject('world_session_changed_after_tick');
  }
  const written=await commit();if(!written.ok)return written;
  const synced=await replay();if(!synced.ok)return synced;
  return Object.freeze({...synced,version:'84.4',
   worldEventSeq:lastEventSeq,killReceiptsCommitted:written.receiptCount,
   checkpointDigestRecorded:true,productionReady:false});
 });
 // Recovery is explicit. Do not advance another world tick until an
 // ambiguous original COMMIT is re-checked and all receipts reconciled.
 const recover=()=>serial(async()=>{
  if(stopped||halted)return reject(stopReason());
  if(!await current()){
   if(shutdownRequested)return closed();
   halted=true;return reject('world_session_unverified');
  }
  if(shutdownRequested)return closed();
  if(pendingCommit){const wrote=await commit();if(!wrote.ok)return wrote;}
  needsReplay=true;
  return replay();
 });
 // The original 84.5 admission supplies this exact privileged context.
 // Preserve its identity for the original 13.7 authentication callback,
 // while deeply copying untrusted command fields before enqueue.
 const snapshotCommand950=args=>{
  try{
   if(!obj(args))return deepData880(args,0,{remaining:8192},new WeakSet());
   const descriptors=Object.getOwnPropertyDescriptors(args);
   if(!Object.hasOwn(descriptors,'serverRequestContext'))
    return deepData880(args,0,{remaining:8192},new WeakSet());
   const auth=descriptors.serverRequestContext;
   if(!Object.hasOwn(auth,'value')||auth.value!==serverRequestContext)
    return INVALID_880;
   const payload=Object.create(null);
   for(const [key,field] of Object.entries(descriptors)){
    if(key==='serverRequestContext')continue;
    if(!Object.hasOwn(field,'value'))return INVALID_880;
    Object.defineProperty(payload,key,{value:field.value,enumerable:true});
   }
   const copy=deepData880(payload,0,{remaining:8192},new WeakSet());
   if(copy===INVALID_880)return INVALID_880;
   const trusted=Object.create(null);
   for(const [key,value] of Object.entries(copy))
    Object.defineProperty(trusted,key,{value,enumerable:true});
   Object.defineProperty(trusted,'serverRequestContext',{
    value:serverRequestContext,enumerable:true,
   });
   return Object.freeze(trusted);
  }catch{return INVALID_880}
 };
 const call=(name,args)=>{
  if(shutdownRequested)return Promise.resolve(closed());
  const input=snapshotCommand950(args);
  if(input===INVALID_880)
   return Promise.resolve(reject('untrusted_private_world_input'));
  return serial(async()=>{
  const unavailable=stopReason();if(unavailable)return reject(unavailable);
  if(!await current()){
   if(shutdownRequested)return closed();
   halted=true;return reject('world_session_unverified');
  }
  if(shutdownRequested)return closed();
  let response;
  try{response=await ownerOps[name](input)}
  catch{halted=true;return reject('private_world_input_unavailable')}
  // A world session may be revoked while the original input is in flight.
  // Revalidate before acknowledging it; never replay an applied input.
  if(shutdownRequested)return closed();
  if(!await current()){
   halted=true;return reject('world_session_changed_after_input');
  }
  // Freeze the complete JSON-shaped original 13.7 response, not only
  // its top-level fields; nested snapshots and events cannot change after
  // a verified world lease/owner acknowledgement.
  let acknowledged=INVALID_880;
  try{acknowledged=deepData880(response,0,
   {remaining:8192},new WeakSet())}catch{}
  if(acknowledged===INVALID_880||acknowledged?.ok!==true||
     acknowledged.rewardsIssued!==false||
     acknowledged.rewardAuthorized===true)
   return reject('private_world_input_refused');
  return acknowledged;
  });
 };
 const shutdown=()=>{
  shutdownRequested=true;
  // Preserve original single-owner queue. Never release the 13.8 world
  // concurrently with an unfinished tick/commit/reconciliation.
  return serial(async()=>{
   if(stopped)return false;
   stopped=true;
   let progressionClosed=true,ownerReleased=false;
   try{await progressionOps.shutdown()}catch{progressionClosed=false}
   // Even if progression shutdown fails, always attempt world release.
   try{ownerReleased=await ownerOps.release()===true}catch{}
   return progressionClosed&&ownerReleased;
  },true);
 };
 return Object.freeze({version:'84.4',advance,recover,shutdown,
  connect:args=>call('connect',args),
  setInput:args=>call('setInput',args),
  submit:args=>call('submit',args),
  poll:args=>call('poll',args),
  disconnect:args=>call('disconnect',args),
  privateServerOnly:true,publicPlayerRouteInstalled:false,
  publicTransportInstalled:false,hostedWorkerInstalled:false,
  independentKillWriterCreated:false,rewardWriterInstalled:false,
  productionReady:false});
}

// This is the ONLY production-shaped construction path for 84.4: it creates
// the existing 18.5 authority (itself built on the original 15.3 writer)
// for this same 13.6 encounter and 13.8 fencing token. No 15.5 writer.
export async function createGame3DPrivateCombatQuestStaging844({
 owner,encounter,scope,worldStage180,serverRequestContext,
 worldKillPool,progressionPool,progressionSchema,
 authorizeServerOperation,resolveTrustedCommittedKill,
 resolveServerKillContext843,now=Date.now,enabled=false,
}={}){
 const pinnedScope=snapshotScope920(scope);
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    !pinnedScope||!obj(serverRequestContext)||
    typeof resolveServerKillContext843!=='function'||
    owner?.instanceId!==pinnedScope.instanceId||
    !Number.isSafeInteger(owner.fencingToken)||
    encounter?.instanceId!==pinnedScope.instanceId||
    encounter?.mapFingerprint!==pinnedScope.mapFingerprint)
  throw Error('84.4 requires a trusted original world and private receipt resolver');
 const progression=await createGame3DPrivateQuestProgression185({
  enabled:true,worldStage180,serverRequestContext,encounter,
  scope:pinnedScope,
  fencingToken:owner.fencingToken,worldKillPool,progressionPool,
  progressionSchema,authorizeServerOperation,resolveTrustedCommittedKill,
  resolveServerKillContext843,now,
 });
 try{return createGame3DPrivateCombatQuestPump844({
  enabled:true,owner,encounter,scope:pinnedScope,progression,worldStage180,
  serverRequestContext,now,
 })}catch(error){progression.shutdown();throw error}
}
