// Game 3D Combat / Quest 86.4 — a requested shutdown must immediately
// prevent any new or already-in-flight world frame from being delivered.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestbookDelivery849}
 from '../privateQuestbookDelivery849.mjs';

const previous=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope=Object.freeze({ownerId:'owner864',characterId:'hero864',
 instanceId:'world-instance-864',instanceEpoch:'world-epoch-864',
 mapFingerprint:'d'.repeat(64)});
const context=Object.freeze({backendOnly:'world-864'});
const edgeContext=Object.freeze({privateEdge:'864'});
const req=()=>({edgeContext});
const attestation=()=>({
 authenticated:true,identitySource:'independent-server-edge-849',
 credentialVerified:true,originApproved:true,csrfVerified:true,
 readOnly:true,method:'GET',accountId:scope.ownerId,
 characterId:scope.characterId,worldInstanceId:scope.instanceId,
 worldEpoch:scope.instanceEpoch,worldSessionId:'world-session-864',
 actionSessionId:'qb174-'+'f'.repeat(64),
 leaseNonce:'86486486-4864-4864-8864-864864864864',
 expiresAtMs:1090000,
});
const snapshot=seq=>({
 eventSeq:seq,serverTime:1000,
 player:{x:0,z:0,hp:90,maxHp:100,stamina:70,
  facing:0,lastIntentSeq:0},enemies:[],
});
const opened=()=>({ok:true,version:'84.8',privateServerOnly:true,
 rewardsIssued:false,rewardAuthorized:false,productionReady:false,
 snapshot:snapshot(0),events:[],nextSeq:0,
 reset:true,gap:false,hasMore:false,
 questbook:{objectives:[],objectiveTargetOnly:true,turnInAuthorized:false}});
const frame=seq=>({ok:true,version:'84.8',privateServerOnly:true,
 rewardsIssued:false,rewardAuthorized:false,productionReady:false,
 snapshot:snapshot(seq),events:[{seq,kind:'player_strike',serverTime:1000,
  damage:10,critical:false,killed:false}],nextSeq:seq,
 reset:false,gap:false,hasMore:false,
 questbook:{objectives:[],objectiveTargetOnly:true,turnInAuthorized:false}});
const waitUntil=async condition=>{
 for(let i=0;i<200;i++){
  if(condition())return;
  await new Promise(resolve=>setImmediate(resolve));
 }
 throw Error('private fixture never entered expected awaited operation');
};
const latch=()=>{let release;const hold=new Promise(resolve=>{release=resolve});
 return {hold,release}};

function fixture(){
 const state={clock:1000000,opened:0,readCount:0,seq:0,
  shutdowns:0,holdOpen:null,holdRead:null,
  holdAuth:null,holdAuthAt:null,pollAuths:0};
 const view={version:'84.8',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  featureEnabledInLiveGame:false,credentialDeliveredToBrowser:false,
  hostedWorkerInstalled:false,
  async open(){state.opened++;
   if(state.holdOpen)await state.holdOpen;
   return opened();
  },
  async read(){state.readCount++;
   if(state.holdRead)await state.holdRead;
   return frame(++state.seq);
  },
  async shutdown(){state.shutdowns++;return true},
 };
 const delivery=createGame3DPrivateQuestbookDelivery849({
  enabled:true,view,scope,serverRequestContext:context,
  verifyEdgeRequest:async ({serverRequestContext,edgeContext:edge,operation})=>{
   assert.equal(serverRequestContext,context);
   assert.equal(edge,edgeContext);
   if(operation==='poll'){
    state.pollAuths++;
    if(state.holdAuthAt===state.pollAuths&&state.holdAuth)
     await state.holdAuth;
   }
   return attestation();
  },now:()=>state.clock,
 });
 return {delivery,state};
}

test('86.4 normal shutdown rejects later work and releases exactly one original view',async()=>{
 const {delivery,state}=fixture();
 assert.equal((await delivery.open(req())).ok,true);
 assert.equal((await delivery.poll(req())).ok,true);
 const closing=delivery.shutdown();
 assert.equal((await delivery.poll(req())).reason,'private_delivery_closed');
 assert.equal((await delivery.open(req())).reason,'private_delivery_closed');
 assert.equal(await closing,true);
 assert.equal(await delivery.shutdown(),false);
 assert.equal(state.shutdowns,1);
 assert.equal(state.readCount,1);
});

test('86.4 shutdown during held original open drops late success and closes view',async()=>{
 const {delivery,state}=fixture();const gate=latch();state.holdOpen=gate.hold;
 const pendingOpen=delivery.open(req());
 await waitUntil(()=>state.opened===1);
 const closing=delivery.shutdown();
 assert.equal((await delivery.poll(req())).reason,'private_delivery_closed');
 assert.equal((await delivery.open(req())).reason,'private_delivery_closed');
 gate.release();
 assert.equal((await pendingOpen).reason,'private_delivery_closed');
 assert.equal(await closing,true);
 assert.equal(state.shutdowns,1);
});

test('86.4 shutdown while a private frame is pending never returns that frame',async()=>{
 const {delivery,state}=fixture();await delivery.open(req());
 const gate=latch();state.holdRead=gate.hold;
 const pendingFrame=delivery.poll(req());
 await waitUntil(()=>state.readCount===1);
 const closing=delivery.shutdown();
 assert.equal((await delivery.poll(req())).reason,'private_delivery_closed');
 gate.release();
 const late=await pendingFrame;
 assert.equal(late.ok,false);
 assert.equal(late.reason,'private_delivery_closed');
 assert.equal(await closing,true);
 assert.equal(state.shutdowns,1);
 assert.equal((await delivery.poll(req())).reason,'private_delivery_closed');
});

test('86.4 already queued poll must not run after earlier in-flight read finishes',async()=>{
 const {delivery,state}=fixture();await delivery.open(req());
 const gate=latch();state.holdRead=gate.hold;
 const first=delivery.poll(req());
 await waitUntil(()=>state.readCount===1);
 const second=delivery.poll(req()); // queued before shutdown
 const closing=delivery.shutdown();
 gate.release();
 assert.equal((await first).reason,'private_delivery_closed');
 assert.equal((await second).reason,'private_delivery_closed');
 assert.equal(await closing,true);
 assert.equal(state.readCount,1);
 assert.equal(state.shutdowns,1);
});

test('86.4 shutdown during the pre-read auth callback does not enter world read',async()=>{
 const {delivery,state}=fixture();await delivery.open(req());
 const gate=latch();state.holdAuthAt=1;state.holdAuth=gate.hold;
 const pending=delivery.poll(req());
 await waitUntil(()=>state.pollAuths===1);
 const closing=delivery.shutdown();
 gate.release();
 assert.equal((await pending).reason,'private_delivery_closed');
 assert.equal(state.readCount,0);
 assert.equal(await closing,true);
 assert.equal(state.shutdowns,1);
});

test('86.4 shutdown during post-read auth cannot publish already-read combat data',async()=>{
 const {delivery,state}=fixture();await delivery.open(req());
 const gate=latch();state.holdAuthAt=2;state.holdAuth=gate.hold;
 const pending=delivery.poll(req());
 await waitUntil(()=>state.pollAuths===2);
 assert.equal(state.readCount,1);
 const closing=delivery.shutdown();
 gate.release();
 assert.equal((await pending).reason,'private_delivery_closed');
 assert.equal(await closing,true);
 assert.equal(state.shutdowns,1);
});

test('86.4 no shutdown retains normal first read and 500 ms rate limiting',async()=>{
 const {delivery,state}=fixture();await delivery.open(req());
 const one=await delivery.poll(req());
 assert.equal(one.ok,true);
 assert.equal(one.payload.nextSeq,1);
 assert.equal((await delivery.poll(req())).reason,'private_delivery_rate_limited');
 state.clock+=500;
 const two=await delivery.poll(req());
 assert.equal(two.ok,true);
 assert.equal(two.payload.nextSeq,2);
 assert.equal(state.shutdowns,0);
 await delivery.shutdown();
 assert.equal(state.shutdowns,1);
});

process.on('exit',()=>{
 if(previous===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=previous;
});
