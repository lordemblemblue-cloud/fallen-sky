// Game 3D Combat / Quest 86.5 — original 84.8 Questbook viewer
// must never publish a late original world frame after shutdown is requested.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestbookPresentation848}
 from '../privateQuestbookPresentation848.mjs';

const before=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope=Object.freeze({ownerId:'owner865',characterId:'hero865',
 instanceId:'world-instance-865',instanceEpoch:'world-epoch-865',
 mapFingerprint:'a'.repeat(64)});
const serverContext=Object.freeze({originalWorld:'865'});
const attest=()=>({authenticated:true,
 identitySource:'base44-verified-action-session-179',
 accountId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 worldSessionId:'world-session-865',
 actionSessionId:'qb174-'+'a'.repeat(64),
 leaseNonce:'86586586-5865-4865-8865-865865865865',
 expiresAtMs:1080000});
const snap=seq=>({eventSeq:seq,serverTime:1000,
 player:{x:0,z:0,hp:90,maxHp:100,stamina:70,
  facing:0,lastIntentSeq:0},enemies:[]});
const frame=()=>({ok:true,version:'84.6',privateServerOnly:true,
 rewardsIssued:false,rewardAuthorized:false,productionReady:false,
 snapshot:snap(1),events:[{seq:1,kind:'player_strike',serverTime:1000,
  damage:12,critical:false,killed:false}],objectives:[],
 nextSeq:1,reset:false,gap:false,hasMore:false,
});
const latch=()=>{let release;const hold=new Promise(resolve=>{release=resolve});
 return {hold,release}};
const until=async condition=>{
 for(let i=0;i<200;i++){
  if(condition())return;
  await new Promise(resolve=>setImmediate(resolve));
 }
 throw Error('original 84.8 fixture did not reach expected state');
};
function setup(){
 const state={openCalls:0,frameCalls:0,disconnectCalls:0,
  shutdownCalls:0,authCalls:0,holdOpen:null,holdFrame:null,
  holdAuth:null,holdAuthAt:0,holdDisconnect:null,
  clock:1000000};
 const handle=Object.freeze({serverOwned:'world-handle-865'});
 const host={version:'84.6',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  credentialDeliveredToBrowser:false,hostedWorkerInstalled:false,
  async open(){state.openCalls++;
   if(state.holdOpen)await state.holdOpen;
   return {ok:true,version:'84.6',privateServerOnly:true,
    rewardsIssued:false,handle,snapshot:snap(0)}},
  async frame({handle:actual,afterSeq}){
   assert.equal(actual,handle);assert.equal(afterSeq,0);
   state.frameCalls++;
   if(state.holdFrame)await state.holdFrame;
   return frame()},
  async disconnect({handle:actual}){
   assert.equal(actual,handle);state.disconnectCalls++;
   if(state.holdDisconnect)await state.holdDisconnect;
   return {ok:true,version:'84.6',rewardsIssued:false}},
  async shutdown(){state.shutdownCalls++;return true},
 };
 const viewer=createGame3DPrivateQuestbookPresentation848({
  host,scope,serverRequestContext:serverContext,enabled:true,
  verifyAuthorizedReader:async ctx=>{
   assert.equal(ctx,serverContext);
   state.authCalls++;
   if(state.holdAuthAt===state.authCalls&&state.holdAuth)
    await state.holdAuth;
   return attest();
  },
  now:()=>state.clock,
 });
 return {state,viewer};
}
test('86.5 immediate shutdown rejects requests and releases original 84.6 once',async()=>{
 const {state,viewer}=setup();
 assert.equal((await viewer.open()).ok,true);
 assert.equal((await viewer.read()).ok,true);
 const closing=viewer.shutdown();
 assert.equal((await viewer.read()).reason,'private_view_closed');
 assert.equal((await viewer.open()).reason,'private_view_closed');
 assert.equal(await closing,true);
 assert.equal(await viewer.shutdown(),false);
 assert.equal(state.shutdownCalls,1);
 assert.equal(state.frameCalls,1);
});
test('86.5 shutdown during an in-flight original open drops its late data',async()=>{
 const {state,viewer}=setup();const gate=latch();state.holdOpen=gate.hold;
 const pending=viewer.open();
 await until(()=>state.openCalls===1);
 const closing=viewer.shutdown();
 assert.equal((await viewer.read()).reason,'private_view_closed');
 gate.release();
 assert.equal((await pending).reason,'private_view_closed');
 assert.equal(await closing,true);
 assert.equal(state.shutdownCalls,1);
 assert.equal(state.frameCalls,0);
});
test('86.5 shutdown during original frame read does not leak late combat events',async()=>{
 const {state,viewer}=setup();await viewer.open();
 const gate=latch();state.holdFrame=gate.hold;
 const pending=viewer.read();
 await until(()=>state.frameCalls===1);
 const closing=viewer.shutdown();
 assert.equal((await viewer.read()).reason,'private_view_closed');
 gate.release();
 const result=await pending;
 assert.equal(result.ok,false);
 assert.equal(result.reason,'private_view_closed');
 assert.equal(await closing,true);
 assert.equal(state.shutdownCalls,1);
 assert.equal((await viewer.read()).reason,'private_view_closed');
});
test('86.5 reads already queued before shutdown do not enter the original host',async()=>{
 const {state,viewer}=setup();await viewer.open();
 const gate=latch();state.holdFrame=gate.hold;
 const first=viewer.read();
 await until(()=>state.frameCalls===1);
 const second=viewer.read();
 const closing=viewer.shutdown();
 gate.release();
 assert.equal((await first).reason,'private_view_closed');
 assert.equal((await second).reason,'private_view_closed');
 assert.equal(await closing,true);
 assert.equal(state.frameCalls,1);
 assert.equal(state.shutdownCalls,1);
});
test('86.5 shutdown during independent pre-frame authentication skips original read',async()=>{
 const {state,viewer}=setup();await viewer.open();
 const gate=latch();state.holdAuthAt=3;state.holdAuth=gate.hold;
 const pending=viewer.read();
 await until(()=>state.authCalls===3);
 const closing=viewer.shutdown();
 gate.release();
 assert.equal((await pending).reason,'private_view_closed');
 assert.equal(state.frameCalls,0);
 assert.equal(await closing,true);
 assert.equal(state.shutdownCalls,1);
});
test('86.5 shutdown during post-frame auth never returns already-read data',async()=>{
 const {state,viewer}=setup();await viewer.open();
 const gate=latch();state.holdAuthAt=4;state.holdAuth=gate.hold;
 const pending=viewer.read();
 await until(()=>state.authCalls===4);
 assert.equal(state.frameCalls,1);
 const closing=viewer.shutdown();
 gate.release();
 assert.equal((await pending).reason,'private_view_closed');
 assert.equal(await closing,true);
 assert.equal(state.shutdownCalls,1);
});
test('86.5 completed disconnect releases owner before any later explicit shutdown',async()=>{
 const {state,viewer}=setup();await viewer.open();
 assert.equal((await viewer.disconnect()).ok,true);
 assert.equal(state.disconnectCalls,1);
 assert.equal(state.shutdownCalls,1);
 assert.equal(await viewer.shutdown(),false);
 assert.equal(await viewer.shutdown(),false);
 assert.equal(state.shutdownCalls,1);
});
test('86.5 shutdown racing a pending original disconnect cannot return late success',async()=>{
 const {state,viewer}=setup();await viewer.open();
 const gate=latch();state.holdDisconnect=gate.hold;
 const pending=viewer.disconnect();
 await until(()=>state.disconnectCalls===1);
 const closing=viewer.shutdown();
 gate.release();
 assert.equal((await pending).reason,'private_view_closed');
 assert.equal(await closing,true);
 assert.equal(state.shutdownCalls,1);
});
test('86.5 normal original frame remains reward-free without cancellation',async()=>{
 const {state,viewer}=setup();await viewer.open();
 const response=await viewer.read();
 assert.equal(response.ok,true);
 assert.equal(response.events[0].seq,1);
 assert.equal(response.rewardAuthorized,false);
 assert.equal(response.questbook.turnInAuthorized,false);
 assert.equal(state.shutdownCalls,0);
 assert.equal(await viewer.shutdown(),true);
 assert.equal(state.shutdownCalls,1);
});
process.on('exit',()=>{
 if(before===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=before;
});
