import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateWorldKillCommit153}
 from '../privateWorldKillCommit153.mjs';
import {createGame3DPrivateCommittedQuestCredits152}
 from '../privateCommittedQuestCredits152.mjs';
import {createGame3DPrivateWorldKillLeaseBinding185}
 from '../privateWorldKillLeaseBinding185.mjs';
import {createGame3DQuestTransactionFence183}
 from '../privateQuestTransactionFence183.mjs';

const at=1793668000000;
const context=Object.freeze({trustedWorld:'private-185'});
const scope=Object.freeze({
 instanceId:'instance-185-private',instanceEpoch:'epoch-185-private',
 holderId:'holder-185-private',
 ownerId:'owner185',characterId:'hero185',mapFingerprint:'a'.repeat(64),
});
const lease=Object.freeze({
 ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 actionSessionId:'qb174-'+'c'.repeat(64),
 serverSessionId:'world-session-185',
 leaseNonce:'18518518-1851-4185-8185-185185185185',
 expiresAtMs:at+45000,
});
const questId='axe_q_first_patrol';
function world(){
 let killed=false,untrustedEvent=false;
 const initial=()=>({instanceId:scope.instanceId,eventSeq:0,
  rewardsIssued:false,productionReady:false,
  player:{x:0,z:0,maxHp:100,hp:100},
  enemies:[{id:'wolf185',x:2,z:0,maxHp:30,hp:30,
   alive:true,tier:'normal'}]});
 const snapshot=()=>killed?({
  ...initial(),eventSeq:1,
  enemies:[{id:'wolf185',x:2,z:0,maxHp:30,
   hp:0,alive:false,tier:'normal'}],
 }):initial();
 const events=()=>killed?[Object.freeze({
  instanceId:scope.instanceId,seq:1,serverTime:at,
  kind:untrustedEvent?'client_kill':'player_strike',
  xpAuthorized:false,lootAuthorized:false,currencyAuthorized:false,
  killed:true,targetId:'wolf185',enemyHp:0,
  serverKillCommitted:false,tier:'normal',
 })]:[];
 return {encounter:{version:'13.6',privateServerOnly:true,
  instanceId:scope.instanceId,mapFingerprint:scope.mapFingerprint,
  mapId:'wolfveil-v1',worldOrigin:{x:0,z:0},
  snapshot,getEventsAfter:()=>events(),
 },kill:()=>{killed=true},forge:()=>{killed=true;untrustedEvent=true}};
}
function stageFixture({leaseMissing=false}={}){
 const state={active:true,lease:{...lease},leaseMissing,
  receipts:new Map(),bindings:new Map(),credits:new Set(),
  queries:[],commits:0,rollbacks:0};
 const worldStage180={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   return serverRequestContext===context&&state.active?
    state.lease:null;
  },
 };
 const clone=()=>({receipts:new Map(state.receipts),
  bindings:new Map(state.bindings),credits:new Set(state.credits)});
 const pool={async connect(){
  let pending=null;
  return {async query(sql,params=[]){
   state.queries.push({sql,params});
   const q=sql.replace(/\s+/g,' ').trim();
   if(q.startsWith('BEGIN')){pending=clone();return {rowCount:0,rows:[]}};
   if(q==='ROLLBACK'){pending=null;state.rollbacks++;return{rowCount:0,rows:[]}};
   if(q==='COMMIT'){
    if(!pending)throw Error('unexpected commit');
    state.receipts=pending.receipts;state.bindings=pending.bindings;
    state.credits=pending.credits;state.commits++;pending=null;
    return {rowCount:0,rows:[]};
   }
   const data=pending??state;
   if(q.includes('FROM game3d_combat_world_instance_lease'))
    return {rowCount:1,rows:[{fencing_token:'7'}]};
   if(q.includes('FROM game3d_private_world_seed_142'))
    return {rowCount:1,rows:[{
     instance_id:scope.instanceId,owner_id:scope.ownerId,
     character_id:scope.characterId,
     map_fingerprint:scope.mapFingerprint,map_id:'wolfveil-v1',
     source_kind:'trusted_server_world_provisioner',sealed:true,
     world_origin_x:0,world_origin_z:0,
     actors_json:{
      player:{position:{x:0,z:0},hp:100,stats:{maxHP:100}},
      enemies:[{id:'wolf185',position:{x:2,z:0},tier:'normal',
       hp:30,alive:true,stats:{maxHP:30}}],
     },
    }]};
   if(q.startsWith('INSERT INTO game3d_private_world_kill_receipt_152')){
    const id=params[0];
    if(data.receipts.has(id))return {rowCount:0,rows:[]};
    data.receipts.set(id,{
     receipt_id:id,owner_id:params[1],character_id:params[2],
     instance_id:params[3],instance_epoch:params[4],
     map_fingerprint:params[5],event_seq:String(params[6]),
     enemy_id:params[7],enemy_tier:params[8],
     committed_at:'2026-11-03T00:00:00Z',
    });
    return {rowCount:1,rows:[{receipt_id:id}]};
   }
   if(q.includes('FROM game3d_private_quest_session_fence_183')){
    const row=state.lease;
    if(state.leaseMissing)return {rowCount:0,rows:[]};
    return {rowCount:1,rows:[{
     owner_id:row.ownerId,character_id:row.characterId,
     world_instance_id:row.worldInstanceId,
     world_epoch:row.worldEpoch,world_session_id:row.serverSessionId,
     action_session_id:row.actionSessionId,
     lease_nonce:row.leaseNonce,active:state.active,not_expired:true,
    }]};
   }
   if(q.startsWith('INSERT INTO game3d_private_world_kill_lease_binding_185')){
    const id=params[0];
    if(!data.receipts.has(id))throw Error('missing receipt FK');
    if(data.bindings.has(id))throw Error('duplicate receipt binding');
    data.bindings.set(id,{
     receipt_id:id,owner_id:params[1],character_id:params[2],
     instance_id:params[3],instance_epoch:params[4],
     map_fingerprint:params[5],event_seq:String(params[6]),
     server_session_id:params[7],action_session_id:params[8],
     lease_nonce:params[9],
     source_kind:'15.3-server-committed-18.5-lease',
     reward_authorized:false,
    });
    return {rowCount:1,rows:[{receipt_id:id}]};
   }
   if(q.includes('FROM game3d_private_world_kill_lease_binding_185')){
    const found=data.bindings.get(params[0]);
    return {rowCount:found?1:0,rows:found?[found]:[]};
   }
   if(q.includes('FROM game3d_private_world_kill_receipt_152')){
    const found=data.receipts.get(params[0]);
    return {rowCount:found?1:0,rows:found?[found]:[]};
   }
   if(q.includes('FROM game3d_private_quest_objective_binding_152'))
    return {rowCount:1,rows:[{
     quest_id:questId,objective_id:'patrol_kills',required_count:3,
    }]};
   if(q.includes('FROM game3d_private_quest_kill_credit_152'))
    return {rowCount:1,rows:[{n:data.credits.size}]};
   if(q.startsWith('INSERT INTO game3d_private_quest_kill_credit_152')){
    const id=params[0];if(!data.bindings.has(id))
     throw Error('18.5 FK: unbound receipt');
    const exists=data.credits.has(id);
    if(!exists)data.credits.add(id);
    return {rowCount:exists?0:1,rows:exists?[]:[{receipt_id:id}]};
   }
   throw Error('unexpected fake PG: '+q.slice(0,115));
  },release(){}};
 }};
 const newBinder=()=>createGame3DPrivateWorldKillLeaseBinding185({
  worldStage180,scope,serverRequestContext:context,
  now:()=>at,enabled:true,
 });
 const makeWriter=binder=>{
  const w=world();
  const writer=createGame3DPrivateWorldKillCommit153({
   encounter:w.encounter,pool,scope,fencingToken:7,
   authorizeServerOperation:async()=>true,
   attestCommittedKill185:binder.bindCommittedKill185,
  });
  return {writer,...w};
 };
 const makeLedger=binder=>{
  const txnFence=createGame3DQuestTransactionFence183({
   now:()=>at,enabled:true,
   resolveTrustedWorldLease:async()=>state.active?state.lease:null,
  });
  return createGame3DPrivateCommittedQuestCredits152({
   pool,authorizeServerOperation:async()=>true,
   verifyCommittedReceipt185:binder.verifyCommittedReceipt185,
   transactionFence:(db,claim)=>txnFence.verifyInTransaction(db,{
    ...claim,sessionId:state.lease.actionSessionId,
   }),
  });
 };
 return {state,pool,newBinder,makeWriter,makeLedger};
}
async function staging(fn){
 const original=process.env.GAME3D_PRIVATE_STAGING_ENV;
 try{process.env.GAME3D_PRIVATE_STAGING_ENV='staging';await fn();}
 finally{
  if(original===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
  else process.env.GAME3D_PRIVATE_STAGING_ENV=original;
 }
}
test('18.5 actual 15.3 server writer commits a kill plus immutable lease binding atomically',async()=>{
 await staging(async()=>{
  const h=stageFixture(),binding=h.newBinder();
  const w=h.makeWriter(binding);w.kill();
  const result=await w.writer.commit();
  assert.equal(result.ok,true);
  assert.equal(result.killReceiptCommitted,true);
  assert.equal(result.receipts.length,1);
  assert.equal(result.rewardAuthorized,false);
  assert.equal(h.state.commits,1);
  assert.equal(h.state.receipts.size,1);
  assert.equal(h.state.bindings.size,1);
  assert.equal(h.state.bindings.get(result.receipts[0].receiptId)
   .lease_nonce,lease.leaseNonce);
  const progress=await h.makeLedger(binding).project({
   receiptId:result.receipts[0].receiptId,
   ownerId:scope.ownerId,characterId:scope.characterId,
  });
  assert.equal(progress.ok,true);
  assert.equal(progress.killCreditCommitted,true);
  assert.equal(progress.rewardAuthorized,false);
  assert.equal(h.state.credits.size,1);
  const replay=await h.makeLedger(binding).project({
   receiptId:result.receipts[0].receiptId,
   ownerId:scope.ownerId,characterId:scope.characterId,
  });
  assert.equal(replay.ok,true);
  assert.equal(replay.killCreditCommitted,false);
  assert.equal(h.state.credits.size,1);
  binding.shutdown();
 });
});
test('18.5 if kill session lease is missing, 15.3 rolls back BOTH persisted records',async()=>{
 await staging(async()=>{
  const h=stageFixture({leaseMissing:true}),binding=h.newBinder();
  const w=h.makeWriter(binding);w.kill();
  const result=await w.writer.commit();
  assert.equal(result.ok,false);
  assert.equal(h.state.commits,0);
  assert.equal(h.state.rollbacks,1);
  assert.equal(h.state.receipts.size,0);
  assert.equal(h.state.bindings.size,0);
  assert.equal(h.state.credits.size,0);
  binding.shutdown();
 });
});
test('18.5 after same-account re-pair no previously bound kill can be projected again',async()=>{
 await staging(async()=>{
  const h=stageFixture(),binding=h.newBinder();
  const w=h.makeWriter(binding);w.kill();
  const result=await w.writer.commit();
  assert.equal(result.ok,true);
  h.state.lease={...lease,leaseNonce:
   '28518518-1851-4185-8185-185185185185'};
  const projected=await h.makeLedger(binding).project({
   receiptId:result.receipts[0].receiptId,
   ownerId:scope.ownerId,characterId:scope.characterId,
  });
  assert.equal(projected.ok,false);
  assert.equal(projected.reason,'committed_kill_session_binding_missing');
  assert.equal(h.state.credits.size,0);
  binding.shutdown();
 });
});
test('18.5 client-suggested lethal event never reaches a lease bind or quest credit',async()=>{
 await staging(async()=>{
  const h=stageFixture(),binding=h.newBinder();
  const w=h.makeWriter(binding);w.forge();
  const result=await w.writer.commit();
  assert.equal(result.ok,false);
  assert.equal(h.state.receipts.size,0);
  assert.equal(h.state.bindings.size,0);
  assert.equal(h.state.credits.size,0);
  binding.shutdown();
 });
});
