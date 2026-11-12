import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DQuestWorldSessionAdmission179}
 from '../privateQuestWorldSessionAdmission179.mjs';
import {createGame3DPrivateEncounterNpcHost178}
 from '../privateEncounterNpcHost178.mjs';
import {createGame3DTrustedNpcWorldBridge177}
 from '../trustedNpcWorldBridge177.mjs';
import {createGame3DNpcInteractionGate175}
 from '../privateNpcInteractionGate175.mjs';

const t=1793668000000,accountId='owner179',characterId='hero179';
const actionSessionId='qb174-'+'a'.repeat(64);
const worldSessionId='world-session-179';
const instanceId='wolfveil-instance-179';
const context={serverSideRequest:'private-only'};
const scope={ownerId:accountId,characterId,instanceId};
function fixture(overrides={}){
 let now=t,revoked=false,worldAccount=accountId,
  baseAccount=accountId,baseWorldSession=worldSessionId,
  baseSession=actionSessionId,worldSession=worldSessionId,worldSessionExpired=false;
 const counters={opened:0,closed:0,sent:0,shutdown:0,activeChecks:0};
 const bridge={version:'15.0',privateServerOnly:true,publicPlayerRouteInstalled:false,
  async open({serverRequestContext}){
   if(serverRequestContext!==context)return {ok:false};
   counters.opened++;
   return {ok:true,handle:'world-handle-179',worldInstanceId:instanceId,
    credentialDeliveredToBrowser:false,sessionExpiresAtMs:now+60000};
  },
  async send(){counters.sent++;return {ok:true,rewardsIssued:false}},
  async close(){counters.closed++;return {ok:true,serverRevocationConfirmed:true}},
  async shutdown(){counters.shutdown++;return {ok:true}}
 };
 let privateHost;
 const admission=createGame3DQuestWorldSessionAdmission179({
  createTrustedNpcHost178:({resolveTrustedWorldActor})=>{
   privateHost=npcHost(resolveTrustedWorldActor);return privateHost;
  },
  worldBridge150:bridge,scope,now:()=>now,
  resolveTrustedWorldPrincipal:async c=>c===context?{
   authenticated:true,identitySource:'trusted-server-session',
   accountId:worldAccount,characterId,serverSessionId:worldSession,
   expiresAtMs:worldSessionExpired?now-1:now+60000}:null,
  resolveVerifiedBase44ActionSession:async c=>c===context?{
   authenticated:true,identitySource:'base44-verified-action-session-179',
   accountId:baseAccount,characterId,worldSessionId:baseWorldSession,
   actionSessionId:baseSession,expiresAtMs:now+40000}:null,
  verifySessionActive:async proof=>{
   counters.activeChecks++;
   return !revoked&&proof.actionSessionId===baseSession;
  },...overrides
 });
 return {admission,counters,context,get host(){return privateHost},
  open:()=>admission.open({serverRequestContext:context}),
  setRevoked:x=>{revoked=x},advance:delta=>{now+=delta},
  setWorldAccount:x=>{worldAccount=x},setBaseAccount:x=>{baseAccount=x},
  setBaseWorldSession:x=>{baseWorldSession=x},
  setBaseSession:x=>{baseSession=x},
  setWorldSession:x=>{worldSession=x},
  setWorldSessionExpired:x=>{worldSessionExpired=x}};
}
const map={id:'wolfveil-v1',fingerprint:'a'.repeat(64),
 valid:p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z),height:()=>0,
 canStrike:()=>true};
const npcHost=resolveTrustedWorldActor=>createGame3DPrivateEncounterNpcHost178({
 encounter:{version:'13.6',privateServerOnly:true,instanceId,
  mapId:map.id,mapFingerprint:map.fingerprint,worldOrigin:{x:0,z:0},
  snapshot:()=>({instanceId,privateBetaOnly:true,rewardsIssued:false,
   serverTime:t-500,player:{x:0,z:0,hp:100}})},
 mapWorld:map,scope:{...scope,instanceEpoch:'epoch-179-one'},
 now:()=>t,verifyExclusiveWorldLease:async()=>true,
 resolveTrustedWorldActor,
 resolveSealedNpcSpawn:async()=>({source:'sealed-private-world-npc-seed-178',
  sealed:true,npcId:'archer_lyra',instanceId,instanceEpoch:'epoch-179-one',
  mapFingerprint:map.fingerprint,position:{x:2,z:0}})
});
const interact=(f,h,patch={})=>f.admission.recordNpcInteraction({
 handle:h,serverRequestContext:context,
 questId:'axe_q_first_patrol',npcId:'archer_lyra',...patch});

test('17.9 admission requires existing private 15.0 session manager and resolvers',()=>{
 assert.throws(()=>createGame3DQuestWorldSessionAdmission179(),/requires/);
 const f=fixture();assert.equal(f.admission.publicPlayerRouteInstalled,false);
 assert.equal(f.admission.realBase44ProviderInstalled,false);
});
test('17.9 opens one verified 15.0 world session after both backend authorities agree',async()=>{
 const f=fixture(),r=await f.open();
 assert.equal(r.ok,true);assert.equal(r.handle,'world-handle-179');
 assert.equal(r.credentialDeliveredToBrowser,false);
 assert.equal(f.counters.opened,1);assert(f.counters.activeChecks>=2);
});
test('17.9 rejects wrong Base44 account before issuing any world bearer',async()=>{
 const f=fixture();f.setBaseAccount('someone_else');
 assert.equal((await f.open()).ok,false);assert.equal(f.counters.opened,0);
});
test('17.9 rejects world-account switch and mismatched login-session binding',async()=>{
 for(const change of [f=>f.setWorldAccount('other'),f=>f.setBaseWorldSession('other-world-session'),
  f=>f.setWorldSession('other-world-session'),f=>f.setBaseSession('browser_claim')]){
  const f=fixture();change(f);
  assert.equal((await f.open()).ok,false);assert.equal(f.counters.opened,0);
 }
});
test('17.9 refused or revoked world actions do not advance the PvE session',async()=>{
 const f=fixture();await f.open();
 const opts={handle:'world-handle-179',serverRequestContext:context,
  action:'poll',payload:{connectionId:'x',afterSeq:0}};
 assert.equal((await f.admission.sendWorldAction(opts)).ok,true);
 assert.equal(f.counters.sent,1);
 f.setRevoked(true);
 assert.equal((await f.admission.sendWorldAction(opts)).ok,false);
 assert.equal(f.counters.sent,1);
});
test('17.9 private NPC receipt is bound to actual world and Base44 session',async()=>{
 const f=fixture();const r=await f.open();const host=f.host;
 const accepted=await f.admission.recordNpcInteraction({handle:r.handle,
  serverRequestContext:context,questId:'axe_q_first_patrol',npcId:'archer_lyra'});
 assert.equal(accepted.ok,true);assert.match(accepted.receiptId,/^npc178-/);
 const bridge=createGame3DTrustedNpcWorldBridge177({
  consumeServerNpcInteraction:host.consumeServerNpcInteraction,
  readServerWorldSnapshot:host.readServerWorldSnapshot,
  verifyServerLineOfSight:host.verifyServerLineOfSight,now:()=>t});
 const gate=createGame3DNpcInteractionGate175({
  resolveTrustedInteraction:bridge.resolveTrustedInteraction,now:()=>t});
 const verified=await gate.validate({ownerId:accountId,characterId,
  questId:'axe_q_first_patrol',sessionId:actionSessionId});
 assert.equal(verified.ok,true);assert.equal(verified.npcId,'archer_lyra');
 assert.equal((await gate.validate({ownerId:accountId,characterId,
  questId:'axe_q_first_patrol',sessionId:actionSessionId})).ok,false);
});
test('17.9 denies unsolicited user-provided session and NPC coordinates',async()=>{
 const f=fixture();await f.open();
 for(const bad of [{actionSessionId},{player:{x:0,y:0,z:0}},{host178:{}},{ownerId:accountId},
  {serverRequestContext:{}},{handle:'attacker'}]){
  const req={handle:'world-handle-179',serverRequestContext:context,
   questId:'axe_q_first_patrol',npcId:'archer_lyra',...bad};
  const out=await f.admission.recordNpcInteraction(req);
  if(bad.handle||bad.serverRequestContext||bad.player||bad.host178||bad.ownerId||bad.actionSessionId)
   assert.equal(out.ok,false);
 }
});
test('17.9 revoked Base44 action session cannot record NPC encounter',async()=>{
 const f=fixture();await f.open();f.setRevoked(true);
 const x=await interact(f,'world-handle-179');assert.equal(x.ok,false);
});
test('17.9 login change invalidates old bound action session on next NPC request',async()=>{
 const f=fixture();await f.open();f.setBaseSession('qb174-'+'b'.repeat(64));
 assert.equal((await interact(f,'world-handle-179')).ok,false);
});
test('17.9 account switch invalidates actor proof even with same private handle',async()=>{
 const f=fixture();await f.open();f.setBaseAccount('attacker');
 assert.equal((await interact(f,'world-handle-179')).ok,false);
});
test('17.9 local expiry prevents NPC quest acceptance',async()=>{
 const f=fixture();await f.open();f.advance(45000);
 assert.equal((await interact(f,'world-handle-179')).ok,false);
});
test('17.9 explicit close revokes private bridge and all previously issued contexts',async()=>{
 const f=fixture(),r=await f.open();
 const closed=await f.admission.close({handle:r.handle,serverRequestContext:context});
 assert.equal(closed.ok,true);assert.equal(f.counters.closed,1);
 assert.equal((await interact(f,r.handle)).ok,false);
});
test('17.9 shutdown kills future private admissions and world actions',async()=>{
 const f=fixture(),r=await f.open();await f.admission.shutdown();
 assert.equal(f.counters.shutdown,1);
 assert.equal((await f.open()).ok,false);
 assert.equal((await interact(f,r.handle)).ok,false);
});
