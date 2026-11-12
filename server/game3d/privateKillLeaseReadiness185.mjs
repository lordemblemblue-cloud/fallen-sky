// Combat / Quest 18.5 — read-only PostgreSQL integrity/role gate.
// Ensure the only INSERT path for original kill->session binding uses a
// DIFFERENT private writer role from the 18.4 quest-credit projector.
// This helper never grants privileges or runs the 049 migration.
const SCHEMA=/^[a-z][a-z0-9_]{0,62}$/;
const tables=Object.freeze([
 'game3d_private_world_kill_receipt_152',
 'game3d_private_world_kill_lease_binding_185',
 'game3d_private_quest_kill_credit_152',
 'game3d_private_quest_turnin_156',
 'game3d_trusted_character',
]);
const refuse=reason=>{throw Error(
 '18.5 private kill lease PG readiness denied: '+reason)};
const privileges=async(db,schema)=>{
 const r=await db.query(`
  SELECT current_user AS role_name,current_database() AS db_name,
   current_schema() AS schema_name,
   inet_server_addr()::text AS server_addr,inet_server_port() AS server_port,
   current_setting('server_version_num')::int AS pg_version,
   current_setting('is_superuser') AS superuser,
   (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass_rls,
   (SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user) AS create_role,
   (SELECT rolcreatedb FROM pg_roles WHERE rolname=current_user) AS create_db,
   (SELECT rolreplication FROM pg_roles WHERE rolname=current_user) AS replication,
   has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
   has_schema_privilege(current_user,current_schema(),'CREATE') AS schema_create
 `);
 const p=r.rows?.[0];
 if(r.rowCount!==1||!p||typeof p.role_name!=='string'||
    p.schema_name!==schema||!Number.isInteger(p.pg_version)||
    p.pg_version<160000||p.superuser!=='off'||p.bypass_rls!==false||
    p.create_role!==false||p.create_db!==false||
    p.replication!==false||p.database_create!==false||
    p.schema_create!==false||typeof p.server_addr!=='string'||
    !Number.isInteger(p.server_port)||p.server_port<=0)
  refuse('privileged_or_wrong_postgresql_server');
 const rights=await db.query(`
  SELECT table_name,
   has_table_privilege(current_user,
    format('%I.%I',table_schema,table_name),'SELECT') AS can_select,
   has_table_privilege(current_user,
    format('%I.%I',table_schema,table_name),'INSERT') AS can_insert,
   has_table_privilege(current_user,
    format('%I.%I',table_schema,table_name),'UPDATE') AS can_update,
   has_table_privilege(current_user,
    format('%I.%I',table_schema,table_name),
    'DELETE,TRUNCATE,REFERENCES,TRIGGER') AS dangerous
  FROM information_schema.tables
  WHERE table_schema=$1 AND table_type='BASE TABLE'
 `,[schema]);
 const perTable=new Map((rights.rows||[]).map(row=>[row.table_name,row]));
 if(tables.some(name=>!perTable.has(name)))refuse('required_kill_binding_table_missing');
 return {principal:p,rights:perTable};
};
export async function assertGame3DPrivateKillLeaseReadiness185({
 worldKillPool,progressionPool,schema,
}={}){
 if(typeof worldKillPool?.connect!=='function'||
    typeof progressionPool?.connect!=='function'||
    worldKillPool===progressionPool||
    typeof schema!=='string'||!SCHEMA.test(schema))
  refuse('separate_backend_pools_required');
 let writer=null,projection=null;
 try{
  writer=await worldKillPool.connect();
  projection=await progressionPool.connect();
  const w=await privileges(writer,schema),r=await privileges(projection,schema);
  if(w.principal.role_name===r.principal.role_name||
     w.principal.db_name!==r.principal.db_name||
     w.principal.server_addr!==r.principal.server_addr||
     w.principal.server_port!==r.principal.server_port)
   refuse('independent_writer_or_shared_pg_unverified');
  const receipt='game3d_private_world_kill_receipt_152';
  const binding='game3d_private_world_kill_lease_binding_185';
  const credits='game3d_private_quest_kill_credit_152';
  const turnin='game3d_private_quest_turnin_156';
  const character='game3d_trusted_character';
  for(const name of tables){
   const x=w.rights.get(name),y=r.rights.get(name);
   if(x.can_select!==true||y.can_select!==true||
      x.dangerous!==false||y.dangerous!==false)
    refuse('unsafe_table_permissions');
   if(name===receipt||name===binding){
    if(x.can_insert!==true||x.can_update!==false||
       y.can_insert!==false||y.can_update!==false)
     refuse('kill_writer_grants_invalid');
   }
  }
  for(const name of [credits,turnin,character]){
   const x=w.rights.get(name);
   if(x.can_insert!==false||x.can_update!==false)
    refuse('kill_writer_has_gameplay_mutation_grants');
  }
  const integrity=await projection.query(`
   SELECT c.conname,c.contype,c.convalidated
   FROM pg_constraint c
   JOIN pg_class t ON t.oid=c.conrelid
   JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE n.nspname=$1 AND c.conname IN (
    'game3d_private_kill_receipt_binding_key_185',
    'game3d_quest_kill_credit_bound_receipt_185')
  `,[schema]);
  const constraints=new Map((integrity.rows||[]).map(v=>[v.conname,v]));
  const unique=constraints.get('game3d_private_kill_receipt_binding_key_185');
  const fk=constraints.get('game3d_quest_kill_credit_bound_receipt_185');
  if(unique?.contype!=='u'||unique.convalidated!==true||
     fk?.contype!=='f'||fk.convalidated!==true)
   refuse('binding_composite_key_or_credit_fk_missing');
  const trigger=await projection.query(`
   SELECT t.tgenabled AS enabled
   FROM pg_trigger t
   JOIN pg_class r ON r.oid=t.tgrelid
   JOIN pg_namespace n ON n.oid=r.relnamespace
   WHERE n.nspname=$1 AND
    r.relname='game3d_private_world_kill_lease_binding_185'
    AND t.tgname='game3d_private_world_kill_lease_binding_185_immutable'
    AND NOT t.tgisinternal
  `,[schema]);
  if(trigger.rowCount!==1||
     !['O','A'].includes(trigger.rows?.[0]?.enabled))
   refuse('binding_immutability_trigger_missing');
  return Object.freeze({ok:true,version:'18.5',
   privateServerOnly:true,independentWriterRole:true,
   killBindingImmutabilityVerified:true,creditFkVerified:true,
   productionReady:false,rewardsIssued:false});
 }catch(error){
  if(String(error?.message).startsWith(
   '18.5 private kill lease PG readiness denied:'))throw error;
  refuse('kill_binding_database_unavailable');
 }finally{
  projection?.release();
  writer?.release();
 }
}
