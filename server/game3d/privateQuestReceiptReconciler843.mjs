// Game 3D Combat / Quest 84.3 — replay immutable PostgreSQL kill receipts
// through the ORIGINAL 18.4/18.5 trusted projection, without inventing kills.
// Private staging only: no browser route, new settlement writer or migration.
import {QUEST_SESSION_LOCK_SQL_183}
 from './privateQuestTransactionFence183.mjs';

export const GAME3D_RECONCILE_PAGE_LIMIT_843=16;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const KEY=/^[A-Za-z0-9_.:-]{8,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const RECEIPT=/^worldkill-[a-f0-9]{64}$/;
const ACTION=/^qb174-[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validSeq=x=>typeof x==='string'&&/^[1-9][0-9]*$/.test(x)&&
 Number.isSafeInteger(Number(x));
const denied=(reason,afterEventSeq,processedReceipts=0,mayHaveCommitted=false)=>Object.freeze({
 ok:false,version:'84.3',reason,afterEventSeq,processedReceipts,
 // Previous 15.2 credit transactions may have committed independently.
 partialProjection:processedReceipts>0||mayHaveCommitted,
 retryFromEventSeq:afterEventSeq,
 rewardsIssued:false,rewardAuthorized:false,questTurnInCommitted:false,
 privateServerOnly:true,productionReady:false,
});

// Fixed instance/epoch keyset read. A LEFT JOIN means an older unbound
// receipt is DETECTED and refused instead of silently skipped.
export const RECONCILE_RECEIPTS_SQL_843=`
 SELECT r.receipt_id,r.owner_id,r.character_id,r.instance_id,
  r.instance_epoch,r.map_fingerprint,r.event_seq::text AS event_seq,
  r.enemy_id,r.enemy_tier,r.source_kind AS receipt_source,
  r.server_kill_committed,
  b.receipt_id AS binding_receipt_id,
  b.owner_id AS binding_owner_id,
  b.character_id AS binding_character_id,
  b.instance_id AS binding_instance_id,
  b.instance_epoch AS binding_instance_epoch,
  b.map_fingerprint AS binding_map_fingerprint,
  b.event_seq::text AS binding_event_seq,
  b.server_session_id AS binding_server_session_id,
  b.action_session_id AS binding_action_session_id,
  b.lease_nonce::text AS binding_lease_nonce,
  b.source_kind AS binding_source,b.reward_authorized AS binding_reward_authorized
 FROM game3d_private_world_kill_receipt_152 r
 LEFT JOIN game3d_private_world_kill_lease_binding_185 b
  ON b.receipt_id=r.receipt_id AND b.owner_id=r.owner_id
  AND b.character_id=r.character_id AND b.instance_id=r.instance_id
  AND b.instance_epoch=r.instance_epoch
  AND b.map_fingerprint=r.map_fingerprint AND b.event_seq=r.event_seq
 WHERE r.owner_id=$1 AND r.character_id=$2 AND r.instance_id=$3
  AND r.instance_epoch=$4 AND r.map_fingerprint=$5
  AND r.event_seq>$6::bigint
 ORDER BY r.event_seq ASC LIMIT 17
`;

export function createGame3DPrivateQuestReceiptReconciler843({
 pool,scope,worldStage180,serverRequestContext,
 resolveServerKillContext,projectCommittedKill,readProgress,
 now=Date.now,isStopped=()=>false,enabled=false,
}={}){
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    typeof pool?.connect!=='function'||!object(scope)||
    !ID.test(scope.ownerId)||!ID.test(scope.characterId)||
    !KEY.test(scope.instanceId)||!KEY.test(scope.instanceEpoch)||
    !HASH.test(scope.mapFingerprint)||
    worldStage180?.version!=='18.0'||
    worldStage180.privateServerOnly!==true||
    worldStage180.publicPlayerRouteInstalled!==false||
    typeof worldStage180.resolveCurrentWorldLease183!=='function'||
    !object(serverRequestContext)||
    typeof resolveServerKillContext!=='function'||
    typeof projectCommittedKill!=='function'||
    typeof readProgress!=='function'||
    typeof now!=='function'||typeof isStopped!=='function')
  throw Error('84.3 requires trusted, fenced private staging sources');
 const pinned=Object.freeze({...scope});
 let tail=Promise.resolve();
 const serial=fn=>{
  const call=tail.then(fn,fn);
  tail=call.then(()=>undefined,()=>undefined);
  return call;
 };
 const current=async()=>{
  if(isStopped())return null;
  let lease;
  try{lease=await worldStage180.resolveCurrentWorldLease183({
   serverRequestContext,
  })}catch{return null}
  if(isStopped()||!object(lease)||
     lease.ownerId!==pinned.ownerId||
     lease.characterId!==pinned.characterId||
     lease.worldInstanceId!==pinned.instanceId||
     lease.worldEpoch!==pinned.instanceEpoch||
     !KEY.test(lease.serverSessionId)||
     !ACTION.test(lease.actionSessionId)||
     !UUID.test(lease.leaseNonce)||
     !Number.isSafeInteger(lease.expiresAtMs)||lease.expiresAtMs<=now())
   return null;
  return Object.freeze({...lease});
 };
 const same=(a,b)=>!!a&&!!b&&
  ['ownerId','characterId','worldInstanceId','worldEpoch',
   'serverSessionId','actionSessionId','leaseNonce','expiresAtMs']
   .every(key=>a[key]===b[key]);
 const locked=(row,lease)=>row?.owner_id===lease.ownerId&&
  row.character_id===lease.characterId&&
  row.world_instance_id===lease.worldInstanceId&&
  row.world_epoch===lease.worldEpoch&&
  row.world_session_id===lease.serverSessionId&&
  row.action_session_id===lease.actionSessionId&&
  row.lease_nonce===lease.leaseNonce&&row.active===true&&
  row.not_expired===true;
 const validRow=(r,lease)=>RECEIPT.test(r?.receipt_id)&&
  r.owner_id===pinned.ownerId&&r.character_id===pinned.characterId&&
  r.instance_id===pinned.instanceId&&
  r.instance_epoch===pinned.instanceEpoch&&
  r.map_fingerprint===pinned.mapFingerprint&&
  validSeq(r.event_seq)&&r.server_kill_committed===true&&
  r.receipt_source==='server-committed-private-pve-kill'&&
  typeof r.enemy_id==='string'&&r.enemy_id.length>0&&
  ['normal','elite','champion','miniBoss'].includes(r.enemy_tier)&&
  r.binding_receipt_id===r.receipt_id&&
  r.binding_owner_id===pinned.ownerId&&
  r.binding_character_id===pinned.characterId&&
  r.binding_instance_id===pinned.instanceId&&
  r.binding_instance_epoch===pinned.instanceEpoch&&
  r.binding_map_fingerprint===pinned.mapFingerprint&&
  r.binding_event_seq===r.event_seq&&
  r.binding_server_session_id===lease.serverSessionId&&
  r.binding_action_session_id===lease.actionSessionId&&
  r.binding_lease_nonce===lease.leaseNonce&&
  r.binding_source==='15.3-server-committed-18.5-lease'&&
  r.binding_reward_authorized===false;

 const readPage=async(afterEventSeq,lease)=>{
  let client,begun=false;
  try{
   client=await pool.connect();
   await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
   begun=true;
   const gate=await client.query(QUEST_SESSION_LOCK_SQL_183,[
    lease.ownerId,lease.characterId,lease.worldInstanceId,
    lease.worldEpoch,lease.serverSessionId,
    lease.actionSessionId,lease.leaseNonce,
   ]);
   if(gate.rowCount!==1||!locked(gate.rows?.[0],lease))
    throw Error('session fence failed');
   const result=await client.query(RECONCILE_RECEIPTS_SQL_843,[
    pinned.ownerId,pinned.characterId,pinned.instanceId,
    pinned.instanceEpoch,pinned.mapFingerprint,afterEventSeq,
   ]);
   if(!Array.isArray(result?.rows)||result.rowCount!==result.rows.length||
      result.rows.length>GAME3D_RECONCILE_PAGE_LIMIT_843+1)
    throw Error('invalid receipt page');
   let prev=afterEventSeq;
   for(const row of result.rows){
    if(!validRow(row,lease)||Number(row.event_seq)<=prev)
     throw Error('unbound or unsorted original kill receipt');
    prev=Number(row.event_seq);
   }
   if(!same(lease,await current()))throw Error('world session changed');
   await client.query('COMMIT');begun=false;
   return result.rows;
  }catch{
   if(begun)try{await client.query('ROLLBACK')}catch{}
   return null;
  }finally{if(client)client.release()}
 };
 const reconcile=({afterEventSeq=0}={})=>serial(async()=>{
  if(!Number.isSafeInteger(afterEventSeq)||afterEventSeq<0)
   return denied('invalid_reconciliation_cursor',0);
  if(isStopped())return denied('private_quest_reconciliation_stopped',afterEventSeq);
  const lease=await current();
  if(!lease)return denied('world_session_unverified',afterEventSeq);
  const rows=await readPage(afterEventSeq,lease);
  if(!rows)return denied('trusted_receipt_page_unavailable',afterEventSeq);
  const page=rows.slice(0,GAME3D_RECONCILE_PAGE_LIMIT_843);
  const credited=[];
  let processed=0;
  for(const row of page){
   if(isStopped()||!same(lease,await current()))
    return denied('world_session_changed_during_replay',afterEventSeq,processed);
   const persisted=Object.freeze({
    receiptId:row.receipt_id,ownerId:pinned.ownerId,
    characterId:pinned.characterId,instanceId:pinned.instanceId,
    instanceEpoch:pinned.instanceEpoch,mapFingerprint:pinned.mapFingerprint,
    eventSeq:Number(row.event_seq),enemyId:row.enemy_id,
    enemyTier:row.enemy_tier,serverSessionId:lease.serverSessionId,
    actionSessionId:lease.actionSessionId,leaseNonce:lease.leaseNonce,
   });
   let ctx,projected;
   try{
    ctx=await resolveServerKillContext(Object.freeze({
     serverRequestContext,persistedReceipt:persisted,
    }));
    if(!object(ctx))throw Error('trusted context unavailable');
    projected=await projectCommittedKill(Object.freeze({
     serverRequestContext,serverKillContext:ctx,
    }));
   }catch{return denied('trusted_receipt_projection_unavailable',afterEventSeq,processed,true)}
   if(projected?.ok!==true||projected.receiptId!==row.receipt_id||
      !Array.isArray(projected.credited)||
      projected.rewardAuthorized!==false||
      projected.rewardsIssued!==false||
      projected.questTurnInCommitted!==false)
    return denied('trusted_receipt_projection_denied',afterEventSeq,processed,true);
   processed++;
   credited.push(...projected.credited);
  }
  let progress;
  try{progress=await readProgress(Object.freeze({serverRequestContext}))}
  catch{return denied('trusted_progress_read_unavailable',afterEventSeq,processed)}
  if(progress?.ok!==true||!Array.isArray(progress.objectives)||
     progress.rewardAuthorized!==false||progress.rewardsIssued!==false||
     isStopped()||!same(lease,await current()))
   return denied('world_session_or_progress_unverified',afterEventSeq,processed);
  return Object.freeze({ok:true,version:'84.3',
   afterEventSeq,processedReceipts:processed,
   nextEventSeq:page.length?Number(page.at(-1).event_seq):afterEventSeq,
   hasMore:rows.length>GAME3D_RECONCILE_PAGE_LIMIT_843,
   newCredits:Object.freeze(credited),
   objectives:Object.freeze([...progress.objectives]),
   partialProjection:false,questTurnInCommitted:false,
   rewardsIssued:false,rewardAuthorized:false,
   privateServerOnly:true,productionReady:false,
  });
 });
 return Object.freeze({version:'84.3',reconcile,
  privateServerOnly:true,publicPlayerRouteInstalled:false,
  rewardWriterInstalled:false,productionReady:false});
}
