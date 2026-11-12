// Game 3D Combat / Quest 18.4 — private quest progress from committed server
// kill receipts to one-time, reward-free turn-in. Uses ONLY the existing
// 15.2 kill-credit ledger, 15.6 turn-in journal and 18.3 PG lease fence.
// Does not mint kill receipts, award XP/items/currency or mount a route.
import {createGame3DPrivateCommittedQuestCredits152}
 from './privateCommittedQuestCredits152.mjs';
import {createGame3DPrivateQuestTurnIn156}
 from './privateQuestTurnIn156.mjs';
import {createGame3DQuestTransactionFence183}
 from './privateQuestTransactionFence183.mjs';
import {getPrivateQuestDefinition154}
 from './privateQuestCatalog154.mjs';
import {assertGame3DPrivateQuestProgressionReadiness184}
 from './privateQuestProgressionReadiness184.mjs';
import {createGame3DTrustedNpcWorldBridge177}
 from './trustedNpcWorldBridge177.mjs';
import {createGame3DNpcInteractionGate175,getGame3DPrivateQuestNpc175}
 from './privateNpcInteractionGate175.mjs';

const KEY=/^[A-Za-z0-9_.:-]{8,160}$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&
 Object.keys(x).every(k=>keys.includes(k));
const denied=reason=>Object.freeze({ok:false,version:'18.4',reason,
 privateServerOnly:true,killCreditCommitted:false,
 questTurnInCommitted:false,rewardsIssued:false,productionReady:false});

export async function createGame3DPrivateQuestProgression184({
 progressionPool,progressionSchema,worldStage180,resolveTrustedCommittedKill,
 verifyCommittedReceipt185=null,
 now=Date.now,enabled=false,
}={}) {
 if(enabled!==true||
    process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    progressionPool?.connect===undefined||
    typeof progressionPool.connect!=='function'||
    worldStage180?.version!=='18.0'||
    worldStage180.privateServerOnly!==true||
    worldStage180.publicPlayerRouteInstalled!==false||
    ['resolveCurrentWorldLease183','resolveQuestTransactionClaim183',
     'verifyWorldActionSession'].some(k=>typeof worldStage180[k]!=='function')||
    ['consumeServerNpcInteraction','readServerWorldSnapshot',
     'verifyServerLineOfSight'].some(k=>
      typeof worldStage180.questActionWorldHost177?.[k]!=='function')||
    typeof resolveTrustedCommittedKill!=='function'||
    (verifyCommittedReceipt185!==null&&
     typeof verifyCommittedReceipt185!=='function')||
    typeof progressionSchema!=='string'||
    !/^[a-z][a-z0-9_]{0,62}$/.test(progressionSchema)||
    typeof now!=='function')
  throw Error('18.4 requires server-authenticated private staging, committed-kill authority and PG session fence');

 await assertGame3DPrivateQuestProgressionReadiness184({
  pool:progressionPool,schema:progressionSchema,
 });
 const fence=createGame3DQuestTransactionFence183({
  enabled:true,now,
  resolveTrustedWorldLease:worldStage180.resolveQuestTransactionClaim183,
 });
 // A turn-in must be a separate, newly recorded, one-use NPC interaction
 // from the existing real 17.8/17.7/17.5 trusted world chain. Quest
 // acceptance and turn-in may NOT reuse the same event/receipt.
 const npcBridge177=createGame3DTrustedNpcWorldBridge177({
  ...worldStage180.questActionWorldHost177,now,
 });
 const npcGate175=createGame3DNpcInteractionGate175({
  resolveTrustedInteraction:npcBridge177.resolveTrustedInteraction,now,
 });
 let stopped=false;
 const currentLease=async context=>{
  if(stopped||!object(context))return null;
  let lease;
  try{lease=await worldStage180.resolveCurrentWorldLease183({
   serverRequestContext:context,
  })}catch{return null;}
  if(!object(lease)||typeof lease.ownerId!=='string'||
     typeof lease.characterId!=='string'||
     typeof lease.actionSessionId!=='string'||
     typeof lease.leaseNonce!=='string'||
     !Number.isSafeInteger(lease.expiresAtMs)||
     lease.expiresAtMs<=now())return null;
  return lease;
 };
 const sameLease=(a,b)=>a&&b&&
  ['ownerId','characterId','worldInstanceId','worldEpoch',
   'serverSessionId','actionSessionId','leaseNonce','expiresAtMs']
   .every(k=>a[k]===b[k]);
 const authority=(context,lease,expectedOp)=>async request=>{
  if(stopped||request?.operation!==expectedOp||
     request.ownerId!==lease.ownerId||
     request.characterId!==lease.characterId)return false;
  const fresh=await currentLease(context);
  return sameLease(lease,fresh);
 };
 const transactionFence=(lease)=>async(db,claim)=>{
  if(stopped||!sameLease(lease,await currentLease(lease.context)))return false;
  return fence.verifyInTransaction(db,Object.freeze({
   ...claim,sessionId:lease.actionSessionId,
  }));
 };
 // No browser chooses receiptId, ownerId or the killed enemy. The caller
 // passes an opaque serverKillContext to an INDEPENDENT trusted resolver,
 // whose receipt must already exist in PostgreSQL as server-committed.
 const projectCommittedKill=async request=>{
  if(stopped||!exact(request,['serverRequestContext','serverKillContext']))
   return denied('trusted_kill_context_required');
  const context=request.serverRequestContext;
  const verified=await currentLease(context);
  if(!verified)return denied('world_session_unverified');
  let receipt;
  try{receipt=await resolveTrustedCommittedKill(Object.freeze({
   serverRequestContext:context,serverKillContext:request.serverKillContext,
  }))}catch{return denied('committed_kill_authority_unavailable')}
  if(!exact(receipt,['receiptId','ownerId','characterId',
    'worldInstanceId','worldEpoch','leaseNonce',
    'serverKillCommitted','sourceKind'])||
     typeof receipt.receiptId!=='string'||!KEY.test(receipt.receiptId)||
     receipt.ownerId!==verified.ownerId||
     receipt.characterId!==verified.characterId||
     receipt.worldInstanceId!==verified.worldInstanceId||
     receipt.worldEpoch!==verified.worldEpoch||
     receipt.leaseNonce!==verified.leaseNonce||
     receipt.serverKillCommitted!==true||
     receipt.sourceKind!=='server-committed-private-pve-kill')
   return denied('committed_server_kill_not_verified');
  const lease={...verified,context};
  if(!sameLease(lease,await currentLease(context)))
   return denied('world_session_changed_before_credit');
  const ledger=createGame3DPrivateCommittedQuestCredits152({
   pool:progressionPool,
   authorizeServerOperation:authority(context,lease,'project_committed_quest_kill'),
   transactionFence:transactionFence(lease),
   verifyCommittedReceipt185,
   sessionFenceMode:'per-quest',
  });
  let result;
  try{
   result=await ledger.project({
    receiptId:receipt.receiptId,
    ownerId:lease.ownerId,characterId:lease.characterId,
   });
  }catch{return denied('committed_kill_database_unavailable')}
  if(result?.ok!==true||result.rewardAuthorized===true)
   return denied(result?.reason??'committed_kill_projection_denied');
  return Object.freeze({...result,version:'18.4',
   rewardsIssued:false,productionReady:false});
 };
 // Server-only Questbook objective read after verified world admission.
 // Reuse the existing 15.2 committed-credit projection; no progress writes.
 const readProgress=async request=>{
  if(stopped||!exact(request,['serverRequestContext']))
   return denied('trusted_quest_reader_required');
  const context=request.serverRequestContext;
  const verified=await currentLease(context);
  if(!verified)return denied('world_session_unverified');
  const lease={...verified,context};
  const ledger=createGame3DPrivateCommittedQuestCredits152({
   pool:progressionPool,
   authorizeServerOperation:authority(context,lease,'read_committed_quest_progress'),
  });
  let result;
  try{
   result=await ledger.readProgress({
    ownerId:lease.ownerId,characterId:lease.characterId,
   });
  }catch{return denied('private_quest_reader_unavailable')}
  if(result?.ok!==true||result.rewardAuthorized===true||
     !sameLease(lease,await currentLease(context)))
   return denied('private_quest_progress_unavailable');
  return Object.freeze({...result,version:'18.4',
   rewardsIssued:false,productionReady:false});
 };
 // A turn-in remains a DB-only journal entry. One-time completion from
 // already-committed objective credits never authorizes rewards/XP.
 const turnInQuest=async request=>{
  if(stopped||!exact(request,['serverRequestContext','questId'])||
     !getPrivateQuestDefinition154(request.questId)||
     !getGame3DPrivateQuestNpc175(request.questId))
   return denied('trusted_quest_turnin_required');
  const context=request.serverRequestContext;
  const verified=await currentLease(context);
  if(!verified)return denied('world_session_unverified');
  const lease={...verified,context};
  // No player/browser supplied NPC position. The trusted host must have
  // recorded a fresh in-world interaction with the specific quest NPC.
  let npc=null;
  try{npc=await npcGate175.validate({
   ownerId:lease.ownerId,characterId:lease.characterId,
   questId:request.questId,sessionId:lease.actionSessionId,
  })}catch{}
  if(npc?.ok!==true||npc.worldAttested!==true||
     npc.questId!==request.questId||npc.rewardsIssued!==false)
   return denied('fresh_server_npc_turnin_interaction_required');
  if(!sameLease(lease,await currentLease(context)))
   return denied('world_session_changed_during_npc_turnin');
  const turnin=createGame3DPrivateQuestTurnIn156({
   pool:progressionPool,
   authorizeServerOperation:authority(context,lease,'turn_in_private_server_quest'),
   transactionFence:transactionFence(lease),
   sessionFenceMode:'per-quest',
  });
  let result;
  try{
   result=await turnin.turnIn({
    ownerId:lease.ownerId,characterId:lease.characterId,
    questId:request.questId,
   });
  }catch{return denied('private_turnin_database_unavailable')}
  if(result?.ok!==true||result.rewardsIssued===true||
     result.rewardSettlementAuthorized===true)
   return denied(result?.reason??'private_quest_turnin_denied');
  return Object.freeze({...result,version:'18.4',
   rewardsIssued:false,productionReady:false});
 };
 const shutdown=()=>{stopped=true;npcBridge177.shutdown()};
 return Object.freeze({version:'18.4',
  projectCommittedKill,readProgress,turnInQuest,shutdown,
  privateServerOnly:true,publicPlayerRouteInstalled:false,
  committedKillWriterInstalled:false,
  rewardWriterInstalled:false,rewardsIssued:false,productionReady:false});
}
