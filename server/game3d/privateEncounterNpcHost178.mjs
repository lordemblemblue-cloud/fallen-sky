// Combat / Quest 17.8 — private 13.6 world encounter -> NPC evidence host.
// No client coordinate, NPC position, or quest progress is accepted. This host
// is inert until separately wired into a trusted PRIVATE world operation.
import {randomUUID} from 'node:crypto';
import {getGame3DPrivateQuestNpc175} from './privateNpcInteractionGate175.mjs';

const ID=/^[A-Za-z0-9_.:-]{8,128}$/;
const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const SESSION=/^qb174-[a-f0-9]{64}$/;
const NPC=/^[A-Za-z0-9_.:-]{1,160}$/;
const who=x=>typeof x==='string'&&WHO.test(x)&&!['__anon__','__default__'].includes(x);
const key=x=>typeof x==='string'&&ID.test(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=100000;
const coords=x=>x&&typeof x==='object'&&finite(x.x)&&finite(x.z);
const failed=reason=>Object.freeze({ok:false,reason,rewardsIssued:false});

export function createGame3DPrivateEncounterNpcHost178({
 encounter,mapWorld,scope,resolveTrustedWorldActor,resolveSealedNpcSpawn,
 verifyExclusiveWorldLease,now=Date.now,maxAgeMs=5000,
}={}){
 if(encounter?.version!=='13.6'||encounter.privateServerOnly!==true||
    typeof encounter.snapshot!=='function'||!mapWorld||
    typeof mapWorld.valid!=='function'||typeof mapWorld.height!=='function'||
    typeof mapWorld.canStrike!=='function'||
    mapWorld.fingerprint!==encounter.mapFingerprint||mapWorld.id!==encounter.mapId||
    !scope||!who(scope.ownerId)||!who(scope.characterId)||
    !key(scope.instanceId)||!key(scope.instanceEpoch)||
    encounter.instanceId!==scope.instanceId||!coords(encounter.worldOrigin)||
    [resolveTrustedWorldActor,resolveSealedNpcSpawn,verifyExclusiveWorldLease,now]
      .some(f=>typeof f!=='function')||
    !Number.isSafeInteger(maxAgeMs)||maxAgeMs<1000||maxAgeMs>5000)
  throw Error('17.8 requires a private encounter, sealed NPCs, signed world actor and fenced lease');
 const pinned=Object.freeze({ownerId:scope.ownerId,characterId:scope.characterId,
  instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch,
  mapFingerprint:encounter.mapFingerprint});
 const origin=Object.freeze({...encounter.worldOrigin});
 const records=new Map();let closed=false,generation=0;
 // A pairing rotation, logout or world replacement invalidates every
 // outstanding receipt. Pending async NPC work must not recreate evidence
 // after the old session has been retired.
 const invalidatePendingInteractions=()=>{
  generation++;
  records.clear();
 };
 const alive=async()=>{
  try{return !closed&&await verifyExclusiveWorldLease(pinned)===true;}
  catch{return false;}
 };
 const purge=()=>{for(const [k,v] of records)
  if(v.time+maxAgeMs<=now())records.delete(k);};
 const getRecord=(q)=>{
  if(closed||!q||typeof q.receiptId!=='string')return null;
  const entry=records.get(q.receiptId);
  if(!entry||entry.time+maxAgeMs<=now()||
     q.ownerId!==entry.ownerId||q.characterId!==entry.characterId||
     q.questId!==entry.questId||q.npcId!==entry.npcId||
     q.sessionId!==entry.sessionId||
     q.worldInstanceId!==pinned.instanceId||
     q.worldEpoch!==pinned.instanceEpoch||q.worldTick!==entry.tick)
    return null;
  return entry;
 };
 const recordServerInteraction=async(request={})=>{
  if(!request||typeof request!=='object'||Array.isArray(request)||
     Object.keys(request).length!==3||
     Object.keys(request).some(k=>!['serverRequestContext','questId','npcId'].includes(k)))
   return failed('unexpected_client_world_fields');
  const {serverRequestContext,questId,npcId}=request;
  const recordedGeneration=generation;
  if(closed||!NPC.test(questId)||!NPC.test(npcId)||
     getGame3DPrivateQuestNpc175(questId)!==npcId||!await alive())
   return failed('world_or_quest_unavailable');
  let actor,spawn;
  try{
   actor=await resolveTrustedWorldActor(serverRequestContext);
   spawn=await resolveSealedNpcSpawn(Object.freeze({...pinned,npcId}));
  }catch{return failed('trusted_world_source_unavailable');}
  if(closed||generation!==recordedGeneration||actor?.authenticated!==true||
     actor.identitySource!=='trusted-server-session'||
     actor.accountId!==pinned.ownerId||actor.characterId!==pinned.characterId||
     !Number.isSafeInteger(actor.sessionExpiresAtMs)||
     actor.sessionExpiresAtMs<=now()||actor.sessionExpiresAtMs>now()+60000||
     typeof actor.actionSessionId!=='string'||
     !SESSION.test(actor.actionSessionId)||
     spawn?.source!=='sealed-private-world-npc-seed-178'||
     spawn.sealed!==true||spawn.npcId!==npcId||
     spawn.instanceId!==pinned.instanceId||
     spawn.instanceEpoch!==pinned.instanceEpoch||
     spawn.mapFingerprint!==pinned.mapFingerprint||!coords(spawn.position))
   return failed('trusted_actor_or_npc_missing');
  const state=encounter.snapshot(),at=now();
  if(!state||state.instanceId!==pinned.instanceId||
     state.privateBetaOnly!==true||state.rewardsIssued!==false||
     !Number.isSafeInteger(state.serverTime)||
     state.serverTime>at||at-state.serverTime>1500||
     !coords(state.player)||state.player.hp<=0||
     !mapWorld.valid(state.player,origin)||
     !mapWorld.valid(spawn.position,origin))
   return failed('authoritative_world_snapshot_stale');
  const player=Object.freeze({x:state.player.x,
    y:mapWorld.height(state.player,origin),z:state.player.z});
  const npc=Object.freeze({x:spawn.position.x,
    y:mapWorld.height(spawn.position,origin),z:spawn.position.z});
  if(!finite(player.y)||!finite(npc.y)||
     Math.hypot(player.x-npc.x,player.y-npc.y,player.z-npc.z)>4.5||
     mapWorld.canStrike(state.player,spawn.position,origin)!==true||
     !await alive()||closed||generation!==recordedGeneration)
   return failed('npc_not_reachable_in_trusted_world');
  purge();if(records.size>=4096)return failed('npc_receipt_capacity');
  const receiptId='npc178-'+randomUUID();
  records.set(receiptId,Object.freeze({receiptId,time:at,tick:state.serverTime,
   ownerId:pinned.ownerId,characterId:pinned.characterId,
   questId,npcId,sessionId:actor.actionSessionId,player,npc,
   consumed:false}));
  return Object.freeze({ok:true,version:'17.8',receiptId,
   worldInstanceId:pinned.instanceId,rewardsIssued:false});
 };
 const consumeServerNpcInteraction=async q=>{
  const recordedGeneration=generation;
  if(!await alive()||closed||generation!==recordedGeneration)return null;
  purge();
  const matches=[...records.values()].filter(e=>!e.consumed&&
    e.ownerId===q?.ownerId&&e.characterId===q?.characterId&&
    e.questId===q?.questId&&e.npcId===q?.npcId&&
    e.sessionId===q?.sessionId);
  if(matches.length!==1)return null;
  const entry=matches[0];
  records.set(entry.receiptId,Object.freeze({...entry,consumed:true}));
  return Object.freeze({source:'server-world-npc-event-177',
   consumed:true,actorAuthenticated:true,intent:'npc_interact',
   ownerId:entry.ownerId,characterId:entry.characterId,
   questId:entry.questId,npcId:entry.npcId,
   actionSessionId:entry.sessionId,receiptId:entry.receiptId,
   worldInstanceId:pinned.instanceId,worldEpoch:pinned.instanceEpoch,
   worldTick:entry.tick,occurredAtMs:entry.time});
 };
 const readServerWorldSnapshot=async q=>{
  const recordedGeneration=generation;
  if(!await alive()||closed||generation!==recordedGeneration)return null;
  const e=getRecord(q);
  return e?.consumed===true?Object.freeze({source:'server-world-snapshot-177',
   serverAuthenticated:true,ownerId:e.ownerId,characterId:e.characterId,
   actionSessionId:e.sessionId,npcId:e.npcId,npcSpawnVerified:true,
   worldInstanceId:pinned.instanceId,worldEpoch:pinned.instanceEpoch,
   worldTick:e.tick,player:e.player,npc:e.npc}):null;
 };
 const verifyServerLineOfSight=async q=>{
  const recordedGeneration=generation;
  if(!await alive()||closed||generation!==recordedGeneration)return null;
  const e=getRecord(q);
  if(!e?.consumed||!coords(q?.player)||!coords(q?.npc)||
    q.player.x!==e.player.x||q.player.y!==e.player.y||
    q.player.z!==e.player.z||q.npc.x!==e.npc.x||
    q.npc.y!==e.npc.y||q.npc.z!==e.npc.z)return null;
  const visible=mapWorld.canStrike(e.player,e.npc,origin)===true;
  return Object.freeze({source:'server-world-collision-177',visible,
   worldInstanceId:pinned.instanceId,worldEpoch:pinned.instanceEpoch,
   worldTick:e.tick});
 };
 const shutdown=()=>{closed=true;invalidatePendingInteractions()};
 return Object.freeze({version:'17.8',recordServerInteraction,
  consumeServerNpcInteraction,readServerWorldSnapshot,
  verifyServerLineOfSight,invalidatePendingInteractions,shutdown,
  requiresPrivateWorldActor:true,requiresExclusiveLease:true,
  browserCoordinatesAccepted:false,publicRouteInstalled:false,
  installedInLiveGame:false,rewardsIssued:false,productionReady:false});
}
