import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DQuestTransactionFence183,QUEST_SESSION_LOCK_SQL_183}
 from '../privateQuestTransactionFence183.mjs';

const at=1793668000000;
const id='qb174-'+'a'.repeat(64);
const lease=Object.freeze({ownerId:'owner183',characterId:'hero183',
 actionSessionId:id,serverSessionId:'world-session-183',
 worldInstanceId:'world-instance-183',worldEpoch:'world-epoch-183',
 leaseNonce:'11111111-1111-4111-8111-111111111111',
 expiresAtMs:at+20000});
const req={ownerId:lease.ownerId,characterId:lease.characterId,
 questId:'axe_q_first_patrol',sessionId:id,
 operation:'accept_private_server_quest'};
const row=(claim=lease)=>({owner_id:claim.ownerId,character_id:claim.characterId,
 world_instance_id:claim.worldInstanceId,world_epoch:claim.worldEpoch,
 world_session_id:claim.serverSessionId,action_session_id:claim.actionSessionId,
 lease_nonce:claim.leaseNonce,active:true,not_expired:true});
const make=({rotate=false,dbRow=row(),fault=false,deny=false}={})=>{
 let calls=0,queryCount=0;
 const fence=createGame3DQuestTransactionFence183({
  enabled:true,now:()=>at,resolveTrustedWorldLease:async()=>{
   calls++;
   if(deny)return null;
   return rotate&&calls>1?{...lease,leaseNonce:'22222222-2222-4222-8222-222222222222'}:lease;
  },
 });
 const client={async query(sql,params){
  queryCount++;assert.equal(sql,QUEST_SESSION_LOCK_SQL_183);
  assert.match(sql,/FOR SHARE/);
  assert.deepEqual(params,[
   lease.ownerId,lease.characterId,lease.worldInstanceId,lease.worldEpoch,
   lease.serverSessionId,lease.actionSessionId,lease.leaseNonce]);
  if(fault)throw Error('PG unavailable');
  return {rowCount:1,rows:[{...dbRow}]};
 }};
 return {fence,client,get calls(){return calls},get queries(){return queryCount}};
};
test('18.3 is opt-in and requires trusted session lease authority',()=>{
 assert.throws(()=>createGame3DQuestTransactionFence183(),/requires|needs/);
 assert.match(QUEST_SESSION_LOCK_SQL_183,/FOR SHARE/);
 assert.doesNotMatch(QUEST_SESSION_LOCK_SQL_183,/FOR KEY SHARE/);
});
test('18.3 exact active world session is locked inside caller-owned DB transaction',async()=>{
 const h=make();assert.equal(await h.fence.verifyInTransaction(h.client,req),true);
 assert.equal(h.queries,1);assert.equal(h.calls,2);
 assert.equal(h.fence.productionReady,false);
 assert.equal(h.fence.rewardsIssued,false);
});
test('18.3 rejects expired, revoked, missing, mismatched or rotated PG lease',async()=>{
 for(const patch of [{active:false},{not_expired:false},
  {world_epoch:'wrong-epoch'}, {lease_nonce:'22222222-2222-4222-8222-222222222222'}]){
  const h=make({dbRow:{...row(),...patch}});
  assert.equal(await h.fence.verifyInTransaction(h.client,req),false);
 }
 const rotated=make({rotate:true});
 assert.equal(await rotated.fence.verifyInTransaction(rotated.client,req),false);
 const expired=createGame3DQuestTransactionFence183({enabled:true,now:()=>at,
  resolveTrustedWorldLease:async()=>({...lease,expiresAtMs:at-1})});
 assert.equal(await expired.verifyInTransaction(make().client,req),false);
});
test('18.3 fails closed on forged account/session and unavailable PG',async()=>{
 const h=make();
 for(const patch of [{ownerId:'attacker183'}, {characterId:'attacker183'},
  {sessionId:'qb174-'+'b'.repeat(64)}, {operation:'turn_in_private_echo_quest'},
  {playerPosition:{x:0,z:0}}]){
  assert.equal(await h.fence.verifyInTransaction(h.client,{...req,...patch}),false);
 }
 const noDb=make({fault:true});
 assert.equal(await noDb.fence.verifyInTransaction(noDb.client,req),false);
 const noLogin=make({deny:true});
 assert.equal(await noLogin.fence.verifyInTransaction(noLogin.client,req),false);
});
test('18.3 world epoch, nonce and role identity are enforced even for correct signed action ID',async()=>{
 const current=make({dbRow:{...row(),world_session_id:'other-world-session'}});
 assert.equal(await current.fence.verifyInTransaction(current.client,req),false);
 const short=createGame3DQuestTransactionFence183({enabled:true,
  now:()=>at,resolveTrustedWorldLease:async()=>({...lease,leaseNonce:'browser'})});
 assert.equal(await short.verifyInTransaction(make().client,req),false);
});
