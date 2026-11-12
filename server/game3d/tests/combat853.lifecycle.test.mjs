// 85.3 late-completion guards on a real private loopback Node HTTP server.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createGame3DPrivateQuestbookPreviewTransport850}
 from '../privateQuestbookPreviewTransport850.mjs';

const before={stage:process.env.GAME3D_PRIVATE_STAGING_ENV,
 preview:process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850};
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850='enabled';
const OPEN='/_internal/game3d/questbook-preview/open';
const FRAME='/_internal/game3d/questbook-preview/frame';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const scope={ownerId:'owner853',characterId:'hero853',
 instanceId:'world-instance-853',instanceEpoch:'world-epoch-853',
 mapFingerprint:'a'.repeat(64)};
const edgeContext=Object.freeze({privateEdge:'853'});
const proof=Object.freeze({authenticated:true,
 identitySource:'trusted-private-http-preview-850',gatewayVerified:true,
 sessionActive:true,readOnly:true,method:'GET',accountId:scope.ownerId,
 characterId:scope.characterId,worldInstanceId:scope.instanceId,
 worldEpoch:scope.instanceEpoch,worldSessionId:'world-session-853',
 actionSessionId:'qb174-'+'a'.repeat(64),
 leaseNonce:'85385385-3853-4853-8853-853853853853',
 expiresAtMs:1100000,edgeContext});
const payload=()=>({protocol:'game3d-private-presentation-849',
 snapshot:{eventSeq:1,serverTime:1000,player:{x:0,z:0,hp:100,maxHp:100,
  stamina:100,facing:0,lastIntentSeq:0},enemies:[]},events:[],nextSeq:1,
 reset:true,gap:false,hasMore:false,
 questbook:{objectives:[],objectiveTargetOnly:true,turnInAuthorized:false}});
const accepted=()=>({ok:true,version:'84.9',privateServerOnly:true,
 productionReady:false,rewardsIssued:false,rewardAuthorized:false,
 cacheControl:'no-store',contentType:'application/json',payload:payload()});
async function fixture({timeout=60}={}){
 const state={authCalls:0,openCalls:0,pollCalls:0,shutdowns:0,
  authHold:null,holdOpen:null,holdPoll:null,entered:0,remoteAborted:false};
 const delivery={version:'84.9',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  featureEnabledInLiveGame:false,credentialDeliveredToBrowser:false,
  async open(){state.openCalls++;if(state.holdOpen)await state.holdOpen;
   return accepted()},
  async poll(){state.pollCalls++;if(state.holdPoll)await state.holdPoll;
   return accepted()},
  async shutdown(){state.shutdowns++;return true},
 };
 const transport=createGame3DPrivateQuestbookPreviewTransport850({
  delivery,scope,enabled:true,serverRequestContext:Object.freeze({test:'853'}),
  now:()=>1000000,requestTimeoutMs:timeout,idleTimeoutMs:5000,
  verifyGatewayRequest:async()=>{state.authCalls++;state.entered++;
   if(state.authHold)await state.authHold;return proof},
 });
 const server=createServer((req,res)=>{
  res.once('close',()=>{if(!res.writableFinished)state.remoteAborted=true});
  void transport.handle(req,res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const get=(path,opts)=>fetch(base+path,opts).then(async r=>({status:r.status,
  body:await r.json()}));
 const close=async()=>{await transport.shutdown();server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve))};
 return {state,transport,get,close};
}

test('85.3 timeout during initial gateway verification cannot open a world afterward',async()=>{
 const x=await fixture({timeout:50});try{
  let release;x.state.authHold=new Promise(resolve=>{release=resolve});
  const request=x.get(OPEN);
  for(let i=0;i<100&&!x.state.entered;i++)await sleep(1);
  assert.equal(x.state.entered,1);
  const expired=await request;
  assert.equal(expired.status,504);
  assert.equal(expired.body.code,'preview_upstream_timeout');
  assert.equal(x.state.openCalls,0);
  release();x.state.authHold=null;await sleep(30);
  assert.equal(x.state.openCalls,0);
  assert.equal(x.state.shutdowns,1);
  assert.equal((await x.get(OPEN)).status,410);
 }finally{await x.close()}
});

test('85.3 aborted owner request before delayed proof cannot open a session',async()=>{
 const x=await fixture({timeout:1000});try{
  let release;x.state.authHold=new Promise(resolve=>{release=resolve});
  const controller=new AbortController();
  const pending=x.get(OPEN,{signal:controller.signal}).then(v=>v,()=>null);
  for(let i=0;i<100&&!x.state.entered;i++)await sleep(1);
  assert.equal(x.state.entered,1);
  controller.abort();await pending;
  for(let i=0;i<100&&!x.state.remoteAborted;i++)await sleep(1);
  assert.equal(x.state.remoteAborted,true);
  release();x.state.authHold=null;await sleep(40);
  assert.equal(x.state.openCalls,0);
  assert.equal(x.state.shutdowns,1);
  assert.equal((await x.get(OPEN)).status,410);
 }finally{await x.close()}
});

test('85.3 concurrent GET open cannot create two original-world sessions',async()=>{
 const x=await fixture({timeout:1000});try{
  let release;x.state.holdOpen=new Promise(resolve=>{release=resolve});
  const first=x.get(OPEN);
  for(let i=0;i<150&&x.state.openCalls===0;i++)await sleep(1);
  assert.equal(x.state.openCalls,1);
  const second=await x.get(OPEN);
  assert.equal(second.status,409);
  assert.equal(second.body.code,'preview_lifecycle_conflict');
  assert.equal(x.state.openCalls,1);
  release();const successful=await first;
  assert.equal(successful.status,200);
  assert.equal(x.state.shutdowns,0);
  assert.equal(x.state.openCalls,1);
  assert.equal((await x.get(FRAME)).status,200);
 }finally{await x.close()}
});

test('85.3 an upstream read released after timeout does not reauthenticate',async()=>{
 const x=await fixture({timeout:50});try{
  assert.equal((await x.get(OPEN)).status,200);
  let release;x.state.holdPoll=new Promise(resolve=>{release=resolve});
  const start=x.get(FRAME);
  for(let i=0;i<100&&x.state.pollCalls===0;i++)await sleep(1);
  assert.equal(x.state.pollCalls,1);
  const response=await start;
  assert.equal(response.status,504);
  const checks=x.state.authCalls;
  release();await sleep(30);
  assert.equal(x.state.authCalls,checks);
  assert.equal(x.state.shutdowns,1);
  assert.equal((await x.get(FRAME)).status,410);
 }finally{await x.close()}
});

process.on('exit',()=>{
 if(before.stage===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=before.stage;
 if(before.preview===undefined)delete process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850;
 else process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850=before.preview;
});
