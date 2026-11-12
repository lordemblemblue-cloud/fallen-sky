import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestReconnect187}
 from '../privateQuestReconnect187.mjs';
import {GAME3D_RECOVERY_READ_SQL_186}
 from '../privateQuestRecovery186.mjs';
import {QUEST_SESSION_LOCK_SQL_183}
 from '../privateQuestTransactionFence183.mjs';
import {KILL_LEASE_READ_SQL_185}
 from '../privateWorldKillLeaseBinding185.mjs';

const at=1793668000000,context=Object.freeze({privateWorld:'original-187'});
const scope=Object.freeze({
 ownerId:'owner187',characterId:'hero187',
 instanceId:'world-instance-187',instanceEpoch:'world-epoch-187',
 mapFingerprint:'a'.repeat(64),
});
const baseLease=Object.freeze({
 ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 serverSessionId:'world-session-187',
 actionSessionId:'qb174-'+'c'.repeat(64),
 leaseNonce:'18718718-1871-4187-8187-187187187187',
 expiresAtMs:at+30000,
});
const receiptId='worldkill-'+'b'.repeat(64);
const questId='axe_q_first_patrol';
const permittedTables=[
 'game3d_trusted_character','game3d_private_world_kill_receipt_152',
 'game3d_private_quest_objective_binding_152',
 'game3d_private_quest_kill_credit_152',
 'game3d_private_quest_acceptance_154','game3d_private_quest_turnin_156',
 'game3d_private_quest_session_fence_183',
 'game3d_private_world_kill_lease_binding_185',
];
const inserts={
 game3d_private_quest_kill_credit_152:[
  'receipt_id','owner_id','character_id','quest_id','objective_id',
  'reward_authorized',
 ],
 game3d_private_quest_turnin_156:[
  'owner_id','character_id','quest_id','catalog_revision',
  'source_kind','rewards_issued',
 ],
};
const updates={
 game3d_trusted_character:['action_row_lock_176'],
 game3d_private_quest_objective_binding_152:['status','updated_at'],
 game3d_private_quest_acceptance_154:[
  'status','updated_at','action_row_lock_176',
 ],
 game3d_private_quest_session_fence_183:['action_row_lock_183'],
};
const allowedColumns=()=>permittedTables.flatMap(table_name=>[
 ...new Set(['owner_id','character_id',...(inserts[table_name]||[]),
  ...(updates[table_name]||[])])
].map(column_name=>({
 table_name,column_name,
 can_insert:(inserts[table_name]||[]).includes(column_name),
 can_update:(updates[table_name]||[]).includes(column_name),
})));
const proof=(ticketId='18718718-1871-4187-8187-187187187190')=>
 Object.freeze({
  identitySource:'base44-server-verified-reconnect-187',
  authenticated:true,consumed:true,reconnectId:ticketId,
  ownerId:scope.ownerId,characterId:scope.characterId,
  worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
  worldSessionId:baseLease.serverSessionId,
  actionSessionId:baseLease.actionSessionId,
  leaseNonce:baseLease.leaseNonce,expiresAtMs:at+20000,
 });
function fixture({receipts=1,proofPatch={},pgRevoked=false,
 endRevocation=false,worldRevoked=false,failAuth=false,
 deferAuth=false,allowReplay=false,failPg=false}={}) {
 const state={
  pgActive:!pgRevoked,worldActive:!worldRevoked,
  lease:{...baseLease},credits:new Set(),readCount:0,
  callCount:0,usedProofs:new Set(),pgQueries:[],
  receipts,clock:at,endRevocation,failPg,
 };
 let releaseAuth;
 const waitingAuth=new Promise(resolve=>{releaseAuth=resolve});
 const worldStage180={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   return state.worldActive&&serverRequestContext===context?
    state.lease:null;
  },
  async resolveQuestTransactionClaim183({ownerId,characterId,
   questId:q,sessionId}){
   return state.worldActive&&ownerId===scope.ownerId&&
    characterId===scope.characterId&&q===questId&&
    sessionId===baseLease.actionSessionId?state.lease:null;
  },
 };
 const pool={async connect(){
  let pending=null;
  return {async query(sql,params=[]){
   state.pgQueries.push(sql);
   if(state.failPg&&sql===QUEST_SESSION_LOCK_SQL_183)
    throw Error('PostgreSQL unavailable');
   const q=sql.replace(/\s+/g,' ').trim();
   if(q.includes('current_user AS role_name'))
    return {rowCount:1,rows:[{
     schema_name:'quest_staging',superuser:'off',bypass_rls:false,
     can_create_role:false,can_create_db:false,replication_role:false,
     schema_create:false,database_create:false,
    }]};
   if(q.includes('information_schema.tables'))
    return {rowCount:permittedTables.length,
     rows:permittedTables.map(table_name=>({
      table_name,can_select:true,dangerous:false,
     }))};
   if(q.includes('information_schema.columns')){
    const rows=allowedColumns();
    return {rowCount:rows.length,rows};
   }
   if(q.includes("current_setting('server_version_num')"))
    return {rowCount:1,rows:[{
     schema_name:'quest_staging',pg_version:160000,
     can_select:true,can_mutate:false,
    }]};
   if(q.includes('FROM pg_constraint'))
    return {rowCount:2,rows:[
     {conname:'game3d_private_kill_receipt_binding_key_185',
      contype:'u',convalidated:true},
     {conname:'game3d_quest_kill_credit_bound_receipt_185',
      contype:'f',convalidated:true},
    ]};
   if(q.includes('FROM pg_trigger'))
    return {rowCount:1,rows:[{enabled:'O'}]};
   if(q.startsWith('BEGIN')){pending=new Set(state.credits);
    return {rowCount:0,rows:[]}};
   if(q==='ROLLBACK'){pending=null;return{rowCount:0,rows:[]}};
   if(q==='COMMIT'){
    if(!pending)throw Error('commit without BEGIN');
    state.credits=pending;pending=null;return{rowCount:0,rows:[]};
   }
   if(sql===QUEST_SESSION_LOCK_SQL_183)
    return {rowCount:1,rows:[{
     owner_id:scope.ownerId,character_id:scope.characterId,
     world_instance_id:scope.instanceId,world_epoch:scope.instanceEpoch,
     world_session_id:baseLease.serverSessionId,
     action_session_id:baseLease.actionSessionId,
     lease_nonce:state.lease.leaseNonce,
     active:state.pgActive,not_expired:state.pgActive,
    }]};
   if(sql===GAME3D_RECOVERY_READ_SQL_186){
    const rows=state.receipts===0?[]:[{
     receipt_id:receiptId,event_seq:'1',
     bound_receipt_id:receiptId,bound_nonce:baseLease.leaseNonce,
     action_session_id:baseLease.actionSessionId,
     server_session_id:baseLease.serverSessionId,
     source_kind:'15.3-server-committed-18.5-lease',
     reward_authorized:false,
    }];
    return {rowCount:rows.length,rows};
   }
   if(sql===KILL_LEASE_READ_SQL_185)
    return {rowCount:1,rows:[{
     receipt_id:receiptId,owner_id:scope.ownerId,
     character_id:scope.characterId,
     instance_id:scope.instanceId,instance_epoch:scope.instanceEpoch,
     event_seq:'1',map_fingerprint:scope.mapFingerprint,
     server_session_id:baseLease.serverSessionId,
     action_session_id:baseLease.actionSessionId,
     lease_nonce:baseLease.leaseNonce,
     source_kind:'15.3-server-committed-18.5-lease',
     reward_authorized:false,
    }]};
   if(q.includes('FROM game3d_private_world_kill_receipt_152'))
    return {rowCount:1,rows:[{
     receipt_id:receiptId,owner_id:scope.ownerId,
     character_id:scope.characterId,
     instance_id:scope.instanceId,instance_epoch:scope.instanceEpoch,
     event_seq:'1',map_fingerprint:scope.mapFingerprint,
     enemy_id:'wolf187',enemy_tier:'normal',
     committed_at:'2026-11-03T13:00:00Z',
    }]};
   if(q.includes('FROM game3d_private_quest_objective_binding_152')&&
     q.includes("status='accepted'"))
    return {rowCount:1,rows:[{
     quest_id:questId,objective_id:'patrol_kills',required_count:3,
    }]};
   if(q.startsWith('SELECT o.quest_id,o.objective_id')){
    state.readCount++;
    if(state.endRevocation)state.pgActive=false;
    return {rowCount:1,rows:[{
     quest_id:questId,objective_id:'patrol_kills',
     objective_type:'kill',enemy_tier:null,enemy_id:null,
     required_count:3,status:'accepted',
     credited:(pending??state.credits).size,
    }]};
   }
   if(q.includes('FROM game3d_private_quest_kill_credit_152'))
    return {rowCount:1,rows:[{n:(pending??state.credits).size}]};
   if(q.startsWith('INSERT INTO game3d_private_quest_kill_credit_152')){
    const set=pending??state.credits,had=set.has(params[0]);
    if(!had)set.add(params[0]);
    return {rowCount:had?0:1,
     rows:had?[]:[{receipt_id:params[0]}]};
   }
   throw Error('unexpected PostgreSQL statement: '+q.slice(0,120));
  },release(){}};
 }};
 const consumeTrustedBase44Reconnect187=async({serverReconnectContext})=>{
  state.callCount++;
  if(deferAuth)await waitingAuth;
  if(failAuth||!serverReconnectContext||
    typeof serverReconnectContext.ticketId!=='string')return null;
  const ticketId=serverReconnectContext.ticketId;
  if(!allowReplay&&state.usedProofs.has(ticketId))return null;
  state.usedProofs.add(ticketId);
  return Object.freeze({...proof(ticketId),...proofPatch});
 };
 const opts={
  enabled:true,worldStage180,serverRequestContext:context,scope,
  progressionPool:pool,progressionSchema:'quest_staging',
  consumeTrustedBase44Reconnect187,now:()=>state.clock,
 };
 return {state,opts,pool,worldStage180,
  releaseAuth:()=>releaseAuth(),proof};
}
async function staging(fn){
 const before=process.env.GAME3D_PRIVATE_STAGING_ENV;
 try{process.env.GAME3D_PRIVATE_STAGING_ENV='staging';await fn()}
 finally{
  if(before===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
  else process.env.GAME3D_PRIVATE_STAGING_ENV=before;
 }
}
const ticket=id=>Object.freeze({
 serverReconnectContext:Object.freeze({ticketId:id}),
});
const id1='18718718-1871-4187-8187-187187187190';
const id2='28718718-1871-4187-8187-187187187190';

test('18.7 only constructs after private original authenticated world admission',async()=>{
 await assert.rejects(createGame3DPrivateQuestReconnect187(),
  /18\.7 requires/);
 await staging(async()=>{
  const h=fixture({worldRevoked:true});
  await assert.rejects(createGame3DPrivateQuestReconnect187(h.opts),
   /original active server world/);
 });
});
test('18.7 fresh authenticated Base44 ticket reconciles one already committed kill',async()=>{
 await staging(async()=>{
  const h=fixture(),service=await createGame3DPrivateQuestReconnect187(h.opts);
  assert.equal(service.publicReconnectRouteInstalled,false);
  assert.equal(service.transportBindingCreated,false);
  const result=await service.reconnect(ticket(id1));
  assert.equal(result.ok,true);
  assert.equal(result.authenticatedReconnect,true);
  assert.equal(result.questProgressSynchronized,true);
  assert.equal(result.receiptsScanned,1);
  assert.equal(result.newlyCreditedObjectives,1);
  assert.equal(result.progress[0].current,1);
  assert.equal(result.rewardsIssued,false);
  assert.equal(result.resumeCombatAuthorized,false);
  assert.equal(result.worldLeaseRestored,false);
  assert.equal(result.transportBindingCreated,false);
  assert.equal(h.state.credits.size,1);
  const second=await service.reconnect(ticket(id2));
  assert.equal(second.ok,true);
  assert.equal(second.newlyCreditedObjectives,0);
  assert.equal(h.state.credits.size,1);
  service.shutdown();
 });
});
test('18.7 reconnect ticket is consumed once even with duplicate concurrent requests',async()=>{
 await staging(async()=>{
  const h=fixture({allowReplay:true,receipts:0});
  const service=await createGame3DPrivateQuestReconnect187(h.opts);
  const [a,b]=await Promise.all([
   service.reconnect(ticket(id1)),service.reconnect(ticket(id1)),
  ]);
  assert.equal(a.ok,true);
  assert.equal(b.ok,false);
  assert.equal(b.reason,'replayed_authenticated_reconnect');
  assert.equal(h.state.readCount,1);
  service.shutdown();
 });
});
test('18.7 wrong account, nonce or expired reauth never replays quest credits',async()=>{
 await staging(async()=>{
  for(const patch of [
   {ownerId:'attacker187'},
   {characterId:'attacker187'},
   {worldInstanceId:'wrong-world-187'},
   {leaseNonce:'28718718-1871-4187-8187-187187187187'},
   {expiresAtMs:at-1},
   {expiresAtMs:at+35000},
   {authenticated:false},
   {consumed:false},
   {identitySource:'browser-claimed-reconnect'},
  ]){
   const h=fixture({proofPatch:patch});
   const service=await createGame3DPrivateQuestReconnect187(h.opts);
   const denied=await service.reconnect(ticket(id1));
   assert.equal(denied.ok,false);
   assert.equal(denied.reason,'base44_reconnect_identity_or_nonce_mismatch');
   assert.equal(h.state.credits.size,0);
   service.shutdown();
  }
 });
});
test('18.7 revoked PG lease denies even if old private stage still appears active',async()=>{
 await staging(async()=>{
  const h=fixture({pgRevoked:true,receipts:0});
  const service=await createGame3DPrivateQuestReconnect187(h.opts);
  const denied=await service.reconnect(ticket(id1));
  assert.equal(denied.ok,false);
  assert.equal(denied.reason,'independent_database_lease_not_active');
  assert.equal(h.state.credits.size,0);
  assert.equal(h.state.readCount,0);
  service.shutdown();
 });
});
test('18.7 PG outage denies reconnection without reviving session',async()=>{
 await staging(async()=>{
  const h=fixture({failPg:true,receipts:0});
  const service=await createGame3DPrivateQuestReconnect187(h.opts);
  const denied=await service.reconnect(ticket(id1));
  assert.equal(denied.ok,false);
  assert.equal(denied.reason,'independent_database_lease_not_active');
  assert.equal(denied.worldLeaseRestored,false);
  service.shutdown();
 });
});
test('18.7 PG revocation after recovery read denies success and does not grant rewards',async()=>{
 await staging(async()=>{
  const h=fixture({endRevocation:true,receipts:0});
  const service=await createGame3DPrivateQuestReconnect187(h.opts);
  const denied=await service.reconnect(ticket(id1));
  assert.equal(denied.ok,false);
  assert.equal(h.state.pgActive,false);
  assert.equal(h.state.credits.size,0);
  assert.equal(denied.rewardsIssued,false);
  service.shutdown();
 });
});
test('18.7 same Base44 action ID but a rotated world nonce cannot reconnect',async()=>{
 await staging(async()=>{
  const h=fixture({receipts:0});
  const service=await createGame3DPrivateQuestReconnect187(h.opts);
  h.state.lease={...baseLease,
   leaseNonce:'38718718-1871-4187-8187-187187187187'};
  const denied=await service.reconnect(ticket(id1));
  assert.equal(denied.ok,false);
  assert.equal(denied.reason,'original_world_session_replaced_or_expired');
  assert.equal(h.state.callCount,0);
  service.shutdown();
 });
});
test('18.7 expired or revoked original world cannot consume reconnect ticket',async()=>{
 await staging(async()=>{
  for(const expired of [true,false]){
   const h=fixture({receipts:0});
   const service=await createGame3DPrivateQuestReconnect187(h.opts);
   if(expired)h.state.clock=baseLease.expiresAtMs+1;
   else h.state.worldActive=false;
   assert.equal((await service.reconnect(ticket(id1))).ok,false);
   assert.equal(h.state.callCount,0);
   service.shutdown();
  }
 });
});
test('18.7 browser fields, direct account IDs and missing context are all rejected',async()=>{
 await staging(async()=>{
  const h=fixture({receipts:0});
  const service=await createGame3DPrivateQuestReconnect187(h.opts);
  for(const malformed of [
   undefined,{}, {ownerId:scope.ownerId},
   {serverReconnectContext:'raw-browser-token'},
   {...ticket(id1),worldInstanceId:scope.instanceId},
  ]){
   assert.equal((await service.reconnect(malformed)).ok,false);
  }
  assert.equal(h.state.callCount,0);
  service.shutdown();
 });
});
test('18.7 shutdown while server Base44 reauth is pending cannot commit reconnect success',async()=>{
 await staging(async()=>{
  const h=fixture({receipts:0,deferAuth:true});
  const service=await createGame3DPrivateQuestReconnect187(h.opts);
  const pending=service.reconnect(ticket(id1));
  // Reauth must have entered before shutdown.
  while(h.state.callCount===0)await Promise.resolve();
  service.shutdown();
  h.releaseAuth();
  const denied=await pending;
  assert.equal(denied.ok,false);
  assert.equal(denied.worldLeaseRestored,false);
  assert.equal(h.state.readCount,0);
 });
});
test('18.7 already consumed tickets cannot be retried after database denial',async()=>{
 await staging(async()=>{
  const h=fixture({pgRevoked:true,receipts:0,allowReplay:true});
  const service=await createGame3DPrivateQuestReconnect187(h.opts);
  assert.equal((await service.reconnect(ticket(id1))).ok,false);
  h.state.pgActive=true;
  const replay=await service.reconnect(ticket(id1));
  assert.equal(replay.ok,false);
  assert.equal(replay.reason,'replayed_authenticated_reconnect');
  assert.equal(h.state.readCount,0);
  service.shutdown();
 });
});

test('18.7 a second private coordinator cannot reuse a server-consumed reconnect ticket',async()=>{
 await staging(async()=>{
  const h=fixture({receipts:0});
  const first=await createGame3DPrivateQuestReconnect187(h.opts);
  const second=await createGame3DPrivateQuestReconnect187(h.opts);
  assert.equal((await first.reconnect(ticket(id1))).ok,true);
  const used=await second.reconnect(ticket(id1));
  assert.equal(used.ok,false);
  assert.equal(used.reason,'base44_reconnect_identity_or_nonce_mismatch');
  assert.equal(h.state.readCount,1);
  first.shutdown();second.shutdown();
 });
});
test('18.7 bounded single-worker replay ledger refuses 65th proof without eviction',async()=>{
 await staging(async()=>{
  const h=fixture({receipts:0});
  const service=await createGame3DPrivateQuestReconnect187(h.opts);
  for(let index=1;index<=64;index++){
   const uniqueId='18718718-1871-4187-8187-'+
    index.toString(16).padStart(12,'0');
   const accepted=await service.reconnect(ticket(uniqueId));
   assert.equal(accepted.ok,true);
   assert.equal(accepted.rewardsIssued,false);
  }
  const refused=await service.reconnect(ticket(
   '18718718-1871-4187-8187-000000000041'));
  assert.equal(refused.ok,false);
  assert.equal(refused.reason,'private_reconnect_replay_capacity_exhausted');
  assert.equal(h.state.credits.size,0);
  service.shutdown();
 });
});
