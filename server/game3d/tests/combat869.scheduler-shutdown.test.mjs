// Combat / Quest 86.9 — original 84.4 scheduler shutdown response fence.
// Uses the REAL 84.4 pump; only the original 13.8 owner, original 18.5
// PostgreSQL progression, and independently trusted 18.3 lease are fixtures.
// No live game, fake reward writer, or second combat owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateCombatQuestPump844}
 from '../privateCombatQuestScheduler844.mjs';

const previous=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope=Object.freeze({ownerId:'owner869',characterId:'hero869',
 holderId:'holder-869',instanceId:'world-instance-869',
 instanceEpoch:'world-epoch-869',mapFingerprint:'e'.repeat(64)});
const context=Object.freeze({server:'private-869'});
const lease=()=>({ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 serverSessionId:'world-session-869',
 actionSessionId:'qb174-'+'f'.repeat(64),
 leaseNonce:'86986986-9869-4869-8869-869869869869',
 expiresAtMs:1090000});
const latch=()=>{let release;const promise=new Promise(r=>{release=r});
 return {promise,release}};
const until=async predicate=>{
 for(let n=0;n<300;n++){
  if(predicate())return;
  await new Promise(resolve=>setImmediate(resolve));
 }
 throw Error('original backend operation did not start');
};
const page=(at)=>({
 ok:true,version:'84.3',processedReceipts:1,nextEventSeq:at+1,
 hasMore:false,newCredits:[{questId:'axe_q_first_patrol',
  objectiveId:'patrol_kills'}],
 objectives:[{questId:'axe_q_first_patrol',objectiveId:'patrol_kills',
  current:1,required:3,status:'accepted'}],
 rewardsIssued:false,rewardAuthorized:false,questTurnInCommitted:false,
});
function setup(){
 const state={calls:[],seq:0,hold:{},leaseCount:0,holdLeaseAt:0,
  progressShutdownCount:0,ownerReleaseCount:0,
  throwProgressShutdown:false,throwRelease:false,returnRelease:true,
  throwWorldCall:null,commits:0,replays:0};
 const entry=async operation=>{
  state.calls.push(operation);
  if(state.hold[operation])await state.hold[operation];
  if(state.throwWorldCall===operation)throw Error('original operation unavailable');
 };
 const owner={version:'13.8',privateServerOnly:true,
  publicTransportInstalled:false,instanceId:scope.instanceId,fencingToken:7,
  async advance(){await entry('tick');state.seq++;
   return {ok:true,eventSeq:state.seq,
    checkpointDigestRecorded:true,rewardsIssued:false}},
  async connect(){await entry('connect');return {ok:true,rewardsIssued:false}},
  async setInput(){await entry('setInput');return {ok:true,rewardsIssued:false}},
  async submit(){await entry('submit');return {ok:true,rewardsIssued:false}},
  async poll(){await entry('poll');return {ok:true,rewardsIssued:false}},
  async disconnect(){await entry('disconnect');return {ok:true,rewardsIssued:false}},
  async release(){state.calls.push('release');state.ownerReleaseCount++;
   if(state.throwRelease)throw Error('original release failed');
   return state.returnRelease!==false},
 };
 const progression={version:'18.5',privateServerOnly:true,
  publicPlayerRouteInstalled:false,independentCombatWriterCreated:false,
  rewardWriterInstalled:false,
  async commitWorldKills(){state.commits++;
   await entry('commit');
   return {ok:true,lastSeq:state.seq,receipts:[],
    rewardsIssued:false,rewardAuthorized:false}},
  async reconcileCommittedKills({afterEventSeq}){state.replays++;
   await entry('replay');return page(afterEventSeq)},
  async shutdown(){state.calls.push('progression_shutdown');
   state.progressShutdownCount++;
   if(state.throwProgressShutdown)throw Error('PG lease close unavailable')},
 };
 const encounter={version:'13.6',privateServerOnly:true,
  instanceId:scope.instanceId,mapFingerprint:scope.mapFingerprint};
 const stage={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   assert.equal(serverRequestContext,context);
   state.leaseCount++;
   if(state.holdLeaseAt===state.leaseCount&&state.hold.lease)
    await state.hold.lease;
   return lease();
  },
 };
 const pump=createGame3DPrivateCombatQuestPump844({
  enabled:true,owner,encounter,scope,progression,worldStage180:stage,
  serverRequestContext:context,now:()=>1000000,
 });
 return {pump,state};
}
test('86.9 normal original tick persists one commit and objective replay',async()=>{
 const {pump,state}=setup();
 const r=await pump.advance();
 assert.equal(r.ok,true);
 assert.equal(r.worldEventSeq,1);
 assert.equal(r.confirmedEventSeq,1);
 assert.equal(r.rewardAuthorized,false);
 assert.equal(r.questTurnInCommitted,false);
 assert.deepEqual(state.calls,['tick','commit','replay']);
 assert.equal(await pump.shutdown(),true);
 assert.equal(await pump.shutdown(),false);
 assert.equal(state.progressShutdownCount,1);
 assert.equal(state.ownerReleaseCount,1);
});
test('86.9 shutdown during independent lease resolution prevents first world tick',async()=>{
 const {pump,state}=setup(),gate=latch();
 state.holdLeaseAt=1;state.hold.lease=gate.promise;
 const pending=pump.advance();
 await until(()=>state.leaseCount===1);
 const closing=pump.shutdown();
 assert.equal((await pump.connect({})).reason,'private_combat_quest_scheduler_stopped');
 gate.release();
 assert.equal((await pending).reason,'private_combat_quest_scheduler_stopped');
 assert.equal(await closing,true);
 assert.equal(state.calls.includes('tick'),false);
 assert.equal(state.commits,0);
 assert.equal(state.ownerReleaseCount,1);
});
test('86.9 in-flight original tick completes durable credit before queued shutdown',async()=>{
 const {pump,state}=setup(),gate=latch();
 state.hold.tick=gate.promise;
 const pending=pump.advance();
 await until(()=>state.calls.includes('tick'));
 const queued=pump.advance();
 const closing=pump.shutdown();
 assert.equal((await pump.recover()).reason,'private_combat_quest_scheduler_stopped');
 gate.release();
 const late=await pending;
 assert.equal(late.ok,false);
 assert.equal(late.reason,'private_combat_quest_scheduler_stopped');
 assert.equal((await queued).reason,'private_combat_quest_scheduler_stopped');
 assert.equal(await closing,true);
 assert.deepEqual(state.calls,
  ['tick','commit','replay','progression_shutdown','release']);
 assert.equal(state.seq,1);
 assert.equal(state.commits,1);
 assert.equal(state.replays,1);
 assert.equal(state.ownerReleaseCount,1);
});
test('86.9 shutdown during original 15.3 kill commit cannot interrupt durable write',async()=>{
 const {pump,state}=setup(),gate=latch();
 state.hold.commit=gate.promise;
 const pending=pump.advance();
 await until(()=>state.calls.includes('commit'));
 const closing=pump.shutdown();
 assert.equal((await pump.poll({})).reason,'private_combat_quest_scheduler_stopped');
 gate.release();
 assert.equal((await pending).reason,'private_combat_quest_scheduler_stopped');
 assert.equal(await closing,true);
 assert.deepEqual(state.calls,['tick','commit','replay',
  'progression_shutdown','release']);
 assert.equal(state.commits,1);
 assert.equal(state.replays,1);
 assert.equal(state.ownerReleaseCount,1);
});
test('86.9 shutdown during private objective reconciliation drops late credit response',async()=>{
 const {pump,state}=setup(),gate=latch();
 state.hold.replay=gate.promise;
 const pending=pump.advance();
 await until(()=>state.calls.includes('replay'));
 const closing=pump.shutdown();
 gate.release();
 const result=await pending;
 assert.equal(result.ok,false);
 assert.equal(result.newCredits,undefined);
 assert.equal(result.objectives,undefined);
 assert.equal(result.reason,'private_combat_quest_scheduler_stopped');
 assert.equal(await closing,true);
 assert.equal(state.commits,1);
 assert.equal(state.replays,1);
 assert.equal(state.ownerReleaseCount,1);
});
test('86.9 queued commands after held owner poll are never forwarded',async()=>{
 const {pump,state}=setup(),gate=latch();
 state.hold.poll=gate.promise;
 const pending=pump.poll({afterSeq:0});
 await until(()=>state.calls.includes('poll'));
 const queued=pump.submit({intent:'single'});
 const closing=pump.shutdown();
 assert.equal((await pump.setInput({m:1})).reason,'private_combat_quest_scheduler_stopped');
 gate.release();
 assert.equal((await pending).reason,'private_combat_quest_scheduler_stopped');
 assert.equal((await queued).reason,'private_combat_quest_scheduler_stopped');
 assert.equal(await closing,true);
 assert.equal(state.calls.includes('submit'),false);
 assert.equal(state.calls.includes('setInput'),false);
 assert.equal(state.ownerReleaseCount,1);
});
test('86.9 original world input failure while shutdown pending cannot escape stale response',async()=>{
 const {pump,state}=setup(),gate=latch();
 state.hold.setInput=gate.promise;state.throwWorldCall='setInput';
 const pending=pump.setInput({m:1});
 await until(()=>state.calls.includes('setInput'));
 const closing=pump.shutdown();
 gate.release();
 assert.equal((await pending).reason,'private_combat_quest_scheduler_stopped');
 assert.equal(await closing,true);
 assert.equal(state.ownerReleaseCount,1);
});
test('86.9 failing progression shutdown still releases exclusive original 13.8 owner',async()=>{
 const {pump,state}=setup();
 state.throwProgressShutdown=true;
 assert.equal(await pump.shutdown(),false);
 assert.deepEqual(state.calls,['progression_shutdown','release']);
 assert.equal(state.progressShutdownCount,1);
 assert.equal(state.ownerReleaseCount,1);
 assert.equal(await pump.shutdown(),false);
 assert.equal(state.ownerReleaseCount,1);
});
test('86.9 a failed owner release is not blindly retried',async()=>{
 const {pump,state}=setup();
 state.returnRelease=false;
 assert.equal(await pump.shutdown(),false);
 assert.equal(state.progressShutdownCount,1);
 assert.equal(state.ownerReleaseCount,1);
 assert.equal(await pump.shutdown(),false);
 assert.equal((await pump.advance()).reason,'private_combat_quest_scheduler_stopped');
 assert.equal(state.ownerReleaseCount,1);
});
test('86.9 a thrown original world release still closes the source-only facade',async()=>{
 const {pump,state}=setup();
 state.throwRelease=true;
 assert.equal(await pump.shutdown(),false);
 assert.equal(state.ownerReleaseCount,1);
 assert.equal((await pump.connect({})).reason,'private_combat_quest_scheduler_stopped');
});
process.on('exit',()=>{
 if(previous===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=previous;
});
