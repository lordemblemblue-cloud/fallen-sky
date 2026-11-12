// Game 3D 85.9 — original 84.6 must not launder fake reward/turn-in
// authority from a supposedly successful original 84.5/84.4 reply.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateGameplayHost846}
 from '../privateCombatQuestHost846.mjs';

const old=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope={instanceId:'world-instance-859',
 instanceEpoch:'world-epoch-859',mapFingerprint:'b'.repeat(64)};
const connectionId='85985985-9859-4859-8859-859859859859';
const snapshot=()=>({protocol:1,version:'13.7',
 instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch,
 mapFingerprint:scope.mapFingerprint,
 eventSeq:1,serverTime:1000,rewardsIssued:false,
 player:{x:1,z:0,hp:90,maxHp:100,stamina:75,facing:0,lastIntentSeq:0},
 enemies:[{id:'wolf1',x:0,z:0,hp:20,maxHp:20,
  alive:true,pendingImpactAt:null}]});
const objective=()=>({questId:'axe_q_first_patrol',
 objectiveId:'patrol_kills',status:'accepted',current:1,required:3});
const goodSync=()=>({ok:true,version:'84.5',rewardsIssued:false,
 rewardAuthorized:false,questTurnInCommitted:false,
 progressSynchronized:true,confirmedEventSeq:1,worldEventSeq:1,
 objectives:[objective()]});
function setup(){
 const state={shutdowns:0,events:[],connect:null,poll:null,
  advance:null,recover:null,input:null,submit:null};
 const admission={version:'84.5',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  credentialDeliveredToBrowser:false,hostedWorkerInstalled:false,
  async connect(){state.events.push('connect');
   return state.connect??{ok:true,version:'84.5',rewardsIssued:false,
    connectionId,snapshot:snapshot()}},
  async poll(){state.events.push('poll');
   return state.poll??{ok:true,version:'84.5',rewardsIssued:false,
    rewardAuthorized:false,reset:false,gap:false,
    hasMore:false,snapshot:snapshot(),events:[],nextSeq:1}},
  async setInput(){state.events.push('input');
   return state.input??{ok:true,rewardsIssued:false,inputSeq:1}},
  async submit(){state.events.push('submit');
   return state.submit??{ok:true,rewardsIssued:false,queued:true}},
  async advance(){state.events.push('advance');
   return state.advance??goodSync()},
  async recover(){state.events.push('recover');
   return state.recover??goodSync()},
  async disconnect(){state.events.push('disconnect');
   return {ok:true,rewardsIssued:false}},
  async shutdown(){state.events.push('shutdown');state.shutdowns++;return true},
 };
 const host=createGame3DPrivateGameplayHost846({
  enabled:true,admission,scope});
 return {host,state};
}
test('85.9 does not hide rewardAuthorized=true inside a successful private tick',async()=>{
 const {host,state}=setup();await host.open();
 state.advance={...goodSync(),rewardAuthorized:true};
 assert.equal((await host.advance()).reason,'private_quest_success_proof_invalid');
 assert.equal(state.shutdowns,1);
 assert.equal((await host.recover()).ok,false);
 assert.equal(await host.shutdown(),false);
});
test('85.9 refuses a supposedly successful unauthorized quest turn-in',async()=>{
 const {host,state}=setup();await host.open();
 state.advance={...goodSync(),questTurnInCommitted:true};
 assert.equal((await host.advance()).reason,'private_quest_success_proof_invalid');
 assert.equal(state.shutdowns,1);
});
test('85.9 refuses success replies missing explicit reward-free proof',async()=>{
 for(const patch of [
  {rewardAuthorized:undefined},{questTurnInCommitted:undefined},
  {version:'84.4'},{worldEventSeq:0},{confirmedEventSeq:-1},
  {objectives:[{...objective(),current:5}]},
 ]){
  const {host,state}=setup();await host.open();
  state.advance={...goodSync(),...patch};
  assert.equal((await host.advance()).reason,'private_quest_success_proof_invalid');
  assert.equal(state.shutdowns,1);
 }
});
test('85.9 denies unauthorized reward authority in open snapshot or frame',async()=>{
 const a=setup();
 a.state.connect={ok:true,version:'84.5',connectionId,
  rewardsIssued:false,snapshot:{...snapshot(),rewardAuthorized:true}};
 assert.equal((await a.host.open()).reason,'private_world_open_unverified');
 assert.equal(a.state.shutdowns,1);
 const b=setup();const {handle}=await b.host.open();
 b.state.poll={ok:true,version:'84.5',rewardsIssued:false,
  rewardAuthorized:true,reset:false,gap:false,
  snapshot:snapshot(),events:[],nextSeq:1,hasMore:false};
 assert.equal((await b.host.frame({handle,afterSeq:0})).reason,
  'private_frame_unverified');
 assert.equal(b.state.shutdowns,1);
});
test('85.9 forged movement or strike reward replies cannot leave private host alive',async()=>{
 const a=setup(),b=setup();
 const ah=await a.host.open(),bh=await b.host.open();
 a.state.input={ok:true,rewardsIssued:false,rewardAuthorized:true,inputSeq:1};
 assert.equal((await a.host.setInput({handle:ah.handle,
  input:{seq:1,x:0,z:0,facing:0}})).reason,
  'private_movement_reward_authority_invalid');
 b.state.submit={ok:true,rewardsIssued:false,rewardAuthorized:true,queued:true};
 assert.equal((await b.host.submit({handle:bh.handle,intent:{
  action:'basic',intentId:'intent_00001',intentSeq:1,
  targetId:'wolf1',weaponPath:'damage'}})).reason,
  'private_strike_reward_authority_invalid');
 assert.equal(a.state.shutdowns,1);
 assert.equal(b.state.shutdowns,1);
});
test('85.9 valid reward-free committed objective updates still project normally',async()=>{
 const {host,state}=setup();const {handle}=await host.open();
 const advance=await host.advance();
 assert.equal(advance.ok,true);
 assert.equal(advance.objectives[0].current,1);
 assert.equal(advance.rewardAuthorized,false);
 const frame=await host.frame({handle,afterSeq:0});
 assert.equal(frame.ok,true);
 assert.equal(frame.objectives[0].status,'accepted');
 assert.equal(state.shutdowns,0);
 assert.equal(await host.shutdown(),true);
 assert.equal(state.shutdowns,1);
});
test('85.9 ambiguous original 84.4 failure remains explicitly recoverable',async()=>{
 const {host,state}=setup();const {handle}=await host.open();
 state.advance={ok:false,version:'84.5',rewardsIssued:false,
  reason:'original_pg_commit_ambiguous'};
 assert.equal((await host.advance()).reason,'private_quest_sync_unverified');
 assert.equal(state.shutdowns,0);
 assert.equal((await host.frame({handle,afterSeq:0})).ok,false);
 assert.equal((await host.recover()).ok,true);
 assert.equal(state.shutdowns,0);
 await host.shutdown();
});
process.on('exit',()=>{
 if(old===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=old;
});
