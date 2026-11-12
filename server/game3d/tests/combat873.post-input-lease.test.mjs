// Combat / Quest 87.3: recheck the original world lease after each player input.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateCombatQuestPump844}
 from '../privateCombatQuestScheduler844.mjs';

const previous=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope=Object.freeze({
 ownerId:'owner873',characterId:'hero873',holderId:'holder-873',
 instanceId:'world-instance-873',instanceEpoch:'world-epoch-873',
 mapFingerprint:'e'.repeat(64),
});
const context=Object.freeze({server:'original-873'});
const newLease=()=>({
 ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 serverSessionId:'world-session-873',
 actionSessionId:'qb174-'+'a'.repeat(64),
 leaseNonce:'87387387-1873-4873-8873-873873873873',
 expiresAtMs:2000000,
});
function make({duringInput=()=>{},clock=()=>1000000,leaseSource=null}={}){
 const state={applied:0,ticks:0,commits:0,replays:0,
  samples:0,leaseResolutions:0,releases:0};
 const mutable=newLease();
 const owner={
  version:'13.8',privateServerOnly:true,publicTransportInstalled:false,
  instanceId:scope.instanceId,fencingToken:7,
  async advance(){state.ticks++;return {ok:true,eventSeq:state.ticks,
   checkpointDigestRecorded:true,rewardsIssued:false}},
  async release(){state.releases++;return true},
 };
 for(const name of ['connect','setInput','submit','poll','disconnect']){
  owner[name]=async args=>{
   state.applied++;await duringInput({name,args,mutable,state});
   return {ok:true,rewardsIssued:false,rewardAuthorized:false};
  };
 }
 const progression={
  version:'18.5',privateServerOnly:true,publicPlayerRouteInstalled:false,
  independentCombatWriterCreated:false,rewardWriterInstalled:false,
  async commitWorldKills(){state.commits++;return {
   ok:true,lastSeq:state.ticks,receipts:[],
   rewardsIssued:false,rewardAuthorized:false}},
  async reconcileCommittedKills(){state.replays++;return {
   ok:true,version:'84.3',processedReceipts:0,nextEventSeq:0,
   hasMore:false,newCredits:[],objectives:[],
   rewardAuthorized:false,rewardsIssued:false,questTurnInCommitted:false}},
  async shutdown(){},
 };
 const encounter={version:'13.6',privateServerOnly:true,
  instanceId:scope.instanceId,mapFingerprint:scope.mapFingerprint};
 const stage={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   assert.equal(serverRequestContext,context);
   state.leaseResolutions++;
   return leaseSource?leaseSource({mutable,state}):mutable;
  },
 };
 const pump=createGame3DPrivateCombatQuestPump844({
  owner,encounter,scope,progression,worldStage180:stage,
  serverRequestContext:context,enabled:true,
  now:()=>{state.samples++;return clock(state);},
 });
 return {pump,state,mutable};
}

test('87.3 stable input is acknowledged after second lease proof',async()=>{
 const {pump,state}=make();
 assert.equal((await pump.connect({player:'hero873'})).ok,true);
 assert.equal(state.applied,1);
 assert.equal(state.leaseResolutions,2);
 assert.equal(state.samples,2);
 assert.equal(state.ticks,0);
 assert.equal(state.commits,0);
 assert.equal(await pump.shutdown(),true);
});

test('87.3 revoked session cannot report input success or replay the input',async()=>{
 const {pump,state}=make({duringInput:({mutable})=>{
  mutable.leaseNonce='87387387-1873-4873-8873-000000000000';
 }});
 const result=await pump.connect({player:'hero873'});
 assert.equal(result.reason,'world_session_changed_after_input');
 assert.equal(result.rewardsIssued,false);
 assert.equal(result.progressSynchronized,false);
 assert.equal(state.applied,1);
 assert.equal((await pump.connect({})).reason,'private_combat_quest_scheduler_halted');
 assert.equal(state.applied,1);
 assert.equal(await pump.shutdown(),true);
 assert.equal(state.releases,1);
});

test('87.3 expired lease during input refuses acknowledgement',async()=>{
 const {pump,state}=make({duringInput:({mutable})=>{mutable.expiresAtMs=1000000}});
 assert.equal((await pump.submit({seq:1})).reason,'world_session_changed_after_input');
 assert.equal(state.applied,1);
 assert.equal(state.ticks,0);
 assert.equal(await pump.shutdown(),true);
});

test('87.3 monotonic rollback during input fails closed',async()=>{
 const {pump,state}=make({clock:({samples})=>samples===1?1000000:999999});
 assert.equal((await pump.setInput({seq:1})).reason,'world_session_changed_after_input');
 assert.equal(state.samples,2);
 assert.equal(state.applied,1);
 assert.equal(await pump.shutdown(),true);
});

test('87.3 lease resolver outage after input refuses acknowledgement',async()=>{
 const {pump,state}=make({leaseSource:({mutable,state})=>{
  if(state.leaseResolutions===2)throw Error('lease lost during input');
  return mutable;
 }});
 assert.equal((await pump.poll({seq:1})).reason,'world_session_changed_after_input');
 assert.equal(state.applied,1);
 assert.equal((await pump.poll({seq:2})).reason,'private_combat_quest_scheduler_halted');
 assert.equal(state.applied,1);
 assert.equal(await pump.shutdown(),true);
});

test('87.3 all original input endpoints perform pre- and post-input proof',async()=>{
 const {pump,state}=make();
 for(const method of ['connect','setInput','submit','poll','disconnect'])
  assert.equal((await pump[method]({seq:1})).ok,true,method);
 assert.equal(state.applied,5);
 assert.equal(state.samples,10);
 assert.equal(state.leaseResolutions,10);
 assert.equal(await pump.shutdown(),true);
});
process.on('exit',()=>{
 if(previous===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=previous;
});
