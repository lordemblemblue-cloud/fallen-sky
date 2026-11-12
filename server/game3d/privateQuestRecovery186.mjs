// Game 3D Combat / Quest 18.6 — idempotent, bounded replay of ALREADY
// COMMITTED private world kill receipts after a failed/ambiguous projection.
// Never recreates an encounter, reissues a world lease, writes a kill,
// revives an old session or awards XP/items/wallet value.
import {createGame3DPrivateCommittedQuestCredits152}
 from './privateCommittedQuestCredits152.mjs';
import {createGame3DPrivateWorldKillLeaseBinding185}
 from './privateWorldKillLeaseBinding185.mjs';
import {createGame3DQuestTransactionFence183,QUEST_SESSION_LOCK_SQL_183}
 from './privateQuestTransactionFence183.mjs';
import {assertGame3DPrivateQuestRecoveryReadiness186}
 from './privateQuestRecoveryReadiness186.mjs';

export const GAME3D_RECOVERY_MAX_KILLS_186=16;
// 13.6 allows at most 16 sealed enemies per private world. Read one extra
// row so a corrupt/out-of-scope world does not silently truncate progress.
// LEFT JOIN intentionally exposes unbound historical receipts: skip or
// guess a new nonce would be unsafe. No FOR SHARE on immutable receipts.
export const GAME3D_RECOVERY_READ_SQL_186=`
 SELECT r.receipt_id,r.event_seq::text AS event_seq,
  b.receipt_id AS bound_receipt_id,
  b.lease_nonce::text AS bound_nonce,b.action_session_id,
  b.server_session_id,b.source_kind,b.reward_authorized
 FROM game3d_private_world_kill_receipt_152 r
 LEFT JOIN game3d_private_world_kill_lease_binding_185 b
  ON b.receipt_id=r.receipt_id
 WHERE r.owner_id=$1 AND r.character_id=$2
  AND r.instance_id=$3 AND r.instance_epoch=$4
  AND r.map_fingerprint=$5
  AND r.server_kill_committed=true
  AND r.source_kind='server-committed-private-pve-kill'
 ORDER BY r.event_seq ASC
 LIMIT 17
`;

const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const KEY=/^[A-Za-z0-9_.:-]{8,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const RECEIPT=/^worldkill-[a-f0-9]{64}$/;
const SESSION=/^qb174-[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const validScope=s=>s!==null&&typeof s==='object'&&!Array.isArray(s)&&
 WHO.test(s.ownerId)&&WHO.test(s.characterId)&&
 KEY.test(s.instanceId)&&KEY.test(s.instanceEpoch)&&
 HASH.test(s.mapFingerprint)&&
 !['__anon__','__default__','__dev_test__'].includes(s.ownerId)&&
 !['__anon__','__default__','__dev_test__'].includes(s.characterId);
const sameLease=(a,b)=>a&&b&&
 ['ownerId','characterId','worldInstanceId','worldEpoch',
  'actionSessionId','serverSessionId','leaseNonce','expiresAtMs']
  .every(k=>a[k]===b[k]);
const denied=reason=>Object.freeze({
 ok:false,version:'18.6',reason,receiptsScanned:0,
 newCredits:Object.freeze([]),progressSynchronized:false,
 resumeCombatAuthorized:false,worldLeaseRestored:false,
 rewardsIssued:false,productionReady:false,privateServerOnly:true,
});
const eventSeq=x=>{
 if(typeof x!=='string'||!/^[1-9][0-9]*$/.test(x))return null;
 const n=Number(x);
 return Number.isSafeInteger(n)&&n>0?n:null;
};

export async function createGame3DPrivateQuestRecovery186({
 worldStage180,serverRequestContext,scope,
 progressionPool,progressionSchema,now=Date.now,enabled=false,
}={}) {
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    worldStage180?.version!=='18.0'||
    worldStage180.privateServerOnly!==true||
    worldStage180.publicPlayerRouteInstalled!==false||
    typeof worldStage180.resolveCurrentWorldLease183!=='function'||
    typeof worldStage180.resolveQuestTransactionClaim183!=='function'||
    !serverRequestContext||typeof serverRequestContext!=='object'||
    !validScope(scope)||typeof progressionPool?.connect!=='function'||
    typeof progressionSchema!=='string'||
    !/^[a-z][a-z0-9_]{0,62}$/.test(progressionSchema)||
    typeof now!=='function')
  throw Error('18.6 requires original live authenticated world, restricted PG and verified 18.5 receipts');

 // An unprivileged projection role can SELECT the binding but NEVER insert
 // or update it. 184 readiness also blocks XP, item, and wallet writes.
 await assertGame3DPrivateQuestRecoveryReadiness186({
  pool:progressionPool,schema:progressionSchema,
 });
 const pinned=Object.freeze({
  ownerId:scope.ownerId,characterId:scope.characterId,
  instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch,
  mapFingerprint:scope.mapFingerprint,
 });
 let stopped=false,queue=Promise.resolve();
 const live=async()=>{
  if(stopped)return null;
  try{
   const candidate=await worldStage180.resolveCurrentWorldLease183({
    serverRequestContext,
   });
   if(stopped||candidate?.ownerId!==pinned.ownerId||
      candidate.characterId!==pinned.characterId||
      candidate.worldInstanceId!==pinned.instanceId||
      candidate.worldEpoch!==pinned.instanceEpoch||
      !SESSION.test(candidate.actionSessionId)||
      !KEY.test(candidate.serverSessionId)||
      !UUID.test(candidate.leaseNonce)||
      !Number.isSafeInteger(candidate.expiresAtMs)||
      candidate.expiresAtMs<=now()||
      candidate.expiresAtMs>now()+900000)return null;
   return candidate;
  }catch{return null;}
 };
 const original=await live();
 if(!original)throw Error('18.6 refuses startup without original active world admission');

 const binding=createGame3DPrivateWorldKillLeaseBinding185({
  enabled:true,now,worldStage180,serverRequestContext,scope:pinned,
 });
 const fence=createGame3DQuestTransactionFence183({
  enabled:true,now,
  resolveTrustedWorldLease:worldStage180.resolveQuestTransactionClaim183,
 });
 const auth=async({operation,ownerId,characterId})=>{
  if(!['project_committed_quest_kill','read_committed_quest_progress']
   .includes(operation)||ownerId!==pinned.ownerId||
     characterId!==pinned.characterId)return false;
  return sameLease(original,await live());
 };
 const ledger=createGame3DPrivateCommittedQuestCredits152({
  pool:progressionPool,authorizeServerOperation:auth,
  verifyCommittedReceipt185:binding.verifyCommittedReceipt185,
  // 18.3 rejects legacy null quest IDs. 18.6 must use the explicit
  // per-quest mode, like the already-merged 18.4 progression factory.
  sessionFenceMode:'per-quest',
  transactionFence:(db,claim)=>fence.verifyInTransaction(db,Object.freeze({
   ...claim,sessionId:original.actionSessionId,
  })),
 });
 // Even an EMPTY world must prove that the independent PostgreSQL
 // session issuer has not revoked the active row. Per-receipt 15.2
 // transaction fencing is otherwise never reached for an empty scan.
 // This takes the same restricted PG FOR SHARE lock used by 18.3 and
 // holds it until COMMIT, serializing with the independently privileged
 // issuer/revoker. No session is created, extended or repaired here.
 const verifyDatabaseLease=async()=>{
  if(!sameLease(original,await live()))return false;
  let db=null,tx=false;
  try{
   db=await progressionPool.connect();
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');tx=true;
   const result=await db.query(QUEST_SESSION_LOCK_SQL_183,[
    original.ownerId,original.characterId,original.worldInstanceId,
    original.worldEpoch,original.serverSessionId,
    original.actionSessionId,original.leaseNonce,
   ]);
   const row=result?.rows?.[0];
   const verified=result?.rowCount===1&&row&&
    row.owner_id===original.ownerId&&
    row.character_id===original.characterId&&
    row.world_instance_id===original.worldInstanceId&&
    row.world_epoch===original.worldEpoch&&
    row.world_session_id===original.serverSessionId&&
    row.action_session_id===original.actionSessionId&&
    row.lease_nonce===original.leaseNonce&&
    row.active===true&&row.not_expired===true&&
    sameLease(original,await live());
   await db.query(verified?'COMMIT':'ROLLBACK');tx=false;
   return verified===true&&sameLease(original,await live());
  }catch{
   if(tx)try{await db.query('ROLLBACK')}catch{}
   return false;
  }finally{db?.release()}
 };
 const scanRows=async()=>{
  let db;
  try{
   db=await progressionPool.connect();
   const result=await db.query(GAME3D_RECOVERY_READ_SQL_186,[
    pinned.ownerId,pinned.characterId,pinned.instanceId,
    pinned.instanceEpoch,pinned.mapFingerprint,
   ]);
   if(!Array.isArray(result?.rows)||
      result.rows.length>GAME3D_RECOVERY_MAX_KILLS_186||
      !Number.isInteger(result.rowCount)||
      result.rowCount!==result.rows.length)return null;
   const rows=[],seen=new Set();
   let previous=0;
   for(const row of result.rows){
    const seq=eventSeq(row?.event_seq);
    if(!RECEIPT.test(row?.receipt_id)||seq===null||
       seq<=previous||seen.has(row.receipt_id)||
       row.bound_receipt_id!==row.receipt_id||
       row.bound_nonce!==original.leaseNonce||
       row.action_session_id!==original.actionSessionId||
       row.server_session_id!==original.serverSessionId||
       row.source_kind!=='15.3-server-committed-18.5-lease'||
       row.reward_authorized!==false)return null;
    previous=seq;
    seen.add(row.receipt_id);
    rows.push(Object.freeze({receiptId:row.receipt_id,eventSeq:seq}));
   }
   return Object.freeze(rows);
  }catch{return null;}finally{db?.release()}
 };
 // Re-read ALL immutable receipts each attempt. No volatile cursor and no
 // offset pagination means a process crash between two credit transactions
 // cannot permanently skip a receipt. Duplicate credit is rejected by
 // 15.2's unique key. This method is backend-only and takes NO identity,
 // receipt ID, world coordinates or client-supplied cursor.
 const doRecover=async()=>{
  if(!sameLease(original,await live()))
   return denied('original_world_session_no_longer_active');
  if(!await verifyDatabaseLease())
   return denied('independent_database_session_lease_unverified');
  const receipts=await scanRows();
  if(!receipts)return denied('unbound_or_invalid_committed_receipt');
  if(!sameLease(original,await live()))
   return denied('world_session_changed_before_replay');
  const newCredits=[];
  for(const row of receipts){
   if(!sameLease(original,await live()))
    return denied('world_session_changed_during_replay');
   let projected;
   try{projected=await ledger.project({
    receiptId:row.receiptId,ownerId:pinned.ownerId,
    characterId:pinned.characterId,
   });}catch{return denied('committed_credit_writer_unavailable')}
   if(projected?.ok!==true||
      projected.rewardAuthorized!==false||
      projected.questTurnInCommitted!==false)
    return denied('committed_kill_reconciliation_failed');
   if(Array.isArray(projected.credited))
    newCredits.push(...projected.credited);
  }
  if(!sameLease(original,await live()))
   return denied('world_session_changed_after_replay');
  let progress;
  try{progress=await ledger.readProgress({
   ownerId:pinned.ownerId,characterId:pinned.characterId,
  });}catch{return denied('private_quest_reader_unavailable')}
  if(progress?.ok!==true||progress.rewardAuthorized!==false||
     !sameLease(original,await live()))
   return denied('private_quest_progress_unavailable');
  // A no-receipts run also checks PG at the END, since it does not
  // execute any per-receipt session-fenced write transaction.
  if(!await verifyDatabaseLease())
   return denied('independent_database_session_lease_changed');
  return Object.freeze({ok:true,version:'18.6',
   receiptsScanned:receipts.length,
   newlyCreditedObjectives:newCredits.length,
   newCredits:Object.freeze(newCredits),
   progress:Object.freeze(progress.objectives),
   progressSynchronized:true,
   resumeCombatAuthorized:false,worldLeaseRestored:false,
   rewardsIssued:false,productionReady:false,privateServerOnly:true,
  });
 };
 const recover=(...args)=>{
  if(args.length!==0)return Promise.resolve(denied('server_only_no_client_arguments'));
  const task=queue.then(doRecover,doRecover);
  queue=task.then(()=>{},()=>{});
  return task;
 };
 const shutdown=()=>{stopped=true;binding.shutdown()};
 return Object.freeze({version:'18.6',recover,shutdown,
  privateServerOnly:true,publicPlayerRouteInstalled:false,
  publicRecoveryRouteInstalled:false,combatWorldRestored:false,
  rewardsIssued:false,productionReady:false});
}
