import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame3DPrivateCombatQuestPump844,
 createGame3DPrivateCombatQuestStaging844,GAME3D_844_MAX_REPLAY_PAGES}
 from '../privateCombatQuestScheduler844.mjs';

const prior=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope={ownerId:'owner844',characterId:'hero844',
 holderId:'holder-844',instanceId:'world-instance-844',
 instanceEpoch:'world-epoch-844',mapFingerprint:'a'.repeat(64)};
const ctx=Object.freeze({trustedBackend:'context-844'});
const lease={ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 serverSessionId:'world-session-844',actionSessionId:'qb174-'+'a'.repeat(64),
 leaseNonce:'84484484-8448-4448-8448-844844844844',expiresAtMs:2000000};
const page=(after,changes={})=>({ok:true,version:'84.3',
 processedReceipts:1,nextEventSeq:after+1,hasMore:false,
 newCredits:[{questId:'axe_q_first_patrol',objectiveId:'patrol_kills'}],
 objectives:[{questId:'axe_q_first_patrol',current:1,required:3}],
 rewardsIssued:false,rewardAuthorized:false,questTurnInCommitted:false,
 ...changes});
function fixture({commit=null,reconcile=null,tick=null,serverLease=null,
 scopeOverride=null,ownerOverrides=null,serverContextOverride=null}={}){
 const state={events:[],seq:0,release:0,commits:0,
  pages:[],stopped:false,lease:{...lease}};
 const owner={version:'13.8',privateServerOnly:true,
  publicTransportInstalled:false,instanceId:scope.instanceId,fencingToken:7,
  async advance(){state.events.push('tick');state.seq++;
   return tick?tick(state):{ok:true,eventSeq:state.seq,
    checkpointDigestRecorded:true,rewardsIssued:false};},
  async release(){state.events.push('release');state.release++;return true},
  async connect(x){state.events.push('connect');return {ok:true,x,rewardsIssued:false}},
  async setInput(x){state.events.push('setInput');return {ok:true,x,rewardsIssued:false}},
  async submit(x){state.events.push('submit');return {ok:true,x,rewardsIssued:false}},
  async poll(x){state.events.push('poll');return {ok:true,x,rewardsIssued:false}},
  async disconnect(x){state.events.push('disconnect');return {ok:true,x,rewardsIssued:false}},
 };
 if(ownerOverrides)Object.assign(owner,ownerOverrides(state));
 const encounter={version:'13.6',privateServerOnly:true,
  instanceId:scope.instanceId,mapFingerprint:scope.mapFingerprint};
 const progression={version:'18.5',privateServerOnly:true,
  publicPlayerRouteInstalled:false,independentCombatWriterCreated:false,
  rewardWriterInstalled:false,
  async commitWorldKills(){state.events.push('commit');state.commits++;
   return commit?commit(state):{ok:true,lastSeq:state.seq,receipts:[],
    rewardAuthorized:false,rewardsIssued:false};},
  async reconcileCommittedKills({afterEventSeq}){
   state.events.push('replay');state.pages.push(afterEventSeq);
   return reconcile?reconcile(state,afterEventSeq):page(afterEventSeq);},
  shutdown(){state.events.push('shutdown');state.stopped=true},
 };
 const stage={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   assert.equal(serverRequestContext,serverContextOverride??ctx);
   return serverLease?serverLease(state):state.lease;
  }};
 const pump=createGame3DPrivateCombatQuestPump844({
  enabled:true,owner,encounter,scope:scopeOverride??scope,
  progression,worldStage180:stage,
  serverRequestContext:serverContextOverride??ctx,now:()=>1000000,
 });
 return {state,pump,owner,progression,stage};
}

test('84.4 advances original 13.8 once, commits original 15.3 once, then reconciles',async()=>{
 const h=fixture();const r=await h.pump.advance();
 assert.equal(r.ok,true);assert.equal(r.worldEventSeq,1);
 assert.equal(r.confirmedEventSeq,1);assert.equal(r.progressSynchronized,true);
 assert.equal(r.rewardsIssued,false);
 assert.deepEqual(h.state.events,['tick','commit','replay']);
 assert.equal(h.pump.publicTransportInstalled,false);
 assert.equal(h.pump.independentKillWriterCreated,false);
});

test('84.4 retries replay without advancing a second combat tick',async()=>{
 let n=0;const h=fixture({reconcile:(_s,at)=>{
  n++;return n===1?{ok:false,reason:'lost_pg'}:page(at);
 }});
 const first=await h.pump.advance();
 assert.equal(first.ok,false);assert.equal(first.retryFromEventSeq,0);
 assert.equal((await h.pump.submit({attack:true})).ok,false);
 assert.equal((await h.pump.advance()).ok,false);
 const retry=await h.pump.recover();
 assert.equal(retry.ok,true);assert.equal(retry.confirmedEventSeq,1);
 assert.equal(h.state.commits,1);
 assert.deepEqual(h.state.events,['tick','commit','replay','replay']);
});

test('84.4 ambiguous kill commit must be retried before objective projection',async()=>{
 let n=0;const h=fixture({commit:s=>{
  n++;return n===1?{ok:false,reason:'ambiguous'}:
   {ok:true,lastSeq:s.seq,receipts:[],rewardAuthorized:false,rewardsIssued:false};
 }});
 assert.equal((await h.pump.advance()).ok,false);
 assert.deepEqual(h.state.events,['tick','commit']);
 assert.equal((await h.pump.poll()).ok,false);
 assert.equal((await h.pump.recover()).ok,true);
 assert.deepEqual(h.state.events,['tick','commit','commit','replay']);
 assert.equal(h.state.seq,1);
});

test('84.4 paginates a bounded replay and confirms intermediate cursors',async()=>{
 const h=fixture({tick:s=>{s.seq=20;return {ok:true,eventSeq:20,checkpointDigestRecorded:true,
  rewardsIssued:false}},reconcile:(_s,at)=>page(at,{hasMore:at<17})});
 const first=await h.pump.advance();
 assert.equal(first.ok,false);
 assert.equal(first.reason,'reconciliation_page_budget_exhausted');
 assert.equal(first.retryFromEventSeq,GAME3D_844_MAX_REPLAY_PAGES);
 assert.deepEqual(h.state.pages,[0,1,2,3,4,5,6,7]);
 const second=await h.pump.recover();
 assert.equal(second.ok,false);assert.equal(second.retryFromEventSeq,16);
 const recovered=await h.pump.recover();
 assert.equal(recovered.ok,true);assert.equal(recovered.confirmedEventSeq,18);
 assert.equal(h.state.commits,1);
 assert.equal(h.state.seq,20);
});

test('84.4 refuses forged progress, reward authority, and nonmoving page cursors',async()=>{
 for(const forged of [
  {rewardsIssued:true},{rewardAuthorized:true},
  {hasMore:true,processedReceipts:0,nextEventSeq:0},
  {nextEventSeq:0,processedReceipts:1},
  // A successful-looking empty page must not skip a future receipt.
  {processedReceipts:0,nextEventSeq:1,hasMore:false,newCredits:[]},
  // No PostgreSQL receipts means no newly credited quest objectives.
  {processedReceipts:0,nextEventSeq:0,hasMore:false,
   newCredits:[{questId:'axe_q_first_patrol',objectiveId:'patrol_kills'}]},
 ]){
  const h=fixture({reconcile:(_s,at)=>page(at,forged)});
  const r=await h.pump.advance();assert.equal(r.ok,false);
  assert.equal(r.reason,'untrusted_or_incomplete_reconciliation_page');
  assert.equal(h.state.commits,1);
 }
});


test('87.4 valid empty receipt replay keeps cursor and never fabricates credit',async()=>{
 const h=fixture({reconcile:(_s,at)=>page(at,{
  processedReceipts:0,nextEventSeq:at,hasMore:false,
  newCredits:[],objectives:[],
 })});
 const first=await h.pump.advance();
 assert.equal(first.ok,true);
 assert.equal(first.confirmedEventSeq,0);
 assert.deepEqual(first.newCredits,[]);
 assert.deepEqual(first.objectives,[]);
 assert.equal(first.killReceiptsCommitted,0);
 assert.equal(h.state.commits,1);
 assert.deepEqual(h.state.pages,[0]);
 // Recovery may re-read receipts from the original cursor, not jump
 // over a future kill merely because an earlier read found nothing.
 const recovered=await h.pump.recover();
 assert.equal(recovered.ok,true);
 assert.equal(recovered.confirmedEventSeq,0);
 assert.deepEqual(h.state.pages,[0,0]);
 assert.equal(h.state.commits,1);
});

test('87.5 accepts a valid original 15.3 receipt exactly once',async()=>{
 const receipt=Object.freeze({
  receiptId:'worldkill-'+'a'.repeat(64),eventSeq:1,
  enemyId:'enemy-1',tier:'normal',
 });
 const h=fixture({commit:s=>({
  ok:true,lastSeq:s.seq,receipts:[receipt],
  rewardAuthorized:false,rewardsIssued:false,
 })});
 const result=await h.pump.advance();
 assert.equal(result.ok,true);
 assert.equal(result.killReceiptsCommitted,1);
 assert.equal(h.state.commits,1);
 assert.equal(h.state.seq,1);
});

test('87.5 refuses forged receipt sequence, shape, tier and oversized batches',async()=>{
 const valid={receiptId:'worldkill-'+'a'.repeat(64),
  eventSeq:1,enemyId:'enemy-1',tier:'normal'};
 const invalid=[
  [{...valid,receiptId:'not-a-world-kill'}],
  [{...valid,eventSeq:2}],
  [{...valid,eventSeq:0}],
  [{...valid,enemyId:'<untrusted>'}],
  [{...valid,tier:'unknown'}],
  [valid,{...valid}],
  Array.from({length:17},()=>({...valid})),
 ];
 for(const receipts of invalid){
  const h=fixture({commit:s=>({
   ok:true,lastSeq:s.seq,receipts,
   rewardAuthorized:false,rewardsIssued:false,
  })});
  const result=await h.pump.advance();
  assert.equal(result.ok,false);
  assert.equal(result.reason,'original_world_kill_commit_unverified');
  assert.equal(result.rewardAuthorized,false);
  assert.equal(h.state.commits,1);
  assert.deepEqual(h.state.events,['tick','commit']);
 }
});

test('87.5 receipt property and array index getters are never executed',async()=>{
 let invoked=0;
 const unsafe={receiptId:'worldkill-'+'a'.repeat(64),
  enemyId:'enemy-1',tier:'normal'};
 Object.defineProperty(unsafe,'eventSeq',{get(){invoked++;
  throw Error('untrusted receipt field getter')}});
 const unsafeSlots=[];
 Object.defineProperty(unsafeSlots,0,{get(){invoked++;
  throw Error('untrusted receipt array getter')},enumerable:true});
 unsafeSlots.length=1;
 for(const receipts of [[unsafe],unsafeSlots]){
  const h=fixture({commit:s=>({
   ok:true,lastSeq:s.seq,receipts,
   rewardAuthorized:false,rewardsIssued:false,
  })});
  assert.equal((await h.pump.advance()).reason,
   'original_world_kill_commit_unverified');
  assert.equal(h.state.commits,1);
 }
 assert.equal(invoked,0);
});

test('87.5 receipt verification handles thrown commit metadata accessor safely',async()=>{
 const h=fixture({commit:s=>{
  const response={ok:true,lastSeq:s.seq,receipts:[],
   rewardsIssued:false};
  Object.defineProperty(response,'rewardAuthorized',{get(){
   throw Error('untrusted commit result')}});
  return response;
 }});
 const result=await h.pump.advance();
 assert.equal(result.reason,'original_world_kill_commit_unverified');
 assert.equal(result.ok,false);
 assert.equal(h.state.commits,1);
});

test('87.6 replay proof rejects a top-level getter without executing it',async()=>{
 let getters=0;
 const h=fixture({reconcile:(_s,at)=>{
  const result=page(at);
  Object.defineProperty(result,'processedReceipts',{get(){getters++;
   throw Error('untrusted replay page getter')}});
  return result;
 }});
 const result=await h.pump.advance();
 assert.equal(result.reason,'untrusted_or_incomplete_reconciliation_page');
 assert.equal(result.ok,false);
 assert.equal(getters,0);
 assert.equal(h.state.commits,1);
});

test('87.6 untrusted credit and objective array getters fail closed',async()=>{
 let getters=0;
 for(const property of ['newCredits','objectives']){
  const h=fixture({reconcile:(_s,at)=>{
   const array=[];
   Object.defineProperty(array,0,{enumerable:true,get(){getters++;
    throw Error('untrusted replay array element')}});
   array.length=1;
   return page(at,{[property]:array});
  }});
  const result=await h.pump.advance();
  assert.equal(result.reason,'untrusted_or_incomplete_reconciliation_page');
  assert.equal(h.state.commits,1);
 }
 assert.equal(getters,0);
});

test('87.6 snapshot credit array cannot change while post-page lease is awaited',async()=>{
 const originalCredit=Object.freeze({questId:'first_credited_quest'});
 const credits=[originalCredit];
 const h=fixture({
  reconcile:(_s,at)=>page(at,{newCredits:credits}),
  serverLease:s=>{
   if(s.events.includes('replay'))credits[0]={questId:'forged_after_page'};
   return s.lease;
  },
 });
 const result=await h.pump.advance();
 assert.equal(result.ok,true);
 assert.equal(result.newCredits[0]===originalCredit,false);
 assert.equal(result.newCredits[0].questId,'first_credited_quest');
 assert.equal(Object.isFrozen(result.newCredits[0]),true);
 assert.equal(h.state.commits,1);
});

test('87.6 sparse and oversized original replay arrays are rejected',async()=>{
 const invalid=[Array(1),Array(4097)];
 for(const array of invalid){
  const h=fixture({reconcile:(_s,at)=>page(at,{newCredits:array})});
  const r=await h.pump.advance();
  assert.equal(r.reason,'untrusted_or_incomplete_reconciliation_page');
  assert.equal(h.state.commits,1);
 }
});

test('84.4 refuses world session rotation after initial commit',async()=>{
 const h=fixture({reconcile:s=>{
  s.lease={...lease,leaseNonce:'74484484-8448-4448-8448-844844844844'};
  return page(0);
 }});
 const r=await h.pump.advance();assert.equal(r.ok,false);
 assert.equal(r.reason,'world_session_changed_during_reconciliation');
 assert.equal((await h.pump.recover()).ok,false);
 assert.equal(h.state.commits,1);
});

test('84.4 does not advance after a failed owner checkpoint',async()=>{
 const h=fixture({tick:s=>({ok:false,eventSeq:s.seq,rewardsIssued:false})});
 assert.equal((await h.pump.advance()).ok,false);
 assert.equal((await h.pump.recover()).ok,false);
 assert.deepEqual(h.state.events,['tick']);
});

test('84.4 shares a serial boundary with all owner input calls',async()=>{
 const h=fixture();
 const all=await Promise.all([h.pump.setInput({m:1}),h.pump.advance(),
  h.pump.poll()]);
 assert.equal(all[0].ok,true);assert.equal(all[1].ok,true);
 assert.equal(all[2].ok,true);
 assert.deepEqual(h.state.events,['setInput','tick','commit','replay','poll']);
});

test('84.4 shutdown releases original owner once and rejects new work',async()=>{
 const h=fixture();
 assert.equal(await h.pump.shutdown(),true);
 assert.equal(await h.pump.shutdown(),false);
 assert.deepEqual(h.state.events,['shutdown','release']);
 assert.equal((await h.pump.advance()).ok,false);
 assert.equal(h.state.release,1);
});

test('84.4 refuses bad wiring, default-disabled staging and missing private resolver',async()=>{
 const h=fixture();assert.throws(()=>createGame3DPrivateCombatQuestPump844(),
  /one original, trusted private combat world/);
 await assert.rejects(createGame3DPrivateCombatQuestStaging844(),
  /trusted original world and private receipt resolver/);
 assert.equal(GAME3D_844_MAX_REPLAY_PAGES,8);
 assert.equal(h.pump.hostedWorkerInstalled,false);
 assert.throws(()=>createGame3DPrivateCombatQuestPump844({
  enabled:true,scope:{...scope,holderId:undefined},
 }),/one original, trusted private combat world/);
});

test('87.7 snapshots a normal original 13.8 checkpoint once',async()=>{
 const h=fixture({tick:s=>({ok:true,eventSeq:s.seq,
  checkpointDigestRecorded:true,rewardsIssued:false})});
 const result=await h.pump.advance();
 assert.equal(result.ok,true);
 assert.equal(result.worldEventSeq,1);
 assert.equal(h.state.commits,1);
});

test('87.7 tick checkpoint accessor is not executed or accepted',async()=>{
 let getterCalls=0;
 const h=fixture({tick:s=>{
  const checkpoint={ok:true,checkpointDigestRecorded:true,rewardsIssued:false};
  Object.defineProperty(checkpoint,'eventSeq',{get(){
   getterCalls++;throw Error('unsafe tick getter');
  }});
  return checkpoint;
 }});
 const result=await h.pump.advance();
 assert.equal(result.reason,'original_private_world_tick_unverified');
 assert.equal(getterCalls,0);
 assert.equal(h.state.commits,0);
 assert.equal((await h.pump.advance()).reason,
  'private_combat_quest_scheduler_halted');
});

test('87.7 rejects inherited checkpoint sequence and descriptor traps',async()=>{
 for(const build of [
  s=>Object.assign(Object.create({eventSeq:s.seq}),
   {ok:true,checkpointDigestRecorded:true,rewardsIssued:false}),
  s=>new Proxy({ok:true,eventSeq:s.seq,
   checkpointDigestRecorded:true,rewardsIssued:false},{
    ownKeys(){throw Error('checkpoint descriptors unavailable')}
   }),
 ]){
  const h=fixture({tick:build});
  const result=await h.pump.advance();
  assert.equal(result.reason,'original_private_world_tick_unverified');
  assert.equal(h.state.commits,0);
 }
});

test('87.7 unsafe tick reward metadata fails closed before kill commit',async()=>{
 const h=fixture({tick:s=>{
  const checkpoint={ok:true,eventSeq:s.seq,
   checkpointDigestRecorded:true};
  Object.defineProperty(checkpoint,'rewardsIssued',{get(){
   throw Error('unsafe reward claim');
  }});
  return checkpoint;
 }});
 const result=await h.pump.advance();
 assert.equal(result.ok,false);
 assert.equal(result.rewardAuthorized,false);
 assert.equal(h.state.commits,0);
});

test('87.8 freezes an original input acknowledgement instead of sharing mutable fields',async()=>{
 const ownerResult={ok:true,rewardsIssued:false,seq:11};
 const h=fixture({ownerOverrides:state=>({connect:async()=>{
  state.events.push('connect');return ownerResult;
 }})});
 const returned=await h.pump.connect({});
 assert.equal(returned.ok,true);
 assert.equal(returned.seq,11);
 assert.equal(Object.isFrozen(returned),true);
 ownerResult.seq=99;
 assert.equal(returned.seq,11);
 assert.equal(h.state.commits,0);
});

test('87.8 rejects accessor metadata without invoking a property getter',async()=>{
 let getterCalls=0;
 const forged={rewardsIssued:false};
 Object.defineProperty(forged,'ok',{get(){getterCalls++;
  throw Error('hostile player response getter')}});
 const h=fixture({ownerOverrides:state=>({connect:async()=>{
  state.events.push('connect');return forged;
 }})});
 const returned=await h.pump.connect({});
 assert.equal(returned.reason,'private_world_input_refused');
 assert.equal(returned.rewardAuthorized,false);
 assert.equal(getterCalls,0);
});

test('87.8 fails closed for inherited, revoked or reward-authorizing inputs',async()=>{
 const cases=[
  Object.assign(Object.create({ok:true}),{rewardsIssued:false}),
  {ok:true,rewardsIssued:false,rewardAuthorized:true},
  new Proxy({ok:true,rewardsIssued:false},{ownKeys(){
   throw Error('untrusted input descriptor provider');
  }}),
 ];
 for(const candidate of cases){
  const h=fixture({ownerOverrides:()=>({submit:async()=>candidate})});
  const returned=await h.pump.submit({seq:7});
  assert.equal(returned.ok,false);
  assert.equal(returned.reason,'private_world_input_refused');
  assert.equal(h.state.commits,0);
 }
});

test('87.9 newly committed kill cannot claim synced quest progress without its receipt',async()=>{
 let reads=0;
 const h=fixture({
  commit:s=>({ok:true,lastSeq:s.seq,rewardAuthorized:false,
   rewardsIssued:false,receipts:[{
    receiptId:'worldkill-'+'a'.repeat(64),eventSeq:s.seq,
    enemyId:'enemy-1',tier:'normal',
   }]}),
  reconcile:(_s,after)=>{
   reads++;
   return reads===1?page(after,{processedReceipts:0,
    nextEventSeq:after,newCredits:[],objectives:[],hasMore:false}):
    page(after);
  },
 });
 const first=await h.pump.advance();
 assert.equal(first.reason,'original_kill_receipts_not_reconciled');
 assert.equal(first.ok,false);
 assert.equal(first.retryFromEventSeq,0);
 assert.equal(h.state.commits,1);
 assert.deepEqual(h.state.events,['tick','commit','replay']);
 assert.equal((await h.pump.advance()).reason,'quest_reconciliation_required');
 const restored=await h.pump.recover();
 assert.equal(restored.ok,true);
 assert.equal(restored.confirmedEventSeq,1);
 assert.equal(h.state.commits,1);
 assert.equal(reads,2);
});

test('87.9 receipt watermark uses the last committed event even with older replay',async()=>{
 let calls=0;
 const h=fixture({
  tick:s=>{s.seq=3;return {ok:true,eventSeq:3,
   checkpointDigestRecorded:true,rewardsIssued:false}},
  commit:s=>({ok:true,lastSeq:s.seq,rewardAuthorized:false,
   rewardsIssued:false,receipts:[
    {receiptId:'worldkill-'+'a'.repeat(64),eventSeq:1,
     enemyId:'enemy-1',tier:'normal'},
    {receiptId:'worldkill-'+'b'.repeat(64),eventSeq:3,
     enemyId:'enemy-2',tier:'elite'},
   ]}),
  reconcile:(_s,at)=>{
   calls++;
   return calls===1?page(at,{nextEventSeq:1}):
    page(at,{nextEventSeq:3});
  },
 });
 assert.equal((await h.pump.advance()).reason,'original_kill_receipts_not_reconciled');
 assert.equal((await h.pump.recover()).ok,true);
 assert.equal(h.state.commits,1);
 assert.equal(h.state.pages.length,2);
 assert.deepEqual(h.state.pages,[0,1]);
});

test('88.0 deeply pins nested quest credits and objective fields',async()=>{
 const credit={questId:'first_quest',details:{step:1,labels:['first','boss']}};
 const objective={questId:'first_quest',status:{stage:'active'}};
 const h=fixture({reconcile:(_s,at)=>page(at,{
  newCredits:[credit],objectives:[objective],
 })});
 const result=await h.pump.advance();
 assert.equal(result.ok,true);
 assert.equal(result.newCredits[0].details.step,1);
 assert.equal(result.objectives[0].status.stage,'active');
 assert.equal(Object.isFrozen(result.newCredits[0].details),true);
 assert.equal(Object.isFrozen(result.newCredits[0].details.labels),true);
 assert.equal(Object.isFrozen(result.objectives[0].status),true);
 credit.details.step=9;credit.details.labels[0]='changed';
 objective.status.stage='forged';
 assert.equal(result.newCredits[0].details.step,1);
 assert.equal(result.newCredits[0].details.labels[0],'first');
 assert.equal(result.objectives[0].status.stage,'active');
});

test('88.0 refuses nested getter without invoking it',async()=>{
 let unsafeGetter=0;
 const hostile={questId:'first_quest'};
 Object.defineProperty(hostile,'amount',{get(){
  unsafeGetter++;throw Error('untrusted nested getter');
 }});
 const h=fixture({reconcile:(_s,at)=>page(at,{newCredits:[hostile]})});
 const result=await h.pump.advance();
 assert.equal(result.reason,'untrusted_or_incomplete_reconciliation_page');
 assert.equal(unsafeGetter,0);
 assert.equal(h.state.commits,1);
});

test('88.0 cyclical replay payload cannot publish unbounded credits',async()=>{
 const cyclical={questId:'first_quest'};cyclical.self=cyclical;
 const h=fixture({reconcile:(_s,at)=>page(at,{objectives:[cyclical]})});
 const result=await h.pump.advance();
 assert.equal(result.reason,'untrusted_or_incomplete_reconciliation_page');
 assert.equal(result.rewardAuthorized,false);
});

test('88.0 nested custom prototype cannot masquerade as JSON quest data',async()=>{
 const payload=Object.create({inheritedCredit:'forged'});
 payload.questId='quest_1';
 const h=fixture({reconcile:(_s,at)=>page(at,{newCredits:[payload]})});
 const result=await h.pump.advance();
 assert.equal(result.reason,'untrusted_or_incomplete_reconciliation_page');
 assert.equal(h.state.commits,1);
});

test('89.0 queued player input cannot be rewritten while original tick holds lane',async()=>{
 let unpause;
 const gate=new Promise(resolve=>{unpause=resolve});
 let observed=null;
 const h=fixture({tick:s=>gate.then(()=>({
  ok:true,eventSeq:s.seq,checkpointDigestRecorded:true,rewardsIssued:false,
 })),ownerOverrides:state=>({setInput:async input=>{
  state.events.push('setInput');observed=input;
  return {ok:true,rewardsIssued:false};
 }})});
 const original={input:{movement:{x:1,y:2}}};
 const advance=h.pump.advance();
 const queued=h.pump.setInput(original);
 original.input.movement.x=999;
 unpause();
 assert.equal((await advance).ok,true);
 assert.equal((await queued).ok,true);
 assert.equal(observed.input.movement.x,1);
 assert.equal(Object.isFrozen(observed),true);
 assert.equal(Object.isFrozen(observed.input.movement),true);
});

test('89.0 hostile nested input getter never executes original owner command',async()=>{
 let invoked=0;
 const badInput={};
 Object.defineProperty(badInput,'action',{get(){invoked++;
  throw Error('hostile queued getter');
 }});
 const h=fixture();
 assert.equal((await h.pump.submit(badInput)).reason,'untrusted_private_world_input');
 assert.equal(invoked,0);
 assert.deepEqual(h.state.events,[]);
 assert.equal(h.state.commits,0);
});

test('89.0 queued input refuses cyclic or non-JSON instances',async()=>{
 const cyclic={kind:'strike'};cyclic.self=cyclic;
 for(const input of [cyclic,{when:new Date(0)},Object.create({kind:'strike'})]){
  const h=fixture();
  const result=await h.pump.setInput(input);
  assert.equal(result.reason,'untrusted_private_world_input');
  assert.deepEqual(h.state.events,[]);
 }
});

test('90.0 preserves verified credit notifications across transient replay failure',async()=>{
 let reads=0;
 const h=fixture({
  tick:s=>{s.seq=3;return {ok:true,eventSeq:3,
   checkpointDigestRecorded:true,rewardsIssued:false}},
  reconcile:(_s,at)=>{
   reads++;
   if(reads===1)return page(at,{hasMore:true,
    nextEventSeq:1,newCredits:[{questId:'first_committed'}]});
   if(reads===2)return {ok:false,reason:'transient_progression_down'};
   return page(at,{nextEventSeq:3,hasMore:false,
    newCredits:[{questId:'second_committed'}]});
  },
 });
 const first=await h.pump.advance();
 assert.equal(first.ok,false);
 assert.equal(first.reason,'untrusted_or_incomplete_reconciliation_page');
 assert.equal(first.retryFromEventSeq,1);
 assert.equal(first.newCredits,undefined);
 const restored=await h.pump.recover();
 assert.equal(restored.ok,true);
 assert.equal(restored.processedReceipts,2);
 assert.equal(restored.confirmedEventSeq,3);
 assert.equal(restored.newCredits.length,2);
 assert.equal(restored.newCredits[0].questId,'first_committed');
 assert.equal(restored.newCredits[1].questId,'second_committed');
 assert.equal(h.state.commits,1);
 assert.deepEqual(h.state.pages,[0,1,1]);
});

test('90.0 full multi-page replay acknowledges each credited quest once',async()=>{
 const h=fixture({
  tick:s=>{s.seq=2;return {ok:true,eventSeq:2,
   checkpointDigestRecorded:true,rewardsIssued:false}},
  reconcile:(_s,at)=>at===0?
   page(at,{nextEventSeq:1,hasMore:true,
    newCredits:[{questId:'quest_a'}]}):
   at===1?page(at,{nextEventSeq:2,hasMore:false,
    newCredits:[{questId:'quest_b'}]}):
   page(at,{processedReceipts:0,nextEventSeq:at,
    newCredits:[],objectives:[],hasMore:false}),
 });
 const result=await h.pump.advance();
 assert.equal(result.ok,true);
 assert.equal(result.processedReceipts,2);
 assert.equal(result.newCredits.length,2);
 assert.equal(result.newCredits[0].questId,'quest_a');
 assert.equal(result.newCredits[1].questId,'quest_b');
 assert.equal((await h.pump.recover()).newCredits.length,0);
 assert.equal(h.state.commits,1);
});

test('90.0 refused replay cannot expose deferred credits on session revocation',async()=>{
 const h=fixture({
  tick:s=>{s.seq=2;return {ok:true,eventSeq:2,
   checkpointDigestRecorded:true,rewardsIssued:false}},
  reconcile:(_s,at)=>page(at,{hasMore:at===0,nextEventSeq:at+1,
   newCredits:[{questId:at===0?'pending_credit':'second_credit'}]}),
  serverLease:s=>{
   if(s.pages.length>=2)return {...s.lease,
    leaseNonce:'74484484-8448-4448-8448-844844844844'};
   return s.lease;
  },
 });
 const result=await h.pump.advance();
 assert.equal(result.ok,false);
 assert.equal(result.rewardAuthorized,false);
 assert.equal(result.newCredits,undefined);
 assert.equal((await h.pump.recover()).ok,false);
 assert.equal(h.state.commits,1);
});

test('91.0 a duplicate original progress increment inside one page is refused',async()=>{
 const credit={questId:'quest_one',objectiveId:'kill_count',count:1};
 const h=fixture({reconcile:(_s,at)=>page(at,{
  newCredits:[credit,{...credit}],
 })});
 const r=await h.pump.advance();
 assert.equal(r.reason,'duplicate_original_quest_credit_projection');
 assert.equal(r.retryFromEventSeq,0);
 assert.equal(h.state.commits,1);
 assert.equal(r.newCredits,undefined);
});

test('91.0 replay recovery preserves unique increments while rejecting repeat count',async()=>{
 let reads=0;
 const one={questId:'quest_one',objectiveId:'kills',count:1};
 const two={questId:'quest_one',objectiveId:'kills',count:2};
 const h=fixture({
  tick:s=>{s.seq=2;return {ok:true,eventSeq:2,
   checkpointDigestRecorded:true,rewardsIssued:false}},
  reconcile:(_s,at)=>{
   reads++;
   if(reads===1)return page(at,{nextEventSeq:1,
    hasMore:true,newCredits:[one]});
   if(reads===2)return page(at,{nextEventSeq:2,
    newCredits:[one]});
   return page(at,{nextEventSeq:2,newCredits:[two]});
  },
 });
 const first=await h.pump.advance();
 assert.equal(first.reason,'duplicate_original_quest_credit_projection');
 assert.equal(first.retryFromEventSeq,1);
 const restored=await h.pump.recover();
 assert.equal(restored.ok,true);
 assert.equal(restored.newCredits.length,2);
 assert.equal(restored.newCredits[0].count,1);
 assert.equal(restored.newCredits[1].count,2);
 assert.equal(h.state.commits,1);
 assert.deepEqual(h.state.pages,[0,1,1]);
});

test('91.0 same objective count in different quests is not a duplicate',async()=>{
 const h=fixture({reconcile:(_s,at)=>page(at,{newCredits:[
  {questId:'quest_one',objectiveId:'kills',count:1},
  {questId:'quest_two',objectiveId:'kills',count:1},
 ]})});
 const r=await h.pump.advance();
 assert.equal(r.ok,true);
 assert.equal(r.newCredits.length,2);
});

test('92.0 original world scope cannot be mutated after scheduler wiring',async()=>{
 const mutableScope={...scope};
 const h=fixture({scopeOverride:mutableScope});
 mutableScope.ownerId='forged_player';
 mutableScope.characterId='forged_character';
 mutableScope.instanceId='forged-world';
 const result=await h.pump.advance();
 assert.equal(result.ok,true);
 assert.equal(result.confirmedEventSeq,1);
 assert.equal(h.state.commits,1);
});

test('92.0 hostile scope accessor cannot execute during constructor',()=>{
 let getterCalls=0;
 const forged={...scope};
 Object.defineProperty(forged,'ownerId',{get(){getterCalls++;
  throw Error('hostile scope getter');
 }});
 assert.throws(()=>fixture({scopeOverride:forged}),
  /one original, trusted private combat world/);
 assert.equal(getterCalls,0);
});

test('92.0 missing own scope identity and descriptor traps fail closed',()=>{
 const inherited=Object.assign(Object.create({ownerId:scope.ownerId}),scope);
 delete inherited.ownerId;
 assert.throws(()=>fixture({scopeOverride:inherited}),
  /one original, trusted private combat world/);
 const trap=new Proxy({...scope},{ownKeys(){
  throw Error('untrusted scope descriptor source');
 }});
 assert.throws(()=>fixture({scopeOverride:trap}),
  /one original, trusted private combat world/);
});

test('93.0 original committed receipt getter cannot execute during proof',async()=>{
 let getters=0;
 const h=fixture({commit:s=>{
  const result={ok:true,lastSeq:s.seq,
   rewardAuthorized:false,rewardsIssued:false};
  Object.defineProperty(result,'receipts',{get(){getters++;
   throw Error('malicious receipt getter');
  }});
  return result;
 }});
 const denied=await h.pump.advance();
 assert.equal(denied.reason,'original_world_kill_commit_unverified');
 assert.equal(getters,0);
 assert.equal(h.state.commits,1);
});

test('93.0 inherited trusted commit sequence is not accepted',async()=>{
 const h=fixture({commit:s=>Object.assign(
  Object.create({lastSeq:s.seq}),{
   ok:true,receipts:[],rewardAuthorized:false,rewardsIssued:false,
  })});
 const denied=await h.pump.advance();
 assert.equal(denied.reason,'original_world_kill_commit_unverified');
 assert.equal(h.state.commits,1);
});

test('93.0 descriptor trap is refused without claiming committed credit',async()=>{
 const h=fixture({commit:s=>new Proxy({
  ok:true,lastSeq:s.seq,receipts:[],rewardAuthorized:false,
  rewardsIssued:false,
 },{ownKeys(){throw Error('untrusted commit proof provider')}})});
 const result=await h.pump.advance();
 assert.equal(result.reason,'original_world_kill_commit_unverified');
 assert.equal(result.killReceiptsCommitted,undefined);
 assert.equal(result.rewardAuthorized,false);
});

test('93.0 irrelevant original commit accessor cannot rewrite receipt proof',async()=>{
 let invoked=0;
 const h=fixture({commit:s=>{
  const result={ok:true,lastSeq:s.seq,receipts:[],
   rewardAuthorized:false,rewardsIssued:false};
  Object.defineProperty(result,'debug',{get(){invoked++;
   throw Error('unrelated diagnostic');
  }});
  return result;
 }});
 assert.equal((await h.pump.advance()).ok,true);
 assert.equal(invoked,0);
 assert.equal(h.state.commits,1);
});

test('94.0 original world tick callable cannot be swapped after authorization',async()=>{
 const h=fixture();let forgedTicks=0;
 h.owner.advance=async()=>{forgedTicks++;
  return {ok:true,eventSeq:999,checkpointDigestRecorded:true,
   rewardsIssued:false}};
 const r=await h.pump.advance();
 assert.equal(r.ok,true);
 assert.equal(r.worldEventSeq,1);
 assert.equal(forgedTicks,0);
 assert.equal(h.state.commits,1);
});

test('94.0 original PostgreSQL commit and Questbook replay callables are pinned',async()=>{
 const h=fixture();let forgedCommits=0,forgedReplays=0;
 h.progression.commitWorldKills=async()=>{forgedCommits++;
  return {ok:true,lastSeq:999,receipts:[],
   rewardsIssued:false,rewardAuthorized:false}};
 h.progression.reconcileCommittedKills=async()=>{forgedReplays++;
  return {ok:false}};
 assert.equal((await h.pump.advance()).ok,true);
 assert.equal(forgedCommits,0);
 assert.equal(forgedReplays,0);
 assert.equal(h.state.commits,1);
});

test('94.0 original world lease resolver and shutdown methods remain pinned',async()=>{
 const h=fixture();let forgedLease=0,forgedClose=0;
 h.stage.resolveCurrentWorldLease183=async()=>{forgedLease++;return null};
 h.progression.shutdown=async()=>{forgedClose++};
 h.owner.release=async()=>{forgedClose++;return true};
 assert.equal((await h.pump.connect({})).ok,true);
 assert.equal(await h.pump.shutdown(),true);
 assert.equal(forgedLease,0);
 assert.equal(forgedClose,0);
 assert.equal(h.state.release,1);
 assert.equal(h.state.stopped,true);
});

test('95.0 preserves exact authenticated server context for original 13.7 world input',async()=>{
 const specialContext={validate(){return true},secretContext:'trusted-only'};
 let observed=null;
 const h=fixture({serverContextOverride:specialContext,
  ownerOverrides:()=>({connect:async args=>{
   observed=args;
   return {ok:true,rewardsIssued:false,connectionId:'safe-world'};
  }})});
 const command={serverRequestContext:specialContext,input:{move:{x:2}}};
 const result=await h.pump.connect(command);
 assert.equal(result.ok,true);
 assert.equal(observed.serverRequestContext,specialContext);
 assert.equal(observed.input.move.x,2);
 assert.equal(Object.isFrozen(observed.input.move),true);
 command.input.move.x=999;
 assert.equal(observed.input.move.x,2);
});

test('95.0 rejects foreign or getter-backed server authorization context',async()=>{
 const specialContext={privileged:true};
 let calls=0,getterCalls=0;
 const h=fixture({serverContextOverride:specialContext,
  ownerOverrides:()=>({connect:async()=>{
   calls++;return {ok:true,rewardsIssued:false};
  }})});
 assert.equal((await h.pump.connect({
  serverRequestContext:{privileged:true},
 })).reason,'untrusted_private_world_input');
 const unsafe={};
 Object.defineProperty(unsafe,'serverRequestContext',{get(){
  getterCalls++;throw Error('hostile auth context getter');
 }});
 assert.equal((await h.pump.connect(unsafe)).reason,
  'untrusted_private_world_input');
 assert.equal(calls,0);
 assert.equal(getterCalls,0);
});

test('95.0 nested owner snapshot is immutable after successful acknowledgement',async()=>{
 const mutableResponse={ok:true,rewardsIssued:false,
  snapshot:{player:{hp:30},events:[{eventSeq:1}]}};
 const h=fixture({ownerOverrides:()=>({
  poll:async()=>mutableResponse,
 })});
 const result=await h.pump.poll({});
 assert.equal(result.ok,true);
 assert.equal(Object.isFrozen(result.snapshot),true);
 assert.equal(Object.isFrozen(result.snapshot.player),true);
 assert.equal(Object.isFrozen(result.snapshot.events[0]),true);
 mutableResponse.snapshot.player.hp=1;
 mutableResponse.snapshot.events[0].eventSeq=999;
 assert.equal(result.snapshot.player.hp,30);
 assert.equal(result.snapshot.events[0].eventSeq,1);
});

test('95.0 rejects unsafe nested owner acknowledgement without executing getter',async()=>{
 let invoked=0;
 const nested={player:{hp:10}};
 Object.defineProperty(nested.player,'secret',{get(){invoked++;
  throw Error('late snapshot getter');
 }});
 const h=fixture({ownerOverrides:()=>({poll:async()=>({
  ok:true,rewardsIssued:false,snapshot:nested,
 })})});
 const result=await h.pump.poll({});
 assert.equal(result.reason,'private_world_input_refused');
 assert.equal(invoked,0);
});

test('95.0 rejects oversized primitive-key commands before the original owner',async()=>{
 const wide={};
 for(let index=0;index<257;index++)wide['field'+index]=index;
 const h=fixture();
 const denied=await h.pump.submit({intent:wide});
 assert.equal(denied.reason,'untrusted_private_world_input');
 assert.deepEqual(h.state.events,[]);
 assert.equal(h.state.commits,0);
});

test('95.0 limits long player command strings without invoking a world input',async()=>{
 const h=fixture();
 const denied=await h.pump.setInput({input:{
  message:'x'.repeat(65537),
 }});
 assert.equal(denied.reason,'untrusted_private_world_input');
 assert.deepEqual(h.state.events,[]);
});

test('95.0 counts primitive leaves in queued commands',async()=>{
 const h=fixture();
 const many={
  first:Array.from({length:4096},()=>1),
  second:Array.from({length:4096},()=>2),
 };
 const denied=await h.pump.submit({intent:many});
 assert.equal(denied.reason,'untrusted_private_world_input');
 assert.deepEqual(h.state.events,[]);
});

test('95.0 rejects an over-budget nested quest-credit projection',async()=>{
 const excessive=Array.from({length:5},(_,i)=>({
  questId:'quest_'+i,description:'x'.repeat(65536),
 }));
 const h=fixture({reconcile:(_s,at)=>page(at,{newCredits:excessive})});
 const denied=await h.pump.advance();
 assert.equal(denied.reason,'untrusted_or_incomplete_reconciliation_page');
 assert.equal(denied.retryFromEventSeq,0);
 assert.equal(h.state.commits,1);
});

test('95.0 accepts bounded nested player snapshots with unchanged semantics',async()=>{
 const h=fixture({ownerOverrides:()=>({poll:async()=>({
  ok:true,rewardsIssued:false,
  snapshot:{player:{hp:80},events:[{kind:'hit',note:'x'.repeat(1024)}]},
 })})});
 const acknowledged=await h.pump.poll({});
 assert.equal(acknowledged.ok,true);
 assert.equal(acknowledged.snapshot.player.hp,80);
 assert.equal(acknowledged.snapshot.events[0].note.length,1024);
 assert.equal(Object.isFrozen(acknowledged.snapshot.events[0]),true);
});

test('84.4 staging factory has one original writer and no public routes',()=>{
 const source=readFileSync(new URL('../privateCombatQuestScheduler844.mjs',import.meta.url),'utf8');
 assert.match(source,/createGame3DPrivateQuestProgression185/);
 assert.match(source,/fencingToken:owner\.fencingToken/);
 assert.match(source,/resolveServerKillContext843/);
 assert.doesNotMatch(source,/createGame3DPrivateCombatQuestScheduler155/);
 assert.doesNotMatch(source,/app\.post\s*\(/);
});

process.on('exit',()=>{
 if(prior===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=prior;
});
