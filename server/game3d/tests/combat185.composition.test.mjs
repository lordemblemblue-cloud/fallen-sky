import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestProgression185}
 from '../privateQuestProgression185.mjs';

const at=1793668000000,context=Object.freeze({world:'185-private'});
const scope=Object.freeze({ownerId:'owner185',characterId:'hero185',
 instanceId:'instance-185-private',instanceEpoch:'epoch-185-private',
 holderId:'holder-185-private',mapFingerprint:'a'.repeat(64)});
const lease=Object.freeze({
 ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 serverSessionId:'world-session-185',
 actionSessionId:'qb174-'+'c'.repeat(64),
 leaseNonce:'18518518-1851-4185-8185-185185185185',
 expiresAtMs:at+20000,
});
const tables=[
 'game3d_trusted_character','game3d_private_world_kill_receipt_152',
 'game3d_private_world_kill_lease_binding_185',
 'game3d_private_quest_kill_credit_152',
 'game3d_private_quest_turnin_156',
 'game3d_private_quest_objective_binding_152',
 'game3d_private_quest_acceptance_154',
 'game3d_private_quest_session_fence_183',
];
const allowedInserts={
 game3d_private_quest_kill_credit_152:[
  'receipt_id','owner_id','character_id','quest_id',
  'objective_id','reward_authorized',
 ],
 game3d_private_quest_turnin_156:[
  'owner_id','character_id','quest_id','catalog_revision',
  'source_kind','rewards_issued',
 ],
};
const allowedUpdates={
 game3d_trusted_character:['action_row_lock_176'],
 game3d_private_quest_objective_binding_152:['status','updated_at'],
 game3d_private_quest_acceptance_154:[
  'status','updated_at','action_row_lock_176',
 ],
 game3d_private_quest_session_fence_183:['action_row_lock_183'],
};
function fixture({invalidWriter=false}={}){
 const counts={writerReleased:0,progressReleased:0};
 const dbPool=writer=>({async connect(){
  return {
   async query(sql){
    if(sql.includes('current_user AS role_name')){
     if(sql.includes('AS db_name')){
      return {rowCount:1,rows:[{
       role_name:writer?'private_world_kill_185':'private_progress_184',
       db_name:'game3d_disposable',schema_name:'quest_staging',
       server_addr:'127.0.0.1',server_port:5432,pg_version:160000,
       superuser:'off',bypass_rls:false,create_role:false,
       create_db:false,replication:false,
       database_create:false,schema_create:false,
      }]};
     }
     return {rowCount:1,rows:[{
      role_name:'private_progress_184',schema_name:'quest_staging',
      superuser:'off',bypass_rls:false,
      can_create_role:false,can_create_db:false,
      replication_role:false,schema_create:false,database_create:false,
     }]};
    }
    if(sql.includes('information_schema.tables')){
     return {rowCount:tables.length,rows:tables.map(table_name=>({
      table_name,can_select:true,dangerous:false,can_update:false,
      can_insert:writer&&[
       'game3d_private_world_kill_receipt_152',
       'game3d_private_world_kill_lease_binding_185',
      ].includes(table_name)&&!invalidWriter,
     }))};
    }
    if(sql.includes('information_schema.columns')){
     const rows=tables.flatMap(table_name=>[
      ...new Set(['owner_id','character_id',
       ...(allowedInserts[table_name]||[]),
       ...(allowedUpdates[table_name]||[])])
     ].map(column_name=>({
      table_name,column_name,
      can_update:(allowedUpdates[table_name]||[]).includes(column_name),
      can_insert:(allowedInserts[table_name]||[]).includes(column_name),
     })));
     return {rowCount:rows.length,rows};
    }
    if(sql.includes('FROM pg_constraint'))
     return {rowCount:2,rows:[
      {conname:'game3d_private_kill_receipt_binding_key_185',
       contype:'u',convalidated:true},
      {conname:'game3d_quest_kill_credit_bound_receipt_185',
       contype:'f',convalidated:true},
     ]};
    if(sql.includes('FROM pg_trigger'))
     return {rowCount:1,rows:[{enabled:'O'}]};
    throw Error('unexpected mock PG query: '+sql.trim().slice(0,100));
   },
   release(){
    if(writer)counts.writerReleased++;else counts.progressReleased++;
   },
  };
 }});
 const encounter={
  version:'13.6',privateServerOnly:true,instanceId:scope.instanceId,
  mapFingerprint:scope.mapFingerprint,mapId:'wolfveil-v1',
  worldOrigin:{x:0,z:0},
  snapshot:()=>({instanceId:scope.instanceId,eventSeq:0,
   rewardsIssued:false,productionReady:false}),
  getEventsAfter:()=>[],
 };
 const worldStage180={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  resolveCurrentWorldLease183:async({serverRequestContext})=>
   serverRequestContext===context?lease:null,
  resolveQuestTransactionClaim183:async()=>lease,
  verifyWorldActionSession:async()=>true,
  questActionWorldHost177:{
   consumeServerNpcInteraction:async()=>null,
   readServerWorldSnapshot:async()=>null,
   verifyServerLineOfSight:async()=>null,
  },
 };
 return {counts,worldKillPool:dbPool(true),
  progressionPool:dbPool(false),encounter,worldStage180};
}
const args=h=>({
 enabled:true,worldStage180:h.worldStage180,
 serverRequestContext:context,encounter:h.encounter,
 scope,fencingToken:7,
 worldKillPool:h.worldKillPool,progressionPool:h.progressionPool,
 progressionSchema:'quest_staging',
 authorizeServerOperation:async()=>false,
 resolveTrustedCommittedKill:async()=>null,now:()=>at,
});
async function staging(fn){
 const prior=process.env.GAME3D_PRIVATE_STAGING_ENV;
 try{process.env.GAME3D_PRIVATE_STAGING_ENV='staging';await fn();}
 finally{
  if(prior===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
  else process.env.GAME3D_PRIVATE_STAGING_ENV=prior;
 }
}
test('18.5 cannot construct source integration without private auth and separate roles',async()=>{
 await assert.rejects(createGame3DPrivateQuestProgression185(),
  /18\.5 requires/);
 await staging(async()=>{
  const h=fixture();
  await assert.rejects(createGame3DPrivateQuestProgression185({
   ...args(h),progressionPool:h.worldKillPool,
  }),/separate_backend_pools_required/);
 });
});
test('18.5 composes original 15.3 writer and 18.4 progression without public route',async()=>{
 await staging(async()=>{
  const h=fixture(),service=await createGame3DPrivateQuestProgression185(args(h));
  assert.equal(service.version,'18.5');
  assert.equal(service.privateServerOnly,true);
  assert.equal(service.publicPlayerRouteInstalled,false);
  assert.equal(service.independentCombatWriterCreated,false);
  assert.equal(service.rewardWriterInstalled,false);
  assert.equal(service.productionReady,false);
  assert.equal(typeof service.commitWorldKills,'function');
  assert.equal(typeof service.readProgress,'function');
  assert.equal(typeof service.projectCommittedKill,'function');
  assert.equal(typeof service.turnInQuest,'function');
  assert.equal(typeof service.grantXP,'undefined');
  assert.equal(typeof service.grantItem,'undefined');
  assert.equal(h.counts.writerReleased,1);
  assert.equal(h.counts.progressReleased,2);
  service.shutdown();
  const stopped=await service.commitWorldKills();
  assert.equal(stopped.ok,false);
  assert.equal(stopped.reason,'quest_world_185_stopped');
 });
});
test('18.5 refuses unsafe world-kill writer before creating 15.3 authority',async()=>{
 await staging(async()=>{
  const h=fixture({invalidWriter:true});
  await assert.rejects(createGame3DPrivateQuestProgression185(args(h)),
   /kill_writer_grants_invalid/);
  assert.equal(h.counts.writerReleased,1);
  assert.equal(h.counts.progressReleased,1);
 });
});
