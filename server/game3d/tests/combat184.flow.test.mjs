import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateCombatQuestFlow184}
 from '../privateCombatQuestFlow184.mjs';

const at=1793668000000;
const scope={ownerId:'owner184',characterId:'hero184',
 instanceId:'instance-184',instanceEpoch:'epoch-184',
 holderId:'holder-184',mapFingerprint:'f'.repeat(64)};
const context=Object.freeze({backend:'trusted-session-184'});
const cols=['owner_id','character_id','world_instance_id','world_epoch',
 'world_session_id','action_session_id','lease_nonce','active','expires_at',
 'revoked_at','action_row_lock_183'].map(column_name=>({
 column_name,is_generated:column_name==='action_row_lock_183'?'ALWAYS':'NEVER',
 data_type:column_name==='action_row_lock_183'?'smallint':'text',
 can_update:column_name==='action_row_lock_183',
}));
function pool(role,database='test_database_184'){
 const calls=[];
 return {
  calls,
  async connect(){
   const db={async query(sql){
    const text=sql.trim().replace(/\s+/g,' ');
    calls.push(text);
    if(text.includes('information_schema.columns'))
     return {rowCount:cols.length,rows:cols};
    if(text.includes('has_table_privilege'))
     return {rowCount:1,rows:[{schema_name:'quest_staging',
      superuser:'off',can_select:true,dangerous:false,table_update:false}]};
    if(text.includes('current_database() AS database_name'))
     return {rowCount:1,rows:[{database_name:database,
      schema_name:'quest_staging',login_role:role}]};
    if(text.includes('FROM game3d_private_quest_objective_binding_152 o'))
     return {rowCount:0,rows:[]};
    if(text.startsWith('BEGIN')||text==='ROLLBACK')
     return {rowCount:0,rows:[]};
    throw Error('Unexpected SQL in flow test: '+text);
   },release(){calls.push('RELEASE')}};
   return db;
  }
 };
}
let active=true;
const lease=()=>({
 ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 serverSessionId:'world-session-184',
 actionSessionId:'qb174-'+'a'.repeat(64),
 leaseNonce:'11111111-1111-4111-8111-111111111111',
 expiresAtMs:at+20000,
});
const worldStage180={version:'18.0',privateServerOnly:true,
 publicPlayerRouteInstalled:false,publicQuestActionWriterInstalled:false,
 async resolveCurrentWorldLease183({serverRequestContext}){
  return active&&serverRequestContext===context?lease():null;
 }};
const owner={version:'13.8',privateServerOnly:true,
 instanceId:scope.instanceId,fencingToken:1,
 async advance(){return {ok:false}},
 async release(){return true},
 async connect(){return {ok:false}},
 async setInput(){return {ok:false}},
 async submit(){return {ok:false}},
 async poll(){return {ok:false}},
 async disconnect(){return {ok:false}},
};
const encounter={version:'13.6',privateServerOnly:true,
 instanceId:scope.instanceId,mapFingerprint:scope.mapFingerprint,
 snapshot:()=>({instanceId:scope.instanceId,eventSeq:0,
  rewardsIssued:false,productionReady:false}),
 getEventsAfter:()=>[],
};
const make=async(extra={})=>{
 const prior=process.env.GAME3D_PRIVATE_STAGING_ENV;
 try{
  process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
  return await createGame3DPrivateCombatQuestFlow184({
   worldStage180,serverRequestContext:context,scope,owner,encounter,
   schedulerPool:pool('kill_worker_184'),turnInPool:pool('quest_turnin_184'),
   writerSchema:'quest_staging',authorizeServerOperation:async()=>true,
   now:()=>at,enabled:true,...extra,
  });
 }finally{
  if(prior===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
  else process.env.GAME3D_PRIVATE_STAGING_ENV=prior;
 }
};
test('18.4 private composer fails closed without explicit staging authority',async()=>{
 await assert.rejects(createGame3DPrivateCombatQuestFlow184(),/18\.4 requires/);
});
test('18.4 refuses same PG login and different PostgreSQL database for quest writers',async()=>{
 const same=pool('world_writer_184');
 await assert.rejects(make({schedulerPool:same,turnInPool:same}),/18\.4 requires/);
 await assert.rejects(make({
  schedulerPool:pool('kill_worker_184','database_a'),
  turnInPool:pool('turnin_worker_184','database_b'),
 }),/18\.4 requires separate restricted/);
 await assert.rejects(make({
  schedulerPool:pool('same_login_184'),
  turnInPool:pool('same_login_184'),
 }),/18\.4 requires separate restricted/);
});
test('18.4 server-only facade reads the existing objective journal without reward routes',async()=>{
 const result=await make();
 try{
  assert.equal(result.version,'18.4');
  assert.equal(result.publicRouteInstalled,false);
  assert.equal(result.browserKillInputsAccepted,false);
  assert.equal(result.questRewardWriterEnabled,false);
  const progress=await result.readProgress();
  assert.equal(progress.ok,true);
  assert.deepEqual(progress.objectives,[]);
  assert.equal(progress.rewardAuthorized,false);
  assert.equal((await result.turnInStarter({
   questId:'axe_q_first_patrol',claimGold:1
  })).ok,false);
  assert.equal((await result.creditEcho({
   questId:'echo_ch_14_first_echo',receiptId:'fake-184-001',
   kind:'kill',clientKillCount:200
  })).ok,false);
  assert.equal((await result.turnInEcho({questId:'unknown'})).ok,false);
 }finally{assert.equal((await result.shutdown()).ok,true)}
});
test('18.4 logout or stage shutdown prevents private progress reads and quest turn-in',async()=>{
 const result=await make();
 active=false;
 try{
  assert.equal((await result.readProgress()).reason,
   'private_world_session_unverified');
  assert.equal((await result.turnInStarter({questId:'axe_q_first_patrol'})).ok,false);
 }finally{
  active=true;
  await result.shutdown();
 }
});
