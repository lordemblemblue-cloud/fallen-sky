import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame3DPrivateGameplayHost846,PRIVATE_GAMEPLAY_LIMITS_846}
 from '../privateCombatQuestHost846.mjs';

const before=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope={instanceId:'world-instance-846',instanceEpoch:'world-epoch-846',
 mapFingerprint:'a'.repeat(64)};
const id='84684684-8468-4468-8468-846846846846';
const enemy=()=>({id:'wolf1',x:3,z:4,hp:20,maxHp:30,alive:true,
 pendingImpactAt:null});
const snapshot=(change={})=>({
 protocol:1,version:'13.7',instanceId:scope.instanceId,
 instanceEpoch:scope.instanceEpoch,mapFingerprint:scope.mapFingerprint,
 eventSeq:1,serverTime:1000,rewardsIssued:false,
 player:{x:0,z:1,hp:100,maxHp:100,stamina:80,facing:0,lastIntentSeq:0},
 enemies:[enemy()],...change,
});
const event=(change={})=>({seq:1,instanceId:scope.instanceId,
 kind:'player_strike',serverTime:1000,targetId:'wolf1',damage:12,
 critical:false,killed:false,xpAuthorized:false,lootAuthorized:false,
 currencyAuthorized:false,secretServerContext:'DO_NOT_EXPOSE',...change});
function make(options={}){
 const state={calls:[],connectionId:id,
  snapshot:options.snapshot??snapshot(),events:options.events??[event()],
  pollPatch:{},quest:options.quest??[{
   questId:'axe_q_first_patrol',objectiveId:'patrol_kills',
   status:'accepted',current:1,required:3,privateProof:'DO_NOT_EXPOSE',
  }],failTick:false,shutdownCount:0,releaseCount:0};
 const admission={version:'84.5',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  credentialDeliveredToBrowser:false,hostedWorkerInstalled:false,
  async connect(){state.calls.push('connect');
   return {ok:true,version:'84.5',connectionId:state.connectionId,
    snapshot:state.snapshot,rewardsIssued:false,ownerId:'SECRET'};},
  async setInput({connectionId,input}){state.calls.push({op:'setInput',connectionId,input});
   return {ok:true,version:'84.5',inputSeq:input.seq,rewardsIssued:false};},
  async submit({connectionId,intent}){state.calls.push({op:'submit',connectionId,intent});
   return {ok:true,version:'84.5',queued:true,rewardsIssued:false};},
  async poll({connectionId,afterSeq}){state.calls.push({op:'poll',connectionId,afterSeq});
   return {ok:true,version:'84.5',reset:false,gap:false,
    snapshot:state.snapshot,events:state.events,
    nextSeq:state.events.at(-1)?.seq??afterSeq,
    hasMore:false,rewardsIssued:false,secretWorldKey:'HIDDEN',
    ...state.pollPatch};},
  async advance(){state.calls.push('advance');return state.failTick?
   {ok:false,rewardsIssued:false}:
   {ok:true,version:'84.5',confirmedEventSeq:1,
    worldEventSeq:1,progressSynchronized:true,questTurnInCommitted:false,
    objectives:state.quest,newCredits:[{receiptId:'PRIVATE'}],
    rewardsIssued:false,rewardAuthorized:false};},
  async recover(){state.calls.push('recover');
   return {ok:true,version:'84.5',confirmedEventSeq:1,
    progressSynchronized:true,questTurnInCommitted:false,
    objectives:state.quest,rewardsIssued:false,rewardAuthorized:false};},
  async disconnect({connectionId}){state.calls.push({op:'disconnect',connectionId});
   return {ok:true,version:'84.5',rewardsIssued:false};},
  async shutdown(){state.calls.push('shutdown');state.shutdownCount++;return true;},
 };
 const host=createGame3DPrivateGameplayHost846({enabled:true,admission,scope});
 return {state,host,admission};
}

test('84.6 opens the original authenticated world with an opaque private handle',async()=>{
 const {host,state}=make();const r=await host.open();
 assert.equal(r.ok,true);assert.equal(typeof r.handle,'object');
 assert.equal(Object.isFrozen(r.handle),true);
 assert.equal(r.snapshot.player.hp,100);
 assert.equal(r.snapshot.enemies.length,1);
 assert.equal(r.snapshot.instanceId,undefined);
 assert.equal(r.connectionId,undefined);
 assert.equal(r.ownerId,undefined);
 assert.equal(host.publicTransportInstalled,false);
 assert.deepEqual(state.calls,['connect']);
});

test('84.6 forwards only strictly bounded 13.6 movement and basic strikes',async()=>{
 const {host,state}=make();const {handle}=await host.open();
 assert.equal((await host.setInput({handle,
  input:{seq:1,x:0.5,z:-0.5,facing:1}})).ok,true);
 assert.equal((await host.submit({handle,
  intent:{action:'basic',intentId:'intent_000001',intentSeq:1,
   targetId:'wolf1',weaponPath:'damage'}})).queued,true);
 assert.equal(state.calls[1].op,'setInput');
 assert.deepEqual(state.calls[1].input,{seq:1,x:0.5,z:-0.5,facing:1});
 assert.equal(state.calls[2].op,'submit');
 assert.deepEqual(state.calls[2].intent,{action:'basic',
  intentId:'intent_000001',intentSeq:1,
  targetId:'wolf1',weaponPath:'damage'});
});

test('84.6 rejects injected HP, damage, loot, identity and malformed IDs',async()=>{
 const {host,state}=make();const {handle}=await host.open();
 const bad=[
  host.setInput({handle,input:{seq:1,x:0,z:1,facing:0,hp:999}}),
  host.setInput({handle,input:{seq:1,x:2,z:0,facing:0}}),
  host.submit({handle,intent:{action:'basic',intentId:'intent_000001',
   intentSeq:1,targetId:'wolf1',weaponPath:'damage',damage:10000}}),
  host.submit({handle,intent:{action:'basic',intentId:'intent_000001',
   intentSeq:1,targetId:'wolf1',weaponPath:'damage'},ownerId:'other'}),
  host.submit({handle,intent:{action:'basic',intentId:'intent_000001',
   intentSeq:1,targetId:undefined,weaponPath:'damage'}}),
  host.submit({handle,intent:{action:'basic',intentId:undefined,
   intentSeq:1,targetId:'wolf1',weaponPath:'damage'}}),
 ];
 assert.ok((await Promise.all(bad)).every(r=>r.ok===false));
 assert.deepEqual(state.calls,['connect']);
});

test('84.6 sends a bounded, safe world event frame without server secrets',async()=>{
 const {host,state}=make();const {handle}=await host.open();
 const synced=await host.advance();assert.equal(synced.ok,true);
 assert.equal(synced.objectives[0].current,1);
 assert.equal(synced.objectives[0].privateProof,undefined);
 assert.equal(synced.newCredits,undefined);
 const r=await host.frame({handle,afterSeq:0});
 assert.equal(r.ok,true);assert.equal(r.events.length,1);
 assert.equal(r.events[0].kind,'player_strike');
 assert.equal(r.events[0].secretServerContext,undefined);
 assert.equal(r.events[0].xpAuthorized,undefined);
 assert.equal(r.secretWorldKey,undefined);
 assert.equal(r.objectives[0].current,1);
 assert.equal(r.snapshot.eventSeq,1);
 assert.equal(state.calls[2].op,'poll');
});

test('84.6 reset/gap frames discard old cosmetic events',async()=>{
 const {host,state}=make({events:[]});const {handle}=await host.open();
 state.pollPatch={reset:true,gap:true,nextSeq:1,hasMore:false};
 const r=await host.frame({handle,afterSeq:0});
 assert.equal(r.ok,true);assert.equal(r.events.length,0);
 assert.equal(r.reset,true);assert.equal(r.nextSeq,1);
});

test('84.6 rejects forged event payouts and permanently fences invalid streams',async()=>{
 const {host,state}=make({events:[event({xpAuthorized:true})]});
 const {handle}=await host.open();
 const r=await host.frame({handle,afterSeq:0});
 assert.equal(r.ok,false);
 assert.equal((await host.open()).ok,false);
 assert.deepEqual(state.calls,['connect',{op:'poll',connectionId:id,afterSeq:0},'shutdown']);
 assert.equal(state.shutdownCount,1);
});

test('84.6 denies receipt authority and malformed event cursor advancement',async()=>{
 const {host,state}=make();const {handle}=await host.open();
 state.pollPatch={nextSeq:500};
 assert.equal((await host.frame({handle,afterSeq:0})).ok,false);
 assert.equal((await host.submit({handle,intent:{}})).ok,false);
});

test('84.6 blocks combat and frame updates after ambiguous quest sync',async()=>{
 const {host,state}=make();const {handle}=await host.open();
 state.failTick=true;
 assert.equal((await host.advance()).ok,false);
 assert.equal((await host.setInput({handle,
  input:{seq:1,x:0,z:0,facing:0}})).ok,false);
 assert.equal((await host.frame({handle,afterSeq:0})).ok,false);
 assert.equal((await host.advance()).ok,false);
 const recovered=await host.recover();assert.equal(recovered.ok,true);
 assert.equal((await host.setInput({handle,
  input:{seq:1,x:0,z:0,facing:0}})).ok,true);
 assert.deepEqual(state.calls,['connect','advance','recover',
  {op:'setInput',connectionId:id,
   input:{seq:1,x:0,z:0,facing:0}}]);
});

test('84.6 reconnect rotates the private handle and rejects queued old input',async()=>{
 const {host,state}=make();
 const first=await host.open();
 const reconnect=host.open();
 const stale=host.setInput({handle:first.handle,
  input:{seq:1,x:0,z:0,facing:0}});
 const second=await reconnect,old=await stale;
 assert.equal(second.ok,true);assert.notEqual(second.handle,first.handle);
 assert.equal(old.ok,false);
 assert.equal(state.calls.filter(x=>x==='connect').length,2);
});

test('84.6 disconnect revokes handle and host can re-open the same session',async()=>{
 const {host,state}=make();const one=await host.open();
 assert.equal((await host.disconnect({handle:one.handle})).ok,true);
 assert.equal((await host.frame({handle:one.handle,afterSeq:0})).ok,false);
 const two=await host.open();assert.equal(two.ok,true);
 assert.notEqual(one.handle,two.handle);
 assert.equal(state.calls.filter(x=>x==='connect').length,2);
});

test('84.6 serializes queued tick, input, and snapshot reads',async()=>{
 const {host,state}=make();const {handle}=await host.open();
 const [a,b,c]=await Promise.all([
  host.setInput({handle,input:{seq:1,x:0,z:0,facing:0}}),
  host.advance(),host.frame({handle,afterSeq:0}),
 ]);
 assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(c.ok,true);
 assert.deepEqual(state.calls.map(x=>typeof x==='string'?x:x.op),
  ['connect','setInput','advance','poll']);
});

test('84.6 shutdown calls original 84.5 shutdown once and rejects all work',async()=>{
 const {host,state}=make();await host.open();
 assert.equal(await host.shutdown(),true);
 assert.equal(await host.shutdown(),false);
 assert.equal(state.shutdownCount,1);
 assert.equal((await host.open()).ok,false);
 assert.equal((await host.advance()).ok,false);
});

test('84.6 factory disabled by default, private-only and without routes',()=>{
 assert.throws(()=>createGame3DPrivateGameplayHost846(),
  /private, authenticated 84.5 game world/);
 const source=readFileSync(
  new URL('../privateCombatQuestStaging846.mjs',import.meta.url),'utf8');
 assert.match(source,/createGame3DPrivateCombatQuestStaging845/);
 assert.match(source,/createGame3DPrivateGameplayHost846/);
 assert.doesNotMatch(source,/app\.post\s*\(/);
 assert.equal(PRIVATE_GAMEPLAY_LIMITS_846.maxEvents,40);
 assert.equal(PRIVATE_GAMEPLAY_LIMITS_846.maxEnemies,16);
});

process.on('exit',()=>{
 if(before===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=before;
});
