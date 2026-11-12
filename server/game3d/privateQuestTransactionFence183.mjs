// Game 3D Quest 18.3 — private PostgreSQL transaction-bound session lease.
// The signed 17.4 proof + NPC event are NOT sufficient to authorize a write.
// The same restricted writer transaction must hold a SHARE lock on the
// independent, server-issued active session row until COMMIT/ROLLBACK.
// A separate, privileged session issuer/revoker MUST publish and revoke this
// row in PostgreSQL. This module cannot create or reactivate it.
const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const KEY=/^[A-Za-z0-9_.:-]{8,128}$/;
const SESSION=/^qb174-[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const validWho=v=>typeof v==='string'&&WHO.test(v)&&
 !['__anon__','__default__','__dev_test__'].includes(v);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&
 Object.keys(v).every(k=>keys.includes(k));
// 18.4 reuses the same PostgreSQL FOR SHARE lease fence for SERVER-ONLY
// committed kill projections and reward-free turn-ins. Read operations do
// not mutate player state and remain separately authorized.
const ops=new Set([
 'accept_private_server_quest','accept_private_echo_quest',
 'project_committed_quest_kill','turn_in_private_server_quest'
]);
const claimFields=['ownerId','characterId','actionSessionId','serverSessionId',
 'worldInstanceId','worldEpoch','leaseNonce','expiresAtMs'];
const safeClaim=(claim,now)=>exact(claim,claimFields)&&
 validWho(claim.ownerId)&&validWho(claim.characterId)&&
 SESSION.test(claim.actionSessionId)&&KEY.test(claim.serverSessionId)&&
 KEY.test(claim.worldInstanceId)&&KEY.test(claim.worldEpoch)&&
 UUID.test(claim.leaseNonce)&&Number.isSafeInteger(claim.expiresAtMs)&&
 claim.expiresAtMs>now()&&claim.expiresAtMs<=now()+900000;
const same=(a,b)=>claimFields.every(k=>a[k]===b[k]);

export const QUEST_SESSION_LOCK_SQL_183=`
 SELECT owner_id,character_id,world_instance_id,world_epoch,
  world_session_id,action_session_id,lease_nonce::text AS lease_nonce,
  active,expires_at > clock_timestamp() AS not_expired
 FROM game3d_private_quest_session_fence_183
 WHERE owner_id=$1 AND character_id=$2
  AND world_instance_id=$3 AND world_epoch=$4
  AND world_session_id=$5 AND action_session_id=$6
  AND lease_nonce=$7::uuid
 FOR SHARE
`;

export function createGame3DQuestTransactionFence183({
 resolveTrustedWorldLease, now=Date.now, enabled=false,
}={}) {
 if(enabled!==true||typeof resolveTrustedWorldLease!=='function'||
    typeof now!=='function')
  throw Error('18.3 needs disabled-by-default trusted private session lease authority');
 const verifyInTransaction=async(db,request)=>{
  if(typeof db?.query!=='function'||
     !exact(request,['ownerId','characterId','questId','sessionId','operation'])||
     !validWho(request.ownerId)||!validWho(request.characterId)||
     typeof request.questId!=='string'||!ops.has(request.operation)||
     !SESSION.test(request.sessionId))return false;
  // This callback resolves the current private 18.0 stage, NEVER from the
  // signed request body. It yields a nonce minted for the current world open.
  let lease;
  try{lease=await resolveTrustedWorldLease(Object.freeze({
   ownerId:request.ownerId,characterId:request.characterId,
   questId:request.questId,sessionId:request.sessionId,
  }));}catch{return false;}
  if(!safeClaim(lease,now)||lease.ownerId!==request.ownerId||
     lease.characterId!==request.characterId||
     lease.actionSessionId!==request.sessionId)return false;
  let result;
  try{result=await db.query(QUEST_SESSION_LOCK_SQL_183,[
   lease.ownerId,lease.characterId,lease.worldInstanceId,lease.worldEpoch,
   lease.serverSessionId,lease.actionSessionId,lease.leaseNonce,
  ]);}catch{return false;}
  const row=result?.rows?.[0];
  if(result?.rowCount!==1||!row||row.owner_id!==lease.ownerId||
     row.character_id!==lease.characterId||
     row.world_instance_id!==lease.worldInstanceId||
     row.world_epoch!==lease.worldEpoch||
     row.world_session_id!==lease.serverSessionId||
     row.action_session_id!==lease.actionSessionId||
     row.lease_nonce!==lease.leaseNonce||
     row.active!==true||row.not_expired!==true)return false;
  // If the world pairing rotated while the PG lock was waiting, fail closed.
  let fresh;
  try{fresh=await resolveTrustedWorldLease(Object.freeze({
   ownerId:request.ownerId,characterId:request.characterId,
   questId:request.questId,sessionId:request.sessionId,
  }));}catch{return false;}
  return safeClaim(fresh,now)&&same(lease,fresh);
 };
 return Object.freeze({version:'18.3',verifyInTransaction,
  privateServerOnly:true,productionReady:false,rewardsIssued:false});
}

const readinessError=reason=>{throw Error(
 '18.3 private quest session fence readiness denied: '+reason)};
export async function assertGame3DQuestSessionFenceReadiness183({pool,schema}={}){
 if(typeof pool?.connect!=='function'||
    typeof schema!=='string'||!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
  readinessError('restricted_schema_required');
 let db;
 try{
  db=await pool.connect();
  const result=await db.query(`
   SELECT column_name,is_generated,data_type,
    has_column_privilege(current_user,
     format('%I.%I',table_schema,table_name),column_name,'UPDATE') AS can_update
   FROM information_schema.columns
   WHERE table_schema=$1
    AND table_name='game3d_private_quest_session_fence_183'
  `,[schema]);
  const columns=new Map((result.rows||[]).map(c=>[c.column_name,c]));
  const needed=['owner_id','character_id','world_instance_id','world_epoch',
   'world_session_id','action_session_id','lease_nonce','active',
   'expires_at','revoked_at','action_row_lock_183'];
  if(needed.some(k=>!columns.has(k)))readinessError('session_lease_table_missing');
  const marker=columns.get('action_row_lock_183');
  if(marker.is_generated!=='ALWAYS'||marker.data_type!=='smallint'||
     marker.can_update!==true||
     [...columns.values()].some(c=>c.can_update===true&&
      c.column_name!=='action_row_lock_183'))
   readinessError('unsafe_session_lease_column_grants');
  const grants=await db.query(`
   SELECT current_schema() AS schema_name,
    current_setting('is_superuser') AS superuser,
    has_table_privilege(current_user,$1,'SELECT') AS can_select,
    has_table_privilege(current_user,$1,'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      AS dangerous,
    has_table_privilege(current_user,$1,'UPDATE') AS table_update
  `,[schema+'.game3d_private_quest_session_fence_183']);
  const p=grants.rows?.[0];
  if(grants.rowCount!==1||p?.schema_name!==schema||
     p?.superuser!=='off'||p?.can_select!==true||
     p?.dangerous!==false||p?.table_update!==false)
   readinessError('privileged_or_unreadable_session_lease');
  return Object.freeze({ok:true,version:'18.3',roleRestricted:true,
   readOnlyLeaseIdentity:true,lockMarkerGenerated:true,productionReady:false});
 }catch(error){
  if(String(error?.message).startsWith(
    '18.3 private quest session fence readiness denied:'))throw error;
  readinessError('lease_database_unavailable');
 }finally{db?.release()}
}
