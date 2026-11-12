// Game 3D Combat / Quest 86.3: invalid/foreign requests must not steal
// another authenticated player's private update allowance or host instance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestbookDelivery849}
 from '../privateQuestbookDelivery849.mjs';

const original=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope=Object.freeze({
 ownerId:'owner863',characterId:'hero863',
 instanceId:'world-instance-863',instanceEpoch:'world-epoch-863',
 mapFingerprint:'c'.repeat(64),
});
const context=Object.freeze({trustedWorld:'863'});
const edgeContext=Object.freeze({privateEdge:'863'});
const evidence=()=>({
 authenticated:true,identitySource:'independent-server-edge-849',
 credentialVerified:true,originApproved:true,csrfVerified:true,
 readOnly:true,method:'GET',accountId:scope.ownerId,
 characterId:scope.characterId,worldInstanceId:scope.instanceId,
 worldEpoch:scope.instanceEpoch,worldSessionId:'world-session-863',
 actionSessionId:'qb174-'+'e'.repeat(64),
 leaseNonce:'86386386-3863-4863-8863-863863863863',
 expiresAtMs:1090000,
});
const player=()=>({x:0,z:0,hp:90,maxHp:100,stamina:80,
 facing:0,lastIntentSeq:0});
const snapshot=seq=>({eventSeq:seq,serverTime:1000,
 player:player(),enemies:[]});
const readFrame=seq=>({
 ok:true,version:'84.8',privateServerOnly:true,
 productionReady:false,rewardsIssued:false,rewardAuthorized:false,
 snapshot:snapshot(seq),events:[{
  seq,kind:'player_strike',serverTime:1000,
  damage:10,critical:false,killed:false,
 }],questbook:{objectives:[],
  objectiveTargetOnly:true,turnInAuthorized:false},
 nextSeq:seq,reset:false,gap:false,hasMore:false,
});
const req=()=>({edgeContext});

function make(){
 const state={clock:1000000,attestation:evidence(),verified:0,
  opened:0,reads:0,shutdowns:0,seq:0,hold:null,nonready:false};
 const view={
  version:'84.8',privateServerOnly:true,publicPlayerRouteInstalled:false,
  publicTransportInstalled:false,featureEnabledInLiveGame:false,
  credentialDeliveredToBrowser:false,hostedWorkerInstalled:false,
  async open(){
   state.opened++;return {
    ok:true,version:'84.8',privateServerOnly:true,
    productionReady:false,rewardsIssued:false,rewardAuthorized:false,
    snapshot:snapshot(0),events:[],questbook:{objectives:[],
     objectiveTargetOnly:true,turnInAuthorized:false},
    nextSeq:0,reset:true,gap:false,hasMore:false,
   };
  },
  async read(){
   state.reads++;
   if(state.hold)await state.hold;
   if(state.nonready)return {
    ok:false,reason:'private_world_frame_not_ready',
   };
   state.seq++;
   return readFrame(state.seq);
  },
  async shutdown(){state.shutdowns++;return true},
 };
 const delivery=createGame3DPrivateQuestbookDelivery849({
  enabled:true,view,scope,serverRequestContext:context,
  verifyEdgeRequest:async ({serverRequestContext,edgeContext:edge,
   operation})=>{
   assert.equal(serverRequestContext,context);
   assert.equal(edge,edgeContext);
   assert.ok(['open','poll'].includes(operation));
   state.verified++;
   return state.attestation;
  },
  now:()=>state.clock,
 });
 return {state,delivery};
}

test('86.3 rejected initial foreign open does not consume or close owner instance',async()=>{
 const {state,delivery}=make();
 state.attestation={...evidence(),accountId:'other'};
 assert.equal((await delivery.open(req())).reason,
  'private_edge_authentication_failed');
 assert.equal(state.opened,0);
 assert.equal(state.shutdowns,0);
 state.attestation=evidence();
 assert.equal((await delivery.open(req())).ok,true);
 assert.equal(state.opened,1);
 await delivery.shutdown();
 assert.equal(state.shutdowns,1);
});
test('86.3 denied foreign poll cannot consume first legitimate poll slot',async()=>{
 const {state,delivery}=make();await delivery.open(req());
 state.attestation={...evidence(),characterId:'other'};
 const denied=await delivery.poll(req());
 assert.equal(denied.reason,'private_edge_authentication_failed');
 assert.equal(state.reads,0);
 assert.equal(state.shutdowns,0);
 state.attestation=evidence();
 const success=await delivery.poll(req());
 assert.equal(success.ok,true);
 assert.equal(success.payload.nextSeq,1);
 assert.equal(state.reads,1);
 await delivery.shutdown();
});
test('86.3 foreign traffic between valid polls never advances lastPoll',async()=>{
 const {state,delivery}=make();await delivery.open(req());
 assert.equal((await delivery.poll(req())).ok,true);
 state.clock+=200;
 state.attestation={...evidence(),accountId:'other'};
 const denied=await delivery.poll(req());
 assert.equal(denied.reason,'private_edge_authentication_failed');
 assert.equal(state.shutdowns,0);
 state.attestation=evidence();state.clock+=300;
 assert.equal((await delivery.poll(req())).ok,true);
 assert.equal(state.reads,2);
 await delivery.shutdown();
});
test('86.3 repeated invalid traffic cannot exhaust the 90-per-minute owner budget',async()=>{
 const {state,delivery}=make();await delivery.open(req());
 state.attestation={...evidence(),originApproved:false};
 for(let i=0;i<120;i++){
  assert.equal((await delivery.poll(req())).reason,
   'private_edge_authentication_failed');
 }
 assert.equal(state.reads,0);
 assert.equal(state.shutdowns,0);
 state.attestation=evidence();
 assert.equal((await delivery.poll(req())).ok,true);
 assert.equal(state.reads,1);
 await delivery.shutdown();
});
test('86.3 same-owner verified lease rotation is terminal even within cooldown',async()=>{
 const {state,delivery}=make();await delivery.open(req());
 assert.equal((await delivery.poll(req())).ok,true);
 state.clock+=100;
 state.attestation={...evidence(),
  leaseNonce:'76386386-3863-4863-8863-863863863863'};
 const denied=await delivery.poll(req());
 assert.equal(denied.reason,'private_edge_session_changed');
 assert.equal(state.shutdowns,1);
 assert.equal((await delivery.poll(req())).reason,'private_delivery_closed');
 assert.equal(state.reads,1);
});
test('86.3 post-read authorization loss drops pending content and releases world',async()=>{
 const {state,delivery}=make();await delivery.open(req());
 let release;
 state.hold=new Promise(resolve=>{release=resolve});
 const pending=delivery.poll(req());
 // A real authorization awaits multiple microtasks. Wait until the owner
 // has actually entered the held read, not for one assumed event-loop turn.
 for(let i=0;i<100&&state.reads===0;i++)
  await new Promise(resolve=>setImmediate(resolve));
 assert.equal(state.reads,1);
 state.attestation={...evidence(),csrfVerified:false};
 release();
 const denied=await pending;
 assert.equal(denied.reason,'private_edge_session_changed');
 assert.equal(state.shutdowns,1);
 assert.equal((await delivery.poll(req())).reason,'private_delivery_closed');
});
test('86.3 unsafe server clock regression remains terminal, not foreign-denial retry',async()=>{
 const {state,delivery}=make();await delivery.open(req());
 state.clock-=500;
 assert.equal((await delivery.poll(req())).reason,'private_delivery_clock_invalid');
 assert.equal(state.shutdowns,1);
 assert.equal((await delivery.poll(req())).reason,'private_delivery_closed');
});
test('86.3 temporary authenticated frame not ready can retry after owner cooldown',async()=>{
 const {state,delivery}=make();await delivery.open(req());
 state.nonready=true;
 assert.equal((await delivery.poll(req())).reason,'private_view_not_ready');
 assert.equal(state.shutdowns,0);
 state.clock+=500;state.nonready=false;
 const ok=await delivery.poll(req());
 assert.equal(ok.ok,true);
 assert.equal(ok.rewardAuthorized,false);
 assert.equal(ok.payload.questbook.turnInAuthorized,false);
 await delivery.shutdown();
});
test('86.3 malformed request shapes cannot charge the owner’s rate budget',async()=>{
 const {state,delivery}=make();await delivery.open(req());
 assert.equal((await delivery.poll({edgeContext,afterSeq:0})).reason,
  'invalid_private_delivery_request');
 assert.equal(state.reads,0);
 assert.equal((await delivery.poll(req())).ok,true);
 await delivery.shutdown();
});
process.on('exit',()=>{
 if(original===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=original;
});
