// Game 3D Combat / Quest 18.2 — private staging ONLY.
// Joins the EXISTING signed 17.4 Questbook route to the 18.0/18.1
// session-paired 17.8 NPC host. It installs NO HTTP listener or public route.
// Quest acceptance still uses the real restricted PostgreSQL 15.4/16.5
// writers and their no-reward, catalog/prerequisite rules.
import {createGame3DQuestActionRoute174}
 from './privateQuestActionRoute174.mjs';
import {assertGame3DQuestActionDatabaseReadiness174}
 from './privateQuestActionReadiness174.mjs';

export async function createGame3DPrivateSignedQuestWorldStaging182({
 worldStage180,writerPool,writerSchema,secret,appOrigin,
 now=Date.now,enabled=false,
}={}) {
 // Both toggles are SERVER settings. No browser VITE flag, demo/mock writer,
 // or client-supplied world identity is an authority.
 if(enabled!==true||
    process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    process.env.GAME3D_QUEST_ACTION_174_SINGLE_REPLICA_STAGING_ACK!=='true'||
    worldStage180?.version!=='18.0'||
    worldStage180.privateServerOnly!==true||
    worldStage180.publicPlayerRouteInstalled!==false||
    worldStage180.publicQuestActionWriterInstalled!==false||
    typeof worldStage180.questActionWorldHost177?.consumeServerNpcInteraction!=='function'||
    typeof worldStage180.questActionWorldHost177?.readServerWorldSnapshot!=='function'||
    typeof worldStage180.questActionWorldHost177?.verifyServerLineOfSight!=='function'||
    typeof worldStage180.verifyWorldActionSession!=='function'||
    typeof writerPool?.connect!=='function'||
    !/^[a-z][a-z0-9_]{0,62}$/.test(writerSchema)||
    typeof secret!=='string'||secret.length<32||
    !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(appOrigin)||
    typeof now!=='function')
  throw Error('18.2 requires an isolated staging world, restricted PG writer and signed Questbook authority');

 // Fail before exposing even a private request handler if the writer can
 // update player XP, bypass RLS, write rewards or use a privileged PG role.
 await assertGame3DQuestActionDatabaseReadiness174({
  pool:writerPool,schema:writerSchema,
 });

 const route=createGame3DQuestActionRoute174({
  pool:writerPool,secret,appOrigin,now,
  trustedNpcWorldHost177:worldStage180.questActionWorldHost177,
  verifyWorldActionSession:worldStage180.verifyWorldActionSession,
 });
 return Object.freeze({
  version:'18.2',handleSignedQuestAction:route.handle,
  shutdown:route.shutdown,privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  publicQuestActionWriterInstalled:false,
  rewardsIssued:false,productionReady:false,
 });
}
