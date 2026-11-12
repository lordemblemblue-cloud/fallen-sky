// Combat / Quest 18.9 — private, real 18.0 pairing-backed adapter for
// the EXISTING durable 18.8 ticket table. No client ticket/identity claims,
// new login authority, public endpoint, extra combat writer, or DB migration.
// A server-owned authenticated request context is the only input.
const KEY=/^[A-Za-z0-9_.:-]{8,128}$/;
const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const SHA=/^[a-f0-9]{64}$/;
const SESSION=/^qb174-[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const nonAnon=x=>typeof x==='string'&&WHO.test(x)&&
 !['__anon__','__default__','__dev_test__'].includes(x);
const privateScope=s=>obj(s)&&nonAnon(s.ownerId)&&
 nonAnon(s.characterId)&&KEY.test(s.instanceId)&&
 KEY.test(s.instanceEpoch)&&SHA.test(s.mapFingerprint);
const fields=['ownerId','characterId','worldInstanceId','worldEpoch',
 'serverSessionId','actionSessionId','leaseNonce','expiresAtMs'];
const same=(a,b)=>a&&b&&fields.every(key=>a[key]===b[key]);
const validLease=(l,at)=>obj(l)&&nonAnon(l.ownerId)&&
 nonAnon(l.characterId)&&KEY.test(l.worldInstanceId)&&
 KEY.test(l.worldEpoch)&&KEY.test(l.serverSessionId)&&
 SESSION.test(l.actionSessionId)&&UUID.test(l.leaseNonce)&&
 Number.isSafeInteger(l.expiresAtMs)&&l.expiresAtMs>at&&
 l.expiresAtMs<=at+900000;
const principalValid=(p,at)=>obj(p)&&p.authenticated===true&&
 p.identitySource==='trusted-server-session'&&
 nonAnon(p.accountId)&&nonAnon(p.characterId)&&
 KEY.test(p.serverSessionId)&&Number.isSafeInteger(p.expiresAtMs)&&
 p.expiresAtMs>at&&p.expiresAtMs<=at+900000;
const actionValid=(p,at)=>obj(p)&&p.authenticated===true&&
 p.identitySource==='base44-verified-action-session-179'&&
 nonAnon(p.accountId)&&nonAnon(p.characterId)&&
 KEY.test(p.worldSessionId)&&SESSION.test(p.actionSessionId)&&
 Number.isSafeInteger(p.expiresAtMs)&&p.expiresAtMs>at&&
 p.expiresAtMs<=at+900000;

export const RECONNECT_TICKET_READ_189=`
 SELECT ticket_id::text AS ticket_id,
  floor(extract(epoch from expires_at)*1000)::bigint AS expires_at_ms
 FROM game3d_private_reconnect_ticket_188
 WHERE owner_id=$1 AND character_id=$2 AND world_instance_id=$3
  AND world_epoch=$4 AND world_session_id=$5 AND action_session_id=$6
  AND lease_nonce=$7::uuid AND consumed_at IS NULL
  AND expires_at>clock_timestamp()
  AND source_kind='server-base44-reconnect-188'
  AND reward_authorized=false
 ORDER BY issued_at DESC,ticket_id DESC
 LIMIT 2
`;

// The independent existing pairing180 verifies both server world identity
// and Base44 action/login revocation. No new "trusted" identity resolver
// may replace it with values copied from a browser JSON request.
export async function createGame3DPrivateReconnectBackend189({
 pairing180,worldStage180,serverRequestContext,scope,
 ticketReaderPool,now=Date.now,enabled=false,
}={}){
 if(enabled!==true||
    process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    pairing180?.version!=='18.0'||
    pairing180.privateServerOnly!==true||
    pairing180.publicPlayerRouteInstalled!==false||
    ['resolveTrustedWorldPrincipal',
     'resolveVerifiedBase44ActionSession','verifySessionActive']
     .some(name=>typeof pairing180[name]!=='function')||
    worldStage180?.version!=='18.0'||
    worldStage180.privateServerOnly!==true||
    worldStage180.publicPlayerRouteInstalled!==false||
    typeof worldStage180.resolveCurrentWorldLease183!=='function'||
    !obj(serverRequestContext)||!privateScope(scope)||
    typeof ticketReaderPool?.connect!=='function'||
    typeof now!=='function')
  throw Error('18.9 requires original 18.0 Base44 pairing and restricted durable ticket reader');

 let stopped=false;
 const current=async()=>{
  if(stopped)return null;
  try{
   const l=await worldStage180.resolveCurrentWorldLease183({
    serverRequestContext,
   });
   if(!validLease(l,now())||l.ownerId!==scope.ownerId||
      l.characterId!==scope.characterId||
      l.worldInstanceId!==scope.instanceId||
      l.worldEpoch!==scope.instanceEpoch)return null;
   return Object.freeze(Object.fromEntries(fields.map(k=>[k,l[k]])));
  }catch{return null}
 };
 const original=await current();
 if(!original)throw Error('18.9 refuses to adopt a lost or replaced world');

 const validWorld=async()=>!stopped&&same(original,await current());
 const verifiedAction=async context=>{
  if(stopped||!obj(context)||!await validWorld())return null;
  let world,action;
  try{
   // Independent 18.0 pairing resolves BOTH authorities on this same
   // new backend request context and rechecks the Base44 signed-in state.
   world=await pairing180.resolveTrustedWorldPrincipal(context);
   action=await pairing180.resolveVerifiedBase44ActionSession(context);
  }catch{return null}
  const t=now();
  if(!principalValid(world,t)||!actionValid(action,t)||
     world.accountId!==original.ownerId||
     world.characterId!==original.characterId||
     world.serverSessionId!==original.serverSessionId||
     action.accountId!==original.ownerId||
     action.characterId!==original.characterId||
     action.worldSessionId!==original.serverSessionId||
     action.actionSessionId!==original.actionSessionId)return null;
  let active=false;
  try{
   active=await pairing180.verifySessionActive(Object.freeze({
    ownerId:original.ownerId,characterId:original.characterId,
    instanceId:scope.instanceId,
    serverSessionId:original.serverSessionId,
    actionSessionId:original.actionSessionId,
   }))===true;
  }catch{return null}
  if(!active||stopped||!await validWorld()||
     world.expiresAtMs<=now()||action.expiresAtMs<=now())return null;
  return Object.freeze({...action,expiresAtMs:Math.min(
   world.expiresAtMs,action.expiresAtMs,original.expiresAtMs,
  )});
 };
 const readPending=async(principalExpiresAtMs)=>{
  if(!Number.isSafeInteger(principalExpiresAtMs)||
     principalExpiresAtMs<=now())return null;
  if(!await validWorld())return null;
  let db;
  try{
   db=await ticketReaderPool.connect();
   const r=await db.query(RECONNECT_TICKET_READ_189,[
    original.ownerId,original.characterId,
    original.worldInstanceId,original.worldEpoch,
    original.serverSessionId,original.actionSessionId,
    original.leaseNonce,
   ]);
   if(r?.rowCount!==1||!Array.isArray(r.rows)||
      r.rows.length!==1||!UUID.test(r.rows[0]?.ticket_id))
    return null;
   const expiresAtMs=Number(r.rows[0].expires_at_ms);
   if(!Number.isSafeInteger(expiresAtMs)||expiresAtMs<=now()||
      expiresAtMs>original.expiresAtMs||
      expiresAtMs>principalExpiresAtMs||!await validWorld())
    return null;
   return Object.freeze({ticketId:r.rows[0].ticket_id,expiresAtMs});
  }catch{return null}
  finally{db?.release()}
 };

 // Called by 18.8 immediately after the issuer has COMMITTED a row.
 // We do NOT copy the ticket into another cache/store: the original 18.8
 // PG table itself is its durable backend-only source of truth. If two
 // outstanding tickets exist for the same live world, refuse to choose.
 const storeIssuedReconnectTicket188=async({
  serverAuthContext,ticketId,expiresAtMs,
 }={})=>{
  if(!UUID.test(ticketId)||!Number.isSafeInteger(expiresAtMs))
   return false;
  const p=await verifiedAction(serverAuthContext);
  if(!p||expiresAtMs>p.expiresAtMs)return false;
  const row=await readPending(p.expiresAtMs);
  return !!row&&row.ticketId===ticketId&&
   row.expiresAtMs===expiresAtMs&&!!await verifiedAction(serverAuthContext);
 };

 const resolveTrustedBase44Action188=async({
  serverAuthContext,serverReconnectContext,
 }={})=>{
  const keys=[serverAuthContext,serverReconnectContext]
   .filter(v=>v!==undefined);
  if(keys.length!==1)return null;
  return await verifiedAction(keys[0]);
 };

 const resolveTrustedReconnectTicket188=async({
  serverReconnectContext,
 }={})=>{
  const p=await verifiedAction(serverReconnectContext);
  if(!p)return null;
  const row=await readPending(p.expiresAtMs);
  if(!row||!await verifiedAction(serverReconnectContext))return null;
  return Object.freeze({source:'trusted-backend-ticket-188',
   ticketId:row.ticketId});
 };

 const shutdown=()=>{stopped=true};
 return Object.freeze({version:'18.9',storeIssuedReconnectTicket188,
  resolveTrustedBase44Action188,resolveTrustedReconnectTicket188,
  shutdown,privateServerOnly:true,publicRouteInstalled:false,
  ticketIdsDeliveredToBrowser:false,usesExistingDurableTicket188:true,
  transportBindingCreated:false,combatResumeAuthorized:false,
  rewardsIssued:false,productionReady:false});
}
