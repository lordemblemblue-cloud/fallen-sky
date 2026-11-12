// Combat / Quest 18.5 — a PRIVATE opt-in composition of the ORIGINAL
// 15.3 server-owned kill writer, immutable PG kill->lease binding and
// 18.4 no-reward Questbook progression. One writer. No HTTP listener,
// public browser route, production migration or independent reward engine.
import {createGame3DPrivateWorldKillCommit153}
 from './privateWorldKillCommit153.mjs';
import {createGame3DPrivateWorldKillLeaseBinding185}
 from './privateWorldKillLeaseBinding185.mjs';
import {assertGame3DPrivateKillLeaseReadiness185}
 from './privateKillLeaseReadiness185.mjs';
import {createGame3DPrivateQuestProgression184}
 from './privateQuestProgression184.mjs';
import {createGame3DPrivateQuestObjectiveBatch842}
 from './privateQuestObjectiveBatch842.mjs';
import {createGame3DPrivateQuestReceiptReconciler843}
 from './privateQuestReceiptReconciler843.mjs';

const denied=reason=>Object.freeze({ok:false,version:'18.5',reason,
 rewardsIssued:false,rewardAuthorized:false,productionReady:false,
 privateServerOnly:true});

export async function createGame3DPrivateQuestProgression185({
 worldStage180,serverRequestContext,
 encounter,scope,fencingToken,
 worldKillPool,progressionPool,progressionSchema,
 authorizeServerOperation,resolveTrustedCommittedKill,
 resolveServerKillContext843=null,
 now=Date.now,enabled=false,
}={}){
 if(enabled!==true||
    process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    !serverRequestContext||typeof serverRequestContext!=='object'||
    worldStage180?.version!=='18.0'||
    worldStage180.privateServerOnly!==true||
    worldStage180.publicPlayerRouteInstalled!==false||
    encounter?.version!=='13.6'||encounter.privateServerOnly!==true||
    !scope||typeof scope!=='object'||
    worldStage180?.resolveCurrentWorldLease183===undefined||
    typeof worldStage180.resolveCurrentWorldLease183!=='function'||
    typeof worldKillPool?.connect!=='function'||
    typeof progressionPool?.connect!=='function'||
    typeof authorizeServerOperation!=='function'||
    typeof resolveTrustedCommittedKill!=='function'||
    (resolveServerKillContext843!==null&&
     typeof resolveServerKillContext843!=='function')||
    typeof now!=='function')
  throw Error('18.5 requires original 15.3 private encounter, separate PG writer and current world lease');

 // Both pools must belong to the same disposable PG16 staging database
 // with independent restricted roles, an immutable binding trigger, exact
 // composite receipt FK and validated credit-to-binding FK. No silent
 // backfill or role-creating operation is permitted.
 await assertGame3DPrivateKillLeaseReadiness185({
  worldKillPool,progressionPool,schema:progressionSchema,
 });
 const binding=createGame3DPrivateWorldKillLeaseBinding185({
  enabled:true,now,worldStage180,serverRequestContext,scope,
 });
 let originalWriter,progression;
 try{
  originalWriter=createGame3DPrivateWorldKillCommit153({
   encounter,scope,fencingToken,pool:worldKillPool,
   authorizeServerOperation,
   attestCommittedKill185:binding.bindCommittedKill185,
  });
  progression=await createGame3DPrivateQuestProgression184({
   enabled:true,now,progressionPool,progressionSchema,
   worldStage180,resolveTrustedCommittedKill,
   verifyCommittedReceipt185:binding.verifyCommittedReceipt185,
  });
 }catch(error){
  binding.shutdown();
  throw error;
 }
 if(originalWriter?.version!=='15.3'||
    originalWriter.privateServerOnly!==true||
    originalWriter.publicRouteInstalled!==false||
    progression?.version!=='18.4'||
    progression.privateServerOnly!==true||
    progression.publicPlayerRouteInstalled!==false||
    progression.rewardWriterInstalled!==false)
  throw Error('18.5 cannot compose an unsafe kill writer or quest authority');

 let stopped=false;
 const execute=fn=>async request=>{
  if(stopped)return denied('quest_world_185_stopped');
  let response;
  try{response=await fn(request)}catch{
   return denied('private_quest_world_unavailable');
  }
  if(!response||response.rewardsIssued===true||
     response.rewardAuthorized===true)return denied('unexpected_reward_state');
  return Object.freeze({...response,version:'18.5',
   rewardsIssued:false,productionReady:false});
 };
 // Batch is server-only; each context must come from the original private
 // scheduler. Every credit still uses 18.4 trusted resolution and 18.5's
 // persisted receipt-to-world-session proof (never a client kill claim).
 const objectiveBatch=createGame3DPrivateQuestObjectiveBatch842({
  projectCommittedKill:execute(progression.projectCommittedKill),
  readProgress:execute(progression.readProgress),
  isStopped:()=>stopped,
 });
 // Opt-in recovery reads ONLY already persisted original 15.3 receipts
 // while the same 18.3 lease remains live. It cannot revive a revoked
 // world, create new kills or grant rewards.
 const reconciler=resolveServerKillContext843===null?null:
  createGame3DPrivateQuestReceiptReconciler843({
   enabled:true,pool:progressionPool,scope,
   worldStage180,serverRequestContext,
   resolveServerKillContext:resolveServerKillContext843,
   projectCommittedKill:execute(progression.projectCommittedKill),
   readProgress:execute(progression.readProgress),
   now,isStopped:()=>stopped,
  });
 const shutdown=()=>{
  if(stopped)return;
  stopped=true;
  progression.shutdown();
  binding.shutdown();
 };
 return Object.freeze({
  version:'18.5',
  // Tick/encounter ownership belongs ONLY to the same private world
  // scheduler, which must serialize tick()/checkpoint with this commit.
  commitWorldKills:execute(originalWriter.commit),
  projectCommittedKill:execute(progression.projectCommittedKill),
  projectCommittedKills:objectiveBatch.projectBatch,
  // Disabled unless the PRIVATE scheduler supplies a trusted mapping from
  // each original PostgreSQL receipt to its opaque event context.
  reconcileCommittedKills:reconciler?.reconcile??
   (async()=>denied('trusted_reconciliation_source_unconfigured')),
  readProgress:execute(progression.readProgress),
  turnInQuest:execute(progression.turnInQuest),
  shutdown,
  privateServerOnly:true,publicPlayerRouteInstalled:false,
  independentCombatWriterCreated:false,
  rewardsIssued:false,rewardWriterInstalled:false,
  productionReady:false,
 });
}
