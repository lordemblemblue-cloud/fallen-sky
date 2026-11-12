import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGame3DPrivateQuestProgressionReadiness184}
 from '../privateQuestProgressionReadiness184.mjs';

const schema='quest_staging';
const tables=[
 'game3d_trusted_character','game3d_private_world_kill_receipt_152',
 'game3d_private_quest_objective_binding_152',
 'game3d_private_quest_kill_credit_152',
 'game3d_private_quest_acceptance_154','game3d_private_quest_turnin_156',
 'game3d_private_quest_session_fence_183',
];
const inserted={
 game3d_private_quest_kill_credit_152:[
  'receipt_id','owner_id','character_id','quest_id','objective_id',
  'reward_authorized',
 ],
 game3d_private_quest_turnin_156:[
  'owner_id','character_id','quest_id','catalog_revision',
  'source_kind','rewards_issued',
 ],
};
const updated={
 game3d_trusted_character:['action_row_lock_176'],
 game3d_private_quest_objective_binding_152:['status','updated_at'],
 game3d_private_quest_acceptance_154:[
  'status','updated_at','action_row_lock_176',
 ],
 game3d_private_quest_session_fence_183:['action_row_lock_183'],
};
const goodTables=()=>tables.map(table_name=>({
 table_name,can_select:true,dangerous:false,
}));
const goodColumns=()=>tables.flatMap(table_name=>[
 ...new Set(['owner_id','character_id',
  ...(inserted[table_name]||[]),...(updated[table_name]||[])])
].map(column_name=>({
 table_name,column_name,can_update:updated[table_name]?.includes(column_name)??false,
 can_insert:inserted[table_name]?.includes(column_name)??false,
})));
const goodRole=()=>({
 role_name:'private_quest_progression_184',schema_name:schema,
 superuser:'off',bypass_rls:false,can_create_role:false,
 can_create_db:false,replication_role:false,
 schema_create:false,database_create:false,
});
function fixture({role=goodRole(),tableRows=goodTables(),
 columnRows=goodColumns(),failure=false}={}) {
 let queries=0,released=0;
 const pool={async connect(){
  if(failure==='connect')throw Error('database unavailable');
  return {async query(sql,params){
   queries++;
   if(failure==='query')throw Error('PG query failure');
   if(sql.includes('current_user AS role_name'))
    return {rowCount:1,rows:[role]};
   if(sql.includes('information_schema.tables')){
    assert.deepEqual(params,[schema]);
    return {rowCount:tableRows.length,rows:tableRows};
   }
   if(sql.includes('information_schema.columns')){
    assert.deepEqual(params,[schema]);
    return {rowCount:columnRows.length,rows:columnRows};
   }
   throw Error('unexpected readiness SQL');
  },release(){released++}};
 }};
 return {pool,get queries(){return queries},get released(){return released}};
}
const verify=h=>assertGame3DPrivateQuestProgressionReadiness184({
 pool:h.pool,schema,
});
test('18.4 restricted writer with only progress/turn-in columns passes readiness',async()=>{
 const h=fixture(),result=await verify(h);
 assert.equal(result.ok,true);
 assert.equal(result.noEconomyWrites,true);
 assert.equal(result.productionReady,false);
 assert.equal(h.queries,3);
 assert.equal(h.released,1);
});
test('18.4 refuses privileged roles and unsafe schema',async()=>{
 for(const rolePatch of [{superuser:'on'},{bypass_rls:true},
  {can_create_role:true},{can_create_db:true},
  {replication_role:true},{schema_create:true},
  {database_create:true},{schema_name:'public'}]){
  const h=fixture({role:{...goodRole(),...rolePatch}});
  await assert.rejects(verify(h),/privileged_progression_writer/);
  assert.equal(h.released,1);
 }
 await assert.rejects(assertGame3DPrivateQuestProgressionReadiness184({
  pool:fixture().pool,schema:'public-unsafe',
 }),/dedicated_schema_required/);
});
test('18.4 refuses missing ledger tables or mutating/delete grants',async()=>{
 for(const rows of [
  goodTables().filter(x=>x.table_name!=='game3d_private_quest_turnin_156'),
  goodTables().map(x=>x.table_name==='game3d_private_world_kill_receipt_152'?
   {...x,dangerous:true}:x),
  goodTables().map(x=>x.table_name==='game3d_private_quest_session_fence_183'?
   {...x,can_select:false}:x),
 ]){
  const h=fixture({tableRows:rows});
  await assert.rejects(verify(h),/missing_table_or_unsafe_grants/);
 }
});
test('18.4 refuses economy writes and reward or immutable receipt manipulation',async()=>{
 for(const extra of [
  {table_name:'game3d_trusted_character',column_name:'xp_total',can_update:true,can_insert:false},
  {table_name:'game3d_private_world_kill_receipt_152',column_name:'enemy_tier',can_update:true,can_insert:false},
  {table_name:'game3d_private_quest_turnin_156',column_name:'rewards_issued',can_update:true,can_insert:true},
  {table_name:'game3d_wallet',column_name:'balance',can_update:true,can_insert:true},
 ]){
  const h=fixture({columnRows:[...goodColumns(),extra]});
  await assert.rejects(verify(h),/unexpected_progression_write_privilege/);
 }
});
test('18.4 refuses missing required row lock and journal insert privileges',async()=>{
 for(const missing of [
  {table:'game3d_trusted_character',column:'action_row_lock_176',kind:'can_update'},
  {table:'game3d_private_quest_session_fence_183',column:'action_row_lock_183',kind:'can_update'},
  {table:'game3d_private_quest_turnin_156',column:'owner_id',kind:'can_insert'},
 ]){
  const h=fixture({columnRows:goodColumns().map(x=>
   x.table_name===missing.table&&x.column_name===missing.column?
    {...x,[missing.kind]:false}:x)});
  await assert.rejects(verify(h),/required_progression_column_privilege_missing/);
 }
});
test('18.4 PG connection and query errors fail closed',async()=>{
 const a=fixture({failure:'connect'});
 await assert.rejects(verify(a),/progression_database_unavailable/);
 assert.equal(a.released,0);
 const b=fixture({failure:'query'});
 await assert.rejects(verify(b),/progression_database_unavailable/);
 assert.equal(b.released,1);
});
