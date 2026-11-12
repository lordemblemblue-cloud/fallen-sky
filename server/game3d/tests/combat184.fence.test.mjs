import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateWorldObjectiveFence184}
 from '../privateWorldObjectiveFence184.mjs';
import {QUEST_SESSION_LOCK_SQL_183}
 from '../privateQuestTransactionFence183.mjs';

const now=1793668000000;
const scope={ownerId:'owner184',characterId:'hero184',
 instanceId:'world-instance-184',instanceEpoch:'world-epoch-184'};
const context=Object.freeze({trusted:'server-session'});
const lease=Object.freeze({
 ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 actionSessionId:'qb174-'+'a'.repeat(64),
 serverSessionId:'server-world-session-184',
 leaseNonce:'11111111-1111-4111-8111-111111111111',
 expiresAtMs:now+10000,
});
const pgRow=claim=>({
 owner_id:claim.ownerId,character_id:claim.characterId,
 world_instance_id:claim.worldInstanceId,world_epoch:claim.worldEpoch,
 world_session_id:claim.serverSessionId,action_session_id:claim.actionSessionId,
 lease_nonce:claim.leaseNonce,active:true,not_expired:true,
});
const project=Object.freeze({ownerId:scope.ownerId,
 characterId:scope.characterId,operation:'project_committed_quest_kill',
 questId:null});
function harness({claim=lease,row=pgRow(lease),race=false,pgFailure=false}={}){
 let reads=0,checks=0;
 const worldStage180={version:'18.0',privateServerOnly:true,
  async resolveCurrentWorldLease183(args){
   reads++;
   if(args.serverRequestContext!==context)return null;
   if(race&&reads>1)return null;
   return claim;
  }};
 const fence=createGame3DPrivateWorldObjectiveFence184({
  worldStage180,serverRequestContext:context,scope,now:()=>now,enabled:true,
 });
 const client={async query(sql,params){
  checks++;
  assert.equal(sql,QUEST_SESSION_LOCK_SQL_183);
  assert.deepEqual(params,[
   lease.ownerId,lease.characterId,lease.worldInstanceId,lease.worldEpoch,
   lease.serverSessionId,lease.actionSessionId,lease.leaseNonce,
  ]);
  if(pgFailure)throw Error('database unavailable');
  return {rowCount:1,rows:[row]};
 }};
 return {fence,client,get reads(){return reads},get checks(){return checks}};
}
test('18.4 refuses missing authority, stale context and nonprivate world',()=>{
 assert.throws(()=>createGame3DPrivateWorldObjectiveFence184(),/18\.4 needs/);
 const h=harness();
 assert.equal(h.fence.privateServerOnly,true);
 assert.equal(h.fence.publicRouteInstalled,false);
 assert.equal(h.fence.rewardsIssued,false);
});
test('18.4 committed kill projection holds exact 18.3 session row FOR SHARE',async()=>{
 const h=harness();
 assert.equal(await h.fence.verifyInTransaction(h.client,project),true);
 assert.equal(h.reads,2);assert.equal(h.checks,1);
 assert.equal(await h.fence.verifyWorldLive(),true);
});
test('18.4 all catalog-authorized private writer operations share the same lease',async()=>{
 const allowed=[
  {operation:'accept_private_server_quest',questId:'axe_q_first_patrol'},
  {operation:'project_committed_quest_kill',questId:null},
  {operation:'turn_in_private_server_quest',questId:'axe_q_first_patrol'},
  {operation:'credit_private_echo_objective',questId:'echo_ch_14_first_echo'},
  {operation:'turn_in_private_echo_quest',questId:'echo_ch_14_first_echo'},
 ];
 const h=harness();
 for(const p of allowed)assert.equal(await h.fence.verifyInTransaction(h.client,{
  ownerId:scope.ownerId,characterId:scope.characterId,...p}),true);
 assert.equal(h.checks,allowed.length);
});
test('18.4 bad actor, arbitrary client progress or unknown operation are rejected before PG',async()=>{
 const h=harness();
 for(const extra of [
  {ownerId:'attacker'},{characterId:'attacker'},
  {operation:'claim_quest_rewards'},{questId:'forged bad quest id'},
  {clientKillCount:100000},{player:{x:1,z:2}},
 ]){
  assert.equal(await h.fence.verifyInTransaction(h.client,{
   ...project,...extra}),false);
 }
 assert.equal(h.checks,0);
});
test('18.4 deny revoked/expired/mismatched PG rows and disappeared world',async()=>{
 for(const row of [
  {...pgRow(lease),active:false},{...pgRow(lease),not_expired:false},
  {...pgRow(lease),world_epoch:'old-world-epoch'},
  {...pgRow(lease),action_session_id:'qb174-'+'b'.repeat(64)},
  {...pgRow(lease),lease_nonce:'22222222-2222-4222-8222-222222222222'},
 ]){
  const h=harness({row});
  assert.equal(await h.fence.verifyInTransaction(h.client,project),false);
 }
 assert.equal(await harness({claim:null}).fence.verifyWorldLive(),false);
 const race=harness({race:true});
 assert.equal(await race.fence.verifyInTransaction(race.client,project),false);
 const pg=harness({pgFailure:true});
 assert.equal(await pg.fence.verifyInTransaction(pg.client,project),false);
});
