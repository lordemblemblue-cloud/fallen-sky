// Combat / Quest 86.7 — cancel publication, NOT original PG/owner actions.
// Tests use real original 84.6 host with a fake authenticated 84.5 backend.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateGameplayHost846}
 from '../privateCombatQuestHost846.mjs';

const saved=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope=Object.freeze({instanceId:'world-instance-867',
 instanceEpoch:'world-epoch-867',mapFingerprint:'a'.repeat(64)});
const connectionId='86786786-7867-4867-8867-867867867867';
const snapshot=()=>({protocol:1,version:'13.7',
 instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch,
 mapFingerprint:scope.mapFingerprint,eventSeq:1,serverTime:1000,
 rewardsIssued:false,
 player:{x:0,z:0,hp:100,maxHp:100,stamina:80,facing:0,
  lastIntentSeq:0},enemies:[]});
const goodSync=()=>({ok:true,version:'84.5',
 rewardsIssued:false,rewardAuthorized:false,questTurnInCommitted:false,
 progressSynchronized:true,confirmedEventSeq:1,worldEventSeq:1,
 objectives:[{questId:'axe_q_first_patrol',objectiveId:'patrol_kills',
  status:'accepted',current:1,required:3}]});
const waitUntil=async predicate=>{
 for(let i=0;i<200;i++){
  if(predicate())return;
  await new Promise(resolve=>setImmediate(resolve));
 }
 throw Error('fixture did not enter original 84.5 operation');
};
const latch=()=>{let release;const hold=new Promise(resolve=>{release=resolve});
 return {hold,release}};
const input={seq:1,x:0,z:1,facing:0};
const intent={action:'basic',intentId:'intent_00001',intentSeq:1,
 targetId:'wolf1',weaponPath:'damage'};

function fixture(){
 const state={calls:[],holds:{},shutdownCount:0,advanceCount:0,
  failAdvance:false,throwOn:null};
 const enter=async operation=>{
  state.calls.push(operation);
  if(state.holds[operation])await state.holds[operation];
  if(state.throwOn===operation)throw Error('original operation failed');
 };
 const admission={version:'84.5',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  credentialDeliveredToBrowser:false,hostedWorkerInstalled:false,
  async connect(){await enter('connect');
   return {ok:true,version:'84.5',rewardsIssued:false,
    connectionId,snapshot:snapshot()}},
  async setInput({input}){
   await enter('setInput');
   return {ok:true,version:'84.5',rewardsIssued:false,
    inputSeq:input.seq}},
  async submit(){await enter('submit');
   return {ok:true,version:'84.5',rewardsIssued:false,queued:true}},
  async poll(){await enter('poll');
   return {ok:true,version:'84.5',rewardsIssued:false,
    rewardAuthorized:false,reset:false,gap:false,
    snapshot:snapshot(),events:[],nextSeq:1,hasMore:false}},
  async advance(){state.advanceCount++;
   await enter('advance');
   return state.failAdvance?{ok:false,version:'84.5',
    reason:'pg_ambiguous',rewardsIssued:false}:goodSync()},
  async recover(){await enter('recover');return goodSync()},
  async disconnect(){await enter('disconnect');
   return {ok:true,version:'84.5',rewardsIssued:false}},
  async shutdown(){state.calls.push('shutdown');
   state.shutdownCount++;return true},
 };
 const host=createGame3DPrivateGameplayHost846({
  admission,scope,enabled:true,
 });
 return {state,host};
}

test('86.7 healthy world still opens, advances and closes once',async()=>{
 const {host,state}=fixture();const opened=await host.open();
 assert.equal(opened.ok,true);
 assert.equal((await host.advance()).ok,true);
 assert.equal((await host.frame({handle:opened.handle,afterSeq:0})).ok,true);
 assert.equal(await host.shutdown(),true);
 assert.equal(await host.shutdown(),false);
 assert.deepEqual(state.calls,['connect','advance','poll','shutdown']);
});
test('86.7 shutdown during original connect rejects late handle and queued opens',async()=>{
 const {host,state}=fixture(),hold=latch();
 state.holds.connect=hold.hold;
 const pending=host.open();
 await waitUntil(()=>state.calls.includes('connect'));
 const close=host.shutdown();
 assert.equal((await host.open()).reason,'private_gameplay_host_closed');
 assert.equal((await host.advance()).reason,'private_gameplay_host_closed');
 hold.release();
 assert.equal((await pending).reason,'private_gameplay_host_closed');
 assert.equal(await close,true);
 assert.equal(state.shutdownCount,1);
 assert.deepEqual(state.calls,['connect','shutdown']);
});
test('86.7 held movement and already-queued strike cannot publish post-shutdown success',async()=>{
 const {host,state}=fixture();const opened=await host.open();
 const hold=latch();state.holds.setInput=hold.hold;
 const pending=host.setInput({handle:opened.handle,input});
 await waitUntil(()=>state.calls.includes('setInput'));
 const queued=host.submit({handle:opened.handle,intent});
 const close=host.shutdown();
 assert.equal((await host.frame({handle:opened.handle,afterSeq:0})).reason,
  'private_gameplay_host_closed');
 hold.release();
 assert.equal((await pending).reason,'private_gameplay_host_closed');
 assert.equal((await queued).reason,'private_gameplay_host_closed');
 assert.equal(await close,true);
 assert.equal(state.calls.includes('submit'),false);
 assert.equal(state.shutdownCount,1);
});
test('86.7 in-flight original strike cannot publish queued action after shutdown',async()=>{
 const {host,state}=fixture();const opened=await host.open();
 const hold=latch();state.holds.submit=hold.hold;
 const pending=host.submit({handle:opened.handle,intent});
 await waitUntil(()=>state.calls.includes('submit'));
 const close=host.shutdown();
 assert.equal((await host.setInput({handle:opened.handle,input})).reason,
  'private_gameplay_host_closed');
 hold.release();
 assert.equal((await pending).reason,'private_gameplay_host_closed');
 assert.equal(await close,true);
 assert.equal(state.shutdownCount,1);
});
test('86.7 held original combat frame cannot return events after shutdown request',async()=>{
 const {host,state}=fixture();const opened=await host.open();
 const hold=latch();state.holds.poll=hold.hold;
 const pending=host.frame({handle:opened.handle,afterSeq:0});
 await waitUntil(()=>state.calls.includes('poll'));
 const queued=host.frame({handle:opened.handle,afterSeq:0});
 const close=host.shutdown();
 hold.release();
 assert.equal((await pending).reason,'private_gameplay_host_closed');
 assert.equal((await queued).reason,'private_gameplay_host_closed');
 assert.equal(await close,true);
 assert.equal(state.calls.filter(x=>x==='poll').length,1);
});
test('86.7 a committed original tick stays single-shot but cannot publish late Questbook data',async()=>{
 const {host,state}=fixture();const opened=await host.open();
 const hold=latch();state.holds.advance=hold.hold;
 const pending=host.advance();
 await waitUntil(()=>state.calls.includes('advance'));
 const queued=host.recover();
 const close=host.shutdown();
 hold.release();
 assert.equal((await pending).reason,'private_gameplay_host_closed');
 assert.equal((await queued).reason,'private_gameplay_host_closed');
 assert.equal(await close,true);
 assert.equal(state.advanceCount,1);
 assert.equal(state.calls.includes('recover'),false);
 assert.equal(state.shutdownCount,1);
 assert.equal((await host.frame({handle:opened.handle,afterSeq:0})).reason,
  'private_gameplay_host_closed');
});
test('86.7 shutdown while original recovery awaits PG replay returns closed',async()=>{
 const {host,state}=fixture();const opened=await host.open();
 state.failAdvance=true;
 assert.equal((await host.advance()).reason,'private_quest_sync_unverified');
 const hold=latch();state.holds.recover=hold.hold;
 const pending=host.recover();
 await waitUntil(()=>state.calls.includes('recover'));
 const close=host.shutdown();
 hold.release();
 assert.equal((await pending).reason,'private_gameplay_host_closed');
 assert.equal(await close,true);
 assert.equal(state.advanceCount,1);
 assert.equal(state.shutdownCount,1);
 assert.equal((await host.submit({handle:opened.handle,intent})).reason,
  'private_gameplay_host_closed');
});
test('86.7 original disconnect pending cannot return late success or reopen',async()=>{
 const {host,state}=fixture();const opened=await host.open();
 const hold=latch();state.holds.disconnect=hold.hold;
 const pending=host.disconnect({handle:opened.handle});
 await waitUntil(()=>state.calls.includes('disconnect'));
 const close=host.shutdown();
 assert.equal((await host.open()).reason,'private_gameplay_host_closed');
 hold.release();
 assert.equal((await pending).reason,'private_gameplay_host_closed');
 assert.equal(await close,true);
 assert.deepEqual(state.calls,['connect','disconnect','shutdown']);
});
test('86.7 thrown in-flight original transport remains closed without double cleanup',async()=>{
 const {host,state}=fixture();const opened=await host.open();
 const hold=latch();state.holds.poll=hold.hold;
 state.throwOn='poll';
 const pending=host.frame({handle:opened.handle,afterSeq:0});
 await waitUntil(()=>state.calls.includes('poll'));
 const close=host.shutdown();
 hold.release();
 assert.equal((await pending).reason,'private_gameplay_host_closed');
 assert.equal(await close,true);
 assert.equal(await host.shutdown(),false);
 assert.equal(state.shutdownCount,1);
});
process.on('exit',()=>{
 if(saved===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=saved;
});
