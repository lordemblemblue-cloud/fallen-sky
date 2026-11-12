// Real PostgreSQL 16 privilege smoke test. Disposable administrator ONLY.
// Opt in with GAME3D_176_DISPOSABLE_PG_ADMIN_URL and
// GAME3D_176_DISPOSABLE_ACK=I_HAVE_A_DISPOSABLE_PG_INSTANCE.
// No default external connections, no production migrations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {assertGame3DQuestActionDatabaseReadiness174,
 QUEST_ACTION_INSERT_TABLES_174,QUEST_ACTION_READ_TABLES_174,
 QUEST_ACTION_LOCK_TABLES_176} from '../privateQuestActionReadiness174.mjs';
const url=process.env.GAME3D_176_DISPOSABLE_PG_ADMIN_URL;
const ack=process.env.GAME3D_176_DISPOSABLE_ACK==='I_HAVE_A_DISPOSABLE_PG_INSTANCE';
const enabled=!!url&&ack;
const quote=s=>'"'+s.replaceAll('"','""')+'"';
test('17.6 disposable PG16: exact lock grants work, XP writes denied',
 {skip:!enabled,timeout:90000},async()=>{
 const {default:pg}=await import('pg');
 const pool=new pg.Pool({connectionString:url,max:1,connectionTimeoutMillis:4000});
 const db=await pool.connect();
 const suffix=randomUUID().replaceAll('-','');
 const schema='g3d_176_'+suffix;
 const role='g3d_176_writer_'+suffix;
 const tables=[...new Set([...QUEST_ACTION_READ_TABLES_174,
  ...QUEST_ACTION_INSERT_TABLES_174])];
 let schemaCreated=false,roleCreated=false;
 try{
  const version=await db.query('SHOW server_version_num');
  assert(Number(version.rows[0].server_version_num)>=160000);
  await db.query('CREATE SCHEMA '+quote(schema));schemaCreated=true;
  await db.query('CREATE ROLE '+quote(role)+' NOLOGIN');roleCreated=true;
  for(const table of tables){
   await db.query('CREATE TABLE '+quote(schema)+'.'+quote(table)+
    ' (owner_id text, character_id text, quest_id text, '+
    'status text, updated_at timestamptz, xp_total bigint, choice text)');
  }
  await db.query('SET search_path TO '+quote(schema));
  const migration=await readFile(new URL(
   '../sql/047_combat176_private_action_row_lock_markers.sql',import.meta.url),'utf8');
  await db.query(migration);
  await db.query('RESET search_path');
  await db.query('GRANT USAGE ON SCHEMA '+quote(schema)+' TO '+quote(role));
  await db.query('GRANT SELECT ON ALL TABLES IN SCHEMA '+quote(schema)+
   ' TO '+quote(role));
  for(const table of QUEST_ACTION_INSERT_TABLES_174){
   await db.query('GRANT INSERT ON '+quote(schema)+'.'+quote(table)+
    ' TO '+quote(role));
  }
  for(const table of QUEST_ACTION_LOCK_TABLES_176){
   await db.query('GRANT UPDATE(action_row_lock_176) ON '+
    quote(schema)+'.'+quote(table)+' TO '+quote(role));
  }
  await db.query('GRANT UPDATE(status,updated_at) ON '+quote(schema)+
   '.game3d_private_rival_invitation_164 TO '+quote(role));
  await db.query('BEGIN');
  await db.query('SET LOCAL ROLE '+quote(role));
  await db.query('SET LOCAL search_path TO '+quote(schema));
  try{
   const limitedPool={connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
   const ready=await assertGame3DQuestActionDatabaseReadiness174({pool:limitedPool,schema});
   assert.equal(ready.ok,true);
   assert.equal(ready.safeGeneratedLockColumns,true);
   for(const table of QUEST_ACTION_LOCK_TABLES_176){
    // Parse-time UPDATE requirement applies even when rows are empty.
    await db.query('SELECT owner_id FROM '+quote(table)+' FOR UPDATE');
   }
   await db.query('SAVEPOINT reject_gameplay_updates');
   await assert.rejects(db.query('UPDATE game3d_trusted_character '+
     'SET xp_total=999'),error=>error?.code==='42501');
   await db.query('ROLLBACK TO SAVEPOINT reject_gameplay_updates');
   await assert.rejects(db.query('UPDATE game3d_private_echo_quest_165 '+
     "SET status='completed'"),error=>error?.code==='42501');
   await db.query('ROLLBACK TO SAVEPOINT reject_gameplay_updates');
   await assert.rejects(db.query('UPDATE game3d_trusted_character '+
     'SET action_row_lock_176=7'),error=>error?.code==='428C9');
   await db.query('ROLLBACK TO SAVEPOINT reject_gameplay_updates');
  }finally{await db.query('ROLLBACK')}
 }finally{
  // Unique generated names only; never mutate a caller-supplied schema.
  if(schemaCreated)await db.query('DROP SCHEMA '+quote(schema)+' CASCADE');
  if(roleCreated)await db.query('DROP ROLE '+quote(role));
  db.release();await pool.end();
 }
});
