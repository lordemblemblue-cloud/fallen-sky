import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {createGame3DQuestActionRoute174,GAME3D_QUEST_ACTION_PATH_174}
 from '../privateQuestActionRoute174.mjs';
const now=Date.UTC(2026,10,2,23,0);
const secret='local-177-http-'+ 'y'.repeat(48);
const actor={ownerId:'owner177',characterId:'hero177',
 sessionId:'qb174-'+'a'.repeat(64)};
const proof=over=>({v:1,proof:'base44-auth-me-explicit-quest-action',
 ...actor,issuedAtMs:now,expiresAtMs:now+25000,nonce:randomUUID(),
 intent:'accept_quest',questId:'echo_ch_14_first_echo',
 leadId:null,choice:null,...over});
const worldEvent=over=>({source:'server-world-npc-event-177',
 consumed:true,actorAuthenticated:true,intent:'npc_interact',
 ...actor,actionSessionId:actor.sessionId,
 questId:'echo_ch_14_first_echo',npcId:'archer_lyra',
 worldInstanceId:'world-instance-177',worldEpoch:'epoch-game-177',
 worldTick:10,receiptId:'npc-interact-177',occurredAtMs:now-1000,...over});
const worldSnapshot=over=>({source:'server-world-snapshot-177',
 serverAuthenticated:true,...actor,actionSessionId:actor.sessionId,
 npcId:'archer_lyra',npcSpawnVerified:true,
 worldInstanceId:'world-instance-177',worldEpoch:'epoch-game-177',worldTick:10,
 player:{x:6,y:5,z:-2},npc:{x:6,y:5,z:-3},...over});
const worldLOS=over=>({source:'server-world-collision-177',visible:true,
 worldInstanceId:'world-instance-177',worldEpoch:'epoch-game-177',
 worldTick:10,...over});
const factory=counts=>({authorizeServerOperation})=>({
 async accept({ownerId,characterId,questId}){
  const operation=questId.startsWith('echo_')?'accept_private_echo_quest':'accept_private_server_quest';
  const permitted=await authorizeServerOperation({operation,ownerId,characterId,questId});
  if(permitted)counts.quest++;
  return permitted?{ok:true,questId,accepted:true,questCompleted:false,
   rewardAuthorized:false,questProgressCommitted:false,rewardsIssued:false}:
   {ok:false,rewardsIssued:false};
 },
 async respond({ownerId,characterId,leadId,choice}){
  const permitted=await authorizeServerOperation({operation:'respond_private_rival_lead',
   ownerId,characterId,leadId});
  if(permitted)counts.rival++;
  return permitted?{ok:true,leadId,status:choice==='decline'?'declined':'pending',
   mutualConsent:false,questAccepted:false,meeting:'neutral_zone_not_scheduled',
   rewardsIssued:false}:{ok:false,rewardsIssued:false};
 }
});
async function setup({noWorld=false,receiptOver={},snapshotOver={},losOver={}}={}){
 const counters={quest:0,rival:0,consumed:0,positions:0,los:0};
 const trustedNpcWorldHost177=noWorld?null:{
  now:()=>now,
  async consumeServerNpcInteraction(){counters.consumed++;return worldEvent(receiptOver)},
  async readServerWorldSnapshot(){counters.positions++;return worldSnapshot(snapshotOver)},
  async verifyServerLineOfSight(){counters.los++;return worldLOS(losOver)}
 };
 const pool={connect:async()=>({release(){}})};
 const make=factory(counters);
 const route=createGame3DQuestActionRoute174({pool,secret,
  appOrigin:'https://game.example',now:()=>now,
  createStarter:make,createEcho:make,createRival:make,
  trustedNpcWorldHost177});
 const server=createServer(async(req,res)=>{
  try{await route.handle(req,res)}catch{res.writeHead(503);res.end('{}')}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve)});
 const url='http://127.0.0.1:'+server.address().port+GAME3D_QUEST_ACTION_PATH_174;
 const close=async()=>{await route.shutdown();await new Promise((resolve,reject)=>
  server.close(err=>err?reject(err):resolve()))};
 return {url,close,counters};
}
const hex=buffer=>Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join('');
async function sign(raw){
 const enc=new TextEncoder(),digest=hex(await crypto.subtle.digest('SHA-256',enc.encode(raw)));
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,enc.encode(
  String(now)+'\nPOST\n'+GAME3D_QUEST_ACTION_PATH_174+'\n'+digest)));
}
async function post(url,value){
 const raw=JSON.stringify(value),mac=await sign(raw);
 const response=await fetch(url,{method:'POST',headers:{
  'content-type':'application/json','x-game3d-quest-action-time':String(now),
  'x-game3d-quest-action-signature':mac},body:raw});
 return {status:response.status,body:await response.json()};
}
test('17.7 adapter + 17.5 gate + 17.4 signed HTTP commits exactly one quest',async()=>{
 const s=await setup();try{
  const a=await post(s.url,proof());
  assert.equal(a.status,200);assert.equal(a.body.accepted,true);
  assert.equal(a.body.rewardsIssued,false);
  assert.equal(s.counters.quest,1);assert.equal(s.counters.consumed,1);
  assert.equal(s.counters.positions,1);assert.equal(s.counters.los,1);
 }finally{await s.close()}
});
test('17.7 trusted interaction event cannot be reused with a new signed nonce',async()=>{
 const s=await setup();try{
  assert.equal((await post(s.url,proof())).status,200);
  assert.equal((await post(s.url,proof())).status,403);
  assert.equal(s.counters.quest,1);
 }finally{await s.close()}
});
test('17.7 no server world host fails closed, no quests written',async()=>{
 const s=await setup({noWorld:true});try{
  const answer=await post(s.url,proof());
  assert.equal(answer.status,503);assert.equal(s.counters.quest,0);
 }finally{await s.close()}
});
test('17.7 signed body cannot embed browser coordinates or fake world receipts',async()=>{
 const s=await setup();try{
  const answer=await post(s.url,proof({player:{x:6,y:5,z:-3}}));
  assert.equal(answer.status,422);assert.equal(s.counters.quest,0);
  assert.equal(s.counters.consumed,0);
 }finally{await s.close()}
});
test('17.7 invalid collision / player location denies signed NPC acceptance',async()=>{
 for(const options of [{losOver:{visible:false}},
  {snapshotOver:{player:{x:500,y:5,z:-2}}},
  {receiptOver:{actorAuthenticated:false}},
  {snapshotOver:{worldTick:11}}]){
  const s=await setup(options);try{
   assert.equal((await post(s.url,proof())).status,403,JSON.stringify(options));
   assert.equal(s.counters.quest,0);
  }finally{await s.close()}
 }
});
test('17.7 Rival decisions use distinct consent authority, not NPC coordinates',async()=>{
 const s=await setup({noWorld:true});try{
  const response=await post(s.url,proof({intent:'choose_rival',
   questId:null,leadId:'rival-lead-177',choice:'decline'}));
  assert.equal(response.status,200);assert.equal(response.body.choiceRecorded,true);
  assert.equal(response.body.rewardsIssued,false);
  assert.equal(s.counters.rival,1);assert.equal(s.counters.quest,0);
 }finally{await s.close()}
});
test('17.7 route rejects simultaneous insecure test and trusted host wiring',()=>{
 const make=factory({quest:0,rival:0});
 assert.throws(()=>createGame3DQuestActionRoute174({
  pool:{connect:async()=>({release(){}})},secret,appOrigin:'https://game.example',
  createStarter:make,createEcho:make,createRival:make,
  validateNpcInteraction:async()=>({ok:true}),
  trustedNpcWorldHost177:{consumeServerNpcInteraction:async()=>{},
   readServerWorldSnapshot:async()=>{},verifyServerLineOfSight:async()=>{}}
 }),/Cannot combine/);
});
