// Combat / Quest 18.3 — separate PRIVILEGED staging session-lease writer.
// DO NOT use the restricted 17.4 quest writer role here. This module is
// server-only, disabled by default, and is NOT attached to index.mjs.
// Only an independently active private world session can publish a lease.
// Revocation updates the same PostgreSQL row accepted via FOR SHARE.
// This gate reads role metadata ONLY. It does not grant privileges, create a
// session row, or connect to production automatically.
const issuerReadinessError=reason=>{
 throw Error('18.3 private lease issuer readiness denied: '+reason);
};
export async function assertGame3DPrivateQuestLeaseIssuerReadiness183({
 issuerPool,writerPool,schema,
}={}) {
 if(typeof issuerPool?.connect!=='function'||
    typeof writerPool?.connect!=='function'||
    issuerPool===writerPool||
    typeof schema!=='string'||!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
  issuerReadinessError('independent_issuer_and_writer_pools_required');
 let issuer=null,writer=null;
 try{
  issuer=await issuerPool.connect();
  writer=await writerPool.connect();
  // A PG client role may publish/revoke a lease, but must not be a
  // superuser, bypass-RLS role, schema creator or gameplay writer.
  const issuerResult=await issuer.query(`
   SELECT current_user AS role_name,current_database() AS db_name,
    current_schema() AS schema_name,
    inet_server_addr()::text AS server_addr,
    inet_server_port() AS server_port,
    current_setting('is_superuser') AS superuser,
    (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass_rls,
    (SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user) AS can_create_role,
    (SELECT rolcreatedb FROM pg_roles WHERE rolname=current_user) AS can_create_db,
    (SELECT rolreplication FROM pg_roles WHERE rolname=current_user) AS replication_role,
    pg_is_in_recovery() AS in_recovery,
    has_schema_privilege(current_user,current_schema(),'CREATE') AS schema_create,
    has_database_privilege(current_user,current_database(),'CREATE') AS db_create,
    has_table_privilege(current_user,$1,'INSERT') AS lease_insert,
    has_table_privilege(current_user,$1,'UPDATE') AS lease_update,
    has_table_privilege(current_user,$1,'SELECT') AS lease_select,
    has_table_privilege(current_user,$1,
     'DELETE,TRUNCATE,REFERENCES,TRIGGER') AS lease_danger,
    has_table_privilege(current_user,$2,
     'INSERT,UPDATE,DELETE') AS character_writer,
    has_table_privilege(current_user,$3,
     'INSERT,UPDATE,DELETE') AS quest_writer,
    has_table_privilege(current_user,$4,
     'INSERT,UPDATE,DELETE') AS quest_objective_writer
  `,[
   schema+'.game3d_private_quest_session_fence_183',
   schema+'.game3d_trusted_character',
   schema+'.game3d_private_quest_acceptance_154',
   schema+'.game3d_private_quest_objective_binding_152',
  ]);
  const writerResult=await writer.query(`
   SELECT current_user AS role_name,current_database() AS db_name,
    current_schema() AS schema_name,
    inet_server_addr()::text AS server_addr,
    inet_server_port() AS server_port
  `);
  const a=issuerResult.rows?.[0],b=writerResult.rows?.[0];
  if(issuerResult.rowCount!==1||writerResult.rowCount!==1||
     !a||!b||typeof a.role_name!=='string'||
     a.role_name===b.role_name||a.db_name!==b.db_name||
     a.schema_name!==schema||b.schema_name!==schema||
     typeof a.server_addr!=='string'||a.server_addr.length===0||
     !Number.isInteger(a.server_port)||a.server_port<=0||
     a.server_addr!==b.server_addr||a.server_port!==b.server_port)
   issuerReadinessError('different_database_or_same_role');
  if(a.superuser!=='off'||a.bypass_rls!==false||
     a.can_create_role!==false||a.can_create_db!==false||
     a.replication_role!==false||a.in_recovery!==false||
     a.schema_create!==false||a.db_create!==false||
     a.lease_insert!==true||a.lease_update!==true||
     a.lease_select!==true||a.lease_danger!==false||
     a.character_writer!==false||a.quest_writer!==false||
     a.quest_objective_writer!==false)
   issuerReadinessError('privileged_or_incorrect_session_issuer_grants');
  return Object.freeze({ok:true,version:'18.3',
   independentIssuerRole:true,gameplayWritesDenied:true,
   privateServerOnly:true,productionReady:false});
 }catch(error){
  if(String(error?.message).startsWith(
   '18.3 private lease issuer readiness denied:'))throw error;
  issuerReadinessError('issuer_database_unavailable');
 }finally{
  writer?.release();
  issuer?.release();
 }
}

const ID=/^[A-Za-z0-9_-]{1,128}$/;
const KEY=/^[A-Za-z0-9_.:-]{8,128}$/;
const SESSION=/^qb174-[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
const valid=claim=>claim&&ID.test(claim.ownerId)&&
 ID.test(claim.characterId)&&KEY.test(claim.worldInstanceId)&&
 KEY.test(claim.worldEpoch)&&KEY.test(claim.serverSessionId)&&
 SESSION.test(claim.actionSessionId)&&UUID.test(claim.leaseNonce)&&
 Number.isSafeInteger(claim.expiresAtMs);
const same=(a,b)=>a&&b&&
 ['ownerId','characterId','worldInstanceId','worldEpoch',
  'serverSessionId','actionSessionId','leaseNonce','expiresAtMs']
 .every(k=>a[k]===b[k]);
const denied=reason=>Object.freeze({ok:false,version:'18.3',reason,
 privateServerOnly:true,rewardsIssued:false,productionReady:false});

// Only a private session issuer role can INSERT or UPDATE these columns.
// Restricted Questbook writer role must be unable to call this operation.
export const QUEST_LEASE_PUBLISH_SQL_183=`
 INSERT INTO game3d_private_quest_session_fence_183
 (owner_id,character_id,world_instance_id,world_epoch,
  world_session_id,action_session_id,lease_nonce,active,expires_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7::uuid,true,to_timestamp($8::numeric/1000.0))
 ON CONFLICT (owner_id,character_id,world_instance_id)
 DO UPDATE SET world_epoch=EXCLUDED.world_epoch,
   world_session_id=EXCLUDED.world_session_id,
   action_session_id=EXCLUDED.action_session_id,
   lease_nonce=EXCLUDED.lease_nonce,active=true,
   revoked_at=NULL,issued_at=clock_timestamp(),
   expires_at=EXCLUDED.expires_at
 RETURNING lease_nonce::text AS lease_nonce
`;
export const QUEST_LEASE_REVOKE_SQL_183=`
 UPDATE game3d_private_quest_session_fence_183
 SET active=false,revoked_at=clock_timestamp()
 WHERE owner_id=$1 AND character_id=$2 AND world_instance_id=$3
   AND lease_nonce=$4::uuid AND active=true
 RETURNING lease_nonce::text AS lease_nonce
`;

export function createGame3DPrivateQuestLeaseIssuer183({
 pool,resolveCurrentWorldLease,now=Date.now,enabled=false,
}={}) {
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    typeof pool?.connect!=='function'||
    typeof resolveCurrentWorldLease!=='function'||typeof now!=='function')
  throw Error('18.3 private lease writer requires a separate trusted staging issuer role');
 let stored=null,stopped=false,queue=Promise.resolve();
 const serialize=fn=>{const p=queue.then(fn,fn);queue=p.then(()=>{},()=>{});return p};
 const transact=async(sql,params)=>{
  let db,started=false;
  try{
   db=await pool.connect();
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');started=true;
   const out=await db.query(sql,params);
   await db.query('COMMIT');started=false;
   return out;
  }catch{
   if(started)try{await db.query('ROLLBACK')}catch{}
   return null;
  }finally{db?.release()}
 };
 const revokeStored=async()=>{
  if(!stored)return Object.freeze({ok:true,version:'18.3',revoked:false,
   rewardsIssued:false,productionReady:false});
  const previous=stored;
  // Do not forget a live lease until the DB confirms the revocation
  // UPDATE has finished. This operation serializes against FOR SHARE.
  const result=await transact(QUEST_LEASE_REVOKE_SQL_183,[
   previous.claim.ownerId,previous.claim.characterId,
   previous.claim.worldInstanceId,previous.claim.leaseNonce,
  ]);
  // A zero-row result can mean an unfamiliar active lease replaced ours.
  // Retain the exact old nonce and fail closed rather than claiming success.
  if(!result||result.rowCount!==1||
     result.rows?.[0]?.lease_nonce!==previous.claim.leaseNonce)
   return denied('database_revocation_unconfirmed');
  stored=null;
  return Object.freeze({ok:true,version:'18.3',revoked:true,
   rewardsIssued:false,productionReady:false});
 };
 const activate=({serverRequestContext}={})=>serialize(async()=>{
  if(stopped||!serverRequestContext||typeof serverRequestContext!=='object')
   return denied('trusted_world_context_required');
  // A previous lease cannot remain active during replacement.
  if(stored){
   const cleared=await revokeStored();
   if(!cleared.ok)return cleared;
  }
  const args=Object.freeze({serverRequestContext});
  let claim;
  try{claim=await resolveCurrentWorldLease(args)}catch{}
  if(!valid(claim)||claim.expiresAtMs<=now()||
     claim.expiresAtMs>now()+900000)
   return denied('verified_world_lease_required');
  const result=await transact(QUEST_LEASE_PUBLISH_SQL_183,[
   claim.ownerId,claim.characterId,claim.worldInstanceId,claim.worldEpoch,
   claim.serverSessionId,claim.actionSessionId,claim.leaseNonce,claim.expiresAtMs,
  ]);
  if(result?.rowCount!==1||result.rows?.[0]?.lease_nonce!==claim.leaseNonce)
   return denied('database_lease_publish_failed');
  // Retain this lease for revocation even if the world changed during PG.
  stored=Object.freeze({claim,serverRequestContext});
  let again;
  try{again=await resolveCurrentWorldLease(args)}catch{}
  if(stopped||!same(claim,again)){
   const revoked=await revokeStored();
   return revoked.ok?denied('world_lease_changed_during_publish'):revoked;
  }
  return Object.freeze({ok:true,version:'18.3',activated:true,
   privateServerOnly:true,rewardsIssued:false,productionReady:false});
 });
 const revoke=({serverRequestContext}={})=>serialize(async()=>{
  if(stopped)return denied('issuer_shutdown');
  if(!stored)return Object.freeze({ok:true,version:'18.3',revoked:false,
   rewardsIssued:false,productionReady:false});
  if(stored.serverRequestContext!==serverRequestContext)
   return denied('trusted_world_context_required');
  return revokeStored();
 });
 const shutdown=()=>serialize(async()=>{
  const result=await revokeStored();
  if(result.ok)stopped=true;
  return result;
 });
 // Introspection is confined to the very same issuer pool captured by
 // this issuer, preventing a caller from checking an unrelated safe pool.
 const verifyIssuerReadiness=({writerPool,schema}={})=>
  assertGame3DPrivateQuestLeaseIssuerReadiness183({
   issuerPool:pool,writerPool,schema,
  });
 return Object.freeze({version:'18.3',activate,revoke,shutdown,
  verifyIssuerReadiness,
  privateServerOnly:true,publicRouteInstalled:false,
  rewardsIssued:false,productionReady:false});
}
