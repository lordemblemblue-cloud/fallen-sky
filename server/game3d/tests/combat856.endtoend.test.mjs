// Game 3D 85.6 — real 84.8 -> 84.9 -> 85.0 module composition.
// Uses genuine local Node HTTP requests, mocks ONLY original 84.6 world
// and independently trusted backend session verification. No PG/Base44 live.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createGame3DPrivateQuestbookPresentation848}
 from '../privateQuestbookPresentation848.mjs';
import {createGame3DPrivateQuestbookDelivery849}
 from '../privateQuestbookDelivery849.mjs';
import {createGame3DPrivateQuestbookPreviewTransport850}
 from '../privateQuestbookPreviewTransport850.mjs';

const stage=process.env.GAME3D_PRIVATE_STAGING_ENV;
const preview=process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850='enabled';
const nonce='85685685-6856-4856-8856-856856856856';
const ACTION='qb174-'+'a'.repeat(64);
const OPEN='/_internal/game3d/questbook-preview/open';
const FRAME='/_internal/game3d/questbook-preview/frame';
const delay=t=>new Promise(resolve=>setTimeout(resolve,t));

function worldFixture(character='hero856'){
 const scope={ownerId:'owner856',characterId:character,
  instanceId:'world-instance-856-'+character,
  instanceEpoch:'world-epoch-856',
  mapFingerprint:'b'.repeat(64)};
 const serverRequestContext=Object.freeze({server:'current-private-world'});
 const edgeContext=Object.freeze({verifiedReadContext:'private'});
 const state={time:1000000,seq:0,started:0,frames:0,shutdowns:0,
  readerOverride:null,edgeOverride:null,gatewayOverride:null,
  objectiveCount:1,frameOverride:null};
 const player=()=>({x:1,z:2,hp:80,maxHp:100,stamina:70,facing:0,
  lastIntentSeq:0,privateOwnerId:'DO_NOT_EXPOSE'});
 const enemy=()=>({id:'wolf1',x:2,z:2,hp:10,maxHp:20,alive:true,
  pendingImpactAt:null,privateDropId:'DO_NOT_EXPOSE'});
 const snapshot=seq=>({eventSeq:seq,serverTime:1000,
  player:player(),enemies:[enemy()],serverToken:'DO_NOT_EXPOSE'});
 const action=()=>({authenticated:true,
  identitySource:'base44-verified-action-session-179',
  accountId:scope.ownerId,characterId:scope.characterId,
  worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
  worldSessionId:'world-session-856',actionSessionId:ACTION,
  leaseNonce:nonce,expiresAtMs:1090000});
 const edge=()=>({authenticated:true,
  identitySource:'independent-server-edge-849',
  credentialVerified:true,originApproved:true,csrfVerified:true,
  readOnly:true,method:'GET',accountId:scope.ownerId,
  characterId:scope.characterId,worldInstanceId:scope.instanceId,
  worldEpoch:scope.instanceEpoch,worldSessionId:'world-session-856',
  actionSessionId:ACTION,leaseNonce:nonce,expiresAtMs:1090000});
 const gateway=()=>({authenticated:true,
  identitySource:'trusted-private-http-preview-850',
  gatewayVerified:true,sessionActive:true,readOnly:true,method:'GET',
  accountId:scope.ownerId,characterId:scope.characterId,
  worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
  worldSessionId:'world-session-856',actionSessionId:ACTION,
  leaseNonce:nonce,expiresAtMs:1090000,edgeContext});
 const host={version:'84.6',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  credentialDeliveredToBrowser:false,hostedWorkerInstalled:false,
  async open(){state.started++;return {
   ok:true,version:'84.6',privateServerOnly:true,rewardsIssued:false,
   handle:Object.freeze({original:'private-world'}),
   snapshot:snapshot(0),sessionKey:'SECRET',
  }},
  async frame({afterSeq}){state.frames++;
   assert.equal(afterSeq,state.seq);
   const current=++state.seq;
   if(state.frameOverride)return state.frameOverride;
   return {ok:true,version:'84.6',privateServerOnly:true,
    rewardsIssued:false,rewardAuthorized:false,productionReady:false,
    snapshot:snapshot(current),reset:false,gap:false,hasMore:false,
    nextSeq:current,
    events:[{seq:current,kind:'player_strike',serverTime:1000,
     targetId:'wolf1',damage:8,killed:false,secretReceipt:'PRIVATE'}],
    objectives:[{questId:'axe_q_first_patrol',objectiveId:'patrol_kills',
     status:'accepted',current:state.objectiveCount,required:3,
     receiptProof:'PRIVATE'}],
   };
  },
  async disconnect(){return {ok:true,rewardsIssued:false}},
  async shutdown(){state.shutdowns++;return true},
 };
 const view=createGame3DPrivateQuestbookPresentation848({
  enabled:true,host,scope,serverRequestContext,
  verifyAuthorizedReader:async ctx=>{
   assert.equal(ctx,serverRequestContext);
   return state.readerOverride??action();
  },now:()=>state.time,
 });
 const delivery=createGame3DPrivateQuestbookDelivery849({
  enabled:true,view,scope,serverRequestContext,
  verifyEdgeRequest:async ({serverRequestContext:ctx,edgeContext:edgeValue})=>{
   assert.equal(ctx,serverRequestContext);
   assert.equal(edgeValue,edgeContext);
   return state.edgeOverride??edge();
  },now:()=>state.time,
 });
 const transport=createGame3DPrivateQuestbookPreviewTransport850({
  enabled:true,delivery,scope,serverRequestContext,
  verifyGatewayRequest:async({serverRequestContext:ctx,request})=>{
   assert.equal(ctx,serverRequestContext);
   assert.ok(request.socket);
   return state.gatewayOverride??gateway();
  },now:()=>state.time,
  requestTimeoutMs:1000,idleTimeoutMs:10000,
 });
 const server=createServer((req,res)=>void transport.handle(req,res));
 return {state,scope,view,delivery,transport,server,gatewayProof:gateway,
  async start(){
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
   const base='http://127.0.0.1:'+server.address().port;
   return async path=>{
    const response=await fetch(base+path);
    return {status:response.status,body:await response.json(),
     headers:response.headers};
   };
  },
  async close(){
   await transport.shutdown();
   server.closeAllConnections();
   await new Promise(resolve=>server.close(resolve));
  },
 };
}
test('85.6 full original read-only chain returns bounded combat and Questbook JSON',async()=>{
 const x=worldFixture();const get=await x.start();
 try{
  const opened=await get(OPEN);
  assert.equal(opened.status,200);
  assert.equal(opened.body.data.snapshot.player.hp,80);
  assert.equal(opened.body.data.snapshot.player.privateOwnerId,undefined);
  assert.equal(opened.body.data.snapshot.enemies[0].privateDropId,undefined);
  assert.equal(opened.body.data.sessionKey,undefined);
  assert.equal(opened.body.rewardAuthorized,false);
  const frame=await get(FRAME);
  assert.equal(frame.status,200);
  assert.equal(frame.body.data.events[0].seq,1);
  assert.equal(frame.body.data.events[0].secretReceipt,undefined);
  assert.equal(frame.body.data.questbook.objectives[0].current,1);
  assert.equal(frame.body.data.questbook.objectives[0].receiptProof,undefined);
  assert.equal(frame.body.data.questbook.turnInAuthorized,false);
  assert.equal(frame.headers.get('cache-control').includes('no-store'),true);
  assert.equal(x.state.started,1);
  assert.equal(x.state.frames,1);
 }finally{await x.close()}
});
test('85.6 genuine nested edge/session rotation revokes host and HTTP session',async()=>{
 const x=worldFixture();const get=await x.start();
 try{
  assert.equal((await get(OPEN)).status,200);
  x.state.readerOverride={authenticated:false};
  const denied=await get(FRAME);
  assert.equal(denied.status,403);
  assert.equal(x.state.shutdowns,1);
  assert.equal((await get(FRAME)).status,410);
 }finally{await x.close()}
});
test('85.6 original read-model rejects corrupt quest evidence before network output',async()=>{
 const x=worldFixture();const get=await x.start();
 try{
  assert.equal((await get(OPEN)).status,200);
  x.state.frameOverride={ok:true,version:'84.6',
   privateServerOnly:true,rewardsIssued:false,rewardAuthorized:false,
   productionReady:false,reset:false,gap:false,hasMore:false,nextSeq:1,
   snapshot:{eventSeq:1,serverTime:1000,
    player:{x:1,z:1,hp:80,maxHp:100,stamina:70,facing:0,lastIntentSeq:0},
    enemies:[]},events:[],
   objectives:[{questId:'axe_q_first_patrol',objectiveId:'patrol_kills',
    status:'accepted',current:99,required:3}]};
  const denied=await get(FRAME);
  assert.equal(denied.status,403);
  assert.equal(x.state.shutdowns,1);
 }finally{await x.close()}
});
test('85.6 original 84.9 per-player rate limit survives real HTTP delivery',async()=>{
 const x=worldFixture();const get=await x.start();
 try{
  await get(OPEN);
  assert.equal((await get(FRAME)).status,200);
  const blocked=await get(FRAME);
  assert.equal(blocked.status,429);
  assert.equal(blocked.body.code,'preview_rate_limited');
  x.state.time+=500;
  assert.equal((await get(FRAME)).status,200);
  assert.equal(x.state.frames,2);
 }finally{await x.close()}
});
test('85.6 independent player world hosts cannot view one another’s Questbook',async()=>{
 const a=worldFixture('heroOne856'),b=worldFixture('heroTwo856');
 const getA=await a.start(),getB=await b.start();
 try{
  await getA(OPEN);await getB(OPEN);
  a.state.objectiveCount=3;b.state.objectiveCount=1;
  const ra=await getA(FRAME),rb=await getB(FRAME);
  assert.equal(ra.status,200);assert.equal(rb.status,200);
  assert.equal(ra.body.data.questbook.objectives[0].current,3);
  assert.equal(rb.body.data.questbook.objectives[0].current,1);
  assert.equal(ra.body.data.questbook.turnInAuthorized,false);
  assert.equal(a.state.started,1);assert.equal(b.state.started,1);
  a.state.gatewayOverride={...a.gatewayProof(),
   leaseNonce:'75685685-6856-4856-8856-856856856856'};
  assert.equal((await getA(FRAME)).status,403);
  assert.equal(a.state.shutdowns,1);
  b.state.time+=500;
  assert.equal((await getB(FRAME)).status,200);
 }finally{await Promise.all([a.close(),b.close()])}
});
process.on('exit',()=>{
 if(stage===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=stage;
 if(preview===undefined)delete process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850;
 else process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850=preview;
});
