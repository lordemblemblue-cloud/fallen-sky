import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateWorldKillLeaseBinding185,
 KILL_LEASE_INSERT_SQL_185,KILL_LEASE_READ_SQL_185}
 from '../privateWorldKillLeaseBinding185.mjs';
import {QUEST_SESSION_LOCK_SQL_183}
 from '../privateQuestTransactionFence183.mjs';

const at=1793668000000,context=Object.freeze({trusted:'private-185'});
const scope=Object.freeze({
 ownerId:'owner185',characterId:'hero185',
 instanceId:'instance-185-private',instanceEpoch:'epoch-185-private',
 mapFingerprint:'a'.repeat(64),
});
const receiptId='worldkill-'+'b'.repeat(64);
const record=Object.freeze({
 receiptId,ownerId:scope.ownerId,characterId:scope.characterId,
 instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch,
 mapFingerprint:scope.mapFingerprint,eventSeq:1,
});
const initialLease=Object.freeze({
 ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 actionSessionId:'qb174-'+'c'.repeat(64),
 serverSessionId:'world-session-185',
 leaseNonce:'18518518-1851-4185-8185-185185185185',
 expiresAtMs:at+45000,
});
function fixture({missing=false,revoked=false,missingBind=false}={}){
 const state={lease:initialLease,missing,revoked,missingBind,
  inserted:null,queries:[],beforeInsert:null,afterRead:null};
 const worldStage180={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   return serverRequestContext===context&&!state.revoked?state.lease:null;
  },
 };
 const db={
  async query(sql,params){
   state.queries.push({sql,params});
   if(sql===QUEST_SESSION_LOCK_SQL_183){
    assert.deepEqual(params,[
     state.lease.ownerId,state.lease.characterId,
     state.lease.worldInstanceId,state.lease.worldEpoch,
     state.lease.serverSessionId,state.lease.actionSessionId,
     state.lease.leaseNonce,
    ]);
    if(state.missing)return {rowCount:0,rows:[]};
    return {rowCount:1,rows:[{
     owner_id:state.lease.ownerId,character_id:state.lease.characterId,
     world_instance_id:state.lease.worldInstanceId,
     world_epoch:state.lease.worldEpoch,
     world_session_id:state.lease.serverSessionId,
     action_session_id:state.lease.actionSessionId,
     lease_nonce:state.lease.leaseNonce,active:!state.revoked,
     not_expired:true,
    }]};
   }
   if(sql===KILL_LEASE_INSERT_SQL_185){
    if(state.beforeInsert)state.beforeInsert(state);
    if(state.inserted!==null)return {rowCount:0,rows:[]};
    state.inserted={
     receipt_id:params[0],owner_id:params[1],
     character_id:params[2],instance_id:params[3],
     instance_epoch:params[4],map_fingerprint:params[5],
     event_seq:String(params[6]),server_session_id:params[7],
     action_session_id:params[8],lease_nonce:params[9],
     source_kind:'15.3-server-committed-18.5-lease',
     reward_authorized:false,
    };
    return {rowCount:1,rows:[{receipt_id:params[0]}]};
   }
   if(sql===KILL_LEASE_READ_SQL_185){
    assert.deepEqual(params,[
     record.receiptId,record.ownerId,record.characterId,
     record.instanceId,record.instanceEpoch,record.mapFingerprint,1,
    ]);
    if(state.afterRead)state.afterRead(state);
    return state.missingBind||!state.inserted?
     {rowCount:0,rows:[]}:
     {rowCount:1,rows:[state.inserted]};
   }
   throw Error('unexpected SQL for kill binding');
  },
 };
 const create=()=>createGame3DPrivateWorldKillLeaseBinding185({
  worldStage180,serverRequestContext:context,scope,
  now:()=>at,enabled:true,
 });
 return {state,db,create};
}
async function staging(fn){
 const old=process.env.GAME3D_PRIVATE_STAGING_ENV;
 try{process.env.GAME3D_PRIVATE_STAGING_ENV='staging';await fn();}
 finally{
  if(old===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
  else process.env.GAME3D_PRIVATE_STAGING_ENV=old;
 }
}
test('18.5 no browser context or public staging flag may create the binding authority',async()=>{
 assert.throws(()=>createGame3DPrivateWorldKillLeaseBinding185(),/18\.5 requires/);
 await staging(async()=>{
  const h=fixture();
  assert.throws(()=>createGame3DPrivateWorldKillLeaseBinding185({
   worldStage180:{version:'18.0',privateServerOnly:true,
    publicPlayerRouteInstalled:false},
   serverRequestContext:context,scope,now:()=>at,enabled:true,
  }),/18\.5 requires/);
  assert.equal(h.create().publicRouteInstalled,false);
 });
});
test('18.5 genuine 15.3 receipt binds exactly once to active original lease',async()=>{
 await staging(async()=>{
  const h=fixture(),binding=h.create();
  assert.equal(await binding.bindCommittedKill185(h.db,record),true);
  assert.equal(await binding.verifyCommittedReceipt185(h.db,record),true);
  assert.equal(h.state.queries.filter(x=>x.sql===QUEST_SESSION_LOCK_SQL_183).length,1);
  assert.equal(h.state.inserted.receipt_id,receiptId);
  assert.equal(h.state.inserted.lease_nonce,initialLease.leaseNonce);
  assert.equal(h.state.inserted.reward_authorized,false);
  assert.equal(await binding.bindCommittedKill185(h.db,record),false);
  binding.shutdown();
 });
});
test('18.5 old receipt cannot be re-used after re-pair with same action session ID',async()=>{
 await staging(async()=>{
  const h=fixture(),binding=h.create();
  assert.equal(await binding.bindCommittedKill185(h.db,record),true);
  h.state.lease={...initialLease,
   leaseNonce:'28518518-1851-4185-8185-185185185185'};
  assert.equal(await binding.verifyCommittedReceipt185(h.db,record),false);
  binding.shutdown();
 });
});
test('18.5 invalid receipt scope or forged event sequence is rejected before SQL',async()=>{
 await staging(async()=>{
  const h=fixture(),binding=h.create();
  for(const patch of [
   {ownerId:'attacker185'},{characterId:'attacker185'},
   {instanceId:'another-instance'},{instanceEpoch:'another-epoch'},
   {mapFingerprint:'f'.repeat(64)},{eventSeq:0},
   {receiptId:'browser-kill-123'},{playerPosition:{x:0,z:0}},
  ]){
   assert.equal(await binding.bindCommittedKill185(h.db,{
    ...record,...patch,
   }),false);
  }
  assert.equal(h.state.queries.length,0);
  binding.shutdown();
 });
});
test('18.5 revoked/expired or missing lease row denies new committed kill binding',async()=>{
 await staging(async()=>{
  const a=fixture({missing:true}),b=fixture({revoked:true});
  assert.equal(await a.create().bindCommittedKill185(a.db,record),false);
  assert.equal(await b.create().bindCommittedKill185(b.db,record),false);
  const c=fixture(),binding=c.create();
  c.state.lease={...initialLease,expiresAtMs:at-1};
  assert.equal(await binding.bindCommittedKill185(c.db,record),false);
 });
});
test('18.5 old or absent immutable binding row cannot authorize projection',async()=>{
 await staging(async()=>{
  const h=fixture(),binding=h.create();
  assert.equal(await binding.verifyCommittedReceipt185(h.db,record),false);
  assert.equal(await binding.bindCommittedKill185(h.db,record),true);
  h.state.inserted={...h.state.inserted,
   action_session_id:'qb174-'+'d'.repeat(64)};
  assert.equal(await binding.verifyCommittedReceipt185(h.db,record),false);
  h.state.inserted={...h.state.inserted,
   action_session_id:initialLease.actionSessionId,lease_nonce:'wrong'};
  assert.equal(await binding.verifyCommittedReceipt185(h.db,record),false);
  binding.shutdown();
 });
});
test('18.5 async world re-pair during binding INSERT invalidates the result',async()=>{
 await staging(async()=>{
  const h=fixture(),binding=h.create();
  h.state.beforeInsert=state=>{
   state.lease={...initialLease,
    leaseNonce:'38518518-1851-4185-8185-185185185185'};
  };
  assert.equal(await binding.bindCommittedKill185(h.db,record),false);
  binding.shutdown();
 });
});
test('18.5 shutdown denies both old committed receipt binding and projection',async()=>{
 await staging(async()=>{
  const h=fixture(),binding=h.create();
  assert.equal(await binding.bindCommittedKill185(h.db,record),true);
  binding.shutdown();
  assert.equal(await binding.bindCommittedKill185(h.db,record),false);
  assert.equal(await binding.verifyCommittedReceipt185(h.db,record),false);
 });
});
