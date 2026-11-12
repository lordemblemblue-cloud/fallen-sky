import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createGame3DQuestbookReadTransport169} from '../privateQuestbookTransport169.mjs';
import {createAXEQuestbookReadModel169} from
 '../../../src/components/game3d/axe/quests/AXEQuestbookReadModel169.js';

const origin='https://game.example';
const revision='a'.repeat(64);
const stamp=1793667600000;
const persons={
 a:{authenticated:true,identitySource:'trusted-server-session',
  accountId:'owner169A',characterId:'character169A',
  serverSessionId:'trusted-session-169-A',expiresAtMs:stamp+600000},
 b:{authenticated:true,identitySource:'trusted-server-session',
  accountId:'owner169B',characterId:'character169B',
  serverSessionId:'trusted-session-169-B',expiresAtMs:stamp+600000},
 relog:{authenticated:true,identitySource:'trusted-server-session',
  accountId:'owner169A',characterId:'character169A',
  serverSessionId:'trusted-session-169-relogin',expiresAtMs:stamp+600000}
};
const quest=()=>({
 id:'axe_q_first_patrol',title:'Beyond the Capital Gate',
 npcId:'archer_lyra',category:'story',requires:null,
 status:'completed',statusLabel:'Completed',acceptedAt:'2026-11-02T12:00:00.000Z',
 completedAt:'2026-11-02T12:30:00.000Z',
 progressPercent:100,requiresServerTurnIn:false,
 objectives:[{id:'patrol_kills',type:'kill',tier:null,targetId:null,
  count:3,current:3,done:true}],
 readOnly:true,serverVerified:true,
 hiddenReward:5000,ownerId:'never-share'
});
const lead=()=>({
 questId:'echo_ch_14_first_echo',npcId:'archer_lyra',
 title:'The First Echo',optional:false,
 prerequisiteId:'axe_q_first_patrol',
 requiresExplicitAccept:true,autoAccepted:false,
 claimableReward:false,
 leakedSecret:'do-not-send'
});
const rival=()=>({
 leadId:'rival-169',otherCharacterId:'anotherPlayer',
 status:'pending',ownChoice:null,otherChoice:null,actorRole:'initiator',
 requiresExplicitConsent:true,mutualConsent:false,relationship:null,
 questAccepted:false,meetingScheduled:false,rewardsIssued:false,
 privateVote:'hidden'
});
const data=()=>({
 readOnly:true,questbook:{
  acceptedIds:[],completedIds:['axe_q_first_patrol'],
  entries:[quest()],readOnly:true
 },npcInteractionLeads:[lead()],rivalInvitations:[rival()],
 requiresExplicitNpcAcceptance:true
});
const publicData=()=>{
 const source=data();
 const {ownerId,hiddenReward,...q}=source.questbook.entries[0];
 const {leakedSecret,...npc}=source.npcInteractionLeads[0];
 const {otherChoice,privateVote,actorRole,...relation}=source.rivalInvitations[0];
 return {...source,rewardsIssued:false,questbook:{...source.questbook,entries:[q]},
  npcInteractionLeads:[npc],rivalInvitations:[relation]};
};
const req=(p='a',body={action:'read'})=>({
 method:'POST',origin,contentType:'application/json',
 body,serverRequestContext:{principal:p}
});
function setup({auth,readOverride}={}){
 const seen=[],opens=[];
 let revoked=false;
 let nextSnapshot=data();
 const sessions=new Map();
 const bridge168={
  version:'16.8',privateServerOnly:true,
  publicEndpointInstalled:false,browserQuestStoreConnected:false,
  async open({serverRequestContext}){
   const p=persons[serverRequestContext.principal];
   if(!p)return {ok:false};
   const handle=randomUUID(),epoch=randomUUID();
   opens.push({p:p.accountId,session:p.serverSessionId});
   sessions.set(handle,{epoch,principal:p});
   return {ok:true,serverHeldHandle:true,handle,epoch,
    sessionExpiresAtMs:stamp+120000,browserCredentialIssued:false};
  },
  async read({serverRequestContext,handle,epoch,knownRevision}){
   seen.push({principal:serverRequestContext.principal,
    handle,epoch,knownRevision});
   if(revoked)return {ok:false,reason:'private_session_expired_or_denied'};
   const s=sessions.get(handle);
   if(!s||s.epoch!==epoch)return {ok:false,reason:'stale_questbook_session_fence'};
   if(readOverride)return readOverride({knownRevision,serverRequestContext,epoch});
   const unchanged=knownRevision===revision;
   return {ok:true,version:'16.8',epoch,revision,sequence:1,
    unchanged,readOnly:true,questWritesEnabled:false,
    socialWritesEnabled:false,rewardsIssued:false,
    ...(unchanged?{}:{snapshot:structuredClone(nextSnapshot)})};
  }
 };
 const resolver=auth??(async ctx=>persons[ctx?.principal]??null);
 const transport=createGame3DQuestbookReadTransport169({
  bridge168,resolveTrustedPlayerSession:resolver,
  allowedOrigins:[origin],now:()=>stamp
 });
 return {transport,opens,seen,bridge168,
  revoke:()=>{revoked=true},
  setSnapshot:x=>{nextSnapshot=x},
  response:async(p='a',body)=>transport.handle(req(p,body))
 };
}
test('16.9 cannot be constructed without trusted router dependencies',()=>{
 assert.throws(()=>createGame3DQuestbookReadTransport169({}));
 assert.throws(()=>createGame3DQuestbookReadTransport169({
  bridge168:{version:'16.8'},resolveTrustedPlayerSession:async()=>persons.a,
  allowedOrigins:[origin]
 }));
 assert.throws(()=>createGame3DQuestbookReadTransport169({
  bridge168:setup().bridge168,
  resolveTrustedPlayerSession:async()=>persons.a,
  allowedOrigins:['*']
 }));
});
test('strict POST, origin, content-type and no browser identity claims',async()=>{
 const f=setup();
 for(const bad of [
  {...req(),origin:'https://attacker.example'},
  {...req(),method:'GET'},
  {...req(),contentType:'text/plain'},
  req('a',{action:'read',ownerId:'owner169B'}),
  req('a',{action:'write'}),
  req('a',{action:'read',knownRevision:'fake'}),
  req('a',{action:'read',knownViewId:'invalid'}),
 ]){
  const result=await f.transport.handle(bad);
  assert.equal(result.body.ok,false);
  assert.equal(result.headers['Cache-Control'],'no-store, private');
 }
 assert.equal(f.opens.length,0);
 assert.equal((await f.response('missing')).status,401);
 assert.equal(f.opens.length,0);
});
test('server identity and session handles stay private, whitelist fields',async()=>{
 const f=setup(),first=await f.response();
 assert.equal(first.status,200);
 assert.equal(first.body.ok,true);
 assert.equal(first.body.version,'16.9');
 assert.equal(first.body.unchanged,false);
 assert.equal(first.body.readOnly,true);
 assert.equal(first.body.snapshot.questbook.entries[0].title,
  'Beyond the Capital Gate');
 assert.equal(first.body.snapshot.questbook.entries[0].hiddenReward,undefined);
 assert.equal(first.body.snapshot.ownerId,undefined);
 assert.equal(first.body.handle,undefined);
 assert.equal(first.body.epoch,undefined);
 assert.equal(first.body.serverSessionId,undefined);
 assert.equal(first.body.snapshot.rivalInvitations[0].otherChoice,undefined);
 assert.equal(first.body.snapshot.rivalInvitations[0].privateVote,undefined);
 assert.equal(first.body.snapshot.npcInteractionLeads[0].autoAccepted,false);
 assert.equal(first.body.snapshot.rewardsIssued,false);
 assert.equal(f.opens.length,1);
 assert.equal(f.seen.length,1);
});
test('repeated conditional reads omit payload; a changed view must resend',async()=>{
 const f=setup(),one=(await f.response()).body;
 const unchanged=(await f.response('a',{
  action:'read',knownRevision:one.revision,knownViewId:one.viewId
 })).body;
 assert.equal(unchanged.unchanged,true);
 assert.equal(Object.hasOwn(unchanged,'snapshot'),false);
 assert.equal(f.seen[1].knownRevision,revision);
 const replaced=(await f.response('a',{
  action:'read',knownRevision:one.revision,knownViewId:randomUUID()
 })).body;
 assert.equal(replaced.unchanged,false);
 assert.ok(replaced.snapshot);
 assert.equal(f.seen[2].knownRevision,null);
});
test('different player and relogin get distinct display generations',async()=>{
 const f=setup();
 const one=(await f.response()).body;
 const second=(await f.response('b')).body;
 assert.notEqual(one.viewId,second.viewId);
 const relogged=(await f.response('relog')).body;
 assert.notEqual(one.viewId,relogged.viewId);
 const older=await f.response('a',{
  action:'read',knownRevision:one.revision,knownViewId:one.viewId
 });
 // The authenticated old login is only accepted if the external auth
 // provider STILL considers it valid. Server handles nevertheless rotate.
 assert.notEqual(older.body.viewId,one.viewId);
 assert.equal(older.body.unchanged,false);
});
test('server read failure or corrupt projection returns no trusted data',async()=>{
 const f=setup();
 f.setSnapshot({...data(),questbook:{...data().questbook,
  entries:[{...quest(),serverVerified:false}]}});
 const failed=await f.response();
 assert.equal(failed.status,503);
 assert.equal(failed.body.snapshot,undefined);
 assert.equal(failed.body.reason,'unverified_questbook_presentation');
 const g=setup();g.revoke();
 const lost=await g.response();
 assert.equal(lost.status,503);
 assert.equal(lost.body.snapshot,undefined);
});
test('revocation during awaited private read cannot leak a snapshot',async()=>{
 let entered,resume;
 const waiting=new Promise(resolve=>{resume=resolve});
 const started=new Promise(resolve=>{entered=resolve});
 let authorized=true;
 const f=setup({
  auth:async ctx=>authorized?persons[ctx?.principal]??null:null,
  readOverride:async({epoch})=>{
   entered();await waiting;
   return {ok:true,version:'16.8',epoch,revision,sequence:1,
    unchanged:false,readOnly:true,questWritesEnabled:false,
    socialWritesEnabled:false,rewardsIssued:false,snapshot:publicData()};
  }
 });
 const pending=f.response();
 await started;
 authorized=false;resume();
 const result=await pending;
 assert.equal(result.status,401);
 assert.equal(result.body.snapshot,undefined);
});
test('shutdown disposes transport and blocks further reads',async()=>{
 const f=setup();
 assert.equal((await f.response()).status,200);
 assert.equal((await f.transport.shutdown()).ok,true);
 assert.equal((await f.response()).status,503);
});
test('16.9 transport response round-trips through browser read model',async()=>{
 const f=setup(),m=createAXEQuestbookReadModel169();
 const first=(await f.response()).body;
 const applied=m.apply(first,{
  acceptedIds:['local_forged'],completedIds:['local_fake'],
  progress:{axe_q_first_patrol:999},lastAcceptedId:'local_forged'
 });
 assert.equal(applied.ok,true,JSON.stringify(applied));
 assert.equal(applied.view.entries.length,1);
 assert.equal(applied.view.questState.objectiveProgress.axe_q_first_patrol.patrol_kills,3);
 assert.deepEqual(applied.view.questState.completedIds,['axe_q_first_patrol']);
 assert.deepEqual(applied.view.localOnlyIds,['local_forged','local_fake']);
 const unchanged=(await f.response('a',m.getQuery())).body;
 assert.equal(unchanged.unchanged,true);
 assert.equal(m.apply(unchanged).updated,false);
});
test('client derivation uses only server progress, never local completion',()=>{
 const m=createAXEQuestbookReadModel169(),viewId=randomUUID();
 const envelope={ok:true,version:'16.9',viewId,revision,sequence:1,
  unchanged:false,readOnly:true,rewardsIssued:false,snapshot:publicData()};
 const local={
  acceptedIds:['local_only'],completedIds:['forged_completed'],
  objectiveProgress:{axe_q_first_patrol:{patrol_kills:999}},
  progress:{axe_q_first_patrol:999},
  lastAcceptedId:'forged_completed'
 };
 const result=m.apply(envelope,local);
 assert.equal(result.ok,true);
 assert.deepEqual(result.view.questState.acceptedIds,[]);
 assert.deepEqual(result.view.questState.completedIds,['axe_q_first_patrol']);
 assert.equal(result.view.questState.objectiveProgress.axe_q_first_patrol.patrol_kills,3);
 assert.deepEqual(result.view.localOnlyIds,['local_only','forged_completed']);
 assert.equal(result.view.rivalInvitations[0].otherChoice,undefined);
 assert.equal(result.view.npcInteractionLeads[0].autoAccepted,false);
 assert.equal(result.view.readOnly,true);
 assert.deepEqual(m.getQuery(),{action:'read',knownRevision:revision,knownViewId:viewId});
 const same=m.apply({...envelope,unchanged:true,snapshot:undefined});
 assert.equal(same.ok,false,'an unchanged reply cannot carry any snapshot property');
 assert.equal(m.getView(),null);
});
test('client accepts no-op reply only for matching session/revision/sequence',()=>{
 const m=createAXEQuestbookReadModel169(),viewId=randomUUID();
 const first={ok:true,version:'16.9',viewId,revision,sequence:1,
  unchanged:false,readOnly:true,rewardsIssued:false,snapshot:publicData()};
 assert.equal(m.apply(first).ok,true);
 const noOp=m.apply({ok:true,version:'16.9',viewId,
  revision,sequence:1,unchanged:true,readOnly:true,rewardsIssued:false});
 assert.equal(noOp.ok,true);assert.equal(noOp.updated,false);
 assert.equal(m.apply({...first,viewId:randomUUID(),
  unchanged:true}).ok,false);
 assert.equal(m.getView(),null);
 assert.equal(m.apply(first).ok,true);
 assert.equal(m.apply({...first,sequence:0}).ok,false);
});
test('client rejects unverified/tampered counters, invitations and Rival consent',()=>{
 for(const corrupt of [
  x=>({...x,questbook:{...x.questbook,
   entries:[{...quest(),progressPercent:1}]} }),
  x=>({...x,questbook:{...x.questbook,
   entries:[{...quest(),serverVerified:false}]} }),
  x=>({...x,rivalInvitations:[{...rival(),otherChoice:'rival'}]}),
  x=>({...x,rivalInvitations:[{...rival(),mutualConsent:true}]}),
  x=>({...x,npcInteractionLeads:[{...lead(),autoAccepted:true}]}),
 ]){
  const m=createAXEQuestbookReadModel169();
  const result=m.apply({ok:true,version:'16.9',viewId:randomUUID(),
   revision,sequence:1,unchanged:false,readOnly:true,
   rewardsIssued:false,snapshot:corrupt(publicData())});
  assert.equal(result.ok,false);
  assert.equal(m.getView(),null);
 }
});
