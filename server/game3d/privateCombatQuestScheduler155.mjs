// Game 3D Combat / Quest 15.5 — PRIVATE scheduler-owned progression.
// The SAME 13.8 world owner serializes inputs and combat ticks. Committed
// 15.3 receipts are recovered from PostgreSQL before 15.2 credit projection.
// Not a browser route, live worker deployment, quest turn-in or reward system.
import {createGame3DPrivateWorldKillCommit153}
 from './privateWorldKillCommit153.mjs';
import {createGame3DPrivateCommittedQuestCredits152}
 from './privateCommittedQuestCredits152.mjs';
import {createGame3DPrivateQuestAcceptance154}
 from './privateQuestAcceptance154.mjs';

const validKey=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(x);
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const validScope=s=>validKey(s?.instanceId)&&validKey(s?.instanceEpoch)&&
 validKey(s?.holderId)&&who(s?.ownerId)&&who(s?.characterId)&&
 validHash(s?.mapFingerprint);
const MAX_RECEIPTS=16;
const deny=reason=>Object.freeze({
 ok:false,reason,version:'15.5',privateServerOnly:true,
 progressSynchronized:false,questCompleted:false,
 rewardsIssued:false,productionReady:false,
});
const leaseSQL=`
 SELECT instance_id,fencing_token::text AS fencing_token
 FROM game3d_combat_world_instance_lease
 WHERE instance_id=$1 AND instance_epoch=$2 AND holder_id=$3
 AND owner_id=$4 AND character_id=$5 AND map_fingerprint=$6
 AND fencing_token=$7::bigint AND expires_at>clock_timestamp()
 FOR SHARE
`;
const receiptsSQL=`
 SELECT receipt_id,event_seq::text AS event_seq
 FROM game3d_private_world_kill_receipt_152
 WHERE owner_id=$1 AND character_id=$2 AND instance_id=$3
 AND instance_epoch=$4 AND map_fingerprint=$5
 AND server_kill_committed=true
 AND source_kind='server-committed-private-pve-kill'
 ORDER BY event_seq LIMIT 17
 FOR SHARE
`;

// Only the privately constructed scheduler should use this wrapper. The
// 13.8 owner and the encounter must NOT be exposed for un-serialized use.
// A trusted operator still has to provision the world, acquire owner lease,
// bind 15.4 accepted quests, and schedule advance on the game server.
export function createGame3DPrivateCombatQuestScheduler155({
 pool,owner,encounter,scope,authorizeServerOperation,
 transactionFence=null,
}={}){
 if(typeof pool?.connect!=='function'||!validScope(scope)||
  typeof authorizeServerOperation!=='function'||
  transactionFence!==null&&typeof transactionFence!=='function'||
  owner?.version!=='13.8'||owner.privateServerOnly!==true||
  owner.instanceId!==scope.instanceId||
  !Number.isSafeInteger(owner.fencingToken)||owner.fencingToken<1||
  typeof owner.advance!=='function'||typeof owner.release!=='function'||
  ['connect','setInput','submit','poll','disconnect'].some(
   name=>typeof owner[name]!=='function')||
  encounter?.version!=='13.6'||encounter.privateServerOnly!==true||
  encounter.instanceId!==scope.instanceId||
  encounter.mapFingerprint!==scope.mapFingerprint)
  throw Error('15.5 requires same private world, 13.8 lease owner and trusted DB');

 const pinned=Object.freeze({...scope}),token=owner.fencingToken;
 const killWriter=createGame3DPrivateWorldKillCommit153({
  pool,encounter,scope:pinned,fencingToken:token,authorizeServerOperation
 });
 const ledger=createGame3DPrivateCommittedQuestCredits152({
  pool,authorizeServerOperation,transactionFence,
 });
 const quests=createGame3DPrivateQuestAcceptance154({
  pool,authorizeServerOperation,transactionFence,
 });
 let stopped=false,paused=false;
 let queue=Promise.resolve();
 const serial=fn=>{
  const run=queue.then(fn,fn);
  queue=run.then(()=>undefined,()=>undefined);
  return run;
 };
 const usable=()=>stopped?deny('private_quest_scheduler_stopped'):
  paused?deny('private_quest_reconciliation_required'):null;

 // Do NOT trust a memory-only receipt list. An ambiguous commit or crash may
 // leave durable receipts in DB while the caller has no in-memory reply.
 // Lock the same active lease throughout reading & projecting all receipts.
 // A partial projection remains idempotent when retried.
 const reconcileNow=async()=>{
  const client=await pool.connect();
  let transaction=false;
  try{
   await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
   transaction=true;
   const l=await client.query(leaseSQL,[
    pinned.instanceId,pinned.instanceEpoch,pinned.holderId,
    pinned.ownerId,pinned.characterId,pinned.mapFingerprint,token
   ]);
   if(l.rowCount!==1||Number(l.rows[0]?.fencing_token)!==token){
    stopped=true;paused=true;
    await client.query('ROLLBACK');transaction=false;
    return deny('private_quest_world_lease_lost');
   }
   const r=await client.query(receiptsSQL,[
    pinned.ownerId,pinned.characterId,pinned.instanceId,
    pinned.instanceEpoch,pinned.mapFingerprint
   ]);
   if(r.rowCount>MAX_RECEIPTS){
    paused=true;
    await client.query('ROLLBACK');transaction=false;
    return deny('private_quest_receipt_limit_exceeded');
   }
   const credits=[];
   for(const row of r.rows){
    if(typeof row.receipt_id!=='string'||!Number.isSafeInteger(
      Number(row.event_seq))||Number(row.event_seq)<1)
     throw Error('invalid committed receipt');
    const projection=await ledger.project({
     receiptId:row.receipt_id,ownerId:pinned.ownerId,
     characterId:pinned.characterId
    });
    if(projection?.ok!==true||
       projection.rewardAuthorized!==false||
       projection.questTurnInCommitted!==false)
     throw Error('private quest credit projection unavailable');
    credits.push(...projection.credited);
   }
   const progress=await ledger.readProgress({
    ownerId:pinned.ownerId,characterId:pinned.characterId
   });
   if(progress?.ok!==true||progress.rewardAuthorized!==false)
    throw Error('private quest progress read unavailable');
   await client.query('COMMIT');transaction=false;
   paused=false;
   return Object.freeze({ok:true,version:'15.5',
    progressSynchronized:true,processedReceipts:r.rowCount,
    newCredits:Object.freeze(credits),progress:progress.objectives,
    privateServerOnly:true,questCompleted:false,
    rewardsIssued:false,productionReady:false});
  }catch{
   if(transaction)try{await client.query('ROLLBACK')}catch{}
   paused=true;
   return deny('private_quest_reconciliation_failed');
  }finally{client.release()}
 };

 const advance=()=>serial(async()=>{
  const unavailable=usable();if(unavailable)return unavailable;
  let tick;
  try{tick=await owner.advance()}catch{stopped=true;return deny('private_world_advance_failed')}
  if(tick?.ok!==true){stopped=true;
   return deny(tick?.reason||'private_world_advance_refused')}
  let committed;
  try{committed=await killWriter.commit()}catch{}
  if(committed?.ok!==true||committed.rewardAuthorized!==false){
   stopped=true;
   return deny(committed?.reason||'private_world_kill_commit_failed');
  }
  const synchronized=await reconcileNow();
  if(!synchronized.ok)return synchronized;
  return Object.freeze({ok:true,version:'15.5',
   worldEventSeq:tick.eventSeq,killReceiptsCommitted:committed.receipts.length,
   checkpointDigestRecorded:tick.checkpointDigestRecorded===true,
   ...synchronized,productionReady:false});
 });
 const reconcile=()=>serial(async()=>{
  if(stopped)return deny('private_quest_scheduler_stopped');
  return reconcileNow();
 });
 const accept=({questId}={})=>serial(async()=>{
  const unavailable=usable();if(unavailable)return unavailable;
  return quests.accept({ownerId:pinned.ownerId,
   characterId:pinned.characterId,questId});
 });
 const read=()=>serial(async()=>{
  const unavailable=usable();if(unavailable)return unavailable;
  return quests.readAccepted({ownerId:pinned.ownerId,
   characterId:pinned.characterId});
 });
 const call=(name,args)=>serial(async()=>{
  const unavailable=usable();if(unavailable)return unavailable;
  try{return await owner[name](args)}catch{
   stopped=true;return deny('private_world_owner_call_failed')
  }
 });
 const release=()=>serial(async()=>{
  if(stopped)return false;
  stopped=true;
  try{return await owner.release()}catch{return false}
 });
 return Object.freeze({
  version:'15.5',advance,reconcile,accept,read,release,
  connect:args=>call('connect',args),
  setInput:args=>call('setInput',args),
  submit:args=>call('submit',args),
  poll:args=>call('poll',args),
  disconnect:args=>call('disconnect',args),
  privateServerOnly:true,publicRouteInstalled:false,
  publicGameWorldMounted:false,hostedWorkerInstalled:false,
  releaseGate:'private-beta-only',questTurnInWriterEnabled:false,
  transactionFenceInstalled:transactionFence!==null,
  rewardWriterEnabled:false,productionReady:false,
 });
}
