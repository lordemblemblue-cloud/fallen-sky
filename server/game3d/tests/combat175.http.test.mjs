// 17.5 real loopback HTTP and independently resolved NPC interaction checks.
// Does NOT connect to a real PostgreSQL server, Base44 or any public endpoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {createGame3DNpcInteractionGate175}
 from '../privateNpcInteractionGate175.mjs';
import {createGame3DQuestActionRoute174,GAME3D_QUEST_ACTION_PATH_174}
 from '../privateQuestActionRoute174.mjs';

const secret='175-isolated-backend-secret-'+ 'm'.repeat(45);
const clock={value:1793667600000};
const ownerId='owner175',characterId='hero175';
const sessionId='qb174-'+'a'.repeat(64);
const claimant=()=>({ownerId,characterId,questId:'axe_q_first_patrol',sessionId});
const proof=(overrides={})=>({
 v:1,proof:'base44-auth-me-explicit-quest-action',ownerId,characterId,
 sessionId,issuedAtMs:clock.value,expiresAtMs:clock.value+25000,
 nonce:randomUUID(),intent:'accept_quest',questId:'axe_q_first_patrol',
 leadId:null,choice:null,...overrides
});
const event=(overrides={})=>({
 source:'trusted-server-npc-interaction-175',worldVerified:true,
 ...claimant(),npcId:'archer_lyra',worldInstanceId:'world-instance-175',
 interactionId:'npc-event-'+randomUUID(),occurredAtMs:clock.value-900,
 lineOfSight:true,player:{x:6,y:5,z:-3},npc:{x:6,y:5,z:-3},
 ...overrides
});
const gate=(resolver=async()=>event())=>createGame3DNpcInteractionGate175({
 resolveTrustedInteraction:resolver,now:()=>clock.value
});
const factory=counts=>({authorizeServerOperation})=>({
 async accept({ownerId:o,characterId:c,questId:q}){
  const operation=q.startsWith('echo_')?'accept_private_echo_quest':'accept_private_server_quest';
  const authorized=await authorizeServerOperation({operation,ownerId:o,characterId:c,questId:q});
  if(authorized)counts.accept++;
  return authorized?{ok:true,questId:q,accepted:true,questCompleted:false,
    rewardAuthorized:false,questProgressCommitted:false,rewardsIssued:false}:
    {ok:false,rewardsIssued:false};
 },
 async respond({ownerId:o,characterId:c,leadId,choice}){
  const authorized=await authorizeServerOperation({operation:'respond_private_rival_lead',
    ownerId:o,characterId:c,leadId});
  if(authorized)counts.rival++;
  return authorized?{ok:true,leadId,status:choice==='decline'?'declined':'pending',
   mutualConsent:false,questAccepted:false,meeting:'neutral_zone_not_scheduled',
   rewardsIssued:false}:{ok:false,rewardsIssued:false};
 }
});
async function serve(validateNpcInteraction){
 const counts={accept:0,rival:0};
 const make=factory(counts),pool={connect:async()=>({release(){}})};
 const route=createGame3DQuestActionRoute174({pool,secret,
  appOrigin:'https://game.example',now:()=>clock.value,
  createStarter:make,createEcho:make,createRival:make,validateNpcInteraction});
 const server=createServer(async(req,res)=>{
  try{await route.handle(req,res)}catch{res.writeHead(503);res.end('{}')}
 });
 await new Promise((resolve,reject)=>{
  server.once('error',reject);server.listen(0,'127.0.0.1',resolve)
 });
 const url='http://127.0.0.1:'+server.address().port+GAME3D_QUEST_ACTION_PATH_174;
 const close=async()=>{await route.shutdown();await new Promise((resolve,reject)=>
  server.close(error=>error?reject(error):resolve()))};
 return {url,counts,close};
}
// Match the independently implemented Web Crypto HMAC in the Base44 Deno function.
const toHex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function independentSignature(raw,at){
 const input=new TextEncoder();
 const digest=await crypto.subtle.digest('SHA-256',input.encode(raw));
 const key=await crypto.subtle.importKey('raw',input.encode(secret),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const message=String(at)+'\nPOST\n'+GAME3D_QUEST_ACTION_PATH_174+'\n'+toHex(digest);
 return toHex(await crypto.subtle.sign('HMAC',key,input.encode(message)));
}
async function send(url,p,{raw:rawOverride,signature,method='POST',extraHeaders={},path=''}={}){
 const raw=rawOverride??JSON.stringify(p),at=p.issuedAtMs;
 const mac=signature??await independentSignature(raw,at);
 const response=await fetch(url+path,{method,headers:{
  'content-type':'application/json',
  'x-game3d-quest-action-time':String(at),
  'x-game3d-quest-action-signature':mac,...extraHeaders
 },body:method==='POST'?raw:undefined,signal:AbortSignal.timeout(5000)});
 return {status:response.status,body:await response.json(),headers:response.headers};
}

test('17.5 no world resolver: signed quest acceptance returns 503 and zero writes',async()=>{
 const world=await serve(null);try{
  const r=await send(world.url,proof());
  assert.equal(r.status,503);assert.equal(r.body.reason,'trusted_npc_world_not_connected');
  assert.equal(world.counts.accept,0);assert.equal(r.body.rewardsIssued,false);
 }finally{await world.close()}
});
test('17.5 trusted in-range NPC interaction commits one accepted quest via real HTTP',async()=>{
 const g=gate(),world=await serve(g.validate);
 try{
  const r=await send(world.url,proof());
  assert.equal(r.status,200);
  assert.equal(r.body.accepted,true);
  assert.equal(r.body.questCompleted,false);
  assert.equal(r.body.rewardsIssued,false);
  assert.equal(world.counts.accept,1);
  assert.equal(r.headers.get('cache-control'),'private, no-store');
 }finally{await world.close()}
});
test('17.5 real HTTP refuses changed raw owner after independent WebCrypto signature',async()=>{
 const world=await serve(gate().validate);try{
  const p=proof(),raw=JSON.stringify(p);
  const signature=await independentSignature(raw,p.issuedAtMs);
  const forged=raw.replace('owner175','attacker');
  const r=await send(world.url,p,{raw:forged,signature});
  assert.equal(r.status,401);assert.equal(world.counts.accept,0);
 }finally{await world.close()}
});
test('17.5 real HTTP replay of signed nonce cannot commit twice',async()=>{
 const world=await serve(gate().validate);try{
  const p=proof();const [a,b]=await Promise.all([
   send(world.url,p),send(world.url,p)]);
  assert.deepEqual([a.status,b.status].sort(),[200,409]);
  assert.equal(world.counts.accept,1);
 }finally{await world.close()}
});
test('17.5 world interaction cannot be reused with a fresh signed nonce',async()=>{
 const receipt=event();const world=await serve(gate(async()=>receipt).validate);
 try{
  assert.equal((await send(world.url,proof())).status,200);
  const r=await send(world.url,proof());
  assert.equal(r.status,403);assert.equal(r.body.reason,'trusted_npc_interaction_required');
  assert.equal(world.counts.accept,1);
 }finally{await world.close()}
});
test('17.5 fake browser position / extra proof is ignored even with valid HMAC',async()=>{
 const world=await serve(gate().validate);
 try{
  const r=await send(world.url,proof({player:{x:6,y:5,z:-3}}));
  assert.equal(r.status,422);assert.equal(world.counts.accept,0);
 }finally{await world.close()}
});
test('17.5 mismatched actor world session or NPC cannot authorize acceptance',async()=>{
 for(const corruption of [
  {ownerId:'someone_else'},{characterId:'other_character'},
  {sessionId:'qb174-'+'b'.repeat(64)},
  {npcId:'archer_vex'},
  {questId:'axe_q_first_elite'},
  {lineOfSight:false},
  {player:{x:106,y:5,z:99}},
  {occurredAtMs:clock.value-6000},
  {occurredAtMs:clock.value+10},
  {worldVerified:false},
  {source:'client-claimed-position'},
 ]){
  const world=await serve(gate(async()=>event(corruption)).validate);
  try{
   const r=await send(world.url,proof());
   assert.equal(r.status,403,JSON.stringify(corruption));
   assert.equal(world.counts.accept,0);
  }finally{await world.close()}
 }
});
test('17.5 Rival decision does not require NPC proximity and never writes rewards',async()=>{
 const world=await serve(null);try{
  const p=proof({intent:'choose_rival',questId:null,
    leadId:'rival-lead-175',choice:'decline'});
  const r=await send(world.url,p);
  assert.equal(r.status,200);
  assert.equal(r.body.choiceRecorded,true);
  assert.equal(r.body.status,'declined');
  assert.equal(r.body.mutualConsent,false);
  assert.equal(r.body.rewardsIssued,false);
  assert.equal(world.counts.rival,1);
  assert.equal(world.counts.accept,0);
 }finally{await world.close()}
});
test('17.5 disabled route rejects all actions after shutdown',async()=>{
 const world=await serve(gate().validate);await world.close();
 await assert.rejects(send(world.url,proof()),/fetch failed|ECONNREFUSED/);
});
