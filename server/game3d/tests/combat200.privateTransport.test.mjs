import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestTransportStaging199}
 from '../privateQuestTransportStaging199.mjs';
import {sanitizePrivateQuestSnapshot197}
 from '../privateTransportSnapshot197.mjs';
import {parsePrivateQuestFrame193}
 from '../privateTransportFrame193.mjs';
import {createPrivateTransportSequence194}
 from '../privateTransportSequence194.mjs';
import {createPrivateTransportBudget195}
 from '../privateTransportBudget195.mjs';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const start=1793720000000;
function fixture({invalidSnapshot=false,dbDead=false}={}){
 let time=start,worldLive=true,actionLive=true,dbLive=!dbDead,
     nonce='11111111-1111-4111-8111-111111111111',closed=0,
     pgQueries=0,reconnectCalls=0;
 const scope={ownerId:'owner200',characterId:'hero200',
  instanceId:'world-instance-200',instanceEpoch:'world-epoch-200',
  mapFingerprint:'f'.repeat(64)};
 const originalCtx={kind:'private-original'};
 const reconnectCtx={kind:'separately-authenticated-reconnect'};
 const readCtx={kind:'separately-authenticated-read'};
 const wrongCtx={kind:'wrong-account'};
 const trusted=new Set([reconnectCtx,readCtx]);
 const lease=()=>({ownerId:scope.ownerId,characterId:scope.characterId,
  worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
  serverSessionId:'world-session-200',
  actionSessionId:'qb174-'+'a'.repeat(64),leaseNonce:nonce,
  expiresAtMs:start+60000});
 const worldStage180={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   return worldLive&&serverRequestContext===originalCtx?lease():null;
  }};
 const pairing180={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveTrustedWorldPrincipal(ctx){
   if(!trusted.has(ctx)||!actionLive)return null;
   return {authenticated:true,identitySource:'trusted-server-session',
    accountId:scope.ownerId,characterId:scope.characterId,
    serverSessionId:'world-session-200',expiresAtMs:start+50000};
  },
  async resolveVerifiedBase44ActionSession(ctx){
   if(!trusted.has(ctx)||!actionLive)return null;
   return {authenticated:true,
    identitySource:'base44-verified-action-session-179',
    accountId:scope.ownerId,characterId:scope.characterId,
    worldSessionId:'world-session-200',
    actionSessionId:'qb174-'+'a'.repeat(64),expiresAtMs:start+50000};
  },
  async verifySessionActive(){return worldLive&&actionLive;}};
 const pool={
  async connect(){return {
   async query(sql,params=[]){
    if(sql.startsWith('BEGIN'))return {rowCount:0,rows:[]};
    if(sql==='COMMIT'||sql==='ROLLBACK')return {rowCount:0,rows:[]};
    if(!sql.includes('game3d_private_quest_session_fence_183'))
     throw Error('unexpected SQL');
    pgQueries++;
    if(!dbLive)return {rowCount:0,rows:[]};
    const l=lease();
    assert.deepEqual(params,[l.ownerId,l.characterId,l.worldInstanceId,
     l.worldEpoch,l.serverSessionId,l.actionSessionId,l.leaseNonce]);
    return {rowCount:1,rows:[{
     owner_id:l.ownerId,character_id:l.characterId,
     world_instance_id:l.worldInstanceId,world_epoch:l.worldEpoch,
     world_session_id:l.serverSessionId,
     action_session_id:l.actionSessionId,lease_nonce:l.leaseNonce,
     active:true,not_expired:true,
    }]};
   },
   release(){closed++},
  }}
 };
 const progress=[{questId:'axe_q_first_patrol',objectiveId:'patrol_kills',
  type:'kill',status:'accepted',current:2,required:3,
  privateDbSecret:'never-expose-this'}];
 const reconnect189={version:'18.9',privateServerOnly:true,
  publicRouteInstalled:false,transportBindingCreated:false,
  resumeCombatAuthorized:false,
  async verifyReconnect({serverReconnectContext}){
   reconnectCalls++;
   if(!trusted.has(serverReconnectContext))return {ok:false};
   return {ok:true,authenticatedReconnect:true,
    questProgressSynchronized:true,transportBindingCreated:false,
    resumeCombatAuthorized:false,worldLeaseRestored:false,
    rewardsIssued:false,progress:invalidSnapshot?[{bad:true}]:progress};
  }};
 const create=()=>createGame3DPrivateQuestTransportStaging199({
  enabled:true,pairing180,worldStage180,reconnect189,
  serverRequestContext:originalCtx,scope,progressionPool:pool,
  now:()=>time,
 });
 return {create,reconnectCtx,readCtx,wrongCtx,
  advance(ms){time+=ms},expire(){time=start+60001},
  revokeWorld(){worldLive=false},revokeBase44(){actionLive=false},
  revokePG(){dbLive=false},rotateNonce(){nonce='22222222-2222-4222-8222-222222222222'},
  get queries(){return pgQueries},get reconnectCalls(){return reconnectCalls},
  get released(){return closed}};
}
const frame=seq=>({v:1,seq,op:'questbook.read'});
test('20.0 private transport disabled by default',async()=>{
 const h=fixture();
 await assert.rejects(
  createGame3DPrivateQuestTransportStaging199({}),
  /19.9 requires original/);
 const g=await h.create();assert.equal(g.publicRouteInstalled,false);
 g.shutdown();
});
test('20.0 only trusted original 18.9 reconnect can attach',async()=>{
 const h=fixture(),g=await h.create();
 assert.equal((await g.attach({serverReconnectContext:h.wrongCtx})).ok,false);
 assert.equal((await g.attach({serverReconnectContext:h.reconnectCtx,ownerId:'x'})).ok,false);
 const a=await g.attach({serverReconnectContext:h.reconnectCtx});
 assert.equal(a.ok,true);
 assert.equal(a.transportBindingCreated,false);
 assert.equal(h.reconnectCalls,1);
 g.shutdown();
});
test('20.0 read returns sanitized static Questbook snapshot, no combat authority',async()=>{
 const h=fixture(),g=await h.create();
 const a=await g.attach({serverReconnectContext:h.reconnectCtx});
 const r=await a.privateHandle.read({serverReadContext:h.readCtx,frame:frame(1)});
 assert.equal(r.ok,true);assert.equal(r.staticReconnectSnapshot,true);
 assert.equal(r.resumeCombatAuthorized,false);assert.equal(r.rewardsIssued,false);
 assert.deepEqual(r.objectives,[{questId:'axe_q_first_patrol',
  objectiveId:'patrol_kills',type:'kill',status:'accepted',
  current:2,required:3}]);
 assert.equal(Object.hasOwn(r,'privateDbSecret'),false);
 assert.ok(h.queries>=4);
 g.shutdown();
});
test('20.0 replayed, skipped and unauthorized operations fail',async()=>{
 const h=fixture(),g=await h.create();
 const a=await g.attach({serverReconnectContext:h.reconnectCtx});
 assert.equal((await a.privateHandle.read({serverReadContext:h.readCtx,
  frame:{...frame(1),op:'combat.attack'}})).ok,false);
 assert.equal((await a.privateHandle.read({serverReadContext:h.readCtx,
  frame:frame(1)})).ok,true);
 assert.equal((await a.privateHandle.read({serverReadContext:h.readCtx,
  frame:frame(1)})).ok,false);
 assert.equal((await a.privateHandle.read({serverReadContext:h.readCtx,
  frame:frame(3)})).ok,false);
 assert.equal((await a.privateHandle.read({serverReadContext:h.readCtx,
  frame:frame(2)})).ok,true);
 g.shutdown();
});
test('20.0 cross-user read denied and original lease revoked',async()=>{
 const h=fixture(),g=await h.create();
 const a=await g.attach({serverReconnectContext:h.reconnectCtx});
 assert.equal((await a.privateHandle.read({serverReadContext:h.wrongCtx,
  frame:frame(1)})).ok,false);
 assert.equal(a.privateHandle.active,false);
 g.shutdown();
});
test('20.0 independent PostgreSQL revocation closes private handle',async()=>{
 const h=fixture(),g=await h.create();
 const a=await g.attach({serverReconnectContext:h.reconnectCtx});
 h.revokePG();
 assert.equal((await a.privateHandle.read({serverReadContext:h.readCtx,
  frame:frame(1)})).ok,false);
 assert.equal(a.privateHandle.active,false);
 g.shutdown();
});
test('20.0 Base44 logout and world rotation reject reads',async()=>{
 for(const method of ['revokeWorld','revokeBase44','rotateNonce']){
  const h=fixture(),g=await h.create();
  const a=await g.attach({serverReconnectContext:h.reconnectCtx});
  h[method]();
  assert.equal((await a.privateHandle.read({serverReadContext:h.readCtx,
   frame:frame(1)})).ok,false);
  g.shutdown();
 }
});
test('20.0 expired attachment cannot be renewed or revived',async()=>{
 const h=fixture(),g=await h.create();
 const a=await g.attach({serverReconnectContext:h.reconnectCtx});
 h.expire();
 assert.equal((await a.privateHandle.read({serverReadContext:h.readCtx,
  frame:frame(1)})).ok,false);
 assert.equal(a.privateHandle.active,false);
 g.shutdown();
});
test('20.0 fixed one-second rate budget denies ninth read',async()=>{
 const h=fixture(),g=await h.create();
 const a=await g.attach({serverReconnectContext:h.reconnectCtx});
 for(let n=1;n<=8;n++)assert.equal((await a.privateHandle.read({
  serverReadContext:h.readCtx,frame:frame(n)})).ok,true);
 assert.equal((await a.privateHandle.read({serverReadContext:h.readCtx,
  frame:frame(9)})).ok,false);
 h.advance(1000);
 assert.equal((await a.privateHandle.read({serverReadContext:h.readCtx,
  frame:frame(10)})).ok,true);
 g.shutdown();
});
test('20.0 a second concurrent attachment is refused',async()=>{
 const h=fixture(),g=await h.create();
 const first=await g.attach({serverReconnectContext:h.reconnectCtx});
 const second=await g.attach({serverReconnectContext:h.reconnectCtx});
 assert.equal(first.ok,true);assert.equal(second.ok,false);
 assert.equal(h.reconnectCalls,1);
 g.shutdown();
});
test('20.0 malformed progress fails closed',async()=>{
 const h=fixture({invalidSnapshot:true}),g=await h.create();
 assert.equal((await g.attach({serverReconnectContext:h.reconnectCtx})).ok,false);
 g.shutdown();
});
test('20.0 audit hides identities and has only counters',async()=>{
 const h=fixture(),g=await h.create();
 const a=await g.attach({serverReconnectContext:h.reconnectCtx});
 await a.privateHandle.read({serverReadContext:h.readCtx,frame:frame(1)});
 const audit=g.audit();
 assert.equal(audit.attached,1);assert.equal(audit.read,1);
 assert.equal(JSON.stringify(audit).includes('owner200'),false);
 g.shutdown();
 assert.equal((await g.attach({serverReconnectContext:h.reconnectCtx})).ok,false);
});
test('20.0 pure helpers enforce read-only bounds',()=>{
 assert.equal(parsePrivateQuestFrame193({v:1,seq:1,op:'combat.move'}),null);
 assert.equal(parsePrivateQuestFrame193({...frame(1),ownerId:'evil'}),null);
 assert.equal(sanitizePrivateQuestSnapshot197([{questId:'q',objectiveId:'o',
  type:'kill',status:'accepted',current:4,required:3}]),null);
 const s=createPrivateTransportSequence194();
 assert.equal(s.accept(1),true);assert.equal(s.accept(1),false);
 assert.equal(s.accept(2),true);
 let time=1000;const b=createPrivateTransportBudget195({now:()=>time});
 for(let i=0;i<8;i++)assert.equal(b.allow(),true);
 assert.equal(b.allow(),false);time+=1000;assert.equal(b.allow(),true);
});

test('20.0 no unbounded concurrent private read backlog',async()=>{
 const h=fixture(),g=await h.create();
 const a=await g.attach({serverReconnectContext:h.reconnectCtx});
 const pending=Array.from({length:9},(_,i)=>a.privateHandle.read({
  serverReadContext:h.readCtx,frame:frame(i+1)}));
 const results=await Promise.all(pending);
 assert.equal(results.filter(r=>r.ok).length,8);
 assert.equal(results[8].ok,false);
 assert.equal(results[8].reason,'private_read_queue_full');
 g.shutdown();
});
