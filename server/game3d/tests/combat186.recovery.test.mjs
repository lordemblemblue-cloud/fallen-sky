import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestRecovery186,
 GAME3D_RECOVERY_READ_SQL_186}
 from '../privateQuestRecovery186.mjs';

const now=1793668000000;
const context=Object.freeze({trustedPrivateWorld:true});
const scope=Object.freeze({ownerId:'owner186',characterId:'hero186',
 instanceId:'world-instance-186',instanceEpoch:'world-epoch-186',
 mapFingerprint:'a'.repeat(64)});
const lease=Object.freeze({
 ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 actionSessionId:'qb174-'+'c'.repeat(64),
 serverSessionId:'world-session-186',
 leaseNonce:'18618618-1861-4186-8186-186186186186',
 expiresAtMs:now+30000,
});
const questId='axe_q_first_patrol';
const ids=['worldkill-'+'1'.repeat(64),'worldkill-'+'2'.repeat(64),
 'worldkill-'+'3'.repeat(64)];
const neededTables=[
 'game3d_trusted_character','game3d_private_world_kill_receipt_152',
 'game3d_private_quest_objective_binding_152',
 'game3d_private_quest_kill_credit_152',
 'game3d_private_quest_acceptance_154','game3d_private_quest_turnin_156',
 'game3d_private_quest_session_fence_183',
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
const roleRows=()=>[...neededTables,
 'game3d_private_world_kill_lease_binding_185'
].map(table_name=>({table_name,can_select:true,dangerous:false}));
const columnRows=()=>neededTables.flatMap(table_name=>[
 ...new Set(['owner_id','character_id',...(inserts[table_name]||[]),
  ...(updates[table_name]||[])])
].map(column_name=>({
 table_name,column_name,
 can_update:(updates[table_name]||[]).includes(column_name),
 can_insert:(inserts[table_name]||[]).includes(column_name),
})));
function fixture({unbound=null,initialCredits=[],receiptCount=3,
 missingRole=false,revokeOnInsert=false,failReceipt=null,
 pgRevoked=false,missingPgLease=false,revokeAfterProgressRead=false}={}){
 const state={active:true,lease:{...lease},credits:new Set(initialCredits),
  commits:0,rollbacks:0,projections:0,failReceipt,revokeOnInsert,
  queries:[],released:0,receiptCount,
  pgLeaseActive:!pgRevoked,missingPgLease,revokeAfterProgressRead,
  bound:unbound===null?null:unbound};
 const receipts=Array.from({length:receiptCount},(_,i)=>({
  receiptId:ids[i]??'worldkill-'+String(i+1).padStart(64,'4'),
  eventSeq:i+1,enemyId:'wolf'+(i+1),
 }));
 const pool={async connect(){
  let pending=null;
  return {async query(sql,params=[]){
   state.queries.push({sql,params});
   const query=sql.replace(/\s+/g,' ').trim();
   if(query.includes('current_user AS role_name'))
    return {rowCount:1,rows:[{
     schema_name:'quest_staging',superuser:'off',bypass_rls:false,
     can_create_role:false,can_create_db:false,replication_role:false,
     schema_create:false,database_create:false,
    }]};
   if(query.includes('information_schema.tables')){
    const rows=roleRows();return {rowCount:rows.length,rows};
   }
   if(query.includes('information_schema.columns')){
    const rows=columnRows();return {rowCount:rows.length,rows};
   }
   if(query.includes('current_setting(\'server_version_num\')')){
    return {rowCount:1,rows:[{schema_name:'quest_staging',
     pg_version:160000,can_select:true,can_mutate:missingRole}]};
   }
   if(query.includes('FROM pg_constraint')){
    return {rowCount:2,rows:[
     {conname:'game3d_private_kill_receipt_binding_key_185',
      contype:'u',convalidated:true},
     {conname:'game3d_quest_kill_credit_bound_receipt_185',
      contype:'f',convalidated:true},
    ]};
   }
   if(query.includes('FROM pg_trigger'))
    return {rowCount:1,rows:[{enabled:'O'}]};
   if(query.startsWith('BEGIN')){
    pending=new Set(state.credits);return{rowCount:0,rows:[]};
   }
   if(query==='ROLLBACK'){
    pending=null;state.rollbacks++;return{rowCount:0,rows:[]};
   }
   if(query==='COMMIT'){
    assert(pending instanceof Set,'commit without BEGIN');
    state.credits=pending;pending=null;state.commits++;
    return {rowCount:0,rows:[]};
   }
   if(sql===GAME3D_RECOVERY_READ_SQL_186){
    assert.deepEqual(params,[scope.ownerId,scope.characterId,
     scope.instanceId,scope.instanceEpoch,scope.mapFingerprint]);
    const rows=receipts.slice(0,17).map(r=>({
     receipt_id:r.receiptId,event_seq:String(r.eventSeq),
     bound_receipt_id:state.bound===r.receiptId?null:r.receiptId,
     bound_nonce:state.lease.leaseNonce,
     action_session_id:lease.actionSessionId,
     server_session_id:lease.serverSessionId,
     source_kind:'15.3-server-committed-18.5-lease',
     reward_authorized:false,
    }));
    return {rowCount:rows.length,rows};
   }
   if(query.includes('FROM game3d_private_world_kill_receipt_152')){
    const r=receipts.find(x=>x.receiptId===params[0]);
    if(state.failReceipt===params[0])throw Error('simulated interruption');
    return {rowCount:r?1:0,rows:r?[{
     receipt_id:r.receiptId,owner_id:scope.ownerId,
     character_id:scope.characterId,instance_id:scope.instanceId,
     instance_epoch:scope.instanceEpoch,
     map_fingerprint:scope.mapFingerprint,event_seq:String(r.eventSeq),
     enemy_id:r.enemyId,enemy_tier:'normal',
     committed_at:'2026-11-03T10:00:00Z',
    }]:[]};
   }
   if(query.includes('FROM game3d_private_world_kill_lease_binding_185')){
    const r=receipts.find(x=>x.receiptId===params[0]);
    return {rowCount:r?1:0,rows:r?[{
     receipt_id:r.receiptId,owner_id:scope.ownerId,
     character_id:scope.characterId,instance_id:scope.instanceId,
     instance_epoch:scope.instanceEpoch,
     map_fingerprint:scope.mapFingerprint,event_seq:String(r.eventSeq),
     server_session_id:lease.serverSessionId,
     action_session_id:lease.actionSessionId,
     lease_nonce:state.lease.leaseNonce,
     source_kind:'15.3-server-committed-18.5-lease',
     reward_authorized:false,
    }]:[]};
   }
   if(query.includes('FROM game3d_private_quest_session_fence_183')){
    if(state.missingPgLease)return {rowCount:0,rows:[]};
    return {rowCount:1,rows:[{
     owner_id:scope.ownerId,character_id:scope.characterId,
     world_instance_id:scope.instanceId,world_epoch:scope.instanceEpoch,
     world_session_id:lease.serverSessionId,
     action_session_id:lease.actionSessionId,
     lease_nonce:state.lease.leaseNonce,active:state.pgLeaseActive,
     not_expired:true,
    }]};
   }
   if(query.includes('FROM game3d_private_quest_objective_binding_152')&&
      query.includes("status='accepted'"))
    return {rowCount:1,rows:[{
     quest_id:questId,objective_id:'patrol_kills',required_count:3,
    }]};
   // The 15.2 read-progress query has a nested kill-credit subquery;
   // match its outer SELECT before the simple COUNT(*) credit query.
   if(query.startsWith('SELECT o.quest_id,o.objective_id')){
    if(state.revokeAfterProgressRead)state.pgLeaseActive=false;
    return {rowCount:1,rows:[{
     quest_id:questId,objective_id:'patrol_kills',objective_type:'kill',
     enemy_tier:null,enemy_id:null,required_count:3,status:'accepted',
     credited:Math.min(3,state.credits.size),
    }]};
   }
   if(query.includes('FROM game3d_private_quest_kill_credit_152')){
    return {rowCount:1,rows:[{n:(pending??state.credits).size}]};
   }
   if(query.startsWith('INSERT INTO game3d_private_quest_kill_credit_152')){
    const existing=(pending??state.credits).has(params[0]);
    if(!existing){
     (pending??state.credits).add(params[0]);state.projections++;
     if(state.revokeOnInsert)state.active=false;
    }
    return {rowCount:existing?0:1,
     rows:existing?[]:[{receipt_id:params[0]}]};
   }
   throw Error('unexpected mocked SQL '+query.slice(0,125));
  },release(){state.released++}};
 }};
 const stage={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   return state.active&&serverRequestContext===context?state.lease:null;
  },
  async resolveQuestTransactionClaim183(request){
   return state.active&&request.ownerId===scope.ownerId&&
    request.characterId===scope.characterId&&
    request.questId===questId&&
    request.sessionId===lease.actionSessionId?state.lease:null;
  },
 };
 const create=()=>createGame3DPrivateQuestRecovery186({
  enabled:true,now:()=>now,
  worldStage180:stage,serverRequestContext:context,
  progressionPool:pool,progressionSchema:'quest_staging',scope,
 });
 return {state,pool,stage,create,receipts};
}
async function staging(fn){
 const previous=process.env.GAME3D_PRIVATE_STAGING_ENV;
 try{process.env.GAME3D_PRIVATE_STAGING_ENV='staging';await fn();}
 finally{
  if(previous===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
  else process.env.GAME3D_PRIVATE_STAGING_ENV=previous;
 }
}
test('18.6 refuses unauthenticated public or browser-supplied recovery',async()=>{
 await assert.rejects(createGame3DPrivateQuestRecovery186(),/18\.6 requires/);
 await staging(async()=>{
  const h=fixture(),r=await h.create();
  assert.equal((await r.recover({ownerId:'attacker186'})).ok,false);
  assert.equal(h.state.credits.size,0);
  assert.equal(r.publicRecoveryRouteInstalled,false);
  assert.equal(r.combatWorldRestored,false);
  assert.equal(r.rewardsIssued,false);
  r.shutdown();
 });
});
test('18.6 replays three sealed committed kills and deduplicates repeated reconciliation',async()=>{
 await staging(async()=>{
  const h=fixture(),r=await h.create();
  const first=await r.recover();
  assert.equal(first.ok,true);
  assert.equal(first.receiptsScanned,3);
  assert.equal(first.newlyCreditedObjectives,3);
  assert.equal(first.progress[0].current,3);
  assert.equal(first.rewardsIssued,false);
  assert.equal(first.resumeCombatAuthorized,false);
  assert.equal(h.state.credits.size,3);
  const again=await r.recover();
  assert.equal(again.ok,true);
  assert.equal(again.newlyCreditedObjectives,0);
  assert.equal(h.state.credits.size,3);
  r.shutdown();
 });
});
test('18.6 process recreation with no in-memory cursor resends only missing credits',async()=>{
 await staging(async()=>{
  const h=fixture({initialCredits:[ids[0]]});
  const first=await h.create();
  const recovered=await first.recover();
  assert.equal(recovered.ok,true);
  assert.equal(recovered.newlyCreditedObjectives,2);
  first.shutdown();
  const replacement=await h.create();
  const rechecked=await replacement.recover();
  assert.equal(rechecked.ok,true);
  assert.equal(rechecked.newlyCreditedObjectives,0);
  assert.equal(h.state.credits.size,3);
  replacement.shutdown();
 });
});
test('18.6 ambiguous interruption after first committed projection safely resumes',async()=>{
 await staging(async()=>{
  const h=fixture({failReceipt:ids[1]}),r=await h.create();
  const failed=await r.recover();
  assert.equal(failed.ok,false);
  assert.equal(h.state.credits.size,1);
  h.state.failReceipt=null;
  const resumed=await r.recover();
  assert.equal(resumed.ok,true);
  assert.equal(resumed.newlyCreditedObjectives,2);
  assert.equal(h.state.credits.size,3);
  r.shutdown();
 });
});
test('18.6 an unbound older receipt stops reconciliation rather than skipping it',async()=>{
 await staging(async()=>{
  const h=fixture({unbound:ids[1]}),r=await h.create();
  const result=await r.recover();
  assert.equal(result.ok,false);
  assert.equal(result.reason,'unbound_or_invalid_committed_receipt');
  assert.equal(h.state.credits.size,0);
  r.shutdown();
 });
});
test('18.6 a re-paired world with a new nonce cannot claim earlier kills',async()=>{
 await staging(async()=>{
  const h=fixture(),r=await h.create();
  h.state.lease={...lease,
   leaseNonce:'28618618-1861-4186-8186-186186186186'};
  const result=await r.recover();
  assert.equal(result.ok,false);
  assert.equal(result.reason,'original_world_session_no_longer_active');
  assert.equal(h.state.credits.size,0);
  r.shutdown();
 });
});
test('18.6 full world loss/restart cannot invent the original 18.3 world session',async()=>{
 await staging(async()=>{
  const h=fixture(),r=await h.create();
  h.state.active=false;
  assert.equal((await r.recover()).ok,false);
  await assert.rejects(h.create(),/original active world admission/);
  assert.equal(h.state.credits.size,0);
  r.shutdown();
 });
});
test('18.6 logout after an INSERT rolls its credit transaction back',async()=>{
 await staging(async()=>{
  const h=fixture({revokeOnInsert:true}),r=await h.create();
  const denied=await r.recover();
  assert.equal(denied.ok,false);
  assert.equal(h.state.credits.size,0);
  assert(h.state.rollbacks>=1);
  r.shutdown();
 });
});
test('18.6 excess committed receipts or privilege drift fail closed',async()=>{
 await staging(async()=>{
  const over=fixture({receiptCount:17}),a=await over.create();
  assert.equal((await a.recover()).reason,'unbound_or_invalid_committed_receipt');
  assert.equal(over.state.credits.size,0);
  a.shutdown();
  const invalid=fixture({missingRole:true});
  await assert.rejects(invalid.create(),/immutable_binding_not_select_only/);
 });
});
test('18.6 simultaneous duplicate recovery attempts are serialized and credit once',async()=>{
 await staging(async()=>{
  const h=fixture(),r=await h.create();
  const [a,b]=await Promise.all([r.recover(),r.recover()]);
  assert.equal(a.ok,true);assert.equal(b.ok,true);
  assert.equal(a.newlyCreditedObjectives,3);
  assert.equal(b.newlyCreditedObjectives,0);
  assert.equal(h.state.credits.size,3);
  r.shutdown();
  assert.equal((await r.recover()).ok,false);
 });
});

test('18.6 zero committed kills still require an active independent PG lease',async()=>{
 await staging(async()=>{
  const good=fixture({receiptCount:0}),a=await good.create();
  const empty=await a.recover();
  assert.equal(empty.ok,true);
  assert.equal(empty.receiptsScanned,0);
  assert.equal(empty.progress[0].current,0);
  assert.equal(empty.rewardsIssued,false);
  a.shutdown();
  for(const options of [{receiptCount:0,pgRevoked:true},
    {receiptCount:0,missingPgLease:true}]){
   const invalid=fixture(options),b=await invalid.create();
   const denied=await b.recover();
   assert.equal(denied.ok,false);
   assert.equal(denied.reason,'independent_database_session_lease_unverified');
   assert.equal(invalid.state.credits.size,0);
   b.shutdown();
  }
 });
});
test('18.6 independent PG revocation during read-only progress denies success',async()=>{
 await staging(async()=>{
  const h=fixture({receiptCount:0,revokeAfterProgressRead:true});
  const service=await h.create();
  const denied=await service.recover();
  assert.equal(denied.ok,false);
  assert.equal(denied.reason,'independent_database_session_lease_changed');
  assert.equal(h.state.credits.size,0);
  assert.equal(h.state.pgLeaseActive,false);
  service.shutdown();
 });
});
test('18.6 anonymous character identities cannot begin recovery',async()=>{
 await staging(async()=>{
  const h=fixture();
  await assert.rejects(createGame3DPrivateQuestRecovery186({
   enabled:true,now:()=>now,worldStage180:h.stage,
   serverRequestContext:context,
   scope:{...scope,characterId:'__anon__'},
   progressionPool:h.pool,progressionSchema:'quest_staging',
  }),/18\.6 requires/);
  assert.equal(h.state.credits.size,0);
 });
});
