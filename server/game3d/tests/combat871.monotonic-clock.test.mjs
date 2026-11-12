// Combat / Quest 87.1 — the original 84.4 world-lease clock is a
// security input; it must be sampled once, remain monotonic and never throw.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateCombatQuestPump844}
 from '../privateCombatQuestScheduler844.mjs';

const original=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope=Object.freeze({
 ownerId:'owner871',characterId:'hero871',holderId:'holder-871',
 instanceId:'world-instance-871',instanceEpoch:'world-epoch-871',
 mapFingerprint:'e'.repeat(64),
});
const context=Object.freeze({server:'original-871'});
const lease=expiry=>({
 ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 serverSessionId:'world-session-871',
 actionSessionId:'qb174-'+'a'.repeat(64),
 leaseNonce:'87187187-1871-4871-8871-871871871871',
 expiresAtMs:expiry,
});
function make({now=()=>1000000,expiry=2000000}={}){
 const state={ticks:0,commits:0,replays:0,releases:0,inputs:0,
  samples:0,progressionShutdowns:0,leaseResolutions:0};
 const owner={
  version:'13.8',privateServerOnly:true,publicTransportInstalled:false,
  instanceId:scope.instanceId,fencingToken:7,
  async advance(){state.ticks++;
   return {ok:true,eventSeq:state.ticks,
    checkpointDigestRecorded:true,rewardsIssued:false}},
  async connect(){state.inputs++;return {ok:true,rewardsIssued:false}},
  async setInput(){state.inputs++;return {ok:true,rewardsIssued:false}},
  async submit(){state.inputs++;return {ok:true,rewardsIssued:false}},
  async poll(){state.inputs++;return {ok:true,rewardsIssued:false}},
  async disconnect(){state.inputs++;return {ok:true,rewardsIssued:false}},
  async release(){state.releases++;return true},
 };
 const progression={
  version:'18.5',privateServerOnly:true,publicPlayerRouteInstalled:false,
  independentCombatWriterCreated:false,rewardWriterInstalled:false,
  async commitWorldKills(){state.commits++;
   return {ok:true,lastSeq:state.ticks,receipts:[],
    rewardsIssued:false,rewardAuthorized:false}},
  async reconcileCommittedKills({afterEventSeq}){state.replays++;
   return {ok:true,version:'84.3',processedReceipts:1,
    nextEventSeq:afterEventSeq+1,hasMore:false,
    newCredits:[],objectives:[{
     questId:'axe_q_first_patrol',objectiveId:'patrol_kills',
     status:'accepted',current:1,required:3,
    }],rewardAuthorized:false,rewardsIssued:false,
    questTurnInCommitted:false}},
  async shutdown(){state.progressionShutdowns++},
 };
 const encounter={version:'13.6',privateServerOnly:true,
  instanceId:scope.instanceId,mapFingerprint:scope.mapFingerprint};
 const worldStage180={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   assert.equal(serverRequestContext,context);
   state.leaseResolutions++;return lease(expiry);
  },
 };
 const pump=createGame3DPrivateCombatQuestPump844({
  owner,encounter,scope,progression,worldStage180,
  serverRequestContext:context,enabled:true,
  now:()=>{state.samples++;return now()},
 });
 return {pump,state};
}

test('87.1 rejects a lease expired at the first clock sample despite a later rollback',async()=>{
 let n=0;
 const {pump,state}=make({now:()=>++n===1?2000000:1999999,
  expiry:2000000});
 const result=await pump.advance();
 assert.equal(result.ok,false);
 assert.equal(result.reason,'world_session_unverified');
 assert.equal(state.samples,1);
 assert.equal(state.ticks,0);
 assert.equal(state.commits,0);
 assert.equal(await pump.shutdown(),true);
 assert.equal(state.releases,1);
});
test('87.1 a throwing trusted clock returns a safe refusal, not a rejected promise',async()=>{
 const {pump,state}=make({now:()=>{throw Error('clock provider failed')}});
 const result=await pump.advance();
 assert.equal(result.reason,'world_session_unverified');
 assert.equal(result.rewardAuthorized,false);
 assert.equal(result.rewardsIssued,false);
 assert.equal(state.ticks,0);
 assert.equal(state.commits,0);
 assert.equal(await pump.shutdown(),true);
 assert.equal(state.releases,1);
});
test('87.1 an initially valid lease cannot be revived by a backward clock',async()=>{
 let now=1000000;
 const {pump,state}=make({now:()=>now});
 assert.equal((await pump.connect({})).ok,true);
 assert.equal(state.samples,2);
 now=999999;
 const result=await pump.advance();
 assert.equal(result.reason,'world_session_unverified');
 assert.equal(state.ticks,0);
 assert.equal(state.commits,0);
 assert.equal(await pump.shutdown(),true);
});
test('87.1 each input consumes pre- and post-input lease clock samples',async()=>{
 const {pump,state}=make();
 assert.equal((await pump.connect({})).ok,true);
 assert.equal(state.samples,2);
 assert.equal((await pump.setInput({seq:1})).ok,true);
 assert.equal(state.samples,4);
 assert.equal(await pump.shutdown(),true);
});
test('87.1 nonfinite, zero, negative, fractional or nonnumeric clock values fail closed',async()=>{
 for(const nowValue of [NaN,Infinity,-Infinity,0,-1,1.25,'1000000',
  undefined,null,Number.MAX_SAFE_INTEGER+1]){
  const {pump,state}=make({now:()=>nowValue});
  const result=await pump.advance();
  assert.equal(result.ok,false);
  assert.equal(result.reason,'world_session_unverified');
  assert.equal(state.ticks,0);
  assert.equal(state.commits,0);
  assert.equal(await pump.shutdown(),true);
  assert.equal(state.releases,1);
 }
});
test('87.1 equal timestamps are allowed and committed receipts remain single-shot',async()=>{
 const {pump,state}=make({now:()=>1000000});
 const result=await pump.advance();
 assert.equal(result.ok,true);
 assert.equal(result.worldEventSeq,1);
 assert.equal(result.confirmedEventSeq,1);
 assert.equal(result.rewardAuthorized,false);
 assert.equal(result.questTurnInCommitted,false);
 assert.equal(state.ticks,1);
 assert.equal(state.commits,1);
 assert.equal(state.replays,1);
 assert.equal(state.samples,4);
 assert.equal(await pump.shutdown(),true);
 assert.equal(await pump.shutdown(),false);
 assert.equal(state.releases,1);
});
test('87.1 advancing time across proofs still permits valid private combat',async()=>{
 let clock=1000000;
 const {pump,state}=make({now:()=>clock++});
 assert.equal((await pump.connect({})).ok,true);
 const result=await pump.advance();
 assert.equal(result.ok,true);
 assert.equal(state.ticks,1);
 assert.equal(state.commits,1);
 assert.equal(state.replays,1);
 assert.equal(await pump.shutdown(),true);
});
test('87.1 clock failure after original tick refuses progress without falsely claiming a credit',async()=>{
 let samples=0;
 const {pump,state}=make({now:()=>{
  samples++;
  if(samples===2)throw Error('clock died after world tick');
  return 1000000;
 }});
 const result=await pump.advance();
 assert.equal(result.ok,false);
 assert.equal(result.reason,'world_session_changed_after_tick');
 assert.equal(result.rewardAuthorized,false);
 assert.equal(state.ticks,1);
 assert.equal(state.commits,0);
 assert.equal(state.replays,0);
 assert.equal((await pump.advance()).ok,false);
 assert.equal(state.ticks,1);
 assert.equal(await pump.shutdown(),true);
 assert.equal(state.releases,1);
});
process.on('exit',()=>{
 if(original===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=original;
});
