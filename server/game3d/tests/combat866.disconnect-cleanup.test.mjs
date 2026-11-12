// Game 3D Combat / Quest 86.6 — a final original 84.8 viewer disconnect
// must release its ORIGINAL 84.6 world owner, even on transport failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestbookPresentation848}
 from '../privateQuestbookPresentation848.mjs';

const old=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope=Object.freeze({ownerId:'owner866',characterId:'hero866',
 instanceId:'world-instance-866',instanceEpoch:'world-epoch-866',
 mapFingerprint:'b'.repeat(64)});
const context=Object.freeze({serverOwned:'world-866'});
const reader=()=>({
 authenticated:true,identitySource:'base44-verified-action-session-179',
 accountId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 worldSessionId:'world-session-866',
 actionSessionId:'qb174-'+'a'.repeat(64),
 leaseNonce:'86686686-6866-4866-8866-866866866866',
 expiresAtMs:1050000,
});
const snapshot=()=>({eventSeq:0,serverTime:1000,
 player:{x:0,z:0,hp:90,maxHp:100,stamina:70,
  facing:0,lastIntentSeq:0},enemies:[]});
const latch=()=>{let release;const hold=new Promise(resolve=>{release=resolve});
 return {hold,release}};
const until=async fn=>{
 for(let i=0;i<200;i++){
  if(fn())return;
  await new Promise(resolve=>setImmediate(resolve));
 }
 throw Error('world disconnect did not enter original host');
};
function setup(){
 const state={calls:[],disconnectReply:null,shutdownResult:true,
  disconnectThrow:false,shutdownThrow:false,disconnectGate:null};
 const handle=Object.freeze({originalOwner:'private-866'});
 const host={version:'84.6',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  credentialDeliveredToBrowser:false,hostedWorkerInstalled:false,
  async open(){state.calls.push('open');
   return {ok:true,version:'84.6',privateServerOnly:true,
    rewardsIssued:false,handle,snapshot:snapshot()}},
  async frame(){throw Error('not needed')},
  async disconnect({handle:incoming}){
   assert.equal(incoming,handle);
   state.calls.push('disconnect');
   if(state.disconnectGate)await state.disconnectGate;
   if(state.disconnectThrow)throw Error('broken world transport');
   return state.disconnectReply??{ok:true,version:'84.6',
    rewardsIssued:false}},
  async shutdown(){state.calls.push('shutdown');
   if(state.shutdownThrow)throw Error('cleanup unavailable');
   return state.shutdownResult},
 };
 const view=createGame3DPrivateQuestbookPresentation848({
  enabled:true,host,scope,serverRequestContext:context,
  verifyAuthorizedReader:async ctx=>{
   assert.equal(ctx,context);return reader();
  },now:()=>1000000,
 });
 return {state,view};
}

test('86.6 normal disconnect releases original world owner before reporting success',async()=>{
 const {state,view}=setup();await view.open();
 const result=await view.disconnect();
 assert.equal(result.ok,true);
 assert.equal(result.privateServerOnly,true);
 assert.equal(result.rewardsIssued,false);
 assert.deepEqual(state.calls,['open','disconnect','shutdown']);
 assert.equal((await view.open()).reason,'private_view_closed');
 assert.equal((await view.read()).reason,'private_view_closed');
 assert.equal(await view.shutdown(),false);
 assert.deepEqual(state.calls,['open','disconnect','shutdown']);
});
test('86.6 original disconnect throw still shuts down original world exactly once',async()=>{
 const {state,view}=setup();await view.open();
 state.disconnectThrow=true;
 assert.equal((await view.disconnect()).reason,'private_world_disconnect_unavailable');
 assert.deepEqual(state.calls,['open','disconnect','shutdown']);
 assert.equal(await view.shutdown(),false);
 assert.equal(state.calls.filter(x=>x==='shutdown').length,1);
});
test('86.6 unverified disconnect result cannot bypass original shutdown',async()=>{
 const {state,view}=setup();await view.open();
 state.disconnectReply={ok:true,rewardsIssued:true};
 assert.equal((await view.disconnect()).reason,'private_world_disconnect_unverified');
 assert.deepEqual(state.calls,['open','disconnect','shutdown']);
 assert.equal((await view.disconnect()).reason,'private_view_closed');
});
test('86.6 failed original shutdown cannot produce a successful disconnect result',async()=>{
 const {state,view}=setup();await view.open();
 state.shutdownResult=false;
 assert.equal((await view.disconnect()).reason,'private_world_disconnect_cleanup_unverified');
 assert.deepEqual(state.calls,['open','disconnect','shutdown']);
 assert.equal(await view.shutdown(),false);
 assert.equal(state.calls.filter(x=>x==='shutdown').length,1);
});
test('86.6 thrown original world cleanup is denied without a second release attempt',async()=>{
 const {state,view}=setup();await view.open();
 state.shutdownThrow=true;
 assert.equal((await view.disconnect()).reason,'private_world_disconnect_cleanup_unverified');
 assert.deepEqual(state.calls,['open','disconnect','shutdown']);
 assert.equal(await view.shutdown(),false);
 assert.equal(state.calls.filter(x=>x==='shutdown').length,1);
});
test('86.6 explicit shutdown racing pending disconnect takes cleanup ownership',async()=>{
 const {state,view}=setup();await view.open();
 const gate=latch();state.disconnectGate=gate.hold;
 const disconnect=view.disconnect();
 await until(()=>state.calls.includes('disconnect'));
 const shutdown=view.shutdown();
 assert.equal((await view.disconnect()).reason,'private_view_closed');
 gate.release();
 assert.equal((await disconnect).reason,'private_view_closed');
 assert.equal(await shutdown,true);
 assert.deepEqual(state.calls,['open','disconnect','shutdown']);
});
test('86.6 caller cannot disconnect unopened original world or release unowned host',async()=>{
 const {state,view}=setup();
 assert.equal((await view.disconnect()).reason,'private_view_not_open');
 assert.deepEqual(state.calls,[]);
 assert.equal((await view.open()).ok,true);
 assert.equal((await view.disconnect()).ok,true);
 assert.equal(state.calls.filter(x=>x==='shutdown').length,1);
});
test('86.6 concurrently queued disconnect calls release exactly one owner',async()=>{
 const {state,view}=setup();await view.open();
 const a=view.disconnect(),b=view.disconnect();
 const both=await Promise.all([a,b]);
 assert.equal(both.filter(x=>x.ok===true).length,1);
 assert.equal(both.filter(x=>x.reason==='private_view_closed').length,1);
 assert.deepEqual(state.calls,['open','disconnect','shutdown']);
});
process.on('exit',()=>{
 if(old===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=old;
});
