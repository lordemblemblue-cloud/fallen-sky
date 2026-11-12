// Combat/Quest 86.0: genuine 84.6->84.8->84.9 source composition.
// The only fakes are the external original 84.5 authenticated admission,
// independent backend session checks and PG16 world state. No public route.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateGameplayHost846}
 from '../privateCombatQuestHost846.mjs';
import {createGame3DPrivateQuestbookPresentation848}
 from '../privateQuestbookPresentation848.mjs';
import {createGame3DPrivateQuestbookDelivery849}
 from '../privateQuestbookDelivery849.mjs';

const old=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope={ownerId:'owner860',characterId:'hero860',
 instanceId:'world-instance-860',instanceEpoch:'world-epoch-860',
 mapFingerprint:'c'.repeat(64)};
const context=Object.freeze({trustedPrivate:'860'});
const edgeContext=Object.freeze({serverVerified:'860'});
const connectionId='86086086-0860-4860-8860-860860860860';
const actionId='qb174-'+'f'.repeat(64);
const nonce='86086086-0860-4860-8860-860860860860';
const snap=seq=>({protocol:1,version:'13.7',
 instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch,
 mapFingerprint:scope.mapFingerprint,eventSeq:seq,serverTime:1000,
 rewardsIssued:false,player:{x:0,z:0,hp:100,maxHp:100,
  stamina:80,facing:0,lastIntentSeq:0},
 enemies:[{id:'wolf1',x:2,z:3,hp:12,maxHp:20,
  alive:true,pendingImpactAt:null}]});
const validSync=()=>({ok:true,version:'84.5',rewardsIssued:false,
 rewardAuthorized:false,questTurnInCommitted:false,
 progressSynchronized:true,confirmedEventSeq:0,worldEventSeq:0,
 objectives:[]});
const validPoll=()=>({ok:true,version:'84.5',
 rewardsIssued:false,rewardAuthorized:false,
 reset:false,gap:false,hasMore:false,
 nextSeq:0,snapshot:snap(0),events:[]});
const readAttestation=()=>({authenticated:true,
 identitySource:'base44-verified-action-session-179',
 accountId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 worldSessionId:'world-session-860',actionSessionId:actionId,
 leaseNonce:nonce,expiresAtMs:1010000});
const edgeAttestation=()=>({authenticated:true,
 identitySource:'independent-server-edge-849',
 credentialVerified:true,originApproved:true,csrfVerified:true,
 readOnly:true,method:'GET',accountId:scope.ownerId,
 characterId:scope.characterId,worldInstanceId:scope.instanceId,
 worldEpoch:scope.instanceEpoch,
 worldSessionId:'world-session-860',actionSessionId:actionId,
 leaseNonce:nonce,expiresAtMs:1010000});
function make(){
 const state={clock:1000000,mode:'valid',calls:[],shutdowns:0,
  nextTick:null,read:readAttestation(),edge:edgeAttestation()};
 const admission={version:'84.5',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  hostedWorkerInstalled:false,credentialDeliveredToBrowser:false,
  async connect(){state.calls.push('connect');
   return {ok:true,version:'84.5',connectionId,
    snapshot:snap(0),rewardsIssued:false}},
  async poll(){state.calls.push('poll');
   if(state.mode==='terminal')return {ok:false,version:'84.5',
    rewardsIssued:false,reason:'private_session_admission_halted'};
   if(state.mode==='throw')throw Error('private_owner_disappeared');
   if(state.mode==='forged')return {...validPoll(),
    events:[{seq:1,instanceId:scope.instanceId,
     kind:'player_strike',serverTime:1000,
     xpAuthorized:true,lootAuthorized:false,currencyAuthorized:false}],
    nextSeq:1,snapshot:snap(1)};
   return validPoll();
  },
  async setInput(){return {ok:true,rewardsIssued:false,inputSeq:1}},
  async submit(){return {ok:true,rewardsIssued:false,queued:true}},
  async advance(){state.calls.push('advance');
   return state.nextTick??validSync()},
  async recover(){state.calls.push('recover');return validSync()},
  async disconnect(){return {ok:true,rewardsIssued:false}},
  async shutdown(){state.calls.push('shutdown');state.shutdowns++;return true},
 };
 const host=createGame3DPrivateGameplayHost846({enabled:true,
  admission,scope});
 const view=createGame3DPrivateQuestbookPresentation848({
  enabled:true,host,scope,serverRequestContext:context,
  verifyAuthorizedReader:async c=>{
   assert.equal(c,context);return state.read;
  },now:()=>state.clock,
 });
 const delivery=createGame3DPrivateQuestbookDelivery849({
  enabled:true,view,scope,serverRequestContext:context,
  verifyEdgeRequest:async ({serverRequestContext,edgeContext:edge,
   operation})=>{
   assert.equal(serverRequestContext,context);
   assert.equal(edge,edgeContext);
   assert.ok(['open','poll'].includes(operation));
   return state.edge;
  },now:()=>state.clock,
 });
 return {state,host,view,delivery};
}
const req=Object.freeze({edgeContext});
test('86.0 original 84.6→84.8→84.9 opens and polls a valid no-reward world',async()=>{
 const x=make();
 assert.equal((await x.delivery.open(req)).ok,true);
 const r=await x.delivery.poll(req);
 assert.equal(r.ok,true);
 assert.equal(r.payload.snapshot.player.hp,100);
 assert.equal(r.payload.questbook.turnInAuthorized,false);
 assert.equal(r.payload.events.length,0);
 assert.equal(r.rewardAuthorized,false);
 assert.equal(await x.delivery.shutdown(),true);
 assert.equal(x.state.shutdowns,1);
});
test('86.0 explicitly terminal 84.6 admission revocation closes all reader layers',async()=>{
 const x=make();await x.delivery.open(req);
 x.state.mode='terminal';
 const r=await x.delivery.poll(req);
 assert.equal(r.ok,false);
 assert.equal(r.reason,'private_view_rejected');
 assert.equal(x.state.shutdowns,1);
 x.state.clock+=500;
 assert.equal((await x.delivery.poll(req)).ok,false);
 assert.equal(x.state.shutdowns,1);
});
test('86.0 thrown original 84.6 owner poll is terminal, not retryable indefinitely',async()=>{
 const x=make();await x.delivery.open(req);
 x.state.mode='throw';
 assert.equal((await x.delivery.poll(req)).reason,'private_view_rejected');
 assert.equal(x.state.shutdowns,1);
 assert.equal(x.state.calls.filter(x=>x==='poll').length,1);
});
test('86.0 unauthorized XP combat event is never laundered into a transient frame',async()=>{
 const x=make();await x.delivery.open(req);
 x.state.mode='forged';
 const r=await x.delivery.poll(req);
 assert.equal(r.reason,'private_view_rejected');
 assert.equal(x.state.shutdowns,1);
 assert.equal((await x.delivery.poll(req)).ok,false);
});
test('86.0 only explicit original 84.4 replay-pending frame can be retried safely',async()=>{
 const x=make();await x.delivery.open(req);
 x.state.nextTick={ok:false,version:'84.5',
  rewardsIssued:false,reason:'pg_ambiguous'};
 const tick=await x.host.advance();
 assert.equal(tick.reason,'private_quest_sync_unverified');
 const pending=await x.delivery.poll(req);
 assert.equal(pending.reason,'private_view_not_ready');
 assert.equal(x.state.shutdowns,0);
 assert.equal((await x.host.recover()).ok,true);
 x.state.clock+=500;
 const ready=await x.delivery.poll(req);
 assert.equal(ready.ok,true);
 assert.equal(x.state.shutdowns,0);
 await x.delivery.shutdown();
 assert.equal(x.state.shutdowns,1);
});
process.on('exit',()=>{
 if(old===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=old;
});
