// Combat / Quest 85.4: real 84.8 + real 84.9 read-only composition.
// Fake only the original 84.6 authority and backend authentication callbacks.
// Does not connect to Base44, PostgreSQL, network or a live world.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestbookPresentation848}
 from '../privateQuestbookPresentation848.mjs';
import {createGame3DPrivateQuestbookDelivery849}
 from '../privateQuestbookDelivery849.mjs';

const old=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope=Object.freeze({ownerId:'owner854',characterId:'hero854',
 instanceId:'world-instance-854',instanceEpoch:'world-epoch-854',
 mapFingerprint:'f'.repeat(64)});
const context=Object.freeze({server:'private-current-world'});
const edgeContext=Object.freeze({trustedEdge:'not-a-browser-token'});
const nonce='85485485-4854-4854-8854-854854854854';
const actionSessionId='qb174-'+'d'.repeat(64);
const verifiedReader=()=>({
 authenticated:true,identitySource:'base44-verified-action-session-179',
 accountId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 worldSessionId:'world-session-854',actionSessionId,leaseNonce:nonce,
 expiresAtMs:1080000,
});
const verifiedEdge=()=>({
 authenticated:true,identitySource:'independent-server-edge-849',
 credentialVerified:true,originApproved:true,csrfVerified:true,
 readOnly:true,method:'GET',accountId:scope.ownerId,
 characterId:scope.characterId,worldInstanceId:scope.instanceId,
 worldEpoch:scope.instanceEpoch,worldSessionId:'world-session-854',
 actionSessionId,leaseNonce:nonce,expiresAtMs:1080000,
});
const snapshot=(seq=0)=>({
 eventSeq:seq,serverTime:1000,
 player:{x:0,z:0,hp:100,maxHp:100,stamina:70,facing:0,
  lastIntentSeq:0,serverSessionId:'SECRET'},
 enemies:[{id:'wolf1',x:2,z:1,hp:20,maxHp:20,alive:true,
  pendingImpactAt:null,serverEnemyProof:'SECRET'}],
 secretLeaseNonce:'SECRET',
});
const objective=(current=1)=>({
 questId:'axe_q_first_patrol',objectiveId:'patrol_kills',
 status:'accepted',current,required:3,
 receiptId:'worldkill-SECRET',serverKillContext:'SECRET',
});
const statusEvent=(seq=1)=>({
 seq,kind:'player_strike',serverTime:1000,
 targetId:'wolf1',damage:20,critical:true,killed:true,
 secretReceiptId:'SECRET',
});
function make(){
 const state={time:1000000,reader:verifiedReader(),edge:verifiedEdge(),
  reads:0,opens:0,shutdowns:0,frameSeq:0,progress:1,
  frameOverride:null,held:null,handle:Object.freeze({private:'handle'})};
 const host={version:'84.6',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  credentialDeliveredToBrowser:false,hostedWorkerInstalled:false,
  async open(){state.opens++;return {
   ok:true,version:'84.6',privateServerOnly:true,
   rewardsIssued:false,handle:state.handle,
   snapshot:snapshot(0),originalWorldSession:'SECRET',
  }},
  async frame({handle,afterSeq}){
   assert.equal(handle,state.handle);
   assert.equal(afterSeq,state.frameSeq);
   state.reads++;
   if(state.held)await state.held;
   if(state.frameOverride)return state.frameOverride;
   const next=afterSeq+1;state.frameSeq=next;
   return {ok:true,version:'84.6',privateServerOnly:true,
    rewardsIssued:false,rewardAuthorized:false,
    productionReady:false,reset:false,gap:false,
    snapshot:snapshot(next),events:[statusEvent(next)],
    nextSeq:next,hasMore:false,
    objectives:[objective(state.progress)],
    serverReceiptProof:'SECRET',
   };
  },
  async disconnect(){return {ok:true,rewardsIssued:false}},
  async shutdown(){state.shutdowns++;return true},
 };
 const view=createGame3DPrivateQuestbookPresentation848({
  enabled:true,host,scope,serverRequestContext:context,
  verifyAuthorizedReader:async supplied=>{
   assert.equal(supplied,context);return state.reader;
  },now:()=>state.time,
 });
 const delivery=createGame3DPrivateQuestbookDelivery849({
  enabled:true,view,scope,serverRequestContext:context,
  verifyEdgeRequest:async ({serverRequestContext,edgeContext:edge,
   operation})=>{
   assert.equal(serverRequestContext,context);
   assert.equal(edge,edgeContext);
   assert.ok(['open','poll'].includes(operation));
   return state.edge;
  },now:()=>state.time,
 });
 return {state,host,view,delivery};
}
const req={edgeContext};

test('85.4 real 84.8→84.9 open strips private world handles and secrets',async()=>{
 const x=make();const result=await x.delivery.open(req);
 assert.equal(result.ok,true);
 assert.equal(result.payload.protocol,'game3d-private-presentation-849');
 assert.equal(result.payload.snapshot.eventSeq,0);
 assert.equal(result.payload.snapshot.player.serverSessionId,undefined);
 assert.equal(result.payload.snapshot.enemies[0].serverEnemyProof,undefined);
 assert.equal(result.payload.originalWorldSession,undefined);
 assert.equal(result.payload.handle,undefined);
 assert.equal(x.state.opens,1);
 await x.delivery.shutdown();
});
test('85.4 original status event reaches read-only Questbook with proof removed',async()=>{
 const x=make();await x.delivery.open(req);
 const r=await x.delivery.poll(req);
 assert.equal(r.ok,true);
 assert.equal(r.payload.events.length,1);
 assert.equal(r.payload.events[0].seq,1);
 assert.equal(r.payload.events[0].secretReceiptId,undefined);
 assert.equal(r.payload.questbook.objectives[0].current,1);
 assert.equal(r.payload.questbook.objectives[0].receiptId,undefined);
 assert.equal(r.payload.questbook.turnInAuthorized,false);
 assert.equal(r.payload.nextSeq,1);
 await x.delivery.shutdown();
});
test('85.4 sequential event cursor comes from original private host, never caller',async()=>{
 const x=make();await x.delivery.open(req);
 assert.equal((await x.delivery.poll(req)).payload.nextSeq,1);
 x.state.time+=500;
 assert.equal((await x.delivery.poll(req)).payload.nextSeq,2);
 assert.equal(x.state.reads,2);
 assert.equal((await x.delivery.poll({edgeContext,afterSeq:0})).ok,false);
 await x.delivery.shutdown();
});
test('85.4 objective target reached remains display only with no new rewards',async()=>{
 const x=make();x.state.progress=3;await x.delivery.open(req);
 const r=await x.delivery.poll(req);
 assert.equal(r.ok,true);
 assert.equal(r.payload.questbook.objectives[0].targetReached,true);
 assert.equal(r.payload.questbook.turnInAuthorized,false);
 assert.equal(r.rewardAuthorized,false);
 assert.equal(r.rewardsIssued,false);
 assert.equal(x.delivery.rewardWriterInstalled,false);
 await x.delivery.shutdown();
});
test('85.4 inner 84.8 viewer lease rotation fences outer 84.9 read',async()=>{
 const x=make();await x.delivery.open(req);
 let release;x.state.held=new Promise(resolve=>{release=resolve});
 const running=x.delivery.poll(req);
 await new Promise(resolve=>setImmediate(resolve));
 x.state.reader={...verifiedReader(),
  leaseNonce:'75485485-4854-4854-8854-854854854854'};
 release();
 const r=await running;
 assert.equal(r.ok,false);
 assert.equal(x.state.shutdowns,1);
 assert.equal((await x.delivery.poll(req)).ok,false);
});
test('85.4 foreign 84.9 edge identity cannot close another owner’s 84.8 world',async()=>{
 const x=make();await x.delivery.open(req);
 x.state.edge={...verifiedEdge(),characterId:'otherHero'};
 const r=await x.delivery.poll(req);
 assert.equal(r.ok,false);
 assert.equal(r.reason,'private_edge_authentication_failed');
 assert.equal(x.state.reads,0);
 assert.equal(x.state.shutdowns,0);
 x.state.edge=verifiedEdge();
 assert.equal((await x.delivery.poll(req)).ok,true);
 await x.delivery.shutdown();
});
test('85.4 verified same-player lease rotation revokes stale 84.9 generation',async()=>{
 const x=make();await x.delivery.open(req);
 x.state.edge={...verifiedEdge(),
  leaseNonce:'75485485-4854-4854-8854-854854854854'};
 const r=await x.delivery.poll(req);
 assert.equal(r.reason,'private_edge_session_changed');
 assert.equal(x.state.reads,0);
 assert.equal(x.state.shutdowns,1);
});
test('85.4 tampered original objective is refused across both authentic adapters',async()=>{
 const x=make();await x.delivery.open(req);
 x.state.frameOverride={ok:true,version:'84.6',privateServerOnly:true,
  rewardsIssued:false,rewardAuthorized:false,productionReady:false,
  reset:false,gap:false,snapshot:snapshot(1),
  events:[statusEvent(1)],nextSeq:1,hasMore:false,
  objectives:[{...objective(),required:0}],
 };
 const r=await x.delivery.poll(req);
 assert.equal(r.ok,false);
 assert.equal(x.state.shutdowns,1);
});
test('85.4 84.9 throttling survives the full original 84.8 chain',async()=>{
 const x=make();await x.delivery.open(req);
 assert.equal((await x.delivery.poll(req)).ok,true);
 const tooSoon=await x.delivery.poll(req);
 assert.equal(tooSoon.reason,'private_delivery_rate_limited');
 assert.equal(tooSoon.retryAfterMs,500);
 assert.equal(x.state.reads,1);
 x.state.time+=500;
 assert.equal((await x.delivery.poll(req)).ok,true);
 await x.delivery.shutdown();
});
test('85.4 teardown closes original host only once and leaves live flags off',async()=>{
 const x=make();await x.delivery.open(req);
 assert.equal(await x.delivery.shutdown(),true);
 assert.equal(await x.delivery.shutdown(),false);
 assert.equal(x.state.shutdowns,1);
 assert.equal(x.delivery.featureEnabledInLiveGame,false);
 assert.equal(x.delivery.publicTransportInstalled,false);
 assert.equal(x.view.credentialDeliveredToBrowser,false);
});
process.on('exit',()=>{
 if(old===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=old;
});
