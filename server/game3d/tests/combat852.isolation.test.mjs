// 85.2: real loopback requests proving cross-player traffic does not evict
// the owner of an existing private, single-world preview transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createGame3DPrivateQuestbookPreviewTransport850}
 from '../privateQuestbookPreviewTransport850.mjs';

const oldEnv={stage:process.env.GAME3D_PRIVATE_STAGING_ENV,
 preview:process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850};
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850='enabled';
const OPEN='/_internal/game3d/questbook-preview/open';
const FRAME='/_internal/game3d/questbook-preview/frame';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const scopeFor=name=>Object.freeze({ownerId:'owner852'+name,
 characterId:'hero852'+name,instanceId:'world-instance-852-'+name,
 instanceEpoch:'world-epoch-852-'+name,mapFingerprint:'a'.repeat(64)});
const sharedPrivateEdgeContext=Object.freeze({serverVerified:true});
const evidence=(s)=>Object.freeze({authenticated:true,
 identitySource:'trusted-private-http-preview-850',gatewayVerified:true,
 sessionActive:true,readOnly:true,method:'GET',accountId:s.ownerId,
 characterId:s.characterId,worldInstanceId:s.instanceId,
 worldEpoch:s.instanceEpoch,worldSessionId:'world-session-852',
 actionSessionId:'qb174-'+'a'.repeat(64),
 leaseNonce:'85285285-2852-4852-8852-852852852852',
 expiresAtMs:1200000,edgeContext:sharedPrivateEdgeContext,
});
const makePayload=()=>({protocol:'game3d-private-presentation-849',
 snapshot:{eventSeq:1,serverTime:1000,
  player:{x:0,z:0,hp:100,maxHp:100,stamina:90,facing:0,lastIntentSeq:0},
  enemies:[]},events:[],nextSeq:1,reset:true,gap:false,hasMore:false,
 questbook:{objectives:[],objectiveTargetOnly:true,turnInAuthorized:false}});
const accepted=()=>({ok:true,version:'84.9',privateServerOnly:true,
 productionReady:false,rewardsIssued:false,rewardAuthorized:false,
 cacheControl:'no-store',contentType:'application/json',payload:makePayload()});
async function make(name){
 const scope=scopeFor(name),context=Object.freeze({backend:'852-'+name});
 const state={proof:evidence(scope),calls:[],shutdowns:0,authChecks:0,
  blocked:null,entered:false};
 const delivery={version:'84.9',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  credentialDeliveredToBrowser:false,featureEnabledInLiveGame:false,
  async open(){state.calls.push('open');return accepted()},
  async poll(){state.calls.push('poll');return accepted()},
  async shutdown(){state.calls.push('shutdown');state.shutdowns++;return true},
 };
 const transport=createGame3DPrivateQuestbookPreviewTransport850({
  enabled:true,delivery,scope,serverRequestContext:context,now:()=>1000000,
  verifyGatewayRequest:async({serverRequestContext})=>{
   assert.equal(serverRequestContext,context);state.authChecks++;
   if(state.blocked){state.entered=true;await state.blocked;}
   return state.proof;
  },requestTimeoutMs:1000,idleTimeoutMs:5000,
 });
 const server=createServer((req,res)=>{void transport.handle(req,res)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const get=(path,options)=>fetch(base+path,options).then(async response=>({
  status:response.status,body:await response.json()}));
 const close=async()=>{await transport.shutdown();server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve))};
 return {transport,state,get,close};
}

test('85.2 two private worlds keep their own sessions and independent updates',async()=>{
 const a=await make('a'),b=await make('b');
 try{
  const opens=await Promise.all([a.get(OPEN),b.get(OPEN)]);
  assert.deepEqual(opens.map(x=>x.status),[200,200]);
  assert.deepEqual((await Promise.all([a.get(FRAME),b.get(FRAME)]))
   .map(x=>x.status),[200,200]);
  assert.deepEqual(a.state.calls,['open','poll']);
  assert.deepEqual(b.state.calls,['open','poll']);
  assert.equal(a.state.shutdowns,0);assert.equal(b.state.shutdowns,0);
 }finally{await a.close();await b.close()}
});

test('85.2 a foreign player cannot shut down an existing private view',async()=>{
 const a=await make('a');try{
  assert.equal((await a.get(OPEN)).status,200);
  a.state.proof=evidence(scopeFor('b'));
  assert.equal((await a.get(FRAME)).status,403);
  assert.equal(a.state.shutdowns,0);
  a.state.proof=evidence(scopeFor('a'));
  assert.equal((await a.get(FRAME)).status,200);
  assert.equal(a.state.shutdowns,0);
  assert.deepEqual(a.state.calls,['open','poll']);
 }finally{await a.close()}
});

test('85.2 an anonymous/foreign request abort during verification does not evict owner',async()=>{
 const a=await make('a');try{
  assert.equal((await a.get(OPEN)).status,200);
  let release;a.state.blocked=new Promise(resolve=>{release=resolve});
  a.state.proof=evidence(scopeFor('b'));
  const controller=new AbortController();
  const request=a.get(FRAME,{signal:controller.signal}).then(
   r=>r,()=>null);
  for(let i=0;i<150&&!a.state.entered;i++)await sleep(1);
  assert.equal(a.state.entered,true);
  controller.abort();await request;
  release();a.state.blocked=null;
  await sleep(40);
  assert.equal(a.state.shutdowns,0);
  a.state.proof=evidence(scopeFor('a'));
  assert.equal((await a.get(FRAME)).status,200);
  assert.equal(a.state.shutdowns,0);
 }finally{await a.close()}
});

test('85.2 the real same-player lease rotation still revokes the prior world',async()=>{
 const a=await make('a');try{
  assert.equal((await a.get(OPEN)).status,200);
  a.state.proof=Object.freeze({...evidence(scopeFor('a')),
   leaseNonce:'95285285-2852-4852-8852-852852852852'});
  assert.equal((await a.get(FRAME)).status,403);
  assert.equal((await a.get(FRAME)).status,410);
  assert.equal(a.state.shutdowns,1);
 }finally{await a.close()}
});

process.on('exit',()=>{
 if(oldEnv.stage===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=oldEnv.stage;
 if(oldEnv.preview===undefined)delete process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850;
 else process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850=oldEnv.preview;
});
