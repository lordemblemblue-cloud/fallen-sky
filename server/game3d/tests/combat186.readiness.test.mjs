import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGame3DPrivateQuestRecoveryReadiness186}
 from '../privateQuestRecoveryReadiness186.mjs';

const schema='quest_staging';
const tables=[
 'game3d_trusted_character','game3d_private_world_kill_receipt_152',
 'game3d_private_quest_objective_binding_152',
 'game3d_private_quest_kill_credit_152',
 'game3d_private_quest_acceptance_154','game3d_private_quest_turnin_156',
 'game3d_private_quest_session_fence_183',
 'game3d_private_world_kill_lease_binding_185',
];
const inserts={
 game3d_private_quest_kill_credit_152:[
  'receipt_id','owner_id','character_id','quest_id',
  'objective_id','reward_authorized',
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
function harness({mutation=false,missingFK=false,disabledTrigger=false,
 privilege=false,outage=false}={}){
 let released=0;
 const pool={async connect(){return {
  async query(sql){
   if(outage&&sql.includes('FROM pg_constraint'))
    throw Error('staging PostgreSQL unavailable');
   if(sql.includes('current_user AS role_name'))
    return {rowCount:1,rows:[{
     schema_name:schema,superuser:privilege?'on':'off',
     bypass_rls:false,can_create_role:false,can_create_db:false,
     replication_role:false,schema_create:false,database_create:false,
    }]};
   if(sql.includes('information_schema.tables')){
    const rows=tables.map(table_name=>({
     table_name,can_select:true,dangerous:false,
    }));
    return {rowCount:rows.length,rows};
   }
   if(sql.includes('information_schema.columns')){
    const rows=tables.flatMap(table_name=>[
     ...new Set(['owner_id','character_id',
      ...(inserts[table_name]||[]),
      ...(updates[table_name]||[])])
    ].map(column_name=>({
     table_name,column_name,
     can_update:(updates[table_name]||[]).includes(column_name),
     can_insert:(inserts[table_name]||[]).includes(column_name),
    })));
    return {rowCount:rows.length,rows};
   }
   if(sql.includes("current_setting('server_version_num')"))
    return {rowCount:1,rows:[{schema_name:schema,pg_version:160000,
     can_select:true,can_mutate:mutation}]};
   if(sql.includes('FROM pg_constraint')){
    const rows=[
     {conname:'game3d_private_kill_receipt_binding_key_185',
      contype:'u',convalidated:true},
     {conname:'game3d_quest_kill_credit_bound_receipt_185',
      contype:'f',convalidated:true},
    ].slice(0,missingFK?1:2);
    return {rowCount:rows.length,rows};
   }
   if(sql.includes('FROM pg_trigger'))
    return disabledTrigger?{rowCount:1,rows:[{enabled:'D'}]}:
     {rowCount:1,rows:[{enabled:'O'}]};
   throw Error('unexpected metadata SQL');
  },release(){released++},
 }}};
 return {pool,get released(){return released}};
}
const ready=h=>assertGame3DPrivateQuestRecoveryReadiness186({
 pool:h.pool,schema,
});
test('18.6 restricted select-only recovery PG role with immutable receipt FK passes',async()=>{
 const h=harness(),result=await ready(h);
 assert.equal(result.ok,true);
 assert.equal(result.immutableReceiptsVerified,true);
 assert.equal(result.restrictedProjectionOnly,true);
 assert.equal(result.rewardsIssued,false);
 assert.equal(h.released,2);
});
test('18.6 rejects even a single binding write privilege',async()=>{
 const h=harness({mutation:true});
 await assert.rejects(ready(h),/immutable_binding_not_select_only/);
 assert.equal(h.released,2);
});
test('18.6 rejects missing credit-to-binding FK and disabled immutable trigger',async()=>{
 for(const args of [
  {missingFK:true},{disabledTrigger:true},
 ]){
  const h=harness(args);
  await assert.rejects(ready(h),/receipt_binding_integrity_not_validated|immutable_binding_trigger_missing/);
  assert.equal(h.released,2);
 }
});
test('18.6 cannot run as a superuser or economy writer',async()=>{
 const h=harness({privilege:true});
 await assert.rejects(ready(h),/privileged_progression_writer/);
 assert.equal(h.released,1);
});
test('18.6 PostgreSQL metadata outage fails closed and releases connections',async()=>{
 const h=harness({outage:true});
 await assert.rejects(ready(h),/read_only_pg_integrity_unavailable/);
 assert.equal(h.released,2);
});
