// Original 84.5 admission shutdown races; no real world, DB or live route.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateCombatQuestAdmission845}
 from '../privateCombatQuestAdmission845.mjs';

const previous=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope={ownerId:'owner868',characterId:'hero868',
 instanceId:'world-instance-868',instanceEpoch:'world-epoch-868'};
const context={private:true};
const connectionId='86886886-8868-4868-8868-868868868868';
const actionId='qb174-'+'a'.repeat(64);
const lease=()=>({ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 serverSessionId:'world-session-868',actionSessionId:actionId,
 leaseNonce:connectionId,expiresAtMs:1010000});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});
 return {promise,resolve}};
async function waitFor(predicate){
 for(let i=0;i<100;i++){
  if(predicate())return;
  await new Promise(resolve=>setImmediate(resolve));
 }
 throw Error('fixture did not reach expected original operation');
}
function make(){
 const state={calls:[],holds:{},shutdowns:0};
 const enter=async op=>{
  state.calls.push(op);
  if(state.holds[op])await state.holds[op];
 };
 const pump={version:'84.4',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  independentKillWriterCreated:false,
  async connect(){await enter('connect');
   return {ok:true,rewardsIssued:false,connectionId}},
  async setInput(){await enter('setInput');
   return {ok:true,rewardsIssued:false}},
  async submit(){await enter('submit');
   return {ok:true,rewardsIssued:false}},
  async poll(){await enter('poll');
   return {ok:true,rewardsIssued:false}},
  async disconnect(){await enter('disconnect');
   return {ok:true,rewardsIssued:false}},
  async advance(){await enter('advance');
   return {ok:true,version:'84.4',rewardsIssued:false,
    progressSynchronized:true}},
  async recover(){await enter('recover');
   return {ok:true,version:'84.4',rewardsIssued:false,
    progressSynchronized:true}},
  async shutdown(){state.calls.push('shutdown');state.shutdowns++;return true},
 };
 const worldStage180={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183(){await enter('lease');return lease()}};
 const adapter=createGame3DPrivateCombatQuestAdmission845({
  pump,worldStage180,serverRequestContext:context,scope,enabled:true,
  now:()=>1000000,
  resolveTrustedWorldPrincipal:async()=>{
   await enter('world-auth');
   return {authenticated:true,identitySource:'trusted-server-session',
    accountId:scope.ownerId,characterId:scope.characterId,
    serverSessionId:'world-session-868',expiresAtMs:1015000}},
  resolveVerifiedBase44ActionSession:async()=>{
   await enter('base44-auth');
   return {authenticated:true,
    identitySource:'base44-verified-action-session-179',
    accountId:scope.ownerId,characterId:scope.characterId,
    worldSessionId:'world-session-868',actionSessionId:actionId,
    expiresAtMs:1011000}},
  verifySessionActive:async()=>{await enter('verify');return true},
 });
 return {state,adapter};
}
test('86.8 healthy original authenticated admission and cleanup',async()=>{
 const {adapter,state}=make();
 assert.equal((await adapter.connect()).ok,true);
 assert.equal((await adapter.advance()).ok,true);
 assert.equal((await adapter.disconnect({connectionId})).ok,true);
 assert.equal(await adapter.shutdown(),true);
 assert.equal(await adapter.shutdown(),false);
 assert.equal(state.shutdowns,1);
});
test('86.8 shutdown during original independent Base44 auth never invokes world pump',async()=>{
 const {adapter,state}=make(),hold=deferred();
 state.holds['base44-auth']=hold.promise;
 const opening=adapter.connect();
 await waitFor(()=>state.calls.includes('base44-auth'));
 const closing=adapter.shutdown();
 assert.equal((await adapter.connect()).reason,'private_session_admission_stopped');
 assert.equal((await adapter.advance()).reason,'private_session_admission_stopped');
 hold.resolve();
 assert.equal((await opening).reason,'private_session_admission_stopped');
 assert.equal(await closing,true);
 assert.equal(state.calls.includes('connect'),false);
 assert.equal(state.shutdowns,1);
});
test('86.8 shutdown during original world lease check never invokes pump',async()=>{
 const {adapter,state}=make(),hold=deferred();
 state.holds.lease=hold.promise;
 const opening=adapter.connect();
 await waitFor(()=>state.calls.includes('lease'));
 const closing=adapter.shutdown();
 hold.resolve();
 assert.equal((await opening).reason,'private_session_admission_stopped');
 assert.equal(await closing,true);
 assert.equal(state.calls.includes('connect'),false);
});
test('86.8 shutdown during original world connect suppresses late connection token',async()=>{
 const {adapter,state}=make(),hold=deferred();
 state.holds.connect=hold.promise;
 const opening=adapter.connect();
 await waitFor(()=>state.calls.includes('connect'));
 const queued=adapter.advance();
 const closing=adapter.shutdown();
 hold.resolve();
 assert.equal((await opening).reason,'private_session_admission_stopped');
 assert.equal((await queued).reason,'private_session_admission_stopped');
 assert.equal(await closing,true);
 assert.equal(state.calls.includes('advance'),false);
 assert.equal(state.shutdowns,1);
});
test('86.8 shutdown during original strike blocks queued commands and late success',async()=>{
 const {adapter,state}=make();await adapter.connect();
 const hold=deferred();state.holds.submit=hold.promise;
 const strike=adapter.submit({connectionId,intent:{skill:'single'}});
 await waitFor(()=>state.calls.includes('submit'));
 const queued=adapter.poll({connectionId,afterSeq:0});
 const closing=adapter.shutdown();
 assert.equal((await adapter.disconnect({connectionId})).reason,
  'private_session_admission_stopped');
 hold.resolve();
 assert.equal((await strike).reason,'private_session_admission_stopped');
 assert.equal((await queued).reason,'private_session_admission_stopped');
 assert.equal(await closing,true);
 assert.equal(state.calls.includes('poll'),false);
 assert.equal(state.shutdowns,1);
});
test('86.8 original completed tick cannot publish after shutdown while reattesting',async()=>{
 const {adapter,state}=make();const hold=deferred();
 state.holds.verify=hold.promise;
 const tick=adapter.advance();
 await waitFor(()=>state.calls.includes('verify'));
 const closing=adapter.shutdown();
 hold.resolve();
 assert.equal((await tick).reason,'private_session_admission_stopped');
 assert.equal(await closing,true);
 assert.equal(state.calls.includes('advance'),false);
 assert.equal(state.shutdowns,1);
});
test('86.8 in-flight original authoritative tick completes once but response is fenced',async()=>{
 const {adapter,state}=make();const hold=deferred();
 state.holds.advance=hold.promise;
 const tick=adapter.advance();
 await waitFor(()=>state.calls.includes('advance'));
 const queued=adapter.recover();
 const closing=adapter.shutdown();
 hold.resolve();
 assert.equal((await tick).reason,'private_session_admission_stopped');
 assert.equal((await queued).reason,'private_session_admission_stopped');
 assert.equal(await closing,true);
 assert.equal(state.calls.filter(x=>x==='advance').length,1);
 assert.equal(state.calls.includes('recover'),false);
 assert.equal(state.shutdowns,1);
});
test('86.8 original disconnect cannot publish success after shutdown',async()=>{
 const {adapter,state}=make();await adapter.connect();
 const hold=deferred();state.holds.disconnect=hold.promise;
 const disconnect=adapter.disconnect({connectionId});
 await waitFor(()=>state.calls.includes('disconnect'));
 const closing=adapter.shutdown();
 hold.resolve();
 assert.equal((await disconnect).reason,'private_session_admission_stopped');
 assert.equal(await closing,true);
 assert.equal(state.shutdowns,1);
});
process.on('exit',()=>{
 if(previous===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=previous;
});
