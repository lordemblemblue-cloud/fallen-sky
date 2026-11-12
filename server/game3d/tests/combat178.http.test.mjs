// Real loopback TCP/HTTP with a 13.6-shape server snapshot, restricted
// quest factory, server-only record and independent Web Crypto HMAC signer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {createGame3DPrivateEncounterNpcHost178} from '../privateEncounterNpcHost178.mjs';
import {createGame3DQuestActionRoute174,GAME3D_QUEST_ACTION_PATH_174}
 from '../privateQuestActionRoute174.mjs';
const secret='offline-178-signing-secret-'+'s'.repeat(48);
const now=1793667700000;
const sessionId='qb174-'+'a'.repeat(64);
const actor={ownerId:'owner178',characterId:'hero178',sessionId};
const scope={ownerId:actor.ownerId,characterId:actor.characterId,
 instanceId:'instance-178-wolfveil',instanceEpoch:'epoch-178-beta'};
const context=Object.freeze({world:Symbol('server-world-178')});
const proof=x=>({v:1,proof:'base44-auth-me-explicit-quest-action',
 ...actor,issuedAtMs:now,expiresAtMs:now+25000,nonce:randomUUID(),
 intent:'accept_quest',questId:'axe_q_first_patrol',leadId:null,choice:null,...x});
const hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
async function sign(body){
 const e=new TextEncoder(),digest=hex(await crypto.subtle.digest('SHA-256',e.encode(body)));
 const k=await crypto.subtle.importKey('raw',e.encode(secret),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',k,e.encode(
  String(now)+'\nPOST\n'+GAME3D_QUEST_ACTION_PATH_174+'\n'+digest)));
}
async function post(url,p){
 const body=JSON.stringify(p);const signature=await sign(body);
 const response=await fetch(url,{method:'POST',headers:{
  'content-type':'application/json',
  'x-game3d-quest-action-time':String(now),
  'x-game3d-quest-action-signature':signature},body});
 return {status:response.status,body:await response.json()};
}
async function setup({position={x:0,z:0},blocked=false,lease=true,actorValid=true}={}){
 const counts={quest:0,rival:0};
 const map={id:'wolfveil-v1',fingerprint:'d'.repeat(64),
  valid:p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z),
  height:()=>0,canStrike:()=>!blocked};
 const encounter={version:'13.6',privateServerOnly:true,
  instanceId:scope.instanceId,mapId:map.id,mapFingerprint:map.fingerprint,
  worldOrigin:{x:0,z:0},snapshot:()=>({
   instanceId:scope.instanceId,privateBetaOnly:true,rewardsIssued:false,
   serverTime:now-250,player:{...position,hp:100},enemies:[],eventSeq:0})};
 const host=createGame3DPrivateEncounterNpcHost178({encounter,mapWorld:map,scope,
  now:()=>now,verifyExclusiveWorldLease:async()=>lease,
  resolveTrustedWorldActor:async ctx=>ctx===context&&actorValid?{
   authenticated:true,identitySource:'trusted-server-session',
   accountId:actor.ownerId,characterId:actor.characterId,actionSessionId:sessionId,sessionExpiresAtMs:now+25000}:null,
  resolveSealedNpcSpawn:async()=>({source:'sealed-private-world-npc-seed-178',
   sealed:true,npcId:'archer_lyra',instanceId:scope.instanceId,
   instanceEpoch:scope.instanceEpoch,mapFingerprint:map.fingerprint,
   position:{x:2,z:0}})});
 const factory=({authorizeServerOperation})=>({
  async accept({ownerId,characterId,questId}){
   if(await authorizeServerOperation({operation:'accept_private_server_quest',
     ownerId,characterId,questId}))counts.quest++;
   return {ok:true,questId,accepted:true,questCompleted:false,
    rewardAuthorized:false,questProgressCommitted:false,rewardsIssued:false};
  },
  async respond({ownerId,characterId,leadId,choice}){
   if(await authorizeServerOperation({operation:'respond_private_rival_lead',
     ownerId,characterId,leadId}))counts.rival++;
   return {ok:true,leadId,status:choice==='decline'?'declined':'pending',
    mutualConsent:false,questAccepted:false,meeting:'neutral_zone_not_scheduled',
    rewardsIssued:false};
  }
 });
 const route=createGame3DQuestActionRoute174({pool:{connect:async()=>({release(){}})},
  secret,appOrigin:'https://game.example',now:()=>now,
  createStarter:factory,createEcho:factory,createRival:factory,
  trustedNpcWorldHost177:{
   now:()=>now,consumeServerNpcInteraction:host.consumeServerNpcInteraction,
   readServerWorldSnapshot:host.readServerWorldSnapshot,
   verifyServerLineOfSight:host.verifyServerLineOfSight
  }});
 const server=createServer(async(req,res)=>{try{await route.handle(req,res)}
  catch{res.writeHead(503);res.end('{}')}});
 await new Promise((resolve,reject)=>{server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve)});
 const url='http://127.0.0.1:'+server.address().port+GAME3D_QUEST_ACTION_PATH_174;
 const record=()=>host.recordServerInteraction({serverRequestContext:context,
  questId:'axe_q_first_patrol',npcId:'archer_lyra'});
 const close=async()=>{await route.shutdown();host.shutdown();
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))};
 return {url,record,close,counts};
}
test('17.8 authorized encounter -> one-use NPC receipt -> signed HTTP quest acceptance',async()=>{
 const h=await setup();try{
  assert.equal((await h.record()).ok,true);
  const r=await post(h.url,proof());
  assert.equal(r.status,200);assert.equal(r.body.accepted,true);
  assert.equal(r.body.rewardsIssued,false);assert.equal(h.counts.quest,1);
 }finally{await h.close()}
});
test('17.8 no world event means signed HTTP quest request refuses',async()=>{
 const h=await setup();try{
  const r=await post(h.url,proof());
  assert.equal(r.status,403);assert.equal(h.counts.quest,0);
 }finally{await h.close()}
});
test('17.8 one world receipt cannot authorize two distinct signed nonces',async()=>{
 const h=await setup();try{
  await h.record();assert.equal((await post(h.url,proof())).status,200);
  assert.equal((await post(h.url,proof())).status,403);assert.equal(h.counts.quest,1);
 }finally{await h.close()}
});
test('17.8 signed account or character switch cannot consume another world actor event',async()=>{
 const h=await setup();try{
  await h.record();const r=await post(h.url,proof({characterId:'hero_thief'}));
  assert.equal(r.status,403);assert.equal(h.counts.quest,0);
 }finally{await h.close()}
});
test('17.8 too-far or blocked NPC cannot record, even with signed request',async()=>{
 for(const args of [{position:{x:30,z:0}},{blocked:true},{lease:false},{actorValid:false}]){
  const h=await setup(args);try{
   assert.equal((await h.record()).ok,false);
   assert.equal((await post(h.url,proof())).status,403);
   assert.equal(h.counts.quest,0);
  }finally{await h.close()}
 }
});
test('17.8 Rival response remains independently permitted without NPC interaction',async()=>{
 const h=await setup();try{
  const r=await post(h.url,proof({intent:'choose_rival',questId:null,
   leadId:'rival-lead-178',choice:'decline'}));
  assert.equal(r.status,200);assert.equal(r.body.mutualConsent,false);
  assert.equal(h.counts.rival,1);assert.equal(h.counts.quest,0);
 }finally{await h.close()}
});
