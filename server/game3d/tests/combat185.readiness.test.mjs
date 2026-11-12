import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGame3DPrivateKillLeaseReadiness185}
 from '../privateKillLeaseReadiness185.mjs';

const schema='quest_staging';
const tableNames=[
 'game3d_private_world_kill_receipt_152',
 'game3d_private_world_kill_lease_binding_185',
 'game3d_private_quest_kill_credit_152',
 'game3d_private_quest_turnin_156',
 'game3d_trusted_character',
];
const privilegeRows=writer=>tableNames.map(table_name=>({
 table_name,can_select:true,dangerous:false,can_update:false,
 can_insert:writer&&[
  'game3d_private_world_kill_receipt_152',
  'game3d_private_world_kill_lease_binding_185',
 ].includes(table_name),
}));
const principal=writer=>({
 role_name:writer?'private_kill_commit_153':'private_quest_credit_184',
 db_name:'private_game3d_185',schema_name:schema,
 server_addr:'127.0.0.1',server_port:5432,pg_version:160000,
 superuser:'off',bypass_rls:false,create_role:false,create_db:false,
 replication:false,database_create:false,schema_create:false,
});
const constraints=()=>[
 {conname:'game3d_private_kill_receipt_binding_key_185',
  contype:'u',convalidated:true},
 {conname:'game3d_quest_kill_credit_bound_receipt_185',
  contype:'f',convalidated:true},
];
function fixture({writerPatch={},readerPatch={},writerRights=null,
 readerRights=null,foreignKey=true,trigger=true,fail=false}={}){
 let released=0;
 const mk=writer=>({async connect(){
  if(fail&&writer)throw Error('private PG not reachable');
  return {async query(sql,params){
   if(sql.includes('current_user AS role_name'))
    return {rowCount:1,rows:[{
     ...principal(writer),...(writer?writerPatch:readerPatch),
    }]};
   if(sql.includes('information_schema.tables')){
    assert.deepEqual(params,[schema]);
    const rows=writer?(writerRights??privilegeRows(true)):
     (readerRights??privilegeRows(false));
    return {rowCount:rows.length,rows};
   }
   if(sql.includes('FROM pg_constraint')){
    assert.deepEqual(params,[schema]);
    const rows=foreignKey?constraints():constraints().slice(0,1);
    return {rowCount:rows.length,rows};
   }
   if(sql.includes('FROM pg_trigger')){
    assert.deepEqual(params,[schema]);
    return trigger?{rowCount:1,rows:[{enabled:'O'}]}:
     {rowCount:0,rows:[]};
   }
   throw Error('unexpected read-only PG metadata query');
  },release(){released++}};
 }});
 const writerPool=mk(true),progressionPool=mk(false);
 return {writerPool,progressionPool,get released(){return released}};
}
const run=h=>assertGame3DPrivateKillLeaseReadiness185({
 worldKillPool:h.writerPool,progressionPool:h.progressionPool,schema,
});
test('18.5 two distinct restricted PG16 roles and validated immutable binding pass startup',async()=>{
 const h=fixture();
 const result=await run(h);
 assert.equal(result.ok,true);
 assert.equal(result.independentWriterRole,true);
 assert.equal(result.killBindingImmutabilityVerified,true);
 assert.equal(result.creditFkVerified,true);
 assert.equal(result.productionReady,false);
 assert.equal(h.released,2);
});
test('18.5 rejects writer and projector sharing a PG pool or same current_user',async()=>{
 const h=fixture();
 await assert.rejects(assertGame3DPrivateKillLeaseReadiness185({
  worldKillPool:h.writerPool,progressionPool:h.writerPool,schema,
 }),/separate_backend_pools_required/);
 const same=fixture({readerPatch:{
  role_name:'private_kill_commit_153',
 }});
 await assert.rejects(run(same),/independent_writer_or_shared_pg_unverified/);
});
test('18.5 different database, server address or elevated database role is denied',async()=>{
 for(const patch of [
  {db_name:'unrelated_pg'}, {server_addr:'10.0.0.4'},
  {pg_version:150000},{superuser:'on'},{bypass_rls:true},
  {create_role:true},{create_db:true},{replication:true},
  {database_create:true},{schema_create:true},
 ]){
  const h=fixture({writerPatch:patch});
  await assert.rejects(run(h),
   /privileged_or_wrong_postgresql_server|independent_writer_or_shared_pg_unverified/);
  assert.equal(h.released,2);
 }
});
test('18.5 committed kill issuer can never credit quests or turn in from its role',async()=>{
 const wrong=privilegeRows(true).map(row=>
  row.table_name==='game3d_private_quest_kill_credit_152'?
   {...row,can_insert:true}:row);
 await assert.rejects(run(fixture({writerRights:wrong})),
  /kill_writer_has_gameplay_mutation_grants/);
 const elevated=privilegeRows(true).map(row=>
  row.table_name==='game3d_private_world_kill_receipt_152'?
   {...row,can_update:true}:row);
 await assert.rejects(run(fixture({writerRights:elevated})),
  /kill_writer_grants_invalid/);
});
test('18.5 progression writer cannot INSERT kill receipts or mutate binding',async()=>{
 for(const patch of [
  {table_name:'game3d_private_world_kill_lease_binding_185',
   can_insert:true},
  {table_name:'game3d_private_world_kill_receipt_152',
   can_update:true},
 ]){
  const rows=privilegeRows(false).map(row=>
   row.table_name===patch.table_name?{...row,...patch}:row);
  await assert.rejects(run(fixture({readerRights:rows})),
   /kill_writer_grants_invalid/);
 }
});
test('18.5 missing validated credit FK or immutable binding trigger blocks startup',async()=>{
 await assert.rejects(run(fixture({foreignKey:false})),
  /binding_composite_key_or_credit_fk_missing/);
 await assert.rejects(run(fixture({trigger:false})),
  /binding_immutability_trigger_missing/);
});
test('18.5 PG connection outage fails closed and releases acquired clients',async()=>{
 const h=fixture({fail:true});
 await assert.rejects(run(h),/kill_binding_database_unavailable/);
 assert.equal(h.released,0);
});
