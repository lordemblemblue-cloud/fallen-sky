import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateEncounter136} from '../privateWorldEncounter136.mjs';
import {createGame3DQuestWorldPairing180,signGame3DWorldPairing180}
 from '../privateQuestWorldPairing180.mjs';
import {createGame3DPrivateQuestWorldStaging180}
 from '../privateQuestWorldStaging180.mjs';
import {randomUUID} from 'node:crypto';
import {createGame3DQuestActionRoute174,signGame3DQuestAction174,
 GAME3D_QUEST_ACTION_PATH_174} from '../privateQuestActionRoute174.mjs';

const now=1793668000000,secret='staging-180-'+'z'.repeat(40);
const scope={ownerId:'owner180',characterId:'hero180',
 instanceId:'world-instance-180',instanceEpoch:'world-epoch-180'};
const context=Object.freeze({source:'trusted-backend-world-auth'});
const actionSessionId='qb174-'+'f'.repeat(64);
const mapWorld={id:'wolfveil-v1',fingerprint:'c'.repeat(64),
 valid:p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z)&&
  Math.abs(p.x)<100&&Math.abs(p.z)<100,
 height:()=>0,move:(_from,to)=>to,canStrike:()=>true};
const makePairing=({baseActive=()=>true}={})=>createGame3DQuestWorldPairing180({scope,secret,enabled:true,now:()=>now,
 resolveTrustedWorldPrincipal:async c=>c===context?{
  authenticated:true,identitySource:'trusted-server-session',
  accountId:scope.ownerId,characterId:scope.characterId,
  serverSessionId:'server-session-180',expiresAtMs:now+60000}:null,
 verifyWorldSessionActive:async()=>true,
 verifyBase44SessionActive:async x=>baseActive()&&x.actionSessionId===actionSessionId});
async function createStaging(options={}){
 const encounter=await createGame3DPrivateEncounter136({
  ...scope,worldOrigin:{x:0,z:0},mapWorld,now:()=>now,
  attestWorldSnapshot:async()=>({ok:true,
   provenance:'authoritative-world-simulation',
   ...scope,worldOrigin:{x:0,z:0},mapId:mapWorld.id,
   mapFingerprint:mapWorld.fingerprint,
   player:{position:{x:0,z:0},hp:100,
    stats:{maxHP:100,damage:15,defense:5}},enemies:[]}),
  resolveAuthenticatedSubject:async()=>({
   authenticated:true,identitySource:'trusted-server-session',accountId:scope.ownerId}),
  resolvePlayerStrike:()=>{throw Error('not used')},
  resolveEnemyStrike:()=>{throw Error('not used')},
 });
 const pairing180=makePairing(options);
 const metrics={opened:0,sent:0,closed:0};
 const bridge={version:'15.0',privateServerOnly:true,publicPlayerRouteInstalled:false,
  async open(){metrics.opened++;return {ok:true,handle:'world-handle-180-'+metrics.opened,
   worldInstanceId:scope.instanceId,sessionExpiresAtMs:now+45000,
   credentialDeliveredToBrowser:false}},
  async send(){metrics.sent++;if(options.send)return options.send();
   return {ok:true,rewardsIssued:false}},
  async close(){metrics.closed++;return {ok:true}},
  async shutdown(){return {ok:true}}};
 const stage=createGame3DPrivateQuestWorldStaging180({
  scope,encounter,mapWorld,worldBridge150:bridge,pairing180,
  resolveSealedNpcSpawn:async()=>options.resolveSealedNpcSpawn?
   options.resolveSealedNpcSpawn():({source:'sealed-private-world-npc-seed-178',
   sealed:true,npcId:'archer_lyra',instanceId:scope.instanceId,
   instanceEpoch:scope.instanceEpoch,mapFingerprint:mapWorld.fingerprint,
   position:{x:2,z:0}}),
  verifyExclusiveWorldLease:async()=>true,now:()=>now,enabled:true});
 const issued=await stage.beginWorldPairing({serverRequestContext:context});
 const proof={v:1,purpose:'base44-auth-me-world-pairing-180',
  ownerId:scope.ownerId,characterId:scope.characterId,
  challenge:issued.challenge,actionSessionId,issuedAtMs:now,expiresAtMs:now+10000};
 const completed=await stage.completeWorldPairing({serverRequestContext:context,
  proof,signature:signGame3DWorldPairing180(secret,proof)});
 return {stage,encounter,completed,metrics};
}
test('18.0 stage refuses implicit installation or absent real world dependencies',()=>{
 assert.throws(()=>createGame3DPrivateQuestWorldStaging180(),/requires/);
});
test('18.0 real 13.6 encounter → sealed 17.8 NPC → 17.9 session path',async()=>{
 const h=await createStaging();
 try{
  assert.equal(h.encounter.version,'13.6');
  assert.equal(h.completed.ok,true);
  const opened=await h.stage.open({serverRequestContext:context});
  assert.equal(opened.ok,true);
  assert.equal(opened.credentialDeliveredToBrowser,false);
  const interaction=await h.stage.recordNpcInteraction({
   handle:opened.handle,serverRequestContext:context,
   questId:'axe_q_first_patrol',npcId:'archer_lyra'});
  assert.equal(interaction.ok,true);
  assert.match(interaction.receiptId,/^npc178-/);
  assert.equal(interaction.rewardsIssued,false);
 }finally{await h.stage.shutdown()}
});
test('18.0 real world stage rejects browser-supplied coordinates and wrong context',async()=>{
 const h=await createStaging();
 try{
  const opened=await h.stage.open({serverRequestContext:context});
  const bad=await h.stage.recordNpcInteraction({handle:opened.handle,
   serverRequestContext:context,questId:'axe_q_first_patrol',
   npcId:'archer_lyra',player:{x:2,z:0}});
  assert.equal(bad.ok,false);
  const wrong=await h.stage.recordNpcInteraction({handle:opened.handle,
   serverRequestContext:{},questId:'axe_q_first_patrol',npcId:'archer_lyra'});
  assert.equal(wrong.ok,false);
 }finally{await h.stage.shutdown()}
});

test('18.0 real private NPC receipt traverses 17.8, 17.7 and 17.5 without granting a quest',async()=>{
 const h=await createStaging();
 try{
  const opened=await h.stage.open({serverRequestContext:context});
  assert.equal(opened.ok,true);
  const result=await h.stage.verifyNpcInteraction({handle:opened.handle,
   serverRequestContext:context,questId:'axe_q_first_patrol',
   npcId:'archer_lyra'});
  assert.deepEqual({
   ok:result.ok,worldAttested:result.worldAttested,
   accepted:result.accepted,questCompleted:result.questCompleted,
   rewardsIssued:result.rewardsIssued,productionReady:result.productionReady,
  },{ok:true,worldAttested:true,accepted:false,questCompleted:false,
   rewardsIssued:false,productionReady:false});
 }finally{await h.stage.shutdown()}
});
test('18.0 private NPC verification rejects browser coordinates, wrong host or stale handles',async()=>{
 const h=await createStaging();
 try{
  const opened=await h.stage.open({serverRequestContext:context});
  const input={handle:opened.handle,serverRequestContext:context,
   questId:'axe_q_first_patrol',npcId:'archer_lyra'};
  for(const extra of [{player:{x:0,z:0}},{actionSessionId},{ownerId:'owner180'},
   {npcId:'attacker'}, {handle:'wrong-handle-180'},
   {serverRequestContext:{source:'browser'}}]){
   const rejected=await h.stage.verifyNpcInteraction({...input,...extra});
   assert.equal(rejected.ok,false);
   assert.equal(rejected.rewardsIssued,false);
  }
  const closing=await h.stage.close({handle:opened.handle,
   serverRequestContext:context});
  assert.equal(closing.ok,true);
  assert.equal((await h.stage.verifyNpcInteraction(input)).ok,false);
 }finally{await h.stage.shutdown()}
});
test('18.0 revoked Base44 identity is denied by the private NPC evidence round trip',async()=>{
 let active=true;
 const h=await createStaging({baseActive:()=>active});
 try{
  const opened=await h.stage.open({serverRequestContext:context});
  active=false;
  const rejected=await h.stage.verifyNpcInteraction({handle:opened.handle,
   serverRequestContext:context,questId:'axe_q_first_patrol',
   npcId:'archer_lyra'});
  assert.equal(rejected.ok,false);
  assert.equal(rejected.reason,'session_not_paired');
 }finally{await h.stage.shutdown()}
});

async function rePair(stage) {
 const begin=await stage.beginWorldPairing({serverRequestContext:context});
 assert.equal(begin.ok,true);
 const proof={v:1,purpose:'base44-auth-me-world-pairing-180',
  ownerId:scope.ownerId,characterId:scope.characterId,
  challenge:begin.challenge,actionSessionId,
  issuedAtMs:now,expiresAtMs:now+10000};
 const completed=await stage.completeWorldPairing({serverRequestContext:context,
  proof,signature:signGame3DWorldPairing180(secret,proof)});
 assert.equal(completed.ok,true);
}

test('18.1 pairing rotation revokes previous stage handle even when the same login pairs again',async()=>{
 const h=await createStaging();
 try{
  const first=await h.stage.open({serverRequestContext:context});
  assert.equal(first.ok,true);
  const action={handle:first.handle,serverRequestContext:context,
   action:'poll',payload:{afterSeq:0}};
  assert.equal((await h.stage.sendWorldAction(action)).ok,true);
  await rePair(h.stage);
  assert.equal((await h.stage.sendWorldAction(action)).ok,false);
  assert.equal((await h.stage.recordNpcInteraction({
   handle:first.handle,serverRequestContext:context,
   questId:'axe_q_first_patrol',npcId:'archer_lyra'})).ok,false);
  assert.equal(h.metrics.closed,1);
  const second=await h.stage.open({serverRequestContext:context});
  assert.equal(second.ok,true);
  assert.notEqual(second.handle,first.handle);
  assert.equal((await h.stage.sendWorldAction(action)).ok,false);
  assert.equal((await h.stage.sendWorldAction({...action,handle:second.handle})).ok,true);
 }finally{await h.stage.shutdown()}
});
test('18.1 explicit session revocation blocks all old world actions and NPC records',async()=>{
 const h=await createStaging();
 try{
  const first=await h.stage.open({serverRequestContext:context});
  const revoked=await h.stage.revokeWorldPairing({serverRequestContext:context});
  assert.equal(revoked.ok,true);
  const action={handle:first.handle,serverRequestContext:context,
   action:'poll',payload:{afterSeq:0}};
  assert.equal((await h.stage.sendWorldAction(action)).ok,false);
  assert.equal((await h.stage.recordNpcInteraction({
   handle:first.handle,serverRequestContext:context,
   questId:'axe_q_first_patrol',npcId:'archer_lyra'})).ok,false);
  await rePair(h.stage);
  assert.equal((await h.stage.sendWorldAction(action)).ok,false);
  const second=await h.stage.open({serverRequestContext:context});
  assert.notEqual(second.handle,first.handle);
 }finally{await h.stage.shutdown()}
});
test('18.1 stage rejects extra caller fields and wrong close handle without affecting current world',async()=>{
 const h=await createStaging();
 try{
  const opened=await h.stage.open({serverRequestContext:context});
  const action={handle:opened.handle,serverRequestContext:context,
   action:'poll',payload:{afterSeq:0}};
  assert.equal((await h.stage.sendWorldAction({...action,ownerId:scope.ownerId})).ok,false);
  assert.equal(h.metrics.sent,0);
  assert.equal((await h.stage.close({handle:'forged-handle',
   serverRequestContext:context})).ok,false);
  assert.equal((await h.stage.sendWorldAction(action)).ok,true);
  assert.equal((await h.stage.sendWorldAction({handle:opened.handle,
   serverRequestContext:context,action:'poll'})).ok,true);
  assert.equal(h.metrics.sent,2);
 }finally{await h.stage.shutdown()}
});
test('18.1 revocation while a world action awaits rejects stale success',async()=>{
 let entered,release;
 const waiting=new Promise(resolve=>{entered=resolve});
 const blocked=new Promise(resolve=>{release=resolve});
 const h=await createStaging({send:async()=>{entered();return blocked;}});
 try{
  const opened=await h.stage.open({serverRequestContext:context});
  const pending=h.stage.sendWorldAction({handle:opened.handle,
   serverRequestContext:context,action:'poll',payload:{afterSeq:0}});
  await waiting;
  assert.equal((await h.stage.revokeWorldPairing({
   serverRequestContext:context})).ok,true);
  release({ok:true,rewardsIssued:false});
  const result=await pending;
  assert.equal(result.ok,false);
  assert.equal(result.reason,'session_changed_during_action');
 }finally{await h.stage.shutdown()}
});
test('18.1 pairing rotation cancels an in-flight NPC spawn before any receipt can be issued',async()=>{
 let entered,release;
 const waiting=new Promise(resolve=>{entered=resolve});
 const blocked=new Promise(resolve=>{release=resolve});
 const h=await createStaging({resolveSealedNpcSpawn:async()=>{
  entered();await blocked;
  return {source:'sealed-private-world-npc-seed-178',sealed:true,
   npcId:'archer_lyra',instanceId:scope.instanceId,
   instanceEpoch:scope.instanceEpoch,mapFingerprint:mapWorld.fingerprint,
   position:{x:2,z:0}};
 }});
 try{
  const opened=await h.stage.open({serverRequestContext:context});
  const pending=h.stage.recordNpcInteraction({handle:opened.handle,
   serverRequestContext:context,questId:'axe_q_first_patrol',npcId:'archer_lyra'});
  await waiting;
  const rotated=h.stage.beginWorldPairing({serverRequestContext:context});
  release();
  const old=await pending;
  assert.equal(old.ok,false);
  assert.equal((await rotated).ok,true);
 }finally{await h.stage.shutdown()}
});

const actionSecret182='test-only-quest-action-182-'+'x'.repeat(48);
function signedQuestRoute182(stage,{beforeAuthorize}={}){
 const writes={accepted:0,authorized:0};
 const service=({authorizeServerOperation})=>({
  async accept({ownerId,characterId,questId}){
   if(beforeAuthorize)await beforeAuthorize();
   const permission=await authorizeServerOperation({
    operation:questId.startsWith('echo_')
     ?'accept_private_echo_quest':'accept_private_server_quest',
    ownerId,characterId,questId,
   });
   if(permission){writes.authorized++;writes.accepted++;}
   return permission?{ok:true,questId,accepted:true,
    questCompleted:false,questProgressCommitted:false,
    rewardAuthorized:false,rewardsIssued:false}:
    {ok:false,rewardsIssued:false};
  },
  async respond(){return {ok:false,rewardsIssued:false}}
 });
 const route=createGame3DQuestActionRoute174({
  pool:{connect:async()=>({release(){}})},
  secret:actionSecret182,appOrigin:'https://staging.example',
  now:()=>now,createStarter:service,createEcho:service,createRival:service,
  trustedNpcWorldHost177:stage.questActionWorldHost177,
  verifyWorldActionSession:stage.verifyWorldActionSession,
 });
 const post=async(patch={})=>{
  const proof={v:1,proof:'base44-auth-me-explicit-quest-action',
   ownerId:scope.ownerId,characterId:scope.characterId,
   sessionId:actionSessionId,issuedAtMs:now,expiresAtMs:now+25000,
   nonce:randomUUID(),intent:'accept_quest',questId:'axe_q_first_patrol',
   leadId:null,choice:null,...patch};
  const raw=JSON.stringify(proof);
  const signature=signGame3DQuestAction174({secret:actionSecret182,at:now,rawBody:raw});
  const req={url:GAME3D_QUEST_ACTION_PATH_174,method:'POST',
   headers:{'content-type':'application/json',
    'x-game3d-quest-action-time':String(now),
    'x-game3d-quest-action-signature':signature},
   async *[Symbol.asyncIterator](){yield Buffer.from(raw)}};
  const res={writableEnded:false,destroyed:false,
   writeHead(status){this.status=status},
   end(raw){this.body=JSON.parse(raw);this.writableEnded=true}};
  await route.handle(req,res);
  return {status:res.status,body:res.body};
 };
 return {route,post,writes};
}
const npcIntent182=handle=>({handle,serverRequestContext:context,
 questId:'axe_q_first_patrol',npcId:'archer_lyra'});

test('18.2 private signed Questbook acceptance consumes one real world NPC receipt',async()=>{
 const h=await createStaging(),signed=signedQuestRoute182(h.stage);
 try{
  const opened=await h.stage.open({serverRequestContext:context});
  assert.equal((await signed.post()).status,403);
  assert.equal(signed.writes.accepted,0);
  const recorded=await h.stage.recordNpcInteraction(npcIntent182(opened.handle));
  assert.equal(recorded.ok,true);
  const accepted=await signed.post();
  assert.equal(accepted.status,200);
  assert.equal(accepted.body.accepted,true);
  assert.equal(accepted.body.questCompleted,false);
  assert.equal(accepted.body.rewardsIssued,false);
  assert.equal(signed.writes.accepted,1);
  assert.equal((await signed.post()).status,403);
  assert.equal(signed.writes.accepted,1);
 }finally{await signed.route.shutdown();await h.stage.shutdown()}
});

test('18.2 signed wrong account, character and action session cannot steal NPC evidence',async()=>{
 const h=await createStaging(),signed=signedQuestRoute182(h.stage);
 try{
  const opened=await h.stage.open({serverRequestContext:context});
  assert.equal((await h.stage.recordNpcInteraction(npcIntent182(opened.handle))).ok,true);
  assert.equal((await signed.post({ownerId:'attacker182'})).status,403);
  assert.equal((await signed.post({characterId:'attacker182'})).status,403);
  assert.equal((await signed.post({sessionId:'qb174-'+'e'.repeat(64)})).status,403);
  assert.equal(signed.writes.accepted,0);
  assert.equal((await signed.post()).status,200);
  assert.equal(signed.writes.accepted,1);
 }finally{await signed.route.shutdown();await h.stage.shutdown()}
});

test('18.2 a diagnostic NPC verification does not double-authorize signed quest acceptance',async()=>{
 const h=await createStaging(),signed=signedQuestRoute182(h.stage);
 try{
  const opened=await h.stage.open({serverRequestContext:context});
  assert.equal((await h.stage.verifyNpcInteraction(npcIntent182(opened.handle))).ok,true);
  assert.equal((await signed.post()).status,403);
  assert.equal(signed.writes.accepted,0);
 }finally{await signed.route.shutdown();await h.stage.shutdown()}
});

test('18.2 logout after recording and before signed delivery denies the quest write',async()=>{
 let active=true;
 const h=await createStaging({baseActive:()=>active});
 const signed=signedQuestRoute182(h.stage);
 try{
  const opened=await h.stage.open({serverRequestContext:context});
  assert.equal((await h.stage.recordNpcInteraction(npcIntent182(opened.handle))).ok,true);
  active=false;
  assert.equal((await signed.post()).status,403);
  assert.equal(signed.writes.accepted,0);
 }finally{await signed.route.shutdown();await h.stage.shutdown()}
});

test('18.2 world re-pairing invalidates old NPC receipts before signed acceptance',async()=>{
 const h=await createStaging(),signed=signedQuestRoute182(h.stage);
 try{
  const opened=await h.stage.open({serverRequestContext:context});
  assert.equal((await h.stage.recordNpcInteraction(npcIntent182(opened.handle))).ok,true);
  await rePair(h.stage);
  const latest=await h.stage.open({serverRequestContext:context});
  assert.equal(latest.ok,true);
  assert.equal((await signed.post()).status,403);
  assert.equal(signed.writes.accepted,0);
  assert.equal((await h.stage.recordNpcInteraction(npcIntent182(latest.handle))).ok,true);
  assert.equal((await signed.post()).status,200);
  assert.equal(signed.writes.accepted,1);
 }finally{await signed.route.shutdown();await h.stage.shutdown()}
});

test('18.2 revoked session after NPC receipt but before quest authorization cannot write',async()=>{
 let active=true;
 const h=await createStaging({baseActive:()=>active});
 const signed=signedQuestRoute182(h.stage,{beforeAuthorize:()=>{active=false}});
 try{
  const opened=await h.stage.open({serverRequestContext:context});
  assert.equal((await h.stage.recordNpcInteraction(npcIntent182(opened.handle))).ok,true);
  const rejected=await signed.post();
  assert.equal(rejected.status,409);
  assert.equal(rejected.body.rewardsIssued,false);
  assert.equal(signed.writes.accepted,0);
 }finally{await signed.route.shutdown();await h.stage.shutdown()}
});

test('18.2 a signed proof cannot smuggle NPC coordinates or bypass normal session checks',async()=>{
 const h=await createStaging(),signed=signedQuestRoute182(h.stage);
 try{
  const opened=await h.stage.open({serverRequestContext:context});
  assert.equal((await h.stage.recordNpcInteraction(npcIntent182(opened.handle))).ok,true);
  assert.equal((await signed.post({player:{x:2,z:0}})).status,422);
  assert.equal((await signed.post({intent:'turn_in_quest'})).status,422);
  assert.equal((await signed.post()).status,200);
  assert.equal(signed.writes.accepted,1);
 }finally{await signed.route.shutdown();await h.stage.shutdown()}
});

test('18.3 same Base44 action ID cannot reuse an earlier server admission lease UUID',async()=>{
 const h=await createStaging();
 try{
  const first=await h.stage.open({serverRequestContext:context});
  assert.equal(first.ok,true);
  const intent={ownerId:scope.ownerId,characterId:scope.characterId,
   questId:'axe_q_first_patrol',sessionId:actionSessionId};
  const older=await h.stage.resolveQuestTransactionClaim183(intent);
  assert.match(older.leaseNonce,
   /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
  assert.equal(older.actionSessionId,actionSessionId);
  assert.equal(older.worldEpoch,scope.instanceEpoch);
  await rePair(h.stage);
  assert.equal(await h.stage.resolveQuestTransactionClaim183(intent),null);
  const second=await h.stage.open({serverRequestContext:context});
  assert.equal(second.ok,true);
  const newer=await h.stage.resolveQuestTransactionClaim183(intent);
  assert.equal(newer.actionSessionId,older.actionSessionId);
  assert.notEqual(newer.leaseNonce,older.leaseNonce);
 }finally{await h.stage.shutdown()}
});
test('18.3 lease issuer cannot claim an unpaired world or forged private context',async()=>{
 const h=await createStaging();
 try{
  const opened=await h.stage.open({serverRequestContext:context});
  assert.equal(opened.ok,true);
  assert.equal(await h.stage.resolveCurrentWorldLease183({
   serverRequestContext:{}}),null);
  assert.equal(await h.stage.resolveCurrentWorldLease183({
   serverRequestContext:context,ownerId:'attacker'}),null);
  const issuerClaim=await h.stage.resolveCurrentWorldLease183({
   serverRequestContext:context});
  assert.equal(issuerClaim.ownerId,scope.ownerId);
  assert.equal(issuerClaim.characterId,scope.characterId);
  assert.equal(issuerClaim.worldInstanceId,scope.instanceId);
  assert.equal(issuerClaim.leaseNonce,
   (await h.stage.resolveQuestTransactionClaim183({
    ownerId:scope.ownerId,characterId:scope.characterId,
    questId:'axe_q_first_patrol',sessionId:actionSessionId
   })).leaseNonce);
  await h.stage.revokeWorldPairing({serverRequestContext:context});
  assert.equal(await h.stage.resolveCurrentWorldLease183({
   serverRequestContext:context}),null);
 }finally{await h.stage.shutdown()}
});
