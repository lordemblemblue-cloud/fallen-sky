// 30.3–30.8: restricted-role PostgreSQL 16 original-world lease guard.
// Reuses original 19.1 pairing and original 18.3 SELECT ... FOR SHARE.
// This is NOT an issuer, lease refresh, revoker, player login or production route.
import {createPrivateTransportAuthority191}
 from './privateTransportAuthority191.mjs';
import {QUEST_SESSION_LOCK_SQL_183,
 assertGame3DQuestSessionFenceReadiness183}
 from './privateQuestTransactionFence183.mjs';

export async function createPrivatePgLeaseGuard303({
 enabled=false,scope,serverRequestContext,pairing180,worldStage180,
 pool,schema,now=Date.now,lockTimeoutMs=750,statementTimeoutMs=2500,
 connectionTimeoutMs=1500,
}={}){
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    typeof pool?.connect!=='function'||typeof now!=='function'||
    typeof schema!=='string'||!/^[a-z][a-z0-9_]{0,62}$/.test(schema)||
    !Number.isInteger(connectionTimeoutMs)||connectionTimeoutMs<100||
    connectionTimeoutMs>3000||
    !Number.isInteger(lockTimeoutMs)||lockTimeoutMs<50||lockTimeoutMs>1000||
    !Number.isInteger(statementTimeoutMs)||statementTimeoutMs<250||
    statementTimeoutMs>3000||statementTimeoutMs<=lockTimeoutMs)
  throw Error('30.3 requires private staged, restricted PostgreSQL lease reader');
 await assertGame3DQuestSessionFenceReadiness183({pool,schema});
 const authority=await createPrivateTransportAuthority191({enabled:true,
  scope,serverRequestContext,pairing180,worldStage180,now});
 const original=authority.original;
 let stopped=false,stageLost=false,clockBad=false,previousClock=null,
  pending=0;
 const stage=()=>{
  if(process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging')stageLost=true;
  return !stopped&&!stageLost;
 };
 const clock=()=>{
  if(clockBad)return null;
  let t;try{t=now()}catch{clockBad=true;return null}
  if(!Number.isSafeInteger(t)||t<=0||
     (previousClock!==null&&t<previousClock)){clockBad=true;return null}
  previousClock=t;return t;
 };
 const verify=async()=>{
  if(!stage()||clock()===null||pending>=2)return false;
  pending++;
  let client,transaction=false;
  try{
   if(!await authority.stillOriginal()||!stage())return false;
   // A stalled pool cannot occupy this admitted session indefinitely.
   // Release a client that arrives AFTER timeout rather than leaking a slot.
   let timeout,expired=false;
   const acquiring=Promise.resolve().then(()=>pool.connect());
   try{
    client=await Promise.race([acquiring,new Promise((_,reject)=>{
     timeout=setTimeout(()=>{expired=true;reject(Error('pg_connect_timeout'))},
      connectionTimeoutMs);
    })]);
   }catch{
    if(expired)void acquiring.then(late=>{try{late?.release()}catch{}},()=>{});
    return false;
   }finally{clearTimeout(timeout)}
   if(!stage()||clock()===null)return false;
   await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
   transaction=true;
   // In the *same* read-locking transaction; not an application-level timer.
   await client.query(`SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`);
   await client.query(`SET LOCAL statement_timeout = '${statementTimeoutMs}ms'`);
   const answer=await client.query(QUEST_SESSION_LOCK_SQL_183,[
    original.ownerId,original.characterId,original.worldInstanceId,
    original.worldEpoch,original.serverSessionId,original.actionSessionId,
    original.leaseNonce,
   ]);
   const row=answer?.rows?.[0];
   const valid=answer?.rowCount===1&&answer.rows.length===1&&row&&
    row.owner_id===original.ownerId&&
    row.character_id===original.characterId&&
    row.world_instance_id===original.worldInstanceId&&
    row.world_epoch===original.worldEpoch&&
    row.world_session_id===original.serverSessionId&&
    row.action_session_id===original.actionSessionId&&
    typeof row.lease_nonce==='string'&&
    row.lease_nonce.toLowerCase()===original.leaseNonce.toLowerCase()&&
    row.active===true&&row.not_expired===true&&
    stage()&&clock()!==null&&await authority.stillOriginal();
   if(!valid)return false;
   await client.query('COMMIT');
   transaction=false;
   return stage()&&clock()!==null&&await authority.stillOriginal();
  }catch{return false}
  finally{
   if(transaction)try{await client?.query('ROLLBACK')}catch{}
   try{client?.release()}catch{}
   pending--;
  }
 };
 const shutdown=()=>{
  if(stopped)return false;
  stopped=true;authority.shutdown();return true;
 };
 return Object.freeze({version:'30.3',verify,shutdown,
  privateServerOnly:true,publicRouteInstalled:false,
  schemaMigrated:false,roleGranted:false,leaseIssued:false,
  resumeCombatAuthorized:false,rewardsIssued:false,productionReady:false});
}
