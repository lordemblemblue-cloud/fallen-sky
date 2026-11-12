import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGame3DQuestActionDatabaseReadiness174,
 QUEST_ACTION_INSERT_TABLES_174,QUEST_ACTION_READ_TABLES_174,
 QUEST_ACTION_LOCK_TABLES_176}
 from '../privateQuestActionReadiness174.mjs';
const schema='qa_174';
const allTables=[...new Set([...QUEST_ACTION_INSERT_TABLES_174,
 ...QUEST_ACTION_READ_TABLES_174])];
const createPool=(override={})=>({connect:async()=>({release(){},
 async query(sql,args=[]){
  if(override.fail)throw Error('connection lost');
  if(sql.includes('current_schema() AS'))return {rowCount:1,rows:[{
   schema_name:override.schema||schema,superuser:override.superuser||'off',
   schema_create:!!override.schemaCreate,db_create:!!override.dbCreate
  }]};
  if(sql.includes('FROM pg_roles'))return {rowCount:1,rows:[{
   rolsuper:false,rolcreatedb:false,rolcreaterole:false,
   rolreplication:false,rolbypassrls:!!override.bypassrls
  }]};
  if(sql.includes('information_schema.columns')){
   const rows=allTables.filter(x=>x!==override.missingTable).flatMap(t=>[
    {table_name:t,column_name:'owner_id',can_update:!!override.allUpdates,
     is_generated:'NEVER',data_type:'text'},
    {table_name:t,column_name:'status',can_update:
      t==='game3d_private_rival_invitation_164'&&!override.missingStatusUpdate,
      is_generated:'NEVER',data_type:'text'},
    {table_name:t,column_name:'updated_at',can_update:
      t==='game3d_private_rival_invitation_164'&&!override.missingStatusUpdate,
      is_generated:'NEVER',data_type:'timestamp with time zone'},
    ...(QUEST_ACTION_LOCK_TABLES_176.includes(t)&&
        t!==override.missingLockMarker?[{
      table_name:t,column_name:'action_row_lock_176',
      can_update:!override.missingLockUpdate,
      is_generated:override.editableMarker?'NEVER':'ALWAYS',
      data_type:override.wrongMarkerType?'integer':'smallint'
    }]:[])
   ]);
   if(override.extraTable)rows.push({table_name:'unexpected_private_table',
    column_name:'id',can_update:false});
   return {rowCount:rows.length,rows};
  }
  if(sql.includes("'SELECT') AS can_select")){
   const table=args[0].split('.').at(-1);
   const can_insert=QUEST_ACTION_INSERT_TABLES_174.includes(table);
   return {rowCount:1,rows:[{
    can_select:!override.missingSelect,
    can_insert:override.extraInsert?true:
      override.missingInsert?!can_insert:can_insert,
    table_update:!!override.tableUpdate,dangerous:!!override.dangerous
   }]};
  }
  if(sql.includes("'status','UPDATE') AS status"))
   return {rowCount:1,rows:[{status:!override.missingStatusUpdate,
    updated:!override.missingStatusUpdate}]};
  throw Error('unexpected SQL in test');
 }} )});
test('17.4 separate minimal writer grants pass when complete',async()=>{
 const result=await assertGame3DQuestActionDatabaseReadiness174({pool:createPool(),schema});
 assert.equal(result.ok,true);assert.equal(result.roleRestricted,true);
 assert.equal(result.noRewardWriter,true);assert.equal(result.productionReady,false);
 assert.equal(result.safeGeneratedLockColumns,true);
 assert.equal(result.version,'17.6');
});
test('17.4 requires explicit PostgreSQL role and canonical schema',async()=>{
 await assert.rejects(assertGame3DQuestActionDatabaseReadiness174({}),/writer_required/);
 await assert.rejects(assertGame3DQuestActionDatabaseReadiness174({
  pool:createPool(),schema:'Bad-Name'}),/writer_required/);
});
test('17.4 refuses postgres superuser and CREATE privileges',async()=>{
 for(const options of [{superuser:'on'},{schemaCreate:true},{dbCreate:true}])
  await assert.rejects(assertGame3DQuestActionDatabaseReadiness174({
   pool:createPool(options),schema}),/role_or_schema_privileged/);
});
test('17.4 refuses changed schema and BYPASSRLS',async()=>{
 await assert.rejects(assertGame3DQuestActionDatabaseReadiness174({
  pool:createPool({schema:'other'}),schema}),/role_or_schema_privileged/);
 await assert.rejects(assertGame3DQuestActionDatabaseReadiness174({
  pool:createPool({bypassrls:true}),schema}),/privileged_postgres_role/);
});
test('17.4 refuses unexpected character XP / quest UPDATE grants',async()=>{
 for(const options of [{allUpdates:true},{tableUpdate:true}])
  await assert.rejects(assertGame3DQuestActionDatabaseReadiness174({
   pool:createPool(options),schema}),/unexpected_(update_column|table_privileges)/);
});
test('17.4 refuses DELETE, TRUNCATE, REFERENCES or TRIGGER grants',async()=>{
 await assert.rejects(assertGame3DQuestActionDatabaseReadiness174({
  pool:createPool({dangerous:true}),schema}),/unexpected_table_privileges/);
});
test('17.4 refuses missing SELECT, unexpected INSERT or missing required INSERT',async()=>{
 for(const options of [{missingSelect:true},{extraInsert:true},{missingInsert:true}])
  await assert.rejects(assertGame3DQuestActionDatabaseReadiness174({
   pool:createPool(options),schema}),/unexpected_table_privileges/);
});
test('17.4 refuses missing canonical private table',async()=>{
 await assert.rejects(assertGame3DQuestActionDatabaseReadiness174({
  pool:createPool({missingTable:'game3d_trusted_character'}),schema}),
  /required_private_table_missing/);
});
test('17.4 refuses broad or missing column UPDATE permissions on Rival status',async()=>{
 await assert.rejects(assertGame3DQuestActionDatabaseReadiness174({
  pool:createPool({missingStatusUpdate:true}),schema}),
  /restricted_rival_update_columns_required/);
});
test('17.6 refuses absent generated row-lock markers and ungranted lock permission',async()=>{
 for(const options of [
  {missingLockMarker:'game3d_trusted_character'},
  {missingLockMarker:'game3d_private_echo_quest_165'},
  {missingLockMarker:'game3d_private_quest_acceptance_154'},
  {missingLockMarker:'game3d_private_rival_invitation_164'},
  {missingLockUpdate:true}
 ]){
  await assert.rejects(assertGame3DQuestActionDatabaseReadiness174({
   pool:createPool(options),schema}),/safe_generated_lock_column_required/);
 }
});
test('17.6 refuses editable lock markers and incorrectly typed markers',async()=>{
 for(const options of [{editableMarker:true},{wrongMarkerType:true}])
  await assert.rejects(assertGame3DQuestActionDatabaseReadiness174({
   pool:createPool(options),schema}),/safe_generated_lock_column_required/);
});
test('17.4 denies database connection errors without leaking details',async()=>{
 await assert.rejects(assertGame3DQuestActionDatabaseReadiness174({
  pool:createPool({fail:true}),schema}),/database_unavailable/);
});
