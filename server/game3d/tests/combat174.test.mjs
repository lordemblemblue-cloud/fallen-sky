import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createGame3DQuestActionRoute174,signGame3DQuestAction174,
 GAME3D_QUEST_ACTION_PATH_174} from '../privateQuestActionRoute174.mjs';
const secret='test-only-174-'+ 'p'.repeat(48);
const clock={ms:1793667600000};
const actor={ownerId:'ownerA',characterId:'heroA',sessionId:'qb174-'+'a'.repeat(64)};
const pool={connect:async()=>({release(){}})};
let calls=[];
const stubFactory=({authorizeServerOperation})=>({
 async accept({ownerId,characterId,questId}){
  const operation=questId.startsWith('echo_')?'accept_private_echo_quest':'accept_private_server_quest';
  const permitted=await authorizeServerOperation({operation,ownerId,characterId,questId});
  calls.push({operation,ownerId,characterId,questId,permitted});
  return permitted?{ok:true,questId,accepted:true,questCompleted:false,rewardsIssued:false,
    rewardAuthorized:false,questProgressCommitted:false}:
   {ok:false,rewardsIssued:false};
 },
 async respond({ownerId,characterId,leadId,choice}){
  const permitted=await authorizeServerOperation({operation:'respond_private_rival_lead',
   ownerId,characterId,leadId});
  calls.push({operation:'choose_rival',ownerId,characterId,leadId,choice,permitted});
  return permitted?{ok:true,leadId,status:choice==='decline'?'declined':'pending',
    mutualConsent:false,questAccepted:false,meeting:'neutral_zone_not_scheduled',
    rewardsIssued:false}:{ok:false,rewardsIssued:false};
 }
});
const create=()=>createGame3DQuestActionRoute174({pool,secret,appOrigin:'https://game.example',
 now:()=>clock.ms,createStarter:stubFactory,createEcho:stubFactory,createRival:stubFactory,
 validateNpcInteraction:async({questId})=>({ok:true,worldAttested:true,questId,rewardsIssued:false})});
const proof=(extras={})=>({v:1,proof:'base44-auth-me-explicit-quest-action',
 ...actor,issuedAtMs:clock.ms,expiresAtMs:clock.ms+25000,nonce:randomUUID(),
 intent:'accept_quest',questId:'axe_q_first_patrol',leadId:null,choice:null,...extras});
const rivalProof=extra=>proof({intent:'choose_rival',questId:null,leadId:'lead-a-174',
 choice:'friendly_rival',...extra});
const send=async(route,p,{method='POST',path=GAME3D_QUEST_ACTION_PATH_174,
 raw:rawOverride,signature,time,headers={}}={})=>{
 const raw=rawOverride??JSON.stringify(p),ts=time??p.issuedAtMs;
 const req={url:path,method,headers:{'content-type':'application/json',
   'content-length':String(Buffer.byteLength(raw)),
   'x-game3d-quest-action-time':String(ts),
   'x-game3d-quest-action-signature':signature??signGame3DQuestAction174({secret,at:ts,rawBody:raw}),
   ...headers},async *[Symbol.asyncIterator](){yield Buffer.from(raw)}};
 const res={writableEnded:false,destroyed:false,writeHead(status,h){this.status=status;this.headers=h},
  end(message){this.body=JSON.parse(message);this.writableEnded=true}};
 assert.equal(await route.handle(req,res),true);
 assert.equal(res.headers['cache-control'],'private, no-store');
 return {status:res.status,body:res.body};
};
test.beforeEach(()=>{calls=[];});
test('17.4 refuses missing writer, signer, or insecure origin',()=>{
 assert.throws(()=>createGame3DQuestActionRoute174({}));
 assert.throws(()=>createGame3DQuestActionRoute174({pool,secret,appOrigin:'http://game.example'}));
 assert.throws(()=>signGame3DQuestAction174({secret:'short',at:clock.ms,rawBody:'{}'}));
});
test('17.4 accepts only explicit authenticated approved starter quest',async()=>{
 const route=create();try{
  const x=await send(route,proof());
  assert.equal(x.status,200);assert.equal(x.body.accepted,true);
  assert.equal(x.body.questCompleted,false);assert.equal(x.body.rewardsIssued,false);
  assert.equal(x.body.questId,'axe_q_first_patrol');assert.equal(calls.length,1);
  assert.equal(calls[0].permitted,true);
 }finally{await route.shutdown()}
});
test('17.4 accepts an eligible Echo catalog quest only via the Echo service',async()=>{
 const route=create();try{
  const x=await send(route,proof({questId:'echo_ch_14_first_echo'}));
  assert.equal(x.status,200);assert.equal(calls[0].operation,'accept_private_echo_quest');
 }finally{await route.shutdown()}
});
test('17.4 Rival consent submits only the actor choice and redacts other vote',async()=>{
 const route=create();try{
  const x=await send(route,rivalProof());
  assert.equal(x.status,200);assert.equal(x.body.choiceRecorded,true);
  assert.equal(x.body.status,'pending');assert.equal(x.body.mutualConsent,false);
  assert.equal(Object.hasOwn(x.body,'otherChoice'),false);
  assert.equal(Object.hasOwn(x.body,'counterpartOwnerId'),false);
  assert.equal(x.body.rewardsIssued,false);assert.equal(calls[0].choice,'friendly_rival');
 }finally{await route.shutdown()}
});
test('17.4 backend signer binds literal private path, time, payload and method',async()=>{
 const route=create();try{
  assert.equal((await send(route,proof(),{signature:'0'.repeat(64)})).status,401);
  assert.equal((await send(route,proof(),{method:'GET'})).status,405);
  assert.equal((await send(route,proof(),{path:GAME3D_QUEST_ACTION_PATH_174+'?q=1'})).status,404);
  assert.equal((await send(route,proof(),{headers:{'content-type':'text/plain'}})).status,415);
  const p=proof();const raw=JSON.stringify(p);
  assert.equal((await send(route,p,{raw:raw.replace('ownerA','ownerB'),
   signature:signGame3DQuestAction174({secret,at:clock.ms,rawBody:raw})})).status,401);
  assert.equal(calls.length,0);
 }finally{await route.shutdown()}
});
test('17.4 rejects replay, stale signature, malformed body and unknown quest',async()=>{
 const route=create();try{
  const p=proof();assert.equal((await send(route,p)).status,200);
  assert.equal((await send(route,p)).status,409);
  assert.equal((await send(route,proof({questId:'fake_quest'}))).status,422);
  assert.equal((await send(route,proof({choice:'rival'}))).status,422);
  assert.equal((await send(route,proof({nonce:'not-uuid'}))).status,422);
  assert.equal((await send(route,proof({issuedAtMs:clock.ms-16000,
   expiresAtMs:clock.ms+1000}),{time:clock.ms-16000})).status,401);
 }finally{await route.shutdown()}
});
test('17.4 does not grant an unconsented/forged relationship or arbitrary choice',async()=>{
 const route=create();try{
  assert.equal((await send(route,rivalProof({choice:'force_match'}))).status,422);
  assert.equal((await send(route,rivalProof({leadId:'short'}))).status,422);
  assert.equal((await send(route,rivalProof({ownerId:'__anon__'}))).status,422);
  assert.equal((await send(route,rivalProof({intent:'turn_in_quest'}))).status,422);
  assert.equal(calls.length,0);
 }finally{await route.shutdown()}
});
test('17.4 grant callback is scoped exactly to one signed actor, operation and target',async()=>{
 let observed=[];
 const factory=({authorizeServerOperation})=>({accept:async input=>{
  observed=await Promise.all([
   authorizeServerOperation({operation:'accept_private_server_quest',...input}),
   authorizeServerOperation({operation:'accept_private_server_quest',...input,ownerId:'attacker'}),
   authorizeServerOperation({operation:'accept_private_server_quest',...input,questId:'axe_q_first_elite'}),
   authorizeServerOperation({operation:'respond_private_rival_lead',...input}),
  ]);
  return {ok:true,questId:input.questId,accepted:true,rewardsIssued:false,
   rewardAuthorized:false,questProgressCommitted:false};
 }});
 const route=createGame3DQuestActionRoute174({pool,secret,appOrigin:'https://game.example',
  now:()=>clock.ms,createStarter:factory,createEcho:stubFactory,createRival:stubFactory,
 validateNpcInteraction:async({questId})=>({ok:true,worldAttested:true,questId,rewardsIssued:false})});
 try{
  assert.equal((await send(route,proof())).status,200);
  assert.deepEqual(observed,[true,false,false,false]);
 }finally{await route.shutdown()}
});
test('17.4 pool failures and rejected writer results fail closed',async()=>{
 const factory=()=>({accept:async()=>({ok:false,reason:'no_permission'})});
 const route=createGame3DQuestActionRoute174({pool,secret,appOrigin:'https://game.example',
  now:()=>clock.ms,createStarter:factory,createEcho:stubFactory,createRival:stubFactory,
 validateNpcInteraction:async({questId})=>({ok:true,worldAttested:true,questId,rewardsIssued:false})});
 try{
  const r=await send(route,proof());assert.equal(r.status,409);
  assert.equal(r.body.rewardsIssued,false);assert.equal(r.body.accepted,false);
 }finally{await route.shutdown()}
});
test('17.4 concurrent identical proof cannot execute twice',async()=>{
 const route=create();try{
  const p=proof(),[a,b]=await Promise.all([send(route,p),send(route,p)]);
  assert.deepEqual([a.status,b.status].sort(),[200,409]);
  assert.equal(calls.length,1);
 }finally{await route.shutdown()}
});
test('17.4 shutdown refuses new actions without invoking writer',async()=>{
 const route=create();await route.shutdown();
 const x=await send(route,proof());assert.equal(x.status,503);
 assert.equal(calls.length,0);
});
test('17.4 expired proof is refused before committing any operation',async()=>{
 const route=create();try{
  assert.equal((await send(route,proof({expiresAtMs:clock.ms}))).status,422);
  assert.equal(calls.length,0);
 }finally{await route.shutdown()}
});
test('17.4 unknown extra payload fields fail closed',async()=>{
 const route=create();try{
  const result=await send(route,proof({rewardXP:999999}));
  assert.equal(result.status,422);assert.equal(calls.length,0);
 }finally{await route.shutdown()}
});
