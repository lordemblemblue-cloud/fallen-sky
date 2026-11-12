// Combat / Quest 87.2 — original lease proof snapshots must be strict
// immutable own data fields, never invoke accessors or trust inherited fields.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateCombatQuestPump844}
 from '../privateCombatQuestScheduler844.mjs';

const original=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope=Object.freeze({
 ownerId:'owner871',characterId:'hero871',holderId:'holder-871',
 instanceId:'world-instance-871',instanceEpoch:'world-epoch-871',
 mapFingerprint:'e'.repeat(64),
});
const context=Object.freeze({server:'original-871'});
const lease=expiry=>({
 ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 serverSessionId:'world-session-871',
 actionSessionId:'qb174-'+'a'.repeat(64),
 leaseNonce:'87187187-1871-4871-8871-871871871871',
 expiresAtMs:expiry,
});
function make({now=()=>1000000,expiry=2000000,leaseSource=null}={}){
 const state={ticks:0,commits:0,replays:0,releases:0,inputs:0,
  samples:0,progressionShutdowns:0,leaseResolutions:0};
 const owner={
  version:'13.8',privateServerOnly:true,publicTransportInstalled:false,
  instanceId:scope.instanceId,fencingToken:7,
  async advance(){state.ticks++;
   return {ok:true,eventSeq:state.ticks,
    checkpointDigestRecorded:true,rewardsIssued:false}},
  async connect(){state.inputs++;return {ok:true,rewardsIssued:false}},
  async setInput(){state.inputs++;return {ok:true,rewardsIssued:false}},
  async submit(){state.inputs++;return {ok:true,rewardsIssued:false}},
  async poll(){state.inputs++;return {ok:true,rewardsIssued:false}},
  async disconnect(){state.inputs++;return {ok:true,rewardsIssued:false}},
  async release(){state.releases++;return true},
 };
 const progression={
  version:'18.5',privateServerOnly:true,publicPlayerRouteInstalled:false,
  independentCombatWriterCreated:false,rewardWriterInstalled:false,
  async commitWorldKills(){state.commits++;
   return {ok:true,lastSeq:state.ticks,receipts:[],
    rewardsIssued:false,rewardAuthorized:false}},
  async reconcileCommittedKills({afterEventSeq}){state.replays++;
   return {ok:true,version:'84.3',processedReceipts:1,
    nextEventSeq:afterEventSeq+1,hasMore:false,
    newCredits:[],objectives:[{
     questId:'axe_q_first_patrol',objectiveId:'patrol_kills',
     status:'accepted',current:1,required:3,
    }],rewardAuthorized:false,rewardsIssued:false,
    questTurnInCommitted:false}},
  async shutdown(){state.progressionShutdowns++},
 };
 const encounter={version:'13.6',privateServerOnly:true,
  instanceId:scope.instanceId,mapFingerprint:scope.mapFingerprint};
 const worldStage180={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   assert.equal(serverRequestContext,context);
   state.leaseResolutions++;return leaseSource?leaseSource():lease(expiry);
  },
 };
 const pump=createGame3DPrivateCombatQuestPump844({
  owner,encounter,scope,progression,worldStage180,
  serverRequestContext:context,enabled:true,
  now:()=>{state.samples++;return now()},
 });
 return {pump,state};
}


test('87.2 normal plain lease advances only original tick, commit and objective replay',async()=>{
 const {pump,state}=make();
 const result=await pump.advance();
 assert.equal(result.ok,true);
 assert.equal(result.worldEventSeq,1);
 assert.equal(result.confirmedEventSeq,1);
 assert.equal(state.ticks,1);
 assert.equal(state.commits,1);
 assert.equal(state.replays,1);
 assert.equal(result.rewardsIssued,false);
 assert.equal(result.rewardAuthorized,false);
 assert.equal(await pump.shutdown(),true);
 assert.equal(state.releases,1);
});
test('87.2 throwing expiry getter is not executed or permitted to start a world tick',async()=>{
 let getterCalls=0;
 const broken=lease(2000000);
 Object.defineProperty(broken,'expiresAtMs',{enumerable:true,
  get(){getterCalls++;throw Error('unsafe expiry accessor')}});
 const {pump,state}=make({leaseSource:()=>broken});
 const result=await pump.advance();
 assert.equal(result.reason,'world_session_unverified');
 assert.equal(getterCalls,0);
 assert.equal(state.ticks,0);
 assert.equal(state.commits,0);
 assert.equal(await pump.shutdown(),true);
});
test('87.2 alternating identity accessor is never executed',async()=>{
 let getterCalls=0;
 const broken=lease(2000000);
 Object.defineProperty(broken,'actionSessionId',{enumerable:true,
  get(){getterCalls++;return getterCalls===1?'qb174-'+'a'.repeat(64):'qb174-'+'b'.repeat(64)}});
 const {pump,state}=make({leaseSource:()=>broken});
 assert.equal((await pump.connect({})).reason,'world_session_unverified');
 assert.equal(getterCalls,0);
 assert.equal(state.inputs,0);
 assert.equal(await pump.shutdown(),true);
});
test('87.2 inherited identity does not qualify as a trusted own lease field',async()=>{
 const inherited=Object.assign(Object.create({ownerId:scope.ownerId}),lease(2000000));
 delete inherited.ownerId;
 const {pump,state}=make({leaseSource:()=>inherited});
 assert.equal((await pump.advance()).reason,'world_session_unverified');
 assert.equal(state.ticks,0);
 assert.equal(await pump.shutdown(),true);
});
test('87.2 descriptor-trap failures are refused without leaking a rejected promise',async()=>{
 const unstable=new Proxy(lease(2000000),{
  ownKeys(){throw Error('invalid descriptor provider')}
 });
 const {pump,state}=make({leaseSource:()=>unstable});
 const result=await pump.advance();
 assert.equal(result.ok,false);
 assert.equal(result.reason,'world_session_unverified');
 assert.equal(state.ticks,0);
 assert.equal(await pump.shutdown(),true);
});
test('87.2 object-valued action nonce cannot invoke a hostile toString',async()=>{
 let invoked=0;
 const malformed=lease(2000000);
 malformed.leaseNonce={toString(){invoked++;throw Error('hostile coercion')}};
 const {pump,state}=make({leaseSource:()=>malformed});
 assert.equal((await pump.advance()).reason,'world_session_unverified');
 assert.equal(invoked,0);
 assert.equal(state.ticks,0);
 assert.equal(await pump.shutdown(),true);
});
test('87.2 required lease values are read from descriptors, not proxy get traps',async()=>{
 let reads=0;
 const sealed=new Proxy(lease(2000000),{
  get(target,key){if(key==='then')return undefined;
   reads++;throw Error('untrusted field read')}
 });
 const {pump,state}=make({leaseSource:()=>sealed});
 const result=await pump.advance();
 assert.equal(result.ok,true);
 assert.equal(state.ticks,1);
 assert.equal(state.commits,1);
 assert.equal(reads,0);
 assert.equal(await pump.shutdown(),true);
});
test('87.2 unrelated accessor fields cannot execute or leak into the pinned proof',async()=>{
 let extras=0;
 const richer=lease(2000000);
 Object.defineProperty(richer,'debug',{enumerable:true,
  get(){extras++;throw Error('unused extension accessor')}});
 const {pump,state}=make({leaseSource:()=>richer});
 assert.equal((await pump.connect({})).ok,true);
 assert.equal((await pump.advance()).ok,true);
 assert.equal(extras,0);
 assert.equal(state.ticks,1);
 assert.equal(await pump.shutdown(),true);
});
test('87.2 a later changed lease expiry cannot reuse the earlier pinned snapshot',async()=>{
 const mutable=lease(2000000);
 const {pump,state}=make({leaseSource:()=>mutable});
 assert.equal((await pump.connect({})).ok,true);
 mutable.expiresAtMs=2000001;
 assert.equal((await pump.advance()).reason,'world_session_unverified');
 assert.equal(state.ticks,0);
 assert.equal(state.commits,0);
 assert.equal(await pump.shutdown(),true);
});

process.on('exit',()=>{
 if(original===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=original;
});
