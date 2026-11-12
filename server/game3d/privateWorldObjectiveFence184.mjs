// Combat / Quest 18.4 — server-only objective/turn-in PG session fence.
// Reuses 18.3's exact-lease FOR SHARE query. A signed NPC acceptance does NOT
// authorize browser-sent defeat counts, receipts, ready flags, or turn-ins.
// The private world and an independently published PG lease must be active.
import {QUEST_SESSION_LOCK_SQL_183}
 from './privateQuestTransactionFence183.mjs';

const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const ID=/^[A-Za-z0-9_.:-]{8,128}$/;
const ACTION=/^qb174-[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 Object.keys(v).length===keys.length&&
 Object.keys(v).every(k=>keys.includes(k));
const ops=Object.freeze(new Set([
 'accept_private_server_quest',
 'accept_private_echo_quest',
 'project_committed_quest_kill',
 'turn_in_private_server_quest',
 'credit_private_echo_objective',
 'turn_in_private_echo_quest',
]));
const consistent=(x,y)=>x&&y&&
 x.ownerId===y.ownerId&&x.characterId===y.characterId&&
 x.worldInstanceId===y.worldInstanceId&&x.worldEpoch===y.worldEpoch&&
 x.actionSessionId===y.actionSessionId&&x.serverSessionId===y.serverSessionId&&
 x.leaseNonce===y.leaseNonce&&x.expiresAtMs===y.expiresAtMs;
const validClaim=(x,scope,t)=>exact(x,['ownerId','characterId',
 'actionSessionId','serverSessionId','worldInstanceId','worldEpoch',
 'leaseNonce','expiresAtMs'])&&
 x.ownerId===scope.ownerId&&x.characterId===scope.characterId&&
 x.worldInstanceId===scope.instanceId&&x.worldEpoch===scope.instanceEpoch&&
 ACTION.test(x.actionSessionId)&&ID.test(x.serverSessionId)&&
 UUID.test(x.leaseNonce)&&Number.isSafeInteger(x.expiresAtMs)&&
 x.expiresAtMs>t&&x.expiresAtMs<=t+900000;

export function createGame3DPrivateWorldObjectiveFence184({
 worldStage180,serverRequestContext,scope,now=Date.now,enabled=false,
}={}) {
 if(enabled!==true||worldStage180?.version!=='18.0'||
    worldStage180.privateServerOnly!==true||
    typeof worldStage180.resolveCurrentWorldLease183!=='function'||
    !serverRequestContext||typeof serverRequestContext!=='object'||
    !scope||typeof scope.ownerId!=='string'||!WHO.test(scope.ownerId)||
    typeof scope.characterId!=='string'||!WHO.test(scope.characterId)||
    typeof scope.instanceId!=='string'||!ID.test(scope.instanceId)||
    typeof scope.instanceEpoch!=='string'||!ID.test(scope.instanceEpoch)||
    typeof now!=='function')
  throw Error('18.4 needs the current private 18.3 session-fenced world');
 const pinned=Object.freeze({...scope});
 const verified=async()=>{
  let claim;
  try{claim=await worldStage180.resolveCurrentWorldLease183(
   Object.freeze({serverRequestContext}))}catch{}
  return validClaim(claim,pinned,now())?claim:null;
 };
 const verifyInTransaction=async(db,request)=>{
  if(typeof db?.query!=='function'||
     !exact(request,['ownerId','characterId','questId','operation'])||
     request.ownerId!==pinned.ownerId||
     request.characterId!==pinned.characterId||
     !ops.has(request.operation)||
     (request.operation==='project_committed_quest_kill'
       ?request.questId!==null
       :typeof request.questId!=='string'||
        !/^[A-Za-z0-9_.:-]{1,160}$/.test(request.questId)))
   return false;
  const before=await verified();
  if(!before)return false;
  let result;
  try{result=await db.query(QUEST_SESSION_LOCK_SQL_183,[
   before.ownerId,before.characterId,before.worldInstanceId,
   before.worldEpoch,before.serverSessionId,before.actionSessionId,
   before.leaseNonce,
  ])}catch{return false;}
  const row=result?.rows?.[0];
  if(result?.rowCount!==1||row?.owner_id!==before.ownerId||
     row.character_id!==before.characterId||
     row.world_instance_id!==before.worldInstanceId||
     row.world_epoch!==before.worldEpoch||
     row.world_session_id!==before.serverSessionId||
     row.action_session_id!==before.actionSessionId||
     row.lease_nonce!==before.leaseNonce||
     row.active!==true||row.not_expired!==true)
   return false;
  // Critical when an async query blocks behind an issuer revocation.
  const after=await verified();
  return after!==null&&consistent(before,after);
 };
 return Object.freeze({version:'18.4',verifyInTransaction,
  verifyWorldLive:async()=>await verified()!==null,
  privateServerOnly:true,publicRouteInstalled:false,
  rewardsIssued:false,productionReady:false});
}
