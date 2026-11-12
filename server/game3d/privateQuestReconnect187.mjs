// Game 3D Combat / Quest 18.7 — private, one-use Base44 reconnect proof
// to the ORIGINAL still-active 18.3 world lease before 18.6 credit replay.
// A verified reconnect is NOT a new world admission, combat authorization,
// WebSocket attachment, login endpoint or permission to restore a dead world.
import {createGame3DPrivateQuestRecovery186}
 from './privateQuestRecovery186.mjs';
import {QUEST_SESSION_LOCK_SQL_183}
 from './privateQuestTransactionFence183.mjs';

const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const KEY=/^[A-Za-z0-9_.:-]{8,128}$/;
const SESSION=/^qb174-[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const nonAnon=x=>typeof x==='string'&&WHO.test(x)&&
 !['__anon__','__default__','__dev_test__'].includes(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const equals=(a,b,fields)=>a&&b&&fields.every(k=>a[k]===b[k]);
const LEASE_FIELDS=Object.freeze([
 'ownerId','characterId','worldInstanceId','worldEpoch',
 'serverSessionId','actionSessionId','leaseNonce','expiresAtMs',
]);
const RECONNECT_FIELDS=Object.freeze([
 'identitySource','authenticated','consumed','reconnectId',
 'ownerId','characterId','worldInstanceId','worldEpoch',
 'worldSessionId','actionSessionId','leaseNonce','expiresAtMs',
]);
const denied=reason=>Object.freeze({ok:false,version:'18.7',reason,
 authenticatedReconnect:false,questProgressSynchronized:false,
 worldLeaseRestored:false,transportBindingCreated:false,
 resumeCombatAuthorized:false,rewardsIssued:false,
 privateServerOnly:true,productionReady:false});
const validLease=(l,now)=>object(l)&&
 nonAnon(l.ownerId)&&nonAnon(l.characterId)&&
 KEY.test(l.worldInstanceId)&&KEY.test(l.worldEpoch)&&
 KEY.test(l.serverSessionId)&&SESSION.test(l.actionSessionId)&&
 UUID.test(l.leaseNonce)&&Number.isSafeInteger(l.expiresAtMs)&&
 l.expiresAtMs>now()&&l.expiresAtMs<=now()+900000;
const validReconnect=(r,lease,now)=>object(r)&&
 Object.keys(r).length===RECONNECT_FIELDS.length&&
 Object.keys(r).every(k=>RECONNECT_FIELDS.includes(k))&&
 r.identitySource==='base44-server-verified-reconnect-187'&&
 r.authenticated===true&&r.consumed===true&&
 UUID.test(r.reconnectId)&&
 r.ownerId===lease.ownerId&&r.characterId===lease.characterId&&
 r.worldInstanceId===lease.worldInstanceId&&
 r.worldEpoch===lease.worldEpoch&&
 r.worldSessionId===lease.serverSessionId&&
 r.actionSessionId===lease.actionSessionId&&
 r.leaseNonce===lease.leaseNonce&&
 Number.isSafeInteger(r.expiresAtMs)&&r.expiresAtMs>now()&&
 r.expiresAtMs<=lease.expiresAtMs;

export async function createGame3DPrivateQuestReconnect187({
 worldStage180,serverRequestContext,scope,
 progressionPool,progressionSchema,
 consumeTrustedBase44Reconnect187,now=Date.now,enabled=false,
}={}) {
 if(enabled!==true||
    process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    worldStage180?.version!=='18.0'||
    worldStage180.privateServerOnly!==true||
    worldStage180.publicPlayerRouteInstalled!==false||
    typeof worldStage180.resolveCurrentWorldLease183!=='function'||
    !object(serverRequestContext)||!object(scope)||
    !nonAnon(scope.ownerId)||!nonAnon(scope.characterId)||
    !KEY.test(scope.instanceId)||!KEY.test(scope.instanceEpoch)||
    !HASH.test(scope.mapFingerprint)||
    typeof progressionPool?.connect!=='function'||
    typeof progressionSchema!=='string'||
    !/^[a-z][a-z0-9_]{0,62}$/.test(progressionSchema)||
    typeof consumeTrustedBase44Reconnect187!=='function'||
    typeof now!=='function')
  throw Error('18.7 requires private authenticated Base44 reconnect authority, original world and restricted PostgreSQL');

 const current=async()=>{
  try{
   const claim=await worldStage180.resolveCurrentWorldLease183({
    serverRequestContext,
   });
   return validLease(claim,now)&&
    claim.ownerId===scope.ownerId&&
    claim.characterId===scope.characterId&&
    claim.worldInstanceId===scope.instanceId&&
    claim.worldEpoch===scope.instanceEpoch?claim:null;
  }catch{return null}
 };
 const first=await current();
 if(!first)
  throw Error('18.7 cannot reconnect without original active server world');
 const original=Object.freeze(
  Object.fromEntries(LEASE_FIELDS.map(k=>[k,first[k]])));
 // 18.6 itself verifies the full restricted role, the original immutable
 // 15.2/18.5 receipt and binding, and the active DB session even for zero
 // receipts. The caller never supplies or changes its 18.0 request context.
 const recovery=await createGame3DPrivateQuestRecovery186({
  enabled:true,worldStage180,serverRequestContext,scope,
  progressionPool,progressionSchema,now,
 });
 if(recovery?.version!=='18.6'||recovery.privateServerOnly!==true||
    recovery.publicPlayerRouteInstalled!==false||
    recovery.publicRecoveryRouteInstalled!==false||
    typeof recovery.recover!=='function'||typeof recovery.shutdown!=='function'||
    recovery.rewardsIssued!==false||recovery.combatWorldRestored!==false)
  throw Error('18.7 requires original read-only 18.6 recovery authority');

 let stopped=false,serial=Promise.resolve();
 const seenReconnectIds=new Set();
 const MAX_RECONNECTS=64; // one worker only; no cache eviction/replay window
 const enqueue=fn=>{
  const next=serial.then(fn,fn);
  serial=next.then(()=>{},()=>{});
  return next;
 };
 const stillOriginal=async()=>!stopped&&
  equals(original,await current(),LEASE_FIELDS);
 // Uses the SAME immutable 18.3 lease query and restricted PG role as
 // quest writes. Holds FOR SHARE until COMMIT and requires independently
 // active Base44/world admission before and after each PG transaction.
 // It never issues a new lease, extends an expiry or flips active=true.
 const databaseLease=async()=>{
  if(!await stillOriginal())return false;
  let db=null,started=false;
  try{
   db=await progressionPool.connect();
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');started=true;
   const reply=await db.query(QUEST_SESSION_LOCK_SQL_183,[
    original.ownerId,original.characterId,original.worldInstanceId,
    original.worldEpoch,original.serverSessionId,
    original.actionSessionId,original.leaseNonce,
   ]);
   const row=reply?.rows?.[0];
   const checked=reply?.rowCount===1&&row&&
    row.owner_id===original.ownerId&&
    row.character_id===original.characterId&&
    row.world_instance_id===original.worldInstanceId&&
    row.world_epoch===original.worldEpoch&&
    row.world_session_id===original.serverSessionId&&
    row.action_session_id===original.actionSessionId&&
    row.lease_nonce===original.leaseNonce&&
    row.active===true&&row.not_expired===true&&
    await stillOriginal();
   await db.query(checked?'COMMIT':'ROLLBACK');started=false;
   return checked===true&&await stillOriginal();
  }catch{
   if(started)try{await db.query('ROLLBACK')}catch{}
   return false;
  }finally{db?.release()}
 };
 const reconnect=(...args)=>{
  // This is an internal transport handoff callback, not an HTTP handler.
  // No identity, session fields, receipt ID or coordinates are accepted
  // from a browser: only a server-created opaque reconnect context goes to
  // the independent Base44 verifier, which consumes it exactly once.
  if(args.length!==1||!object(args[0])||
     Object.keys(args[0]).length!==1||
     !Object.hasOwn(args[0],'serverReconnectContext')||
     !object(args[0].serverReconnectContext))
   return Promise.resolve(denied('trusted_server_reconnect_context_required'));
  const reconnectContext=args[0].serverReconnectContext;
  return enqueue(async()=>{
   if(stopped)return denied('private_reconnect_closed');
   if(!await stillOriginal())
    return denied('original_world_session_replaced_or_expired');
   let proof;
   try{proof=await consumeTrustedBase44Reconnect187(
    Object.freeze({serverReconnectContext:reconnectContext})
   )}catch{return denied('base44_reconnect_authority_unavailable')}
   if(!validReconnect(proof,original,now))
    return denied('base44_reconnect_identity_or_nonce_mismatch');
   if(seenReconnectIds.has(proof.reconnectId))
    return denied('replayed_authenticated_reconnect');
   if(seenReconnectIds.size>=MAX_RECONNECTS)
    return denied('private_reconnect_replay_capacity_exhausted');
   // Record before any database or credit operation; a DB failure must
   // never make a consumed auth ticket reusable after a crash/retry.
   seenReconnectIds.add(proof.reconnectId);
   if(!await databaseLease())
    return denied('independent_database_lease_not_active');
   let result;
   try{result=await recovery.recover()}
   catch{return denied('committed_credit_recovery_unavailable')}
   if(result?.ok!==true||
      result.progressSynchronized!==true||
      result.resumeCombatAuthorized!==false||
      result.worldLeaseRestored!==false||
      result.rewardsIssued!==false)
    return denied('original_world_credit_recovery_failed');
   if(!await databaseLease()||stopped)
    return denied('world_session_revoked_during_reconnect');
   return Object.freeze({ok:true,version:'18.7',
    authenticatedReconnect:true,questProgressSynchronized:true,
    receiptsScanned:result.receiptsScanned,
    newlyCreditedObjectives:result.newlyCreditedObjectives,
    progress:result.progress,
    worldLeaseRestored:false,transportBindingCreated:false,
    resumeCombatAuthorized:false,rewardsIssued:false,
    privateServerOnly:true,productionReady:false});
  });
 };
 const shutdown=()=>{
  stopped=true;
  seenReconnectIds.clear();
  recovery.shutdown();
 };
 return Object.freeze({version:'18.7',reconnect,shutdown,
  privateServerOnly:true,publicPlayerRouteInstalled:false,
  publicReconnectRouteInstalled:false,transportBindingCreated:false,
  worldLeaseRestored:false,resumeCombatAuthorized:false,
  rewardsIssued:false,productionReady:false});
}
