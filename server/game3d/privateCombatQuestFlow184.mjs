// Game 3D Combat / Quest 18.4 — private server-owned combat → objectives
// → turn-in composer. NO player-facing route, save mutation or reward writer.
// The 15.5 scheduler commits kills via the actual 15.3 world/lease authority,
// then recovers durable receipts into the 15.2 objective journal.
// Starter and Echo turn-in use their existing PostgreSQL writers, and every
// write holds the *same* 18.3 world-session row until COMMIT/ROLLBACK.
import {createGame3DPrivateWorldObjectiveFence184}
 from './privateWorldObjectiveFence184.mjs';
import {assertGame3DQuestSessionFenceReadiness183}
 from './privateQuestTransactionFence183.mjs';
import {createGame3DPrivateCombatQuestScheduler155}
 from './privateCombatQuestScheduler155.mjs';
import {createGame3DPrivateCommittedQuestCredits152}
 from './privateCommittedQuestCredits152.mjs';
import {createGame3DPrivateQuestTurnIn156}
 from './privateQuestTurnIn156.mjs';
import {createGame3DPrivateEchoQuest165}
 from './privateEchoQuest165.mjs';
import {getPrivateQuestDefinition154}
 from './privateQuestCatalog154.mjs';
import {PRIVATE_ECHO_QUESTS_165}
 from './privateEchoQuest165.mjs';

const KEY=/^[A-Za-z0-9_.:-]{8,128}$/;
const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const valid=x=>typeof x==='string'&&WHO.test(x)&&
 !['__anon__','__default__','__dev_test__'].includes(x);
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).length===keys.length&&
 Object.keys(x).every(k=>keys.includes(k));
const refused=reason=>Object.freeze({
 ok:false,version:'18.4',reason,
 privateServerOnly:true,questCompleted:false,
 rewardsIssued:false,productionReady:false,
});

export async function createGame3DPrivateCombatQuestFlow184({
 worldStage180,serverRequestContext,scope,owner,encounter,
 schedulerPool,turnInPool,writerSchema,authorizeServerOperation,
 resolveTrustedWorldDiscovery=null,now=Date.now,enabled=false,
}={}) {
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    worldStage180?.version!=='18.0'||
    worldStage180.privateServerOnly!==true||
    worldStage180.publicPlayerRouteInstalled!==false||
    worldStage180.publicQuestActionWriterInstalled!==false||
    typeof worldStage180.resolveCurrentWorldLease183!=='function'||
    !serverRequestContext||typeof serverRequestContext!=='object'||
    !scope||!valid(scope.ownerId)||!valid(scope.characterId)||
    !KEY.test(scope.instanceId)||!KEY.test(scope.instanceEpoch)||
    !KEY.test(scope.holderId)||!/^[a-f0-9]{64}$/.test(scope.mapFingerprint)||
    typeof schedulerPool?.connect!=='function'||
    typeof turnInPool?.connect!=='function'||
    schedulerPool===turnInPool||
    typeof writerSchema!=='string'||
    !/^[a-z][a-z0-9_]{0,62}$/.test(writerSchema)||
    typeof authorizeServerOperation!=='function'||
    (resolveTrustedWorldDiscovery!==null&&
     typeof resolveTrustedWorldDiscovery!=='function')||
    typeof now!=='function')
  throw Error('18.4 requires isolated staging world, server kill scheduler and separate private PG writer pools');
 // This private composer is not allowed to start with a missing session
 // table, a privileged PG writer or two databases that cannot coordinate
 // the same FOR SHARE lease and revoker UPDATE.
 await assertGame3DQuestSessionFenceReadiness183({
  pool:schedulerPool,schema:writerSchema});
 await assertGame3DQuestSessionFenceReadiness183({
  pool:turnInPool,schema:writerSchema});
 const dbIdentity=async pool=>{
  let db;
  try{
   db=await pool.connect();
   const r=await db.query(`
    SELECT current_database() AS database_name,
     current_schema() AS schema_name,current_user AS login_role
   `);
   const identity=r.rows?.[0];
   if(r.rowCount!==1||typeof identity?.database_name!=='string'||
      identity.schema_name!==writerSchema||
      typeof identity.login_role!=='string')return null;
   return identity;
  }catch{return null}finally{db?.release()}
 };
 const [schedulerDB,turnInDB]=await Promise.all([
  dbIdentity(schedulerPool),dbIdentity(turnInPool),
 ]);
 if(!schedulerDB||!turnInDB||
    schedulerDB.database_name!==turnInDB.database_name||
    schedulerDB.login_role===turnInDB.login_role)
  throw Error('18.4 requires separate restricted scheduler/turn-in logins on the same private PG database');
 const pinned=Object.freeze({...scope});
 const fence=createGame3DPrivateWorldObjectiveFence184({
  worldStage180,serverRequestContext,scope:pinned,now,enabled:true,
 });
 // The 15.5 scheduler is the SAME trusted 13.8 world owner. Its own 15.3
 // writer proves the sealed roster, lease/fencing token and lethal event
 // chain before it inserts an immutable receipt. The 15.2 projection then
 // checks the independent 18.3 session lease within a PG transaction.
 const scheduler=createGame3DPrivateCombatQuestScheduler155({
  pool:schedulerPool,owner,encounter,scope:pinned,
  authorizeServerOperation,transactionFence:fence.verifyInTransaction,
 });
 if(scheduler.transactionFenceInstalled!==true||
    scheduler.privateServerOnly!==true||
    scheduler.publicRouteInstalled!==false||
    scheduler.rewardWriterEnabled!==false)
  throw Error('18.4 requires private 15.5 scheduler with transactional session fence');
 const ledger=createGame3DPrivateCommittedQuestCredits152({
  pool:schedulerPool,authorizeServerOperation,
  transactionFence:fence.verifyInTransaction,
 });
 const turnIn=createGame3DPrivateQuestTurnIn156({
  pool:turnInPool,authorizeServerOperation,
  transactionFence:fence.verifyInTransaction,
 });
 const echo=createGame3DPrivateEchoQuest165({
  pool:turnInPool,authorizeServerOperation,
  resolveTrustedWorldDiscovery,now,
  transactionFence:fence.verifyInTransaction,
 });
 let stopped=false,chain=Promise.resolve();
 const serialize=fn=>{
  const result=chain.then(fn,fn);
  chain=result.then(()=>{},()=>{});
  return result;
 };
 const execute=fn=>serialize(async()=>{
  if(stopped)return refused('private_combat_quest_flow_closed');
  if(!await fence.verifyWorldLive())
   return refused('private_world_session_unverified');
  try{
   const r=await fn();
   if(r?.ok!==true)return r??refused('private_quest_operation_unavailable');
   // Durable quest data was written under the PG session lease lock; its
   // state can be recovered from Questbook if a logout happens after COMMIT.
   return r;
  }catch{return refused('private_combat_quest_operation_failed')}
 });
 const advance=()=>execute(()=>scheduler.advance());
 const reconcile=()=>execute(()=>scheduler.reconcile());
 const readProgress=()=>execute(()=>ledger.readProgress({
  ownerId:pinned.ownerId,characterId:pinned.characterId,
 }));
 const turnInStarter=(args={})=>execute(()=>{
  if(!exact(args,['questId'])||
     typeof args.questId!=='string'||
     !getPrivateQuestDefinition154(args.questId))
   return refused('quest_not_in_server_catalog');
  return turnIn.turnIn({ownerId:pinned.ownerId,
   characterId:pinned.characterId,questId:args.questId});
 });
 const creditEcho=(args={})=>execute(()=>{
  if(!exact(args,['questId','receiptId','kind'])||
     !Object.hasOwn(PRIVATE_ECHO_QUESTS_165,args.questId)||
     typeof args.receiptId!=='string'||
     !/^[A-Za-z0-9_.:-]{8,160}$/.test(args.receiptId)||
     !['kill','discovery'].includes(args.kind))
   return refused('invalid_private_echo_credit');
  return echo.credit({ownerId:pinned.ownerId,
   characterId:pinned.characterId,questId:args.questId,
   receiptId:args.receiptId,kind:args.kind});
 });
 const turnInEcho=(args={})=>execute(()=>{
  if(!exact(args,['questId'])||
     !Object.hasOwn(PRIVATE_ECHO_QUESTS_165,args.questId))
   return refused('echo_quest_not_in_server_catalog');
  return echo.turnIn({ownerId:pinned.ownerId,
   characterId:pinned.characterId,questId:args.questId});
 });
 const shutdown=()=>serialize(async()=>{
  if(stopped)return refused('private_combat_quest_flow_closed');
  stopped=true;
  const released=await scheduler.release();
  return Object.freeze({ok:released===true,version:'18.4',
   privateServerOnly:true,rewardsIssued:false,productionReady:false});
 });
 return Object.freeze({version:'18.4',
  advance,reconcile,readProgress,turnInStarter,creditEcho,turnInEcho,
  shutdown,privateServerOnly:true,publicRouteInstalled:false,
  browserKillInputsAccepted:false,questRewardWriterEnabled:false,
  productionReady:false,rewardsIssued:false,
 });
}
