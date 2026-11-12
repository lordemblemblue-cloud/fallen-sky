// 17.4 writer identity gate. This checks database grants, not gameplay identity.
// Run at opt-in worker startup before binding a public listener.
export const QUEST_ACTION_INSERT_TABLES_174=Object.freeze([
 'game3d_private_quest_acceptance_154',
 'game3d_private_quest_objective_binding_152',
 'game3d_private_echo_quest_165',
 'game3d_private_rival_choice_164'
]);
export const QUEST_ACTION_READ_TABLES_174=Object.freeze([
 'game3d_trusted_character',
 'game3d_private_quest_acceptance_154',
 'game3d_private_quest_objective_binding_152',
 'game3d_private_quest_turnin_156',
 'game3d_private_echo_quest_165',
 'game3d_private_echo_turnin_165',
 'game3d_private_rival_invitation_164',
 'game3d_private_rival_choice_164'
]);
// PostgreSQL 16 requires UPDATE on at least one column even for row locks.
 // Grant it ONLY on a generated, non-assignable constant marker, never XP,
 // quest status, objectives, evidence or owner binding.
export const QUEST_ACTION_LOCK_TABLES_176=Object.freeze([
 'game3d_trusted_character',
 'game3d_private_quest_acceptance_154',
 'game3d_private_echo_quest_165',
 'game3d_private_rival_invitation_164'
]);
const LOCK_COLUMN_176='action_row_lock_176';
const allowedUpdate=new Set([
 ...QUEST_ACTION_LOCK_TABLES_176.map(t=>t+'.'+LOCK_COLUMN_176),
 'game3d_private_rival_invitation_164.status',
 'game3d_private_rival_invitation_164.updated_at',
 // 18.3 staging only: PostgreSQL FOR SHARE requires UPDATE on at least one
 // column. This generated immutable marker is non-assignable and never grants
 // writes to the lease identity, active state, epoch or expiration.
 'game3d_private_quest_session_fence_183.action_row_lock_183'
]);
const fail=reason=>{throw Error('Quest action 17.4 database readiness denied: '+reason)};
const schemaPattern=/^[a-z][a-z0-9_]{0,62}$/;
export async function assertGame3DQuestActionDatabaseReadiness174({pool,schema}={}){
 if(typeof pool?.connect!=='function'||typeof schema!=='string'||
    !schemaPattern.test(schema))fail('schema_and_writer_required');
 let client;
 try{
  client=await pool.connect();
  const role=await client.query(`
   SELECT current_schema() AS schema_name,
    current_setting('is_superuser') AS superuser,
    has_schema_privilege(current_user,current_schema(),'CREATE') AS schema_create,
    has_database_privilege(current_user,current_database(),'CREATE') AS db_create
  `);
  const r=role.rows?.[0];
  if(role.rowCount!==1||r?.schema_name!==schema||r.superuser!=='off'||
     r.schema_create!==false||r.db_create!==false)
   fail('role_or_schema_privileged');
  const flags=await client.query(`
   SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
    FROM pg_roles WHERE rolname=current_user
  `);
  const f=flags.rows?.[0];
  if(flags.rowCount!==1||!f||Object.values(f).some(x=>x!==false))
   fail('privileged_postgres_role');
  const rows=await client.query(`
   SELECT table_name,column_name,is_generated,data_type,
    has_column_privilege(current_user,
     format('%I.%I',table_schema,table_name),column_name,'UPDATE') AS can_update
   FROM information_schema.columns WHERE table_schema=$1
   ORDER BY table_name,column_name
  `,[schema]);
  if(!Array.isArray(rows.rows)||!rows.rows.length)fail('no_visible_schema_columns');
  for(const c of rows.rows){
   if(c.can_update===true&&!allowedUpdate.has(c.table_name+'.'+c.column_name))
    fail('unexpected_update_column');
  }
  const tables=new Set(rows.rows.map(x=>x.table_name));
  const inserts=new Set(QUEST_ACTION_INSERT_TABLES_174);
  for(const required of [...new Set([...QUEST_ACTION_READ_TABLES_174,...inserts])])
   if(!tables.has(required))fail('required_private_table_missing');
  for(const table of QUEST_ACTION_LOCK_TABLES_176){
   const marker=rows.rows.find(c=>c.table_name===table&&
     c.column_name===LOCK_COLUMN_176);
   if(!marker||marker.is_generated!=='ALWAYS'||
      marker.data_type!=='smallint'||marker.can_update!==true)
    fail('safe_generated_lock_column_required');
  }
  for(const table of tables){
   const target=schema+'.'+table;
   const grants=await client.query(`
    SELECT has_table_privilege(current_user,$1,'SELECT') AS can_select,
     has_table_privilege(current_user,$1,'INSERT') AS can_insert,
     has_table_privilege(current_user,$1,'UPDATE') AS table_update,
     has_table_privilege(current_user,$1,
      'DELETE,TRUNCATE,REFERENCES,TRIGGER') AS dangerous
   `,[target]);
   const g=grants.rows?.[0];
   if(grants.rowCount!==1||!g||g.dangerous!==false||g.table_update!==false||
      g.can_insert!==inserts.has(table)||
      (QUEST_ACTION_READ_TABLES_174.includes(table)&&g.can_select!==true))
    fail('unexpected_table_privileges');
  }
  // A writer with UPDATE on one generated constant column can acquire
  // SELECT ... FOR UPDATE locks without being able to alter character XP
  // or quest objectives. Do not weaken this to unrestricted UPDATE.
  const target=schema+'.game3d_private_rival_invitation_164';
  const update=await client.query(`
   SELECT has_column_privilege(current_user,$1,'status','UPDATE') AS status,
    has_column_privilege(current_user,$1,'updated_at','UPDATE') AS updated
  `,[target]);
  if(update.rowCount!==1||update.rows?.[0]?.status!==true||
     update.rows?.[0]?.updated!==true)
   fail('restricted_rival_update_columns_required');
  return Object.freeze({ok:true,version:'17.6',schemaVerified:true,
   roleRestricted:true,safeGeneratedLockColumns:true,
   noRewardWriter:true,productionReady:false});
 }catch(error){
  if(String(error?.message).startsWith('Quest action 17.4 database readiness denied:'))throw error;
  fail('database_unavailable');
 }finally{client?.release()}
}
