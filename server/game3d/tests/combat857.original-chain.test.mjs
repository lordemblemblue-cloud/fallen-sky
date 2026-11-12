// Combat/Quest 85.7: authentic 84.4 -> 84.5 -> 84.6 in-process chain.
// Stub ONLY original 13.8 world, 18.5 DB progression, 18.0 server lease and
// the independently authenticated world/Base44 sources. Not real PG/live.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateCombatQuestPump844}
 from '../privateCombatQuestScheduler844.mjs';
import {createGame3DPrivateCombatQuestAdmission845}
 from '../privateCombatQuestAdmission845.mjs';
import {createGame3DPrivateGameplayHost846}
 from '../privateCombatQuestHost846.mjs';

const original=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope=Object.freeze({ownerId:'owner857',characterId:'hero857',
 holderId:'holder-857',instanceId:'world-instance-857',
 instanceEpoch:'world-epoch-857',mapFingerprint:'f'.repeat(64)});
const ctx=Object.freeze({trustedServerWorld:'857'});
const connectionId='85785785-7857-4857-8857-857857857857';
const actionId='qb174-'+'a'.repeat(64);
const nonce='85785785-7857-4857-8857-857857857857';
const lease=()=>({ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 serverSessionId:'world-session-857',actionSessionId:actionId,
 leaseNonce:nonce,expiresAtMs:1010000});
const snap=(seq=0)=>({protocol:1,version:'13.7',
 instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch,
 mapFingerprint:scope.mapFingerprint,eventSeq:seq,serverTime:1000,
 rewardsIssued:false,
 player:{x:0,z:0,hp:100,maxHp:100,stamina:80,facing:0,lastIntentSeq:0},
 enemies:[{id:'wolf1',x:2,z:0,hp:25,maxHp:25,alive:true,
  pendingImpactAt:null}]});
const event=seq=>({seq,instanceId:scope.instanceId,
 kind:'player_strike',serverTime:1000,targetId:'wolf1',
 damage:12,critical:false,killed:false,
 xpAuthorized:false,lootAuthorized:false,currencyAuthorized:false,
 serverReceiptId:'DO_NOT_EXPOSE'});
const objective=(current=1)=>({
 questId:'axe_q_first_patrol',objectiveId:'patrol_kills',
 type:'kill',status:'accepted',current,required:3,
 receiptProof:'DO_NOT_EXPOSE'});
function fixture(){
 const state={clock:1000000,seq:0,events:[],call:[],
  commits:0,release:0,objectiveCount:1,replayFailed:false,
  replayFailOnce:false,rotate:false,principalActive:true};
 const owner={version:'13.8',privateServerOnly:true,
  publicTransportInstalled:false,instanceId:scope.instanceId,fencingToken:7,
  async connect(){
   state.call.push('connect');
   return {ok:true,version:'13.7',connectionId,
    snapshot:snap(state.seq),rewardsIssued:false}},
  async setInput({input}){
   state.call.push('setInput');
   return {ok:true,inputSeq:input.seq,rewardsIssued:false}},
  async submit({intent}){
   state.call.push('submit');
   return {ok:true,queued:intent.action==='basic',rewardsIssued:false}},
  async poll({afterSeq}){
   state.call.push('poll');
   const chosen=state.events.filter(e=>e.seq>afterSeq);
   return {ok:true,version:'13.7',reset:false,gap:false,
    snapshot:snap(state.seq),events:chosen,
    nextSeq:chosen.at(-1)?.seq??afterSeq,hasMore:false,
    rewardsIssued:false,rewardAuthorized:false,
    serverSecret:'DO_NOT_EXPOSE'}},
  async disconnect(){state.call.push('disconnect');
   return {ok:true,rewardsIssued:false}},
  async advance(){
   state.call.push('tick');
   state.seq++;
   state.events.push(event(state.seq));
   return {ok:true,eventSeq:state.seq,
    checkpointDigestRecorded:true,rewardsIssued:false}},
  async release(){state.call.push('release');state.release++;return true},
 };
 const progression={version:'18.5',privateServerOnly:true,
  publicPlayerRouteInstalled:false,independentCombatWriterCreated:false,
  rewardWriterInstalled:false,
  async commitWorldKills(){
   state.call.push('commit');state.commits++;
   return {ok:true,lastSeq:state.seq,receipts:[],
    rewardsIssued:false,rewardAuthorized:false}},
  async reconcileCommittedKills({afterEventSeq}){
   state.call.push('replay');
   if(state.replayFailOnce&&!state.replayFailed){
    state.replayFailed=true;return {ok:false,reason:'pg_retry_needed'};
   }
   return {ok:true,version:'84.3',
    processedReceipts:state.seq>afterEventSeq?1:0,
    nextEventSeq:state.seq,hasMore:false,
    objectives:[objective(state.objectiveCount)],
    newCredits:[{receiptId:'INTERNAL_ONLY'}],
    rewardsIssued:false,rewardAuthorized:false,
    questTurnInCommitted:false}},
  shutdown(){state.call.push('progression_shutdown')},
 };
 const stage={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   assert.equal(serverRequestContext,ctx);
   return state.rotate?{...lease(),leaseNonce:'75785785-7857-4857-8857-857857857857'}:lease();
  }},
  encounter={version:'13.6',privateServerOnly:true,
   instanceId:scope.instanceId,mapFingerprint:scope.mapFingerprint};
 const pump=createGame3DPrivateCombatQuestPump844({
  enabled:true,owner,encounter,scope,progression,worldStage180:stage,
  serverRequestContext:ctx,now:()=>state.clock,
 });
 const admission=createGame3DPrivateCombatQuestAdmission845({
  enabled:true,pump,worldStage180:stage,serverRequestContext:ctx,scope,
  resolveTrustedWorldPrincipal:async c=>{
   assert.equal(c,ctx);
   return {authenticated:state.principalActive,
    identitySource:'trusted-server-session',
    accountId:scope.ownerId,characterId:scope.characterId,
    serverSessionId:'world-session-857',expiresAtMs:1015000};
  },
  resolveVerifiedBase44ActionSession:async c=>{
   assert.equal(c,ctx);
   return {authenticated:state.principalActive,
    identitySource:'base44-verified-action-session-179',
    accountId:scope.ownerId,characterId:scope.characterId,
    worldSessionId:'world-session-857',actionSessionId:actionId,
    expiresAtMs:1011000};
  },
  verifySessionActive:async ({ownerId,characterId})=>
   state.principalActive&&ownerId===scope.ownerId&&
   characterId===scope.characterId,
  now:()=>state.clock,
 });
 const host=createGame3DPrivateGameplayHost846({
  enabled:true,admission,scope,
 });
 return {state,host,admission,pump};
}
test('85.7 real 84.4→84.5→84.6 open, strike, tick, commit, credit and private frame',async()=>{
 const {host,state}=fixture();
 const opened=await host.open();
 assert.equal(opened.ok,true);
 const {handle}=opened;
 assert.ok(handle&&typeof handle==='object');
 assert.equal(opened.connectionId,undefined);
 assert.equal((await host.setInput({handle,input:{
  seq:1,x:0,z:1,facing:0}})).ok,true);
 assert.equal((await host.submit({handle,intent:{
  action:'basic',intentId:'intent_00001',intentSeq:1,
  targetId:'wolf1',weaponPath:'damage'}})).ok,true);
 const advance=await host.advance();
 assert.equal(advance.ok,true);
 assert.equal(advance.confirmedEventSeq,1);
 assert.equal(advance.objectives[0].current,1);
 assert.equal(advance.objectives[0].objectiveId,'patrol_kills');
 assert.equal(advance.objectives[0].receiptProof,undefined);
 assert.equal(advance.newCredits,undefined);
 assert.deepEqual(state.call.slice(0,6),
  ['connect','setInput','submit','tick','commit','replay']);
 const frame=await host.frame({handle,afterSeq:0});
 assert.equal(frame.ok,true);
 assert.equal(frame.events[0].serverReceiptId,undefined);
 assert.equal(frame.objectives[0].status,'accepted');
 assert.equal(frame.snapshot.player.hp,100);
 assert.equal(frame.serverSecret,undefined);
 assert.equal(await host.shutdown(),true);
 assert.equal(state.commits,1);
 assert.equal(state.release,1);
});
test('85.7 original 18.5 replay outage requires explicit recovery without second tick',async()=>{
 const {host,state}=fixture();state.replayFailOnce=true;
 const {handle}=await host.open();
 assert.equal((await host.advance()).reason,'private_quest_sync_unverified');
 assert.equal((await host.frame({handle,afterSeq:0})).ok,false);
 assert.equal((await host.advance()).ok,false);
 const recovered=await host.recover();
 assert.equal(recovered.ok,true);
 assert.equal(recovered.confirmedEventSeq,1);
 assert.equal(state.commits,1);
 assert.equal(state.call.filter(x=>x==='tick').length,1);
 assert.equal(state.call.filter(x=>x==='replay').length,2);
 assert.equal((await host.frame({handle,afterSeq:0})).ok,true);
 await host.shutdown();
});
test('85.7 changed 18.3 world lease fails across original 84.5 and 84.4',async()=>{
 const {host,state}=fixture();
 const {handle}=await host.open();
 state.rotate=true;
 assert.equal((await host.submit({handle,intent:{
  action:'basic',intentId:'intent_00002',intentSeq:2,
  targetId:'wolf1',weaponPath:'damage'}})).ok,false);
 assert.equal((await host.advance()).ok,false);
 assert.equal(state.call.includes('tick'),false);
 await host.shutdown();
});
test('85.7 real 84.5 rejects fake server authority from original private host',async()=>{
 const {host,state}=fixture();state.principalActive=false;
 const result=await host.open();
 assert.equal(result.ok,false);
 assert.equal(result.handle,undefined);
 assert.equal(state.call.includes('connect'),false);
 await host.shutdown();
});
test('85.7 objective count is derived from progression only and never authorizes rewards',async()=>{
 const {host,state}=fixture();state.objectiveCount=3;
 const {handle}=await host.open();
 const response=await host.advance();
 assert.equal(response.ok,true);
 assert.equal(response.objectives[0].current,3);
 assert.equal(response.rewardAuthorized,false);
 assert.equal(response.rewardsIssued,false);
 assert.equal(host.rewardWriterInstalled,false);
 const frame=await host.frame({handle,afterSeq:0});
 assert.equal(frame.objectives[0].current,3);
 await host.shutdown();
});
process.on('exit',()=>{
 if(original===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=original;
});
