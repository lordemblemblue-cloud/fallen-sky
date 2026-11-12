// Game 3D Combat / Quest 17.1 — fail-closed database readiness check.
// Run BEFORE mounting the 17.0 authenticated Questbook read relay.
// This verifies a dedicated SELECT-only role against the exact 16.x read
// tables; it never executes migrations or grants application privileges.
export const QUESTBOOK_171_REQUIRED_TABLES=Object.freeze([
 'game3d_trusted_character',
 'game3d_private_world_kill_receipt_152',
 'game3d_private_quest_objective_binding_152',
 'game3d_private_quest_kill_credit_152',
 'game3d_private_quest_acceptance_154',
 'game3d_private_quest_turnin_156',
 'game3d_private_rival_invitation_164',
 'game3d_private_rival_choice_164',
 'game3d_private_echo_quest_165',
 'game3d_private_world_discovery_receipt_165',
 'game3d_private_echo_objective_credit_165',
 'game3d_private_echo_turnin_165',
]);
export const GAME3D_QUESTBOOK_PG_SCHEMA_PATTERN_171=/^[a-z][a-z0-9_]{0,62}$/;
const refusal=code=>{throw Error('Questbook 17.1 database readiness denied: '+code)};
export async function assertGame3DQuestbookDatabaseReadiness171({pool,schema}={}){
 if(typeof pool?.connect!=='function'||
   typeof schema!=='string'||
   !GAME3D_QUESTBOOK_PG_SCHEMA_PATTERN_171.test(schema))
  refusal('dedicated_schema_required');
 let client;
 try{
  client=await pool.connect();
  const role=await client.query(
   "SELECT current_user AS role_name, current_schema() AS schema_name, "+
   "current_setting('is_superuser') AS superuser, "+
   "has_schema_privilege(current_user,current_schema(),'CREATE') AS schema_create, "+
   "has_database_privilege(current_user,current_database(),'CREATE') AS database_create");
  const r=role.rows?.[0];
  if(role.rowCount!==1||!r||
     r.schema_name!==schema||r.superuser!=='off'||
     r.schema_create!==false||r.database_create!==false)
   refusal('read_only_role_or_schema_mismatch');
  const flags=await client.query(
   "SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls "+
   "FROM pg_roles WHERE rolname=current_user");
  const f=flags.rows?.[0];
  if(flags.rowCount!==1||!f||
     f.rolsuper!==false||f.rolcreatedb!==false||
     f.rolcreaterole!==false||f.rolreplication!==false||
     f.rolbypassrls!==false)
   refusal('privileged_role_refused');
  for(const table of QUESTBOOK_171_REQUIRED_TABLES){
   const name=schema+'.'+table;
   const exists=await client.query('SELECT to_regclass($1) AS relation',[name]);
   if(!exists.rows?.[0]?.relation)refusal('required_table_missing');
   const grants=await client.query(
    "SELECT has_table_privilege(current_user,$1,'SELECT') AS can_select, "+
    "has_table_privilege(current_user,$1,"+
    "'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS can_mutate",
    [name]);
   if(grants.rowCount!==1||
      grants.rows?.[0]?.can_select!==true||
      grants.rows?.[0]?.can_mutate!==false)
    refusal('table_privileges_not_select_only');
  }
  // This is not proof of active gameplay or production readiness. It is a
  // synchronous startup gate on schema presence and DB role privileges.
  return Object.freeze({ok:true,version:'17.1',
   readOnly:true,privilegedDatabaseRole:false,
   schemaVerified:true,requiredTablesVerified:QUESTBOOK_171_REQUIRED_TABLES.length,
   productionGameplayVerified:false,rewardsIssued:false});
 }catch(error){
  if(error?.message?.startsWith('Questbook 17.1 database readiness denied:'))
   throw error;
  refusal('database_unavailable');
 }finally{
  if(client)client.release();
 }
}
