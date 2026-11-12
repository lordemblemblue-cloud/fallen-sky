// Game 3D 85.8 — original 84.6 private host releases 84.5 owner once
// on terminal failure, independent of 84.8/84.9/85.0 outer layers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateGameplayHost846}
 from '../privateCombatQuestHost846.mjs';

const before=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope=Object.freeze({instanceId:'world-instance-858',
 instanceEpoch:'world-epoch-858',mapFingerprint:'a'.repeat(64)});
const connectionId='85885885-8858-4858-8858-858858858858';
const snapshot=()=>({protocol:1,version:'13.7',
 instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch,
 mapFingerprint:scope.mapFingerprint,eventSeq:1,serverTime:1000,
 rewardsIssued:false,
 player:{x:0,z:0,hp:100,maxHp:100,stamina:75,
  facing:0,lastIntentSeq:0},
 enemies:[{id:'wolf1',x:3,z:3,hp:18,maxHp:20,
  alive:true,pendingImpactAt:null}]});
function fixture(){
 const state={calls:[],connectReply:null,pollReply:null,
  inputReply:null,submitReply:null,advanceReply:null,
  recoverReply:null,shutdowns:0};
 const admission={version:'84.5',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  hostedWorkerInstalled:false,credentialDeliveredToBrowser:false,
  async connect(){state.calls.push('connect');
   return state.connectReply??{ok:true,version:'84.5',
    connectionId,snapshot:snapshot(),rewardsIssued:false}},
  async poll(){state.calls.push('poll');
   return state.pollReply??{ok:true,rewardsIssued:false,
    reset:false,gap:false,snapshot:snapshot(),
    events:[],nextSeq:1,hasMore:false}},
  async setInput({input}){state.calls.push('input');
   return state.inputReply??{ok:true,rewardsIssued:false,inputSeq:input.seq}},
  async submit(){state.calls.push('submit');
   return state.submitReply??{ok:true,rewardsIssued:false,queued:true}},
  async advance(){state.calls.push('advance');
   return state.advanceReply??{ok:true,version:'84.5',rewardsIssued:false,
    progressSynchronized:true,questTurnInCommitted:false,
    rewardAuthorized:false,confirmedEventSeq:1,objectives:[]}},
  async recover(){state.calls.push('recover');
   return state.recoverReply??{ok:true,version:'84.5',rewardsIssued:false,
    rewardAuthorized:false,questTurnInCommitted:false,
    progressSynchronized:true,confirmedEventSeq:1,objectives:[]}},
  async disconnect(){state.calls.push('disconnect');
   return {ok:true,rewardsIssued:false}},
  async shutdown(){state.calls.push('shutdown');state.shutdowns++;return true},
 };
 const host=createGame3DPrivateGameplayHost846({
  enabled:true,admission,scope,
 });
 return {host,state};
}
test('85.8 authentication refusal during initial connect releases original admission exactly once',async()=>{
 const {host,state}=fixture();
 state.connectReply={ok:false,reason:'private_world_or_base44_session_unverified',
  rewardsIssued:false};
 assert.equal((await host.open()).ok,false);
 assert.deepEqual(state.calls,['connect','shutdown']);
 assert.equal((await host.open()).ok,false);
 assert.equal(await host.shutdown(),false);
 assert.equal(state.shutdowns,1);
});
test('85.8 invalid original world snapshot shuts down original 84.5 owner',async()=>{
 const {host,state}=fixture();
 state.connectReply={ok:true,rewardsIssued:false,connectionId,
  snapshot:{...snapshot(),instanceEpoch:'foreign-epoch'}};
 assert.equal((await host.open()).reason,'private_world_open_unverified');
 assert.equal(state.shutdowns,1);
 assert.deepEqual(state.calls,['connect','shutdown']);
});
test('85.8 terminal event validation closes original host immediately',async()=>{
 const {host,state}=fixture();
 const {handle}=await host.open();
 state.pollReply={ok:true,rewardsIssued:false,
  reset:false,gap:false,snapshot:snapshot(),
  events:[{seq:1,instanceId:scope.instanceId,kind:'player_strike',
   serverTime:1000,xpAuthorized:true,lootAuthorized:false,
   currencyAuthorized:false}],nextSeq:1,hasMore:false};
 assert.equal((await host.frame({handle,afterSeq:0})).reason,
  'private_frame_event_chain_invalid');
 assert.equal(state.shutdowns,1);
 assert.equal((await host.advance()).ok,false);
 assert.equal(await host.shutdown(),false);
 assert.deepEqual(state.calls,['connect','poll','shutdown']);
});
test('85.8 original 84.5 revoked-lease movement denial shuts down without leaking session',async()=>{
 const {host,state}=fixture();const {handle}=await host.open();
 state.inputReply={ok:false,rewardsIssued:false,
  reason:'private_session_changed_during_operation'};
 assert.equal((await host.setInput({handle,input:{
  seq:1,x:0,z:0,facing:0}})).reason,'private_world_session_revoked');
 assert.equal(state.shutdowns,1);
 assert.equal((await host.recover()).ok,false);
});
test('85.8 original 84.5 revoked-lease quest tick is terminal but ambiguous PG replay still recoverable',async()=>{
 const a=fixture(),b=fixture();
 const ar=await a.host.open(),br=await b.host.open();
 a.state.advanceReply={ok:false,rewardsIssued:false,
  reason:'private_world_or_base44_session_unverified'};
 assert.equal((await a.host.advance()).reason,'private_world_session_revoked');
 assert.equal(a.state.shutdowns,1);
 b.state.advanceReply={ok:false,rewardsIssued:false,reason:'pg_ambiguous'};
 assert.equal((await b.host.advance()).reason,'private_quest_sync_unverified');
 assert.equal(b.state.shutdowns,0);
 assert.equal((await b.host.recover()).ok,true);
 assert.equal(b.state.shutdowns,0);
 assert.equal((await b.host.frame({handle:br.handle,afterSeq:0})).ok,true);
 await b.host.shutdown();
 assert.equal(b.state.shutdowns,1);
 assert.equal(ar.ok,true);
});
test('85.8 normal explicit shutdown remains single owner release',async()=>{
 const {host,state}=fixture();await host.open();
 assert.equal(await host.shutdown(),true);
 assert.equal(await host.shutdown(),false);
 assert.equal(state.shutdowns,1);
});
process.on('exit',()=>{
 if(before===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=before;
});
