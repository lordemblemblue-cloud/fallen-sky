// 19.2: independent 18.3 PostgreSQL lease lock, before/after read-only handoff.
import {QUEST_SESSION_LOCK_SQL_183}
 from './privateQuestTransactionFence183.mjs';
export function createPrivateTransportFence192({pool,original,stillOriginal}={}){
 if(typeof pool?.connect!=='function'||typeof stillOriginal!=='function'||
    !original||typeof original!=='object')
  throw Error('19.2 requires restricted PG pool and original 18.3 lease');
 let stopped=false;
 const verify=async()=>{
  if(stopped||!await stillOriginal())return false;
  let db,started=false;
  try{
   db=await pool.connect();
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');started=true;
   const result=await db.query(QUEST_SESSION_LOCK_SQL_183,[
    original.ownerId,original.characterId,original.worldInstanceId,
    original.worldEpoch,original.serverSessionId,original.actionSessionId,
    original.leaseNonce,
   ]);
   const row=result?.rows?.[0];
   const valid=result?.rowCount===1&&row&&
    row.owner_id===original.ownerId&&
    row.character_id===original.characterId&&
    row.world_instance_id===original.worldInstanceId&&
    row.world_epoch===original.worldEpoch&&
    row.world_session_id===original.serverSessionId&&
    row.action_session_id===original.actionSessionId&&
    row.lease_nonce===original.leaseNonce&&
    row.active===true&&row.not_expired===true&&
    !stopped&&await stillOriginal();
   await db.query(valid?'COMMIT':'ROLLBACK');started=false;
   return valid===true&&!stopped&&await stillOriginal();
  }catch{
   if(started)try{await db.query('ROLLBACK')}catch{}
   return false;
  }finally{db?.release()}
 };
 return Object.freeze({version:'19.2',verify,shutdown(){stopped=true},
  privateServerOnly:true,publicRouteInstalled:false,
  productionReady:false});
}
