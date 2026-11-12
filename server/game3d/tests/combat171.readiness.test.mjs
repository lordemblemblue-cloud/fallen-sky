// Game 3D Combat / Quest 17.1 — repeatable offline SELECT-only role checks.
// This is a fake PostgreSQL privilege inspector, NOT a real PG16 integration test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGame3DQuestbookDatabaseReadiness171,
 QUESTBOOK_171_REQUIRED_TABLES}
 from '../privateQuestbookReadiness171.mjs';

const schema='qb171_disposable';
function fixture(overrides={}){
 let released=0;
 const calls=[];
 const client={
  async query(sql,args=[]){
   calls.push({sql,args});
   if(overrides.unavailable)throw Error('server connection lost');
   if(sql.includes('current_user AS role_name'))return {rowCount:1,rows:[{
    role_name:'qb171_reader',schema_name:overrides.schema??schema,
    superuser:overrides.superuser?'on':'off',
    schema_create:!!overrides.schemaCreate,
    database_create:!!overrides.databaseCreate
   }]};
   if(sql.includes('FROM pg_roles'))return {rowCount:1,rows:[{
    rolsuper:!!overrides.rolsuper,
    rolcreatedb:!!overrides.rolcreatedb,
    rolcreaterole:!!overrides.rolcreaterole,
    rolreplication:!!overrides.rolreplication,
    rolbypassrls:!!overrides.rolbypassrls
   }]};
   if(sql.includes('to_regclass($1)'))return {rowCount:1,rows:[{
    relation:args[0]===schema+'.'+overrides.missingTable?null:args[0]
   }]};
   if(sql.includes('has_table_privilege'))return {rowCount:1,rows:[{
    can_select:args[0]===schema+'.'+overrides.missingSelect?false:true,
    can_mutate:args[0]===schema+'.'+overrides.writeGrant?true:false
   }]};
   throw Error('Unexpected SQL in privilege check: '+sql);
  },
  release(){released++}
 };
 return {pool:{connect:async()=>client},calls,get released(){return released}};
}
const check=f=>assertGame3DQuestbookDatabaseReadiness171({pool:f.pool,schema});
test('17.1 least-privilege role can read all twelve canonical tables',async()=>{
 const f=fixture();const out=await check(f);
 assert.equal(out.ok,true);assert.equal(out.readOnly,true);
 assert.equal(out.requiredTablesVerified,12);
 assert.equal(out.productionGameplayVerified,false);
 assert.equal(out.rewardsIssued,false);
 assert.equal(f.released,1);
 assert.equal(f.calls.filter(x=>x.sql.includes('to_regclass')).length,12);
 assert.equal(f.calls.filter(x=>x.sql.includes('has_table_privilege')).length,12);
 assert.deepEqual(f.calls.filter(x=>x.sql.includes('to_regclass')).map(x=>x.args[0]),
  QUESTBOOK_171_REQUIRED_TABLES.map(t=>schema+'.'+t));
 assert.equal(f.calls.every(x=>/^SELECT\b/.test(x.sql)),true);
});
test('17.1 missing pool and malformed/implicit schema are denied',async()=>{
 for(const args of [{},{pool:fixture().pool},{pool:fixture().pool,schema:'public-bad'},
  {pool:fixture().pool,schema:'"injection"'},
  {pool:fixture().pool,schema:'UPPERCASE'}]){
  await assert.rejects(assertGame3DQuestbookDatabaseReadiness171(args),
   /dedicated_schema_required/);
 }
});
test('17.1 wrong active search_path schema fails closed',async()=>{
 const f=fixture({schema:'public'});
 await assert.rejects(check(f),/read_only_role_or_schema_mismatch/);
 assert.equal(f.released,1);
});
test('17.1 superuser cannot be a Questbook read-only worker',async()=>{
 const f=fixture({superuser:true});
 await assert.rejects(check(f),/read_only_role_or_schema_mismatch/);
 assert.equal(f.released,1);
});
test('17.1 schema and database CREATE grants are denied',async()=>{
 for(const invalid of [{schemaCreate:true},{databaseCreate:true}]){
  const f=fixture(invalid);
  await assert.rejects(check(f),/read_only_role_or_schema_mismatch/);
  assert.equal(f.released,1);
 }
});
test('17.1 database privilege escalation flags are rejected',async()=>{
 for(const flag of ['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls']){
  const f=fixture({[flag]:true});
  await assert.rejects(check(f),/privileged_role_refused/,flag);
  assert.equal(f.released,1);
 }
});
test('17.1 missing required private quest schema table refuses startup',async()=>{
 const f=fixture({missingTable:'game3d_private_echo_turnin_165'});
 await assert.rejects(check(f),/required_table_missing/);
 assert.equal(f.released,1);
});
test('17.1 missing SELECT on a table blocks the whole projection',async()=>{
 const f=fixture({missingSelect:'game3d_private_rival_choice_164'});
 await assert.rejects(check(f),/table_privileges_not_select_only/);
 assert.equal(f.released,1);
});
test('17.1 UPDATE/INSERT-style grants fail the read-only boundary',async()=>{
 const f=fixture({writeGrant:'game3d_trusted_character'});
 await assert.rejects(check(f),/table_privileges_not_select_only/);
 assert.equal(f.released,1);
});
test('17.1 database outages deny startup and release the client',async()=>{
 const f=fixture({unavailable:true});
 await assert.rejects(check(f),/database_unavailable/);
 assert.equal(f.released,1);
});
test('17.1 SELECT-only responses never authorize rewards or production gameplay',async()=>{
 const f=fixture();const out=await check(f);
 assert(Object.isFrozen(out));
 assert.equal(out.privilegedDatabaseRole,false);
 assert.equal(out.productionGameplayVerified,false);
 assert.equal(out.rewardsIssued,false);
});
