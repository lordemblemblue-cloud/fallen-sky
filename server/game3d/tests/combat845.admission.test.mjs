import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateCombatQuestAdmission845,
 createGame3DPrivateCombatQuestStaging845}
 from '../privateCombatQuestAdmission845.mjs';

const previous=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const context=Object.freeze({opaquePrivateContext:'845'});
const scope=Object.freeze({ownerId:'owner845',characterId:'hero845',
 instanceId:'world-instance-845',instanceEpoch:'world-epoch-845'});
const conn='84584584-8458-4458-8458-845845845845';
const actionId='qb174-'+'a'.repeat(64);
const nonce='84584584-8458-4458-8458-845845845845';
const baseLease=()=>({ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 serverSessionId:'world-session-845',actionSessionId:actionId,
 leaseNonce:nonce,expiresAtMs:1010000});
const pumpOK=()=>({ok:true,version:'84.4',progressSynchronized:true,
 rewardsIssued:false,rewardAuthorized:false,
 newCredits:[],objectives:[],confirmedEventSeq:0});
function make({replyOverride=null}={}){
 const state={calls:[],verified:[],lease:baseLease(),active:true,
  identity:scope.ownerId,action:actionId,
  connectionId:conn,hold:null,shutdown:0};
 const pump={version:'84.4',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  independentKillWriterCreated:false,
  async connect(args){state.calls.push(['connect',args]);
   return {ok:true,version:'13.7',rewardsIssued:false,
    connectionId:state.connectionId,snapshot:{player:{hp:100}}};},
  async setInput(args){state.calls.push(['setInput',args]);
   return {ok:true,rewardsIssued:false};},
  async submit(args){state.calls.push(['submit',args]);
   if(state.hold)await state.hold;
   return {ok:true,rewardsIssued:false};},
  async poll(args){state.calls.push(['poll',args]);
   return {ok:true,rewardsIssued:false,events:[]};},
  async disconnect(args){state.calls.push(['disconnect',args]);
   return {ok:true,rewardsIssued:false};},
  async advance(){state.calls.push(['advance']);
   return replyOverride?.advance??pumpOK();},
  async recover(){state.calls.push(['recover']);return pumpOK()},
  async shutdown(){state.calls.push(['shutdown']);state.shutdown++;return true},
 };
 const stage={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   assert.equal(serverRequestContext,context);
   return state.active?{...state.lease}:null;
  }};
 const resolveTrustedWorldPrincipal=async received=>{
  assert.equal(received,context);
  return {authenticated:state.active,identitySource:'trusted-server-session',
   accountId:state.identity,characterId:scope.characterId,
   serverSessionId:'world-session-845',expiresAtMs:1015000};
 };
 const resolveVerifiedBase44ActionSession=async received=>{
  assert.equal(received,context);
  return {authenticated:state.active,
   identitySource:'base44-verified-action-session-179',
   accountId:state.identity,characterId:scope.characterId,
   worldSessionId:'world-session-845',actionSessionId:state.action,
   expiresAtMs:1011000};
 };
 const verifySessionActive=async claim=>{
  state.verified.push(claim);
  return state.active&&claim.ownerId===scope.ownerId&&
   claim.characterId===scope.characterId&&
   claim.instanceId===scope.instanceId&&
   claim.serverSessionId==='world-session-845'&&
   claim.actionSessionId===state.action;
 };
 const adapter=createGame3DPrivateCombatQuestAdmission845({
  enabled:true,pump,worldStage180:stage,serverRequestContext:context,scope,
  resolveTrustedWorldPrincipal,resolveVerifiedBase44ActionSession,
  verifySessionActive,now:()=>1000000,
 });
 return {state,pump,stage,adapter};
}

test('84.5 connects with a fixed private context and independently checked world/Base44 identities',async()=>{
 const {adapter,state}=make();const connected=await adapter.connect();
 assert.equal(connected.ok,true);assert.equal(connected.connectionId,conn);
 assert.equal(connected.version,'84.5');assert.equal(connected.privateServerOnly,true);
 assert.equal(adapter.credentialDeliveredToBrowser,false);
 assert.deepEqual(state.calls.map(c=>c[0]),['connect']);
 assert.equal(state.calls[0][1].serverRequestContext,context);
 assert.ok(state.verified.length>=2);
});

test('84.5 routes private input and events through existing 84.4 owner only',async()=>{
 const {adapter,state}=make();await adapter.connect();
 const results=await Promise.all([
  adapter.setInput({connectionId:conn,input:{move:'north'}}),
  adapter.submit({connectionId:conn,intent:{skill:'single'}}),
  adapter.poll({connectionId:conn,afterSeq:0}),
 ]);
 assert.ok(results.every(x=>x.ok===true));
 assert.deepEqual(state.calls.map(c=>c[0]),['connect','setInput','submit','poll']);
 assert.ok(state.calls.slice(1).every(c=>c[1].serverRequestContext===context));
 assert.equal((await adapter.disconnect({connectionId:conn})).ok,true);
 assert.equal((await adapter.poll({connectionId:conn,afterSeq:0})).ok,false);
});

test('84.5 forbids player-provided owner, token, quest or receipt arguments',async()=>{
 const {adapter,state}=make();await adapter.connect();
 const cases=[
  adapter.submit({connectionId:conn,intent:{},ownerId:scope.ownerId}),
  adapter.poll({connectionId:conn,afterSeq:0,receiptId:'fake'}),
  adapter.setInput({connectionId:'stale',input:{}}),
  adapter.setInput({connectionId:conn,input:null}),
  adapter.poll({connectionId:conn,afterSeq:-1}),
 ];
 const replies=await Promise.all(cases);
 assert.ok(replies.every(r=>r.ok===false));
 assert.deepEqual(state.calls.map(c=>c[0]),['connect']);
});

test('84.5 tick and recovery stay on the trusted private scheduler',async()=>{
 const {adapter,state}=make();
 const advance=await adapter.advance();const recover=await adapter.recover();
 assert.equal(advance.ok,true);assert.equal(recover.ok,true);
 assert.equal(advance.progressSynchronized,true);
 assert.deepEqual(state.calls.map(c=>c[0]),['advance','recover']);
});

test('84.5 rejects reward-bearing and unverified combat tick replies',async()=>{
 const {adapter}=make({replyOverride:{advance:{...pumpOK(),rewardsIssued:true}}});
 const r=await adapter.advance();assert.equal(r.ok,false);
 assert.equal(r.reason,'private_world_operation_refused');
});

test('84.5 rejects wrong-account session and permanently fences the old admission',async()=>{
 const {adapter,state}=make();
 state.identity='other-account';
 assert.equal((await adapter.connect()).ok,false);
 state.identity=scope.ownerId;
 assert.equal((await adapter.connect()).reason,'private_session_admission_halted');
 assert.equal(state.calls.length,0);
});

test('84.5 rejects a same-action-ID new lease nonce after pairing rotation',async()=>{
 const {adapter,state}=make();
 assert.equal((await adapter.connect()).ok,true);
 state.lease={...baseLease(),leaseNonce:'74584584-8458-4458-8458-845845845845'};
 const r=await adapter.advance();assert.equal(r.ok,false);
 assert.equal(r.reason,'private_world_or_base44_session_unverified');
 assert.equal(state.calls.filter(x=>x[0]==='advance').length,0);
});

test('84.5 denies access when independent Base44 session revokes',async()=>{
 const {adapter,state}=make();await adapter.connect();
 state.active=false;
 assert.equal((await adapter.submit({connectionId:conn,intent:{}})).ok,false);
 assert.equal(state.calls.filter(x=>x[0]==='submit').length,0);
});

test('84.5 re-checks session after an awaited combat action',async()=>{
 const {adapter,state}=make();await adapter.connect();
 let finish;state.hold=new Promise(resolve=>{finish=resolve});
 const inFlight=adapter.submit({connectionId:conn,intent:{skill:'single'}});
 await new Promise(resolve=>setImmediate(resolve));
 state.active=false;finish();
 const result=await inFlight;
 assert.equal(result.ok,false);
 assert.equal(result.reason,'private_session_changed_during_operation');
 assert.equal((await adapter.advance()).ok,false);
});

test('84.5 serializes input with combat ticks and supports same-session reconnect',async()=>{
 const {adapter,state}=make();await adapter.connect();
 const oldId=conn,newId='94584584-8458-4458-8458-845845845845';
 const before=adapter.advance();const reconnect=adapter.connect();
 state.connectionId=newId;
 const [t,c]=await Promise.all([before,reconnect]);
 assert.equal(t.ok,true);assert.equal(c.ok,true);
 assert.equal(c.connectionId,newId);
 assert.equal((await adapter.submit({connectionId:oldId,intent:{}})).ok,false);
 assert.equal((await adapter.submit({connectionId:newId,intent:{}})).ok,true);
 assert.deepEqual(state.calls.map(x=>x[0]),['connect','advance','connect','submit']);
});

test('84.5 rejects queued old-connection input after reconnect rotation',async()=>{
 const {adapter,state}=make();await adapter.connect();
 const newId='74584584-8458-4458-8458-845845845845';
 state.connectionId=newId;
 const reconnect=adapter.connect();
 const outdated=adapter.submit({connectionId:conn,intent:{skill:'single'}});
 assert.equal((await reconnect).ok,true);
 assert.equal((await outdated).reason,'stale_private_world_connection');
 assert.deepEqual(state.calls.map(x=>x[0]),['connect','connect']);
});

test('84.5 shutdown releases original pump once and rejects further work',async()=>{
 const {adapter,state}=make();await adapter.connect();
 assert.equal(await adapter.shutdown(),true);
 assert.equal(await adapter.shutdown(),false);
 assert.equal(state.shutdown,1);
 assert.equal((await adapter.advance()).ok,false);
});

test('84.5 requires explicit staging and does not create another combat writer',async()=>{
 assert.throws(()=>createGame3DPrivateCombatQuestAdmission845(),
  /independent world\/Base44 admission/);
 await assert.rejects(createGame3DPrivateCombatQuestStaging845(),
  /two independent session authorities/);
});

process.on('exit',()=>{
 if(previous===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=previous;
});
