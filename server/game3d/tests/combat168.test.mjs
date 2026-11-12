import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestbookSessionBridge168} from
 '../privateQuestbookSessionBridge168.mjs';
import {PRIVATE_QUESTBOOK_PROJECTION_VERSION_167} from
 '../privateQuestbookProjection167.mjs';

const clock={ms:1793667600000};
const principals={
 a:{authenticated:true,identitySource:'trusted-server-session',
  accountId:'owner168A',characterId:'character168A',
  serverSessionId:'trusted-session-168-A',expiresAtMs:clock.ms+600000},
 b:{authenticated:true,identitySource:'trusted-server-session',
  accountId:'owner168B',characterId:'character168B',
  serverSessionId:'trusted-session-168-B',expiresAtMs:clock.ms+600000},
 switch:{authenticated:true,identitySource:'trusted-server-session',
  accountId:'owner168A',characterId:'character168Alt',
  serverSessionId:'trusted-session-168-A',expiresAtMs:clock.ms+600000}
};
const copy=x=>structuredClone(x);
const snapshot=(p,entries=[],leads=[],rivals=[])=>({
 ok:true,version:'16.7',
 projectionVersion:PRIVATE_QUESTBOOK_PROJECTION_VERSION_167,
 ownerId:p.accountId,characterId:p.characterId,
 questbook:{acceptedIds:entries.filter(e=>e.status==='accepted').map(e=>e.id),
  completedIds:entries.filter(e=>e.status==='completed').map(e=>e.id),
  entries,readOnly:true},
 npcInteractionLeads:leads,rivalInvitations:rivals,
 privateServerOnly:true,publicEndpointInstalled:false,
 browserQuestStoreConnected:false,questWritesEnabled:false,
 socialWritesEnabled:false,rewardsIssued:false
});
const quest=()=>({
 id:'axe_q_first_patrol',questId:'axe_q_first_patrol',
 title:'Beyond the Capital Gate',npcId:'archer_lyra',category:'story',
 requires:null,status:'accepted',statusLabel:'In Progress',
 acceptedAt:'2026-11-02T00:00:00.000Z',completedAt:null,
 progressPercent:0,objectives:[{
  id:'patrol',type:'kill',tier:null,targetId:null,
  count:3,current:0,done:false,optional:false
 }],serverVerified:true,readOnly:true,requiresServerTurnIn:false
});
const lead=()=>({
 questId:'echo_ch_14_first_echo',npcId:'archer_lyra',
 title:'Chapter 1.4 — The First Echo',
 prerequisiteId:'axe_q_first_patrol',optional:false,
 action:'request_private_server_quest_acceptance',
 requiresExplicitAccept:true,autoAccepted:false,
 claimableReward:false,readOnly:true
});
const rival=()=>({
 leadId:'rival-168',otherCharacterId:'character168B',
 status:'pending',actorRole:'initiator',ownChoice:null,otherChoice:null,
 requiresExplicitConsent:true,mutualConsent:false,relationship:null,
 questAccepted:false,meetingScheduled:false,rewardsIssued:false,readOnly:true
});
const mk=({override,auth}={})=>{
 let data=snapshot(principals.a),reads=[],writes=0;
 const reader={version:'16.7',privateServerOnly:true,
  publicEndpointInstalled:false,browserQuestStoreConnected:false,
  readSnapshot:async scope=>{
   reads.push(copy(scope));
   return override?override(scope):copy(data);
  }};
 const bridge=createGame3DPrivateQuestbookSessionBridge168({
  projection167:reader,
  resolveTrustedPlayerSession:auth??(async ctx=>principals[ctx?.principal]??null),
  now:()=>clock.ms,leaseMs:120000
 });
 return {bridge,setData:x=>{data=x},reads:()=>reads,
  writes:()=>writes};
};
test('16.8 requires independently verified server-only dependencies',()=>{
 assert.throws(()=>createGame3DPrivateQuestbookSessionBridge168({}));
 assert.throws(()=>createGame3DPrivateQuestbookSessionBridge168({
  projection167:{version:'16.7',readSnapshot:async()=>({ok:true})},
  resolveTrustedPlayerSession:async()=>principals.a
 }));
});
test('authentication, canonical identity, no browser token, and isolation',async()=>{
 const f=mk(),{bridge}=f;
 assert.equal((await bridge.open({serverRequestContext:{principal:'unknown'}}))
  .reason,'trusted_questbook_login_required');
 const open=await bridge.open({serverRequestContext:{principal:'a'}});
 assert.equal(open.ok,true);
 assert.equal(open.browserCredentialIssued,false);
 assert.equal(open.publicEndpointInstalled,false);
 assert.equal(open.token,undefined);
 const params={handle:open.handle,epoch:open.epoch};
 assert.equal((await bridge.read({...params,serverRequestContext:{principal:'b'}}))
  .reason,'trusted_questbook_session_mismatch');
 assert.equal(f.reads().length,0);
 const good=await bridge.read({...params,serverRequestContext:{principal:'a'},
  ownerId:'owner168B',characterId:'character168B'});
 assert.equal(good.ok,true);
 assert.deepEqual(f.reads(),[{ownerId:'owner168A',
  characterId:'character168A'}]);
 assert.equal(good.snapshot.questbook.entries.length,0);
 assert.equal(good.snapshot.ownerId,undefined);
 assert.equal(good.privateServerOnly,true);
 assert.equal(good.questWritesEnabled,false);
 assert.equal(f.writes(),0);
});
test('content revisions and conditional reads do not modify server state',async()=>{
 const f=mk(),{bridge}=f;
 const open=await bridge.open({serverRequestContext:{principal:'a'}});
 const args={handle:open.handle,epoch:open.epoch,
  serverRequestContext:{principal:'a'}};
 const first=await bridge.read(args);
 assert.equal(first.ok,true);assert.equal(first.unchanged,false);
 assert.equal(first.sequence,1);
 const identical=await bridge.read({...args,knownRevision:first.revision});
 assert.equal(identical.ok,true);assert.equal(identical.unchanged,true);
 assert.equal(identical.sequence,1);
 assert.equal(Object.hasOwn(identical,'snapshot'),false);
 f.setData(snapshot(principals.a,[quest()]));
 const second=await bridge.read({...args,knownRevision:first.revision});
 assert.equal(second.unchanged,false);assert.equal(second.sequence,2);
 assert.notEqual(second.revision,first.revision);
 assert.equal(second.snapshot.questbook.entries[0].objectives[0].current,0);
 assert.equal(second.snapshot.questbook.entries[0].readOnly,true);
 assert.equal(f.writes(),0);
});
test('reconnect fences old handle and old epoch, independent actor sessions',async()=>{
 const f=mk(),{bridge}=f;
 const one=await bridge.open({serverRequestContext:{principal:'a'}});
 const other=await bridge.open({serverRequestContext:{principal:'b'}});
 const reconnect=await bridge.open({serverRequestContext:{principal:'a'}});
 assert.notEqual(one.epoch,reconnect.epoch);
 const fail=await bridge.read({handle:one.handle,epoch:one.epoch,
  serverRequestContext:{principal:'a'}});
 assert.equal(fail.reason,'stale_questbook_session_fence');
 const wrongEpoch=await bridge.read({handle:reconnect.handle,epoch:one.epoch,
  serverRequestContext:{principal:'a'}});
 assert.equal(wrongEpoch.reason,'stale_questbook_session_fence');
 // The B session is not invalidated by A's reconnect.
 const b=await bridge.read({handle:other.handle,epoch:other.epoch,
  serverRequestContext:{principal:'b'}});
 // Stub returns A data; mismatched owner/character must be refused.
 assert.equal(b.reason,'unverified_private_questbook_snapshot');
 const correct=await bridge.read({handle:reconnect.handle,epoch:reconnect.epoch,
  serverRequestContext:{principal:'a'}});
 assert.equal(correct.ok,true);assert.equal(correct.sequence,1);
 const switched=await bridge.open({serverRequestContext:{principal:'switch'}});
 assert.equal(switched.ok,true);
 assert.equal((await bridge.read({handle:reconnect.handle,epoch:reconnect.epoch,
  serverRequestContext:{principal:'a'}})).reason,
  'stale_questbook_session_fence');
});
test('NPC invitations and Rival statuses remain read-only and consent-gated',async()=>{
 const f=mk(),q=quest();
 q.status='completed';q.statusLabel='Completed';q.progressPercent=100;
 q.objectives[0].current=3;q.objectives[0].done=true;
 q.completedAt='2026-11-02T00:20:00.000Z';
 f.setData(snapshot(principals.a,[q],[lead()],[rival()]));
 const open=await f.bridge.open({serverRequestContext:{principal:'a'}});
 const s=(await f.bridge.read({handle:open.handle,epoch:open.epoch,
  serverRequestContext:{principal:'a'}})).snapshot;
 assert.deepEqual(s.questbook.completedIds,['axe_q_first_patrol']);
 assert.equal(s.npcInteractionLeads[0].autoAccepted,false);
 assert.equal(s.npcInteractionLeads[0].requiresExplicitAccept,true);
 assert.equal(s.rivalInvitations[0].otherChoice,null);
 assert.equal(s.rivalInvitations[0].mutualConsent,false);
 assert.equal(s.rivalInvitations[0].questAccepted,false);
 assert.equal(s.rivalInvitations[0].rewardsIssued,false);
});
test('bad projection, forged credit, cross-character and oversize fail closed',async()=>{
 for(const bad of [
  p=>snapshot(principals.b),
  p=>({...snapshot(p),questWritesEnabled:true}),
  p=>snapshot(p,[{...quest(),progressPercent:100}]),
  p=>snapshot(p,[{...quest(),serverVerified:false}]),
  p=>snapshot(p,[],[],[{...rival(),otherChoice:'rival'}]),
  p=>snapshot(p,[],[lead()]),
  p=>snapshot(p,Array.from({length:10},()=>quest()))
 ]){
  const f=mk({override:bad});
  const open=await f.bridge.open({serverRequestContext:{principal:'a'}});
  const reply=await f.bridge.read({handle:open.handle,epoch:open.epoch,
   serverRequestContext:{principal:'a'}});
  assert.equal(reply.reason,'unverified_private_questbook_snapshot');
  assert.equal(reply.snapshot,undefined);
 }
});
test('expiry, resolver revocation, close and shutdown fail closed',async()=>{
 const f=mk(),{bridge}=f;
 let open=await bridge.open({serverRequestContext:{principal:'a'}});
 const args={handle:open.handle,epoch:open.epoch,
  serverRequestContext:{principal:'a'}};
 assert.equal((await bridge.close(args)).ok,true);
 assert.equal((await bridge.read(args)).reason,'stale_questbook_session_fence');
 open=await bridge.open({serverRequestContext:{principal:'a'}});
 clock.ms+=120001;
 assert.equal((await bridge.read({handle:open.handle,epoch:open.epoch,
  serverRequestContext:{principal:'a'}})).reason,
  'stale_questbook_session_fence');
 clock.ms-=120001;
 const fresh=await bridge.open({serverRequestContext:{principal:'a'}});
 assert.equal((await bridge.shutdown()).ok,true);
 assert.equal((await bridge.read({handle:fresh.handle,epoch:fresh.epoch,
  serverRequestContext:{principal:'a'}})).reason,'questbook_bridge_closed');
});
test('session revoked while projection awaits cannot deliver snapshot',async()=>{
 let resume;
 const waiting=new Promise(resolve=>{resume=resolve});
 let inside;
 const entered=new Promise(resolve=>{inside=resolve});
 let allowed=true;
 const f=mk({override:async scope=>{
  inside();await waiting;return snapshot(principals.a);
 },auth:async ctx=>allowed?principals[ctx?.principal]??null:null});
 const open=await f.bridge.open({serverRequestContext:{principal:'a'}});
 const pending=f.bridge.read({handle:open.handle,epoch:open.epoch,
  serverRequestContext:{principal:'a'}});
 await entered;
 allowed=false;resume();
 const result=await pending;
 assert.equal(result.reason,'trusted_questbook_session_mismatch');
 assert.equal(result.snapshot,undefined);
});
