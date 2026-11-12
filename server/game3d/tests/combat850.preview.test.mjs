import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {createGame3DPrivateQuestbookPreviewTransport850,
 GAME3D_PREVIEW_HTTP_LIMITS_850} from '../privateQuestbookPreviewTransport850.mjs';

const oldStage=process.env.GAME3D_PRIVATE_STAGING_ENV;
const oldPreview=process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850='enabled';
const scope={ownerId:'owner850',characterId:'hero850',
 instanceId:'world-instance-850',instanceEpoch:'world-epoch-850',
 mapFingerprint:'a'.repeat(64)};
const serverContext=Object.freeze({trustedBackend:'private'});
const edgeContext=Object.freeze({serverVerified:true});
const originalProof=()=>({authenticated:true,
 identitySource:'trusted-private-http-preview-850',gatewayVerified:true,
 sessionActive:true,readOnly:true,method:'GET',accountId:scope.ownerId,
 characterId:scope.characterId,worldInstanceId:scope.instanceId,
 worldEpoch:scope.instanceEpoch,worldSessionId:'world-session-850',
 actionSessionId:'qb174-'+'a'.repeat(64),
 leaseNonce:'85085085-0850-4850-8850-850850850850',
 expiresAtMs:1050000,edgeContext});
const payload=()=>({protocol:'game3d-private-presentation-849',
 snapshot:{eventSeq:1,serverTime:1000,player:{x:0,z:0,hp:100,
  maxHp:100,stamina:100,facing:0,lastIntentSeq:0},enemies:[]},
 events:[],nextSeq:1,reset:true,gap:false,hasMore:false,
 questbook:{objectives:[],objectiveTargetOnly:true,turnInAuthorized:false}});
const accepted=()=>({ok:true,version:'84.9',privateServerOnly:true,
 productionReady:false,rewardsIssued:false,rewardAuthorized:false,
 cacheControl:'no-store',contentType:'application/json',payload:payload(),
 sessionSecret:'DO_NOT_LEAK'});
const network=(state,opts={})=>{
 const delivery={version:'84.9',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  credentialDeliveredToBrowser:false,featureEnabledInLiveGame:false,
  async open({edgeContext:edge}){state.calls.push('open');
   assert.equal(edge,edgeContext);
   if(state.holdOpen)await state.holdOpen;
   return state.openReply??accepted();},
  async poll({edgeContext:edge}){state.calls.push('poll');
   assert.equal(edge,edgeContext);
   state.pendingPolls++;
   if(state.holdPoll)await state.holdPoll;
   return state.pollReply??accepted();},
  async shutdown(){state.calls.push('shutdown');state.shutdowns++;return true},
 };
 const transport=createGame3DPrivateQuestbookPreviewTransport850({
  delivery,scope,serverRequestContext:serverContext,
  verifyGatewayRequest:async({request,serverRequestContext,operation})=>{
   assert.equal(serverRequestContext,serverContext);
   assert.ok(request.socket);
   assert.ok(['open','poll'].includes(operation));
   state.authCalls++;
   return state.proof;
  },now:()=>state.clock,
  requestTimeoutMs:opts.requestTimeoutMs??500,
  idleTimeoutMs:opts.idleTimeoutMs??3000,enabled:true,
 });
 const server=createServer((req,res)=>{void transport.handle(req,res)});
 return {delivery,transport,server};
};
async function fixture(opts={}){
 const state={clock:1000000,authCalls:0,proof:originalProof(),calls:[],
  shutdowns:0,pendingPolls:0,openReply:null,pollReply:null,
  holdOpen:null,holdPoll:null};
 const parts=network(state,opts);
 await new Promise((resolve,reject)=>parts.server.listen(0,'127.0.0.1',
  error=>error?reject(error):resolve()));
 const base='http://127.0.0.1:'+parts.server.address().port;
 const cleanup=async()=>{await parts.transport.shutdown();
  parts.server.closeAllConnections();await new Promise(resolve=>
   parts.server.close(resolve))};
 const call=(segment,options)=>fetch(base+segment,options).then(async r=>({
  status:r.status,headers:r.headers,body:await r.json(),
 }));
 const rawHost=(host)=>new Promise((resolve,reject)=>{
  const req=httpRequest(base+OPEN,{headers:{Host:host}},res=>{
   const chunks=[];res.on('data',c=>chunks.push(c));
   res.on('end',()=>resolve({status:res.statusCode,
    body:JSON.parse(Buffer.concat(chunks).toString('utf8'))}));
  });req.on('error',reject);req.end();
 });
 return {...parts,base,state,call,rawHost,cleanup};
}
const OPEN='/_internal/game3d/questbook-preview/open';
const FRAME='/_internal/game3d/questbook-preview/frame';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Actual local Node HTTP loopback requests, not simulated handler arguments.
test('85.0 serves a verified GET open/frame with no-cache security headers',async()=>{
 const x=await fixture();try{
  const a=await x.call(OPEN);assert.equal(a.status,200);
  assert.equal(a.body.ok,true);
  assert.equal(a.body.data.protocol,'game3d-private-presentation-849');
  assert.equal(a.body.data.sessionSecret,undefined);
  assert.equal(a.body.data.questbook.turnInAuthorized,false);
  assert.match(a.headers.get('cache-control'),/no-store/);
  assert.equal(a.headers.get('x-content-type-options'),'nosniff');
  assert.equal(a.headers.get('access-control-allow-origin'),null);
  const b=await x.call(FRAME);assert.equal(b.status,200);
  assert.equal(b.body.ok,true);
  assert.deepEqual(x.state.calls,['open','poll']);
  assert.equal(x.state.authCalls,4);
 }finally{await x.cleanup()}
});
test('85.0 rejects unknown routes, queries, non-GET and request bodies',async()=>{
 const x=await fixture();try{
  assert.equal((await x.call('/index')).status,404);
  assert.equal((await x.call(OPEN+'?owner=other')).status,404);
  assert.equal((await x.call(OPEN,{method:'POST',body:'{}'})).status,405);
  assert.equal((await x.call(OPEN,{headers:{'content-length':'0'}})).status,200);
  assert.equal((await x.call(FRAME,{method:'POST',body:'attack'})).status,405);
  assert.deepEqual(x.state.calls,['open']);
 }finally{await x.cleanup()}
});
test('85.0 rejects forwarded and external Host headers before authentication',async()=>{
 const x=await fixture();try{
  assert.equal((await x.call(OPEN,{headers:{'x-forwarded-for':'192.0.2.1'}})).status,403);
  assert.equal((await x.rawHost('public.example')).status,403);
  assert.equal(x.state.authCalls,0);
  assert.equal((await x.call(OPEN)).status,200);
 }finally{await x.cleanup()}
});
test('85.0 no verified world session means no view access',async()=>{
 const x=await fixture();try{
  x.state.proof={...originalProof(),accountId:'attacker'};
  assert.equal((await x.call(OPEN)).status,403);
  assert.equal(x.state.shutdowns,0);
  assert.equal(x.state.calls.includes('open'),false);
  x.state.proof=originalProof();
  assert.equal((await x.call(OPEN)).status,200);
  assert.equal((await x.call(FRAME)).status,200);
 }finally{await x.cleanup()}
});
test('85.0 rejects a replaced world lease after an in-flight private poll',async()=>{
 const x=await fixture();try{
  assert.equal((await x.call(OPEN)).status,200);
  let release;x.state.holdPoll=new Promise(resolve=>{release=resolve});
  const pending=x.call(FRAME);
  for(let i=0;i<100&&x.state.pendingPolls===0;i++)await pause(1);
  assert.equal(x.state.pendingPolls,1);
  x.state.proof={...originalProof(),leaseNonce:'95085085-0850-4850-8850-850850850850'};
  release();assert.equal((await pending).status,403);
  assert.equal((await x.call(FRAME)).status,410);
  assert.equal(x.state.shutdowns,1);
 }finally{await x.cleanup()}
});
test('85.0 maps original 84.9 throttling to 429 with Retry-After',async()=>{
 const x=await fixture();try{
  await x.call(OPEN);
  x.state.pollReply={ok:false,reason:'private_delivery_rate_limited',retryAfterMs:1200};
  const r=await x.call(FRAME);
  assert.equal(r.status,429);assert.equal(r.body.code,'preview_rate_limited');
  assert.equal(r.headers.get('retry-after'),'2');
  assert.equal(x.state.shutdowns,0);
 }finally{await x.cleanup()}
});
test('85.0 temporary 84.9 view not-ready is 503 without closing',async()=>{
 const x=await fixture();try{
  await x.call(OPEN);
  x.state.pollReply={ok:false,reason:'private_view_not_ready'};
  assert.equal((await x.call(FRAME)).status,503);
  x.state.pollReply=null;
  assert.equal((await x.call(FRAME)).status,200);
 }finally{await x.cleanup()}
});
test('85.0 invalid success metadata fences preview session and closes delivery',async()=>{
 const x=await fixture();try{
  await x.call(OPEN);
  x.state.pollReply={...accepted(),cacheControl:'public'};
  assert.equal((await x.call(FRAME)).status,502);
  assert.equal((await x.call(FRAME)).status,410);
  assert.equal(x.state.shutdowns,1);
 }finally{await x.cleanup()}
});
test('85.0 request deadline closes a stalled delivery with a bounded 504',async()=>{
 const x=await fixture({requestTimeoutMs:50});try{
  await x.call(OPEN);
  let release;x.state.holdPoll=new Promise(resolve=>{release=resolve});
  const r=await x.call(FRAME);
  assert.equal(r.status,504);assert.equal(r.body.code,'preview_upstream_timeout');
  assert.equal((await x.call(FRAME)).status,410);
  release();
  for(let i=0;i<20&&x.state.shutdowns===0;i++)await pause(1);
  assert.equal(x.state.shutdowns,1);
 }finally{await x.cleanup()}
});
test('85.0 idle preview sessions expire without a browser-side quit route',async()=>{
 const x=await fixture({idleTimeoutMs:100});try{
  assert.equal((await x.call(OPEN)).status,200);
  await pause(180);
  assert.equal((await x.call(FRAME)).status,410);
  assert.equal(x.state.shutdowns,1);
 }finally{await x.cleanup()}
});
test('85.0 rejects requests above its two inflight limit',async()=>{
 const x=await fixture();try{
  await x.call(OPEN);
  let release;x.state.holdPoll=new Promise(resolve=>{release=resolve});
  const a=x.call(FRAME),b=x.call(FRAME);
  for(let i=0;i<150&&x.state.pendingPolls<2;i++)await pause(1);
  assert.equal(x.state.pendingPolls,2);
  const c=await x.call(FRAME);assert.equal(c.status,429);
  assert.equal(c.body.code,'preview_concurrency_limited');
  release();const done=await Promise.all([a,b]);
  assert.ok(done.every(v=>v.status===200));
 }finally{await x.cleanup()}
});
test('85.0 rejects oversized private JSON and closes its presentation owner',async()=>{
 const x=await fixture();try{
  await x.call(OPEN);
  const body=payload();
  body.snapshot.eventSeq=40;body.nextSeq=40;body.reset=false;
  body.snapshot.enemies=Array.from({length:16},(_,i)=>({
   id:'e'.repeat(154)+String(i).padStart(3,'0'),
   x:0,z:0,hp:10,maxHp:20,alive:true,pendingImpactAt:null,
  }));
  body.questbook.objectives=Array.from({length:128},(_,i)=>({
   questId:'q'.repeat(128),
   objectiveId:'o'.repeat(125)+String(i).padStart(3,'0'),
   status:'a'.repeat(47),current:1,required:2,targetReached:false,
  }));
  body.events=Array.from({length:40},(_,i)=>({
   seq:i+1,kind:'k'.repeat(63),serverTime:1000,
   targetId:'t'.repeat(160),enemyId:'e'.repeat(160),
   tier:'Normal'.padEnd(32,'A'),damage:12,enemyHp:2,playerHp:5,
   critical:false,killed:true,impactAt:1000,
  }));
  assert.ok(Buffer.byteLength(JSON.stringify(body),'utf8')>65536);
  x.state.pollReply={...accepted(),payload:body};
  const r=await x.call(FRAME);
  assert.equal(r.status,502);
  assert.equal(r.body.code,'preview_response_limit');
  assert.equal((await x.call(FRAME)).status,410);
  assert.equal(x.state.shutdowns,1);
 }finally{await x.cleanup()}
});
test('86.1 HTTP preview refuses invalid scalar player HP and forged event sequence',async()=>{
 for(const alteration of [
  body=>{body.snapshot.player.hp='100'},
  body=>{body.snapshot.player.hp=9999},
  body=>{body.events=[{seq:5,kind:'player_strike',serverTime:1000}];
   body.nextSeq=4;body.snapshot.eventSeq=4;body.reset=false},
  body=>{body.questbook.objectives=[{
   questId:'axe_q_first_patrol',objectiveId:'patrol_kills',
   status:'accepted',current:4,required:3,targetReached:false,
  }]},
 ]){
  const x=await fixture();
  try{
   await x.call(OPEN);
   const body=payload();alteration(body);
   x.state.pollReply={...accepted(),payload:body};
   const response=await x.call(FRAME);
   assert.equal(response.status,502);
   assert.equal(response.body.code,'preview_delivery_payload_invalid');
   assert.equal(x.state.shutdowns,1);
  }finally{await x.cleanup()}
 }
});
test('85.0 refuses cyclic internal payloads without hanging the socket',async()=>{
 const x=await fixture();try{
  await x.call(OPEN);
  const cycle=payload();cycle.self=cycle;
  x.state.pollReply={...accepted(),payload:cycle};
  const r=await x.call(FRAME);
  assert.equal(r.status,502);
  assert.equal(r.body.code,'preview_delivery_payload_invalid');
  assert.equal(x.state.shutdowns,1);
 }finally{await x.cleanup()}
});
test('86.2 HTTP preview serializes clean values despite hidden upstream toJSON hooks',async()=>{
 const x=await fixture();
 try{
  await x.call(OPEN);
  const supplied=payload();
  Object.defineProperty(supplied,'toJSON',{
   value:()=>({privateSession:'LEAK_OUTER'}),
  });
  Object.defineProperty(supplied.snapshot.player,'toJSON',{
   value:()=>({privateSession:'LEAK_PLAYER'}),
  });
  Object.defineProperty(supplied.questbook.objectives,'toJSON',{
   value:()=>({privateReceipt:'LEAK_QUEST'}),
  });
  x.state.pollReply={...accepted(),payload:supplied};
  const r=await x.call(FRAME);
  assert.equal(r.status,200);
  assert.equal(r.body.ok,true);
  assert.equal(r.body.data.snapshot.player.hp,100);
  assert.equal(r.body.data.questbook.turnInAuthorized,false);
  assert.doesNotMatch(JSON.stringify(r.body),/LEAK_|privateSession|privateReceipt/);
  assert.equal(x.state.shutdowns,0);
 }finally{await x.cleanup()}
});
test('85.0 rejects extra nested secret fields even in a nominally successful 84.9 packet',async()=>{
 const x=await fixture();try{
  await x.call(OPEN);
  x.state.pollReply={...accepted(),payload:{...payload(),
   snapshot:{...payload().snapshot,player:{...payload().snapshot.player,
    serverSessionId:'secret'}}}};
  const r=await x.call(FRAME);
  assert.equal(r.status,502);
  assert.equal(r.body.code,'preview_delivery_payload_invalid');
  assert.equal(x.state.shutdowns,1);
 }finally{await x.cleanup()}
});
test('85.0 explicit server shutdown is idempotent and refuses fresh requests',async()=>{
 const x=await fixture();try{
  await x.call(OPEN);
  assert.equal(await x.transport.shutdown(),true);
  assert.equal(await x.transport.shutdown(),true);
  assert.equal(x.state.shutdowns,1);
  assert.equal((await x.call(FRAME)).status,410);
 }finally{await x.cleanup()}
});
test('85.0 factory composes only the existing 84.9 private delivery',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../privateCombatQuestStaging850.mjs',import.meta.url),'utf8');
 assert.match(source,/createGame3DPrivateCombatQuestStaging849/);
 assert.match(source,/createGame3DPrivateQuestbookPreviewTransport850/);
 assert.match(source,/GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850/);
 assert.match(source,/verifyGatewayRequest/);
 assert.doesNotMatch(source,/createServer\s*\(/);
 assert.doesNotMatch(source,/\.listen\s*\(/);
});
test('85.0 default-disabled, not a public route and not a listener',()=>{
 assert.throws(()=>createGame3DPrivateQuestbookPreviewTransport850(),
  /explicit private staging world/);
 assert.equal(GAME3D_PREVIEW_HTTP_LIMITS_850.maxInflight,2);
 const x=network({calls:[],shutdowns:0,authCalls:0,proof:originalProof(),
  pendingPolls:0,clock:1000000});
 assert.equal(x.transport.listenerInstalled,false);
 assert.equal(x.transport.publicTransportInstalled,false);
 assert.equal(x.transport.featureEnabledInLiveGame,false);
 void x.transport.shutdown();
});
process.on('exit',()=>{
 if(oldStage===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=oldStage;
 if(oldPreview===undefined)delete process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850;
 else process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850=oldPreview;
});
