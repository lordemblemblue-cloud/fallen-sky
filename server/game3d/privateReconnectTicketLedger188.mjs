// Combat / Quest 18.8 — PRIVATE PostgreSQL-backed one-use Base44 reconnect
// tickets. Neither the bearer nor any client-provided identity reaches PG.
// A separate, trusted Base44/session callback authenticates both issuance
// and consumption. This module does NOT install Base44 login, WebSocket,
// browser routes, combat authority, quest turn-in or player rewards.
import {randomUUID} from 'node:crypto';
import {QUEST_SESSION_LOCK_SQL_183}
 from './privateQuestTransactionFence183.mjs';
import {assertGame3DPrivateReconnectTicketReadiness188}
 from './privateReconnectTicketReadiness188.mjs';

const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const KEY=/^[A-Za-z0-9_.:-]{8,128}$/;
const ACTION=/^qb174-[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const safeWho=x=>typeof x==='string'&&WHO.test(x)&&
 !['__anon__','__default__','__dev_test__'].includes(x);
const same=(a,b,keys)=>a&&b&&keys.every(k=>a[k]===b[k]);
const LEASE_FIELDS=Object.freeze([
 'ownerId','characterId','worldInstanceId','worldEpoch',
 'serverSessionId','actionSessionId','leaseNonce','expiresAtMs',
]);
const denied=reason=>Object.freeze({ok:false,version:'18.8',reason,
 privateServerOnly:true,publicRouteInstalled:false,
 authenticatedReconnect:false,rewardsIssued:false,productionReady:false});
const validLease=(l,at)=>obj(l)&&
 safeWho(l.ownerId)&&safeWho(l.characterId)&&
 typeof l.worldInstanceId==='string'&&KEY.test(l.worldInstanceId)&&
 typeof l.worldEpoch==='string'&&KEY.test(l.worldEpoch)&&
 typeof l.serverSessionId==='string'&&KEY.test(l.serverSessionId)&&
 typeof l.actionSessionId==='string'&&ACTION.test(l.actionSessionId)&&
 typeof l.leaseNonce==='string'&&UUID.test(l.leaseNonce)&&
 Number.isSafeInteger(l.expiresAtMs)&&l.expiresAtMs>at&&
 l.expiresAtMs<=at+900000;
// Reuse the REAL 18.0 independent Base44 action identity shape. A valid
// HMAC alone is not enough: this callback MUST also recheck signed-in
// account/character, logout, action expiration and server-side revocation.
const validPrincipal=(p,lease,at)=>obj(p)&&
 p.authenticated===true&&
 p.identitySource==='base44-verified-action-session-179'&&
 p.accountId===lease.ownerId&&p.characterId===lease.characterId&&
 p.worldSessionId===lease.serverSessionId&&
 p.actionSessionId===lease.actionSessionId&&
 Number.isSafeInteger(p.expiresAtMs)&&p.expiresAtMs>at&&
 p.expiresAtMs<=at+900000;
export const RECONNECT_TICKET_ISSUE_SQL_188=`
 INSERT INTO game3d_private_reconnect_ticket_188
 (ticket_id,owner_id,character_id,world_instance_id,world_epoch,
  world_session_id,action_session_id,lease_nonce,expires_at,
  source_kind,reward_authorized)
 VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8::uuid,
  to_timestamp($9::numeric/1000.0),'server-base44-reconnect-188',false)
 RETURNING ticket_id::text AS ticket_id
`;
export const RECONNECT_TICKET_CONSUME_SQL_188=`
 UPDATE game3d_private_reconnect_ticket_188
 SET consumed_at=clock_timestamp()
 WHERE ticket_id=$1::uuid AND owner_id=$2 AND character_id=$3
  AND world_instance_id=$4 AND world_epoch=$5
  AND world_session_id=$6 AND action_session_id=$7
  AND lease_nonce=$8::uuid
  AND consumed_at IS NULL AND expires_at>clock_timestamp()
  AND source_kind='server-base44-reconnect-188'
  AND reward_authorized=false
 RETURNING ticket_id::text AS ticket_id,
  floor(extract(epoch from expires_at)*1000)::bigint AS expires_at_ms
`;

// The supplied serverReconnectContext MUST be an independently secured
// backend object (session store, authenticated request-scoped handle, etc).
// It must NOT be a browser JSON object containing a ticket ID. The external
// resolver owns that trust boundary and is required to reject client claims.
export async function createGame3DPrivateReconnectTicketLedger188({
 worldStage180,serverRequestContext,scope,
 issuerPool,consumerPool,schema,
 resolveTrustedBase44Action188,resolveTrustedReconnectTicket188,
 now=Date.now,enabled=false,
}={}){
 if(enabled!==true||
    process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    worldStage180?.version!=='18.0'||
    worldStage180.privateServerOnly!==true||
    worldStage180.publicPlayerRouteInstalled!==false||
    typeof worldStage180.resolveCurrentWorldLease183!=='function'||
    !obj(serverRequestContext)||!obj(scope)||
    !safeWho(scope.ownerId)||!safeWho(scope.characterId)||
    typeof scope.instanceId!=='string'||!KEY.test(scope.instanceId)||
    typeof scope.instanceEpoch!=='string'||!KEY.test(scope.instanceEpoch)||
    typeof scope.mapFingerprint!=='string'||!HASH.test(scope.mapFingerprint)||
    typeof issuerPool?.connect!=='function'||
    typeof consumerPool?.connect!=='function'||
    issuerPool===consumerPool||
    typeof resolveTrustedBase44Action188!=='function'||
    typeof resolveTrustedReconnectTicket188!=='function'||
    typeof now!=='function')
  throw Error('18.8 requires isolated PG writer roles and independently authenticated Base44 reconnect');

 await assertGame3DPrivateReconnectTicketReadiness188({
  issuerPool,consumerPool,schema,
 });
 let stopped=false,serial=Promise.resolve();
 const queue=fn=>{
  const result=serial.then(fn,fn);
  serial=result.then(()=>{},()=>{});
  return result;
 };
 const current=async()=>{
  if(stopped)return null;
  try{
   const lease=await worldStage180.resolveCurrentWorldLease183({
    serverRequestContext,
   });
   return validLease(lease,now())&&
    lease.ownerId===scope.ownerId&&
    lease.characterId===scope.characterId&&
    lease.worldInstanceId===scope.instanceId&&
    lease.worldEpoch===scope.instanceEpoch&&!stopped?
    Object.freeze(Object.fromEntries(
     LEASE_FIELDS.map(k=>[k,lease[k]]))):null;
  }catch{return null}
 };
 const original=await current();
 if(!original)
  throw Error('18.8 refuses tickets without the original live 18.3 world lease');
 const stillOriginal=async()=>same(original,await current(),LEASE_FIELDS);
 const verifiedPrincipal=async(serverContext,key)=>{
  let response;
  try{response=await resolveTrustedBase44Action188(
   Object.freeze({[key]:serverContext})
  )}catch{return null}
  return validPrincipal(response,original,now())?response:null;
 };
 const lockedLease=async db=>{
  const r=await db.query(QUEST_SESSION_LOCK_SQL_183,[
   original.ownerId,original.characterId,original.worldInstanceId,
   original.worldEpoch,original.serverSessionId,
   original.actionSessionId,original.leaseNonce,
  ]);
  const row=r?.rows?.[0];
  return r?.rowCount===1&&row?.owner_id===original.ownerId&&
   row.character_id===original.characterId&&
   row.world_instance_id===original.worldInstanceId&&
   row.world_epoch===original.worldEpoch&&
   row.world_session_id===original.serverSessionId&&
   row.action_session_id===original.actionSessionId&&
   row.lease_nonce===original.leaseNonce&&
   row.active===true&&row.not_expired===true;
 };
 const transaction=async(pool,fn)=>{
  let db=null,tx=false;
  try{
   db=await pool.connect();
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');tx=true;
   if(!await lockedLease(db)){await db.query('ROLLBACK');tx=false;return null}
   const result=await fn(db);
   if(result===null||!await stillOriginal()){
    await db.query('ROLLBACK');tx=false;return null;
   }
   await db.query('COMMIT');tx=false;
   return result;
  }catch{
   if(tx)try{await db.query('ROLLBACK')}catch{}
   return null;
  }finally{db?.release()}
 };
 // The ticket is a random, server-minted UUID and remains backend-only.
 // Not an HTTP bearer, browser credential or right to reconnect to combat.
 const issue=(request={})=>queue(async()=>{
  if(stopped||!obj(request)||Object.keys(request).length!==1||
     !Object.hasOwn(request,'serverAuthContext')||
     !obj(request.serverAuthContext))
   return denied('private_verified_base44_issuer_context_required');
  if(!await stillOriginal())return denied('original_world_lease_inactive');
  const principal=await verifiedPrincipal(request.serverAuthContext,
   'serverAuthContext');
  if(!principal)return denied('base44_session_unverified');
  const t=now(),expiresAtMs=Math.min(
   t+15000,original.expiresAtMs,principal.expiresAtMs);
  if(!Number.isSafeInteger(t)||expiresAtMs<=t+100)
   return denied('reconnect_ticket_expired');
  const ticketId=randomUUID();
  const inserted=await transaction(issuerPool,async db=>{
   const r=await db.query(RECONNECT_TICKET_ISSUE_SQL_188,[
    ticketId,original.ownerId,original.characterId,
    original.worldInstanceId,original.worldEpoch,
    original.serverSessionId,original.actionSessionId,
    original.leaseNonce,expiresAtMs,
   ]);
   if(r?.rowCount!==1||r.rows?.[0]?.ticket_id!==ticketId)return null;
   if(!await verifiedPrincipal(request.serverAuthContext,
    'serverAuthContext'))return null;
   return {ticketId,expiresAtMs};
  });
  if(!inserted||stopped||!await stillOriginal())
   return denied('reconnect_ticket_not_published');
  return Object.freeze({ok:true,version:'18.8',
   // This ID must be held in a backend session store, never returned to
   // browser JS, a public URL or a client-controlled reconnect payload.
   ticketId:inserted.ticketId,expiresAtMs:inserted.expiresAtMs,
   privateServerOnly:true,publicRouteInstalled:false,
   credentialsDeliveredToBrowser:false,
   rewardsIssued:false,productionReady:false});
 });
 const consume=(request={})=>queue(async()=>{
  if(stopped||!obj(request)||Object.keys(request).length!==1||
     !Object.hasOwn(request,'serverReconnectContext')||
     !obj(request.serverReconnectContext))
   return null;
  if(!await stillOriginal())return null;
  const principal=await verifiedPrincipal(request.serverReconnectContext,
   'serverReconnectContext');
  if(!principal)return null;
  let resolved;
  try{resolved=await resolveTrustedReconnectTicket188(Object.freeze({
   serverReconnectContext:request.serverReconnectContext,
  }))}catch{return null}
  if(!obj(resolved)||resolved.source!=='trusted-backend-ticket-188'||
     typeof resolved.ticketId!=='string'||!UUID.test(resolved.ticketId))
   return null;
  const consumed=await transaction(consumerPool,async db=>{
   const r=await db.query(RECONNECT_TICKET_CONSUME_SQL_188,[
    resolved.ticketId,original.ownerId,original.characterId,
    original.worldInstanceId,original.worldEpoch,
    original.serverSessionId,original.actionSessionId,
    original.leaseNonce,
   ]);
   if(r?.rowCount!==1||r.rows?.[0]?.ticket_id!==resolved.ticketId)
    return null;
   const expiry=Number(r.rows[0].expires_at_ms);
   if(!Number.isSafeInteger(expiry)||expiry<=now()||
      expiry>original.expiresAtMs||expiry>principal.expiresAtMs||
      !await verifiedPrincipal(request.serverReconnectContext,
       'serverReconnectContext'))return null;
   return {reconnectId:resolved.ticketId,expiresAtMs:expiry};
  });
  if(!consumed||stopped||!await stillOriginal())return null;
  // 18.7 deliberately requires this exact one-use server proof shape.
  return Object.freeze({
   identitySource:'base44-server-verified-reconnect-187',
   authenticated:true,consumed:true,
   reconnectId:consumed.reconnectId,
   ownerId:original.ownerId,characterId:original.characterId,
   worldInstanceId:original.worldInstanceId,worldEpoch:original.worldEpoch,
   worldSessionId:original.serverSessionId,
   actionSessionId:original.actionSessionId,
   leaseNonce:original.leaseNonce,expiresAtMs:consumed.expiresAtMs,
  });
 });
 const shutdown=()=>{stopped=true};
 return Object.freeze({version:'18.8',issue,consume,shutdown,
  privateServerOnly:true,publicRouteInstalled:false,
  publicPlayerRouteInstalled:false,credentialsDeliveredToBrowser:false,
  durableCrossWorkerReplayProtection:true,
  worldLeaseRestored:false,transportBindingCreated:false,
  resumeCombatAuthorized:false,rewardsIssued:false,
  productionReady:false});
}
