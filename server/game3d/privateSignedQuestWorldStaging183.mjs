// Combat / Quest 18.3 — opt-in private staging signed quest route.
// This is NOT mounted by the live Game 3D worker and never creates a route,
// runs a migration, provisions a lease or grants quest rewards.
import {createGame3DQuestActionRoute174}
 from './privateQuestActionRoute174.mjs';
import {createGame3DPrivateWorldLeaseLifecycle183}
 from './privateWorldLeaseLifecycle183.mjs';
import {assertGame3DQuestActionDatabaseReadiness174}
 from './privateQuestActionReadiness174.mjs';
import {createGame3DQuestTransactionFence183,
 assertGame3DQuestSessionFenceReadiness183}
 from './privateQuestTransactionFence183.mjs';

export async function createGame3DPrivateSignedQuestWorldStaging183({
 worldStage180,leaseIssuer183,writerPool,writerSchema,secret,appOrigin,now=Date.now,
 enabled=false,
}={}) {
 if(enabled!==true||
    process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    process.env.GAME3D_QUEST_ACTION_174_SINGLE_REPLICA_STAGING_ACK!=='true'||
    worldStage180?.version!=='18.0'||
    worldStage180.privateServerOnly!==true||
    worldStage180.publicPlayerRouteInstalled!==false||
    worldStage180.publicQuestActionWriterInstalled!==false||
    typeof worldStage180.verifyWorldActionSession!=='function'||
    typeof worldStage180.resolveQuestTransactionClaim183!=='function'||
    typeof worldStage180.resolveCurrentWorldLease183!=='function'||
    leaseIssuer183?.version!=='18.3'||
    leaseIssuer183.privateServerOnly!==true||
    leaseIssuer183.publicRouteInstalled!==false||
    ['activate','revoke','shutdown','verifyIssuerReadiness']
     .some(k=>typeof leaseIssuer183[k]!=='function')||
    ['consumeServerNpcInteraction','readServerWorldSnapshot',
     'verifyServerLineOfSight'].some(k=>
      typeof worldStage180.questActionWorldHost177?.[k]!=='function')||
    typeof writerPool?.connect!=='function'||
    typeof writerSchema!=='string'||
    !/^[a-z][a-z0-9_]{0,62}$/.test(writerSchema)||
    typeof secret!=='string'||secret.length<32||
    !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(appOrigin)||
    typeof now!=='function')
  throw Error('18.3 requires restricted private staging with independently verified world and PG session lease');

 // The 17.4 writer must have the existing exact-grant restrictions PLUS
 // SELECT/FOR SHARE access to the 18.3 PG lease row. No privileged writer,
 // missing lease table or stale migrations may silently proceed.
 await assertGame3DQuestActionDatabaseReadiness174({
  pool:writerPool,schema:writerSchema});
 await assertGame3DQuestSessionFenceReadiness183({
  pool:writerPool,schema:writerSchema});
 // Independent issuer *object's own* pool must be a different, restricted
 // PostgreSQL login and must not be able to update gameplay/quest tables.
 // Never accept a caller-supplied "verified" claim in its place.
 const issuerReady=await leaseIssuer183.verifyIssuerReadiness({
  writerPool,schema:writerSchema});
 if(issuerReady?.ok!==true||
    issuerReady.independentIssuerRole!==true||
    issuerReady.gameplayWritesDenied!==true)
  throw Error('18.3 separate session issuer grants unverified');

 const fence=createGame3DQuestTransactionFence183({
  enabled:true,now,
  resolveTrustedWorldLease:worldStage180.resolveQuestTransactionClaim183,
 });
 const route=createGame3DQuestActionRoute174({
  pool:writerPool,secret,appOrigin,now,
  trustedNpcWorldHost177:worldStage180.questActionWorldHost177,
  verifyWorldActionSession:worldStage180.verifyWorldActionSession,
  transactionSessionFence183:fence.verifyInTransaction,
 });
 return createGame3DPrivateWorldLeaseLifecycle183({
  worldStage180,leaseIssuer183,route,enabled:true,
 });
}
