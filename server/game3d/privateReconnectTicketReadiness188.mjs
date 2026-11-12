// Combat / Quest 18.8 — read-only PG16 permissions/integrity inspection.
// Issuer and consumer must be DIFFERENT, minimally privileged PG roles,
// independent of the 18.3 world lease publisher and quest reward writers.
// This module never GRANTs, creates tables, opens a public listener, or
// treats PostgreSQL admin credentials as staging-ready.
const SCHEMA=/^[a-z][a-z0-9_]{0,62}$/;
const deny=code=>{throw Error('18.8 private reconnect role readiness denied: '+code)};
const TOKEN_TABLE='game3d_private_reconnect_ticket_188';
const LEASE_TABLE='game3d_private_quest_session_fence_183';
const GAMEPLAY=[
 'game3d_trusted_character',
 'game3d_private_world_kill_receipt_152',
 'game3d_private_world_kill_lease_binding_185',
 'game3d_private_quest_kill_credit_152',
 'game3d_private_quest_acceptance_154',
 'game3d_private_quest_turnin_156',
];
const roleSql=`
 SELECT current_user AS role_name,current_database() AS db_name,
  current_schema() AS schema_name,inet_server_addr()::text AS server_addr,
  inet_server_port() AS server_port,
  current_setting('is_superuser') AS superuser,
  current_setting('server_version_num')::int AS pg_version,
  pg_is_in_recovery() AS in_recovery,
  (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass_rls,
  (SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user) AS create_role,
  (SELECT rolcreatedb FROM pg_roles WHERE rolname=current_user) AS create_db,
  (SELECT rolreplication FROM pg_roles WHERE rolname=current_user) AS replication,
  has_schema_privilege(current_user,current_schema(),'CREATE') AS schema_create,
  has_database_privilege(current_user,current_database(),'CREATE') AS database_create
`;
const grantsSql=`
 SELECT
  has_table_privilege(current_user,$1,'SELECT') AS ticket_select,
  has_table_privilege(current_user,$1,'INSERT') AS ticket_insert,
  has_table_privilege(current_user,$1,'UPDATE') AS ticket_full_update,
  has_table_privilege(current_user,$1,
   'DELETE,TRUNCATE,REFERENCES,TRIGGER') AS ticket_danger,
  has_column_privilege(current_user,$1,'consumed_at','UPDATE')
   AS ticket_consume,
  has_column_privilege(current_user,$1,'ticket_id','UPDATE')
   AS ticket_id_update,
  has_column_privilege(current_user,$1,'owner_id','UPDATE')
   AS ticket_owner_update,
  has_column_privilege(current_user,$1,'lease_nonce','UPDATE')
   AS ticket_nonce_update,
  has_column_privilege(current_user,$1,'expires_at','UPDATE')
   AS ticket_expiry_update,
  has_column_privilege(current_user,$1,'character_id','UPDATE')
   AS ticket_character_update,
  has_column_privilege(current_user,$1,'world_instance_id','UPDATE')
   AS ticket_instance_update,
  has_column_privilege(current_user,$1,'world_epoch','UPDATE')
   AS ticket_epoch_update,
  has_column_privilege(current_user,$1,'world_session_id','UPDATE')
   AS ticket_world_session_update,
  has_column_privilege(current_user,$1,'action_session_id','UPDATE')
   AS ticket_action_session_update,
  has_column_privilege(current_user,$1,'source_kind','UPDATE')
   AS ticket_source_update,
  has_column_privilege(current_user,$1,'issued_at','UPDATE')
   AS ticket_issued_update,
  has_column_privilege(current_user,$1,'reward_authorized','UPDATE')
   AS ticket_reward_update,
  has_table_privilege(current_user,$2,'SELECT') AS lease_select,
  has_column_privilege(current_user,$2,'action_row_lock_183','UPDATE')
   AS lease_row_lock,
  has_table_privilege(current_user,$2,'INSERT,UPDATE,DELETE,TRUNCATE')
   AS lease_mutate,
  has_column_privilege(current_user,$2,'active','UPDATE')
   AS lease_active_update,
  has_column_privilege(current_user,$2,'lease_nonce','UPDATE')
   AS lease_nonce_update,
  has_column_privilege(current_user,$2,'world_epoch','UPDATE')
   AS lease_epoch_update,
  has_column_privilege(current_user,$2,'world_session_id','UPDATE')
   AS lease_world_session_update,
  has_column_privilege(current_user,$2,'action_session_id','UPDATE')
   AS lease_action_session_update,
  has_column_privilege(current_user,$2,'expires_at','UPDATE')
   AS lease_expiry_update,
  has_column_privilege(current_user,$2,'revoked_at','UPDATE')
   AS lease_revoked_update
`;
const gameplaySql=`
 -- pg_catalog exposes table existence regardless of the reconnect role's
 -- SELECT rights. Information_schema would accidentally REQUIRE granting
 -- reconnect roles read access to gameplay data just to audit their grants.
 SELECT r.relname AS table_name,
  has_table_privilege(current_user,
   format('%I.%I',n.nspname,r.relname),
   'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS gameplay_mutate
 FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace
 WHERE n.nspname=$1 AND r.relkind IN ('r','p')
  AND r.relname=ANY($2::text[])
`;
const roleValid=(p,schema)=>p&&
 typeof p.role_name==='string'&&p.role_name.length>0&&
 typeof p.db_name==='string'&&p.db_name.length>0&&
 p.schema_name===schema&&typeof p.server_addr==='string'&&
 p.server_addr.length>0&&Number.isInteger(p.server_port)&&
 p.server_port>0&&Number.isInteger(p.pg_version)&&
 p.pg_version>=160000&&p.superuser==='off'&&
 p.in_recovery===false&&p.bypass_rls===false&&
 p.create_role===false&&p.create_db===false&&
 p.replication===false&&p.schema_create===false&&
 p.database_create===false;

export async function assertGame3DPrivateReconnectTicketReadiness188({
 issuerPool,consumerPool,schema,
}={}){
 if(typeof issuerPool?.connect!=='function'||
    typeof consumerPool?.connect!=='function'||
    issuerPool===consumerPool||typeof schema!=='string'||
    !SCHEMA.test(schema)||schema==='public')
  deny('independent_private_postgresql_roles_required');
 let issuer=null,consumer=null;
 try{
  issuer=await issuerPool.connect();
  consumer=await consumerPool.connect();
  const [a,b]=await Promise.all([
   issuer.query(roleSql),consumer.query(roleSql),
  ]);
  const x=a.rows?.[0],y=b.rows?.[0];
  if(a.rowCount!==1||b.rowCount!==1||
     !roleValid(x,schema)||!roleValid(y,schema)||
     x.role_name===y.role_name||x.db_name!==y.db_name||
     x.server_addr!==y.server_addr||
     x.server_port!==y.server_port)
   deny('privileged_or_unrelated_pg_roles');
  const targets=[schema+'.'+TOKEN_TABLE,schema+'.'+LEASE_TABLE];
  const [g1,g2]=await Promise.all([
   issuer.query(grantsSql,targets),consumer.query(grantsSql,targets),
  ]);
  const z=g1.rows?.[0],w=g2.rows?.[0];
  const base=p=>p&&p.ticket_select===true&&p.lease_select===true&&
   p.lease_row_lock===true&&p.lease_mutate===false&&
   p.lease_active_update===false&&p.lease_nonce_update===false&&
   p.ticket_danger===false&&p.ticket_full_update===false&&
   p.ticket_id_update===false&&p.ticket_owner_update===false&&
   p.ticket_nonce_update===false&&p.ticket_expiry_update===false&&
   p.ticket_character_update===false&&p.ticket_instance_update===false&&
   p.ticket_epoch_update===false&&
   p.ticket_world_session_update===false&&
   p.ticket_action_session_update===false&&
   p.ticket_source_update===false&&p.ticket_issued_update===false&&
   p.ticket_reward_update===false&&
   p.lease_epoch_update===false&&
   p.lease_world_session_update===false&&
   p.lease_action_session_update===false&&
   p.lease_expiry_update===false&&p.lease_revoked_update===false;
  if(g1.rowCount!==1||g2.rowCount!==1||
     !base(z)||!base(w)||z.ticket_insert!==true||
     z.ticket_consume!==false||w.ticket_insert!==false||
     w.ticket_consume!==true)
   deny('unsafe_reconnect_or_world_lease_grants');
  const [m1,m2]=await Promise.all([
   issuer.query(gameplaySql,[schema,GAMEPLAY]),
   consumer.query(gameplaySql,[schema,GAMEPLAY]),
  ]);
  for(const m of [m1,m2]){
   if(m.rowCount!==GAMEPLAY.length||
      !Array.isArray(m.rows)||
      m.rows.some(row=>!GAMEPLAY.includes(row.table_name)||
       row.gameplay_mutate!==false)||
      new Set(m.rows.map(row=>row.table_name)).size!==GAMEPLAY.length)
    deny('unexpected_gameplay_mutation_rights');
  }
  const guards=await consumer.query(`
   SELECT t.tgenabled AS enabled
   FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid
   JOIN pg_namespace n ON n.oid=r.relnamespace
   WHERE n.nspname=$1 AND
    r.relname='game3d_private_reconnect_ticket_188'
    AND t.tgname='game3d_private_reconnect_ticket_188_guard'
    AND NOT t.tgisinternal
  `,[schema]);
  if(guards.rowCount!==1||
     !['O','A'].includes(guards.rows?.[0]?.enabled))
   deny('reconnect_ticket_immutability_guard_missing');
  return Object.freeze({ok:true,version:'18.8',
   independentIssuerAndConsumerRoles:true,
   originalLeaseMutationDenied:true,
   gameEconomyMutationDenied:true,
   consumedTicketImmutabilityVerified:true,
   privateServerOnly:true,productionReady:false});
 }catch(error){
  if(String(error?.message).startsWith(
   '18.8 private reconnect role readiness denied:'))throw error;
  deny('reconnect_pg_metadata_unavailable');
 }finally{
  consumer?.release();
  issuer?.release();
 }
}
