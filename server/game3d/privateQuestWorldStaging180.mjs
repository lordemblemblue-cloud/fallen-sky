// Game 3D Combat / Quest 18.0 — private integration of actual 13.6, 17.8,
// 17.9, and a separately verified Base44/world session pairing authority.
// This factory is not installed in server/game3d/index.mjs or a public route.
import {randomUUID} from 'node:crypto';
import {createGame3DQuestWorldSessionAdmission179}
 from './privateQuestWorldSessionAdmission179.mjs';
import {createGame3DPrivateEncounterNpcHost178}
 from './privateEncounterNpcHost178.mjs';
import {createGame3DTrustedNpcWorldBridge177}
 from './trustedNpcWorldBridge177.mjs';
import {createGame3DNpcInteractionGate175,getGame3DPrivateQuestNpc175}
 from './privateNpcInteractionGate175.mjs';

const KEY = /^[A-Za-z0-9_.:-]{8,128}$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const who = x => typeof x === 'string' && ID.test(x) &&
 !['__anon__','__default__','__dev_test__'].includes(x);

export function createGame3DPrivateQuestWorldStaging180({
 scope, encounter, mapWorld, worldBridge150, pairing180,
 resolveSealedNpcSpawn, verifyExclusiveWorldLease,
 now = Date.now, enabled = false,
}={}) {
 if (enabled !== true || !scope || !who(scope.ownerId) ||
     !who(scope.characterId) || !KEY.test(scope.instanceId) ||
     !KEY.test(scope.instanceEpoch) || !encounter ||
     encounter.version !== '13.6' || encounter.privateServerOnly!==true ||
     encounter.instanceId!==scope.instanceId ||
     typeof encounter.snapshot!=='function' || !mapWorld ||
     mapWorld.id!==encounter.mapId ||
     mapWorld.fingerprint!==encounter.mapFingerprint ||
     pairing180?.version!=='18.0' || pairing180.privateServerOnly!==true ||
     pairing180.publicPlayerRouteInstalled!==false ||
     worldBridge150?.version!=='15.0' || worldBridge150.privateServerOnly!==true ||
     worldBridge150.publicPlayerRouteInstalled!==false ||
     ['begin','complete','revoke','shutdown','resolveTrustedWorldPrincipal',
      'resolveVerifiedBase44ActionSession','verifySessionActive']
      .some(k=>typeof pairing180[k]!=='function') ||
     typeof resolveSealedNpcSpawn!=='function' ||
     typeof verifyExclusiveWorldLease!=='function' || typeof now!=='function')
  throw Error('18.0 staging requires real private encounter, world and verified session pairing');
 const pinned=Object.freeze({ownerId:scope.ownerId,characterId:scope.characterId,
  instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch});
 let host=null;
 const admission=createGame3DQuestWorldSessionAdmission179({
  worldBridge150,scope:pinned,
  resolveTrustedWorldPrincipal:pairing180.resolveTrustedWorldPrincipal,
  resolveVerifiedBase44ActionSession:pairing180.resolveVerifiedBase44ActionSession,
  verifySessionActive:pairing180.verifySessionActive,
  createTrustedNpcHost178:({resolveTrustedWorldActor})=>{
   host=createGame3DPrivateEncounterNpcHost178({encounter,mapWorld,
    scope:pinned,resolveTrustedWorldActor,
    resolveSealedNpcSpawn,verifyExclusiveWorldLease,now});
   return host;
  },now,
 });
 // This private staging diagnostic exercises the REAL 17.8 receipt through
 // 17.7 server-world verification and the 17.5 quest/NPC gate. It does not
 // accept/complete quests, grant rewards, or install a client-accessible API.
 // The receipt is consumed exactly once by these existing trusted gates.
 const npcBridge177=createGame3DTrustedNpcWorldBridge177({
  consumeServerNpcInteraction:request=>
   host?.consumeServerNpcInteraction(request)??null,
  readServerWorldSnapshot:request=>
   host?.readServerWorldSnapshot(request)??null,
  verifyServerLineOfSight:request=>
   host?.verifyServerLineOfSight(request)??null,now,
 });
 const npcGate175=createGame3DNpcInteractionGate175({
  resolveTrustedInteraction:npcBridge177.resolveTrustedInteraction,now,
 });
 const denied=reason=>Object.freeze({ok:false,version:'18.0',reason,
  privateServerOnly:true,rewardsIssued:false,productionReady:false});
 let currentHandle=null,currentContext=null,currentAction=null,epoch=0,stopped=false;
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&
  Object.keys(x).every(key=>keys.includes(key));
 const privateContext=args=>exact(args,['serverRequestContext'])&&
  object(args.serverRequestContext);
 // One PRIVATE world handle lives for a single verified pairing generation.
 // Retirement also clears previous NPC proof receipts and fences async work.
 const retire=()=>{
  const previous={handle:currentHandle,context:currentContext};
  currentHandle=null;currentContext=null;currentAction=null;epoch++;
  host?.invalidatePendingInteractions();
  return previous;
 };
 const bestEffortClose=async previous=>{
  if(previous.handle&&previous.context){
   try{await admission.close({handle:previous.handle,
    serverRequestContext:previous.context})}catch{}
  }
 };
 const beginWorldPairing=async(args={})=>{
  if(stopped||!privateContext(args))return denied('trusted_world_context_required');
  const previous=retire(),started=epoch;
  await bestEffortClose(previous);
  if(stopped||started!==epoch)return denied('pairing_rotated_during_retirement');
  let result;
  try{result=await pairing180.begin(args)}
  catch{return denied('private_pairing_unavailable')}
  if(stopped||started!==epoch)return denied('pairing_changed_during_begin');
  return result;
 };
 const completeWorldPairing=async(args={})=>{
  if(stopped||!exact(args,['serverRequestContext','proof','signature'])||
     !object(args.serverRequestContext))
   return denied('trusted_pairing_proof_required');
  const started=epoch;
  let result;
  try{result=await pairing180.complete(args)}
  catch{return denied('private_pairing_unavailable')}
  if(stopped||started!==epoch)return denied('pairing_changed_during_completion');
  return result;
 };
 const revokeWorldPairing=async(args={})=>{
  if(stopped||!privateContext(args))return denied('trusted_world_context_required');
  const previous=retire(),started=epoch;
  await bestEffortClose(previous);
  let result;
  try{result=await pairing180.revoke(args)}
  catch{return denied('private_revoke_unavailable')}
  if(stopped||started!==epoch)return denied('pairing_changed_during_revocation');
  return result;
 };
 const open=async(args={})=>{
  if(stopped||!privateContext(args))return denied('trusted_world_context_required');
  retire();
  const started=epoch;
  let reply;
  try{reply=await admission.open(args)}
  catch{return denied('private_world_unavailable')}
  if(stopped||started!==epoch){
   if(reply?.ok)try{await admission.close({handle:reply.handle,
    serverRequestContext:args.serverRequestContext})}catch{}
   return denied('session_changed_during_open');
  }
  if(reply?.ok){
   // Pin the backend-verified Base44 action ID to this newly admitted world.
   // It can never be copied from a browser quest request or quest proof.
   let action=null,active=false;
   try{
    action=await pairing180.resolveVerifiedBase44ActionSession(args.serverRequestContext);
    if(action?.authenticated===true&&
       action.identitySource==='base44-verified-action-session-179'&&
       action.accountId===pinned.ownerId&&action.characterId===pinned.characterId&&
       typeof action.actionSessionId==='string'&&
       /^qb174-[a-f0-9]{64}$/.test(action.actionSessionId)){
     active=await pairing180.verifySessionActive(Object.freeze({
      ownerId:pinned.ownerId,characterId:pinned.characterId,
      instanceId:pinned.instanceId,serverSessionId:action.worldSessionId,
      actionSessionId:action.actionSessionId
     }))===true;
    }
   }catch{}
   if(!active||stopped||started!==epoch){
    try{await admission.close({handle:reply.handle,
     serverRequestContext:args.serverRequestContext})}catch{}
    return denied('staging_world_action_session_unverified');
   }
   currentHandle=reply.handle;
   currentContext=args.serverRequestContext;
   currentAction=Object.freeze({serverSessionId:action.worldSessionId,
    actionSessionId:action.actionSessionId,
    // An unguessable server-owned admission generation. The same Base44
    // token may produce the same qb174 ID after world re-pairing, but a
    // previous PG session lease MUST NOT authorize this newer world.
    leaseNonce:randomUUID(),
    expiresAtMs:Math.min(action.expiresAtMs,reply.expiresAtMs)});
  }
  return reply;
 };
 const isCurrentRequest=(request,keys)=>!stopped&&exact(request,keys)&&
  typeof request.handle==='string'&&currentHandle!==null&&
  request.handle===currentHandle&&object(request.serverRequestContext);
 const sendWorldAction=async(request={})=>{
  // The legacy 17.9 send contract allows actions without a payload, but
  // never accepts arbitrary identity or world-position fields.
  if(!isCurrentRequest(request,['handle','serverRequestContext','action','payload'])&&
     !isCurrentRequest(request,['handle','serverRequestContext','action']))
   return denied('inactive_or_invalid_world_handle');
  const started=epoch;
  let result;
  try{result=await admission.sendWorldAction(request)}
  catch{return denied('private_world_unavailable')}
  if(stopped||started!==epoch||request.handle!==currentHandle)
   return denied('session_changed_during_action');
  return result;
 };
 const recordNpcInteraction=async(request={})=>{
  if(!isCurrentRequest(request,['handle','serverRequestContext','questId','npcId']))
   return denied('inactive_or_invalid_world_handle');
  const started=epoch;
  let result;
  try{result=await admission.recordNpcInteraction(request)}
  catch{return denied('private_npc_world_unavailable')}
  if(stopped||started!==epoch||request.handle!==currentHandle)
   return denied('session_changed_during_npc_recording');
  return result;
 };
 // The existing signed 17.4 Questbook route takes a TRUSTED world-host
 // contract. Never invoke verifyNpcInteraction first: its diagnostic consumes
 // the same one-use NPC receipt required by the 17.4 writer.
 //
 // None of these callbacks record events or manufacture receipts. A separate
 // backend-only recordNpcInteraction must already have been authorized.
 // Recheck independent Base44/world liveness around each awaited evidence
 // operation, including after logout or a same-ID re-pairing.
 const questEvidenceKeys=Object.freeze({
  consume:['ownerId','characterId','questId','npcId','sessionId'],
  read:['ownerId','characterId','questId','npcId','sessionId',
   'receiptId','worldInstanceId','worldEpoch','worldTick'],
  los:['ownerId','characterId','questId','npcId','sessionId',
   'receiptId','worldInstanceId','worldEpoch','worldTick','player','npc'],
 });
 const activeQuestSession=async(sessionId,expectedEpoch)=>{
  if(stopped||expectedEpoch!==epoch||!currentHandle||!currentContext||
     !currentAction||currentAction.actionSessionId!==sessionId)return false;
  const session=currentAction;
  let action,active=false;
  try{
   action=await pairing180.resolveVerifiedBase44ActionSession(currentContext);
   if(action?.authenticated===true&&
      action.identitySource==='base44-verified-action-session-179'&&
      action.accountId===pinned.ownerId&&
      action.characterId===pinned.characterId&&
      action.worldSessionId===session.serverSessionId&&
      action.actionSessionId===session.actionSessionId)
    active=await pairing180.verifySessionActive(Object.freeze({
     ownerId:pinned.ownerId,characterId:pinned.characterId,
     instanceId:pinned.instanceId,serverSessionId:session.serverSessionId,
     actionSessionId:session.actionSessionId,
    }))===true;
  }catch{}
  return active&&!stopped&&expectedEpoch===epoch&&currentAction===session;
 };
 const guardedNpcEvidence=async(request,keys,operation)=>{
  if(stopped||!exact(request,keys)||
     request.ownerId!==pinned.ownerId||
     request.characterId!==pinned.characterId||
     getGame3DPrivateQuestNpc175(request.questId)!==request.npcId||
     keys!==questEvidenceKeys.consume&&
      (request.worldInstanceId!==pinned.instanceId||
       request.worldEpoch!==pinned.instanceEpoch))
   return null;
  const started=epoch;
  if(!await activeQuestSession(request.sessionId,started))return null;
  let result=null;
  try{result=await operation(request)}catch{return null;}
  if(!result||!await activeQuestSession(request.sessionId,started))return null;
  return result;
 };
 const questActionWorldHost177=Object.freeze({
  now,
  consumeServerNpcInteraction:request=>
   guardedNpcEvidence(request,questEvidenceKeys.consume,
    value=>host?.consumeServerNpcInteraction(value)),
  readServerWorldSnapshot:request=>
   guardedNpcEvidence(request,questEvidenceKeys.read,
    value=>host?.readServerWorldSnapshot(value)),
  verifyServerLineOfSight:request=>
   guardedNpcEvidence(request,questEvidenceKeys.los,
    value=>host?.verifyServerLineOfSight(value)),
 });
 // Pass this to 17.4's verifyWorldActionSession option alongside the above
 // trusted world host. No client can choose the world handle or action ID.
 // This prevents a revoked session from passing quest authorization after
 // its NPC evidence was already consumed, while leaving the DB transaction
 // fence to the actual restricted quest writer.
 const verifyWorldActionSession=async(request)=>{
  if(!exact(request,['ownerId','characterId','questId','sessionId'])||
     request.ownerId!==pinned.ownerId||
     request.characterId!==pinned.characterId||
     !getGame3DPrivateQuestNpc175(request.questId))
   return false;
  return activeQuestSession(request.sessionId,epoch);
 };
 // The 18.3 private PG transaction fence receives THIS authoritative
 // server-held lease generation, never an ID from a browser/quest payload.
 // A separate trusted lease issuer must write its active row to PG and
 // atomically mark it revoked on logout/re-pair. Until then PG rejects.
 const resolveQuestTransactionClaim183=async request=>{
  if(!exact(request,['ownerId','characterId','questId','sessionId'])||
     request.ownerId!==pinned.ownerId||
     request.characterId!==pinned.characterId||
     !getGame3DPrivateQuestNpc175(request.questId))return null;
  const generation=epoch,lease=currentAction;
  if(!lease||!await activeQuestSession(request.sessionId,generation)||
     stopped||epoch!==generation||currentAction!==lease)return null;
  return Object.freeze({
   ownerId:pinned.ownerId,characterId:pinned.characterId,
   actionSessionId:lease.actionSessionId,
   serverSessionId:lease.serverSessionId,
   worldInstanceId:pinned.instanceId,worldEpoch:pinned.instanceEpoch,
   leaseNonce:lease.leaseNonce,expiresAtMs:lease.expiresAtMs,
  });
 };
 // Readable only from the private Node integration. This is not a
 // browser credential or an ability to write PG. The separate privileged
 // lease issuer must obtain it from the SAME trusted server-side context
 // that opened the current private world.
 const resolveCurrentWorldLease183=async(args={})=>{
  if(!privateContext(args)||args.serverRequestContext!==currentContext)
   return null;
  const generation=epoch,lease=currentAction;
  if(!lease||!await activeQuestSession(lease.actionSessionId,generation)||
     stopped||generation!==epoch||lease!==currentAction)return null;
  return Object.freeze({
   ownerId:pinned.ownerId,characterId:pinned.characterId,
   actionSessionId:lease.actionSessionId,
   serverSessionId:lease.serverSessionId,
   worldInstanceId:pinned.instanceId,worldEpoch:pinned.instanceEpoch,
   leaseNonce:lease.leaseNonce,expiresAtMs:lease.expiresAtMs,
  });
 };
 const verifyNpcInteraction=async request=>{
  if(stopped||!request||typeof request!=='object'||Array.isArray(request)||
     Object.keys(request).length!==4||
     Object.keys(request).some(k=>!
      ['handle','serverRequestContext','questId','npcId'].includes(k))||
     typeof request.handle!=='string'||request.handle!==currentHandle||
     !getGame3DPrivateQuestNpc175(request.questId)||
     getGame3DPrivateQuestNpc175(request.questId)!==request.npcId)
   return denied('unexpected_private_npc_request');
  const started=epoch;
  let before;
  try{before=await pairing180.resolveVerifiedBase44ActionSession(request.serverRequestContext)}
  catch{return denied('base44_session_unavailable')}
  if(!before||started!==epoch||stopped||
     before.accountId!==pinned.ownerId||
     before.characterId!==pinned.characterId)
   return denied('session_not_paired');
  let receipt;
  try{receipt=await admission.recordNpcInteraction(request)}
  catch{return denied('private_npc_world_unavailable')}
  if(receipt?.ok!==true)return denied('npc_interaction_not_recorded');
  // The 17.7 bridge consumes the 17.8 event and independently checks a
  // server snapshot and line of sight before the 17.5 gate can pass.
  const validated=await npcGate175.validate({
   ownerId:pinned.ownerId,characterId:pinned.characterId,
   questId:request.questId,sessionId:before.actionSessionId,
  });
  if(validated?.ok!==true)return denied('npc_evidence_not_verified');
  let after,active=false;
  try{
   after=await pairing180.resolveVerifiedBase44ActionSession(request.serverRequestContext);
   if(after&&after.actionSessionId===before.actionSessionId&&
      after.worldSessionId===before.worldSessionId){
    active=await pairing180.verifySessionActive(Object.freeze({
     ownerId:pinned.ownerId,characterId:pinned.characterId,
     instanceId:pinned.instanceId,serverSessionId:before.worldSessionId,
     actionSessionId:before.actionSessionId,
    }))===true;
   }
  }catch{}
  if(!active||stopped||started!==epoch||request.handle!==currentHandle)
   return denied('session_changed_during_npc_verification');
  return Object.freeze({ok:true,version:'18.0',
   questId:request.questId,npcId:request.npcId,
   worldAttested:true,accepted:false,questCompleted:false,
   rewardsIssued:false,productionReady:false,privateServerOnly:true});
 };
 const close=async(args={})=>{
  if(stopped||!exact(args,['handle','serverRequestContext'])||
     !isCurrentRequest(args,['handle','serverRequestContext']))
   return denied('inactive_or_invalid_world_handle');
  retire();
  try{return await admission.close(args)}
  catch{return denied('private_world_revoke_unconfirmed')}
 };
 const shutdown=async()=>{
  // Always stop the one-use NPC gate before the underlying world teardown.
  retire();stopped=true;
  npcBridge177.shutdown();
  pairing180.shutdown();
  host?.shutdown();
  return admission.shutdown();
 };
 return Object.freeze({version:'18.0',
  beginWorldPairing,completeWorldPairing,revokeWorldPairing,
  open,sendWorldAction,recordNpcInteraction,
  verifyNpcInteraction,
  // Private adapter for createGame3DQuestActionRoute174's
  // trustedNpcWorldHost177 argument; does not install any HTTP endpoint.
  questActionWorldHost177,verifyWorldActionSession,
  resolveQuestTransactionClaim183,resolveCurrentWorldLease183,
  close,shutdown,
  privateServerOnly:true,publicPlayerRouteInstalled:false,
  publicQuestActionWriterInstalled:false,rewardsIssued:false,
  productionReady:false});
}
