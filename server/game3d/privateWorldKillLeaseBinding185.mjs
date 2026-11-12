// Game 3D Combat / Quest 18.5 — persist the exact world-session nonce
// with each genuine 15.3 committed kill, in the SAME PG transaction.
// Two separate callbacks: bind ONLY after a real 15.3 INSERT, and verify
// ONLY from the restricted 15.2 projection transaction. No kill writer,
// browser route, event emitter, reward, or autonomous migration here.
import {QUEST_SESSION_LOCK_SQL_183}
 from './privateQuestTransactionFence183.mjs';

const ID=/^[A-Za-z0-9_-]{1,128}$/;
const KEY=/^[A-Za-z0-9_.:-]{8,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const RECEIPT=/^worldkill-[a-f0-9]{64}$/;
const SESSION=/^qb174-[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const RECORD=['receiptId','ownerId','characterId','instanceId',
 'instanceEpoch','mapFingerprint','eventSeq'];
const valueSeq=x=>{
 if(typeof x!=='number'&&typeof x!=='string')return null;
 if(typeof x==='string'&&!/^[1-9][0-9]*$/.test(x))return null;
 const n=Number(x);
 return Number.isSafeInteger(n)&&n>0?n:null;
};
const validRecord=r=>exact(r,RECORD)&&
 RECEIPT.test(r.receiptId)&&
 typeof r.ownerId==='string'&&ID.test(r.ownerId)&&
 typeof r.characterId==='string'&&ID.test(r.characterId)&&
 typeof r.instanceId==='string'&&KEY.test(r.instanceId)&&
 typeof r.instanceEpoch==='string'&&KEY.test(r.instanceEpoch)&&
 typeof r.mapFingerprint==='string'&&HASH.test(r.mapFingerprint)&&
 valueSeq(r.eventSeq)!==null;
const validLease=(lease,at,scope)=>lease&&
 lease.ownerId===scope.ownerId&&lease.characterId===scope.characterId&&
 lease.worldInstanceId===scope.instanceId&&
 lease.worldEpoch===scope.instanceEpoch&&
 SESSION.test(lease.actionSessionId)&&
 KEY.test(lease.serverSessionId)&&UUID.test(lease.leaseNonce)&&
 Number.isSafeInteger(lease.expiresAtMs)&&lease.expiresAtMs>at;
const same=(a,b)=>a&&b&&
 ['ownerId','characterId','worldInstanceId','worldEpoch',
  'actionSessionId','serverSessionId','leaseNonce','expiresAtMs']
  .every(k=>a[k]===b[k]);

export const KILL_LEASE_INSERT_SQL_185=`
 INSERT INTO game3d_private_world_kill_lease_binding_185
 (receipt_id,owner_id,character_id,instance_id,instance_epoch,
  map_fingerprint,event_seq,server_session_id,action_session_id,
  lease_nonce,source_kind,reward_authorized)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::uuid,
  '15.3-server-committed-18.5-lease',false)
 RETURNING receipt_id
`;
export const KILL_LEASE_READ_SQL_185=`
 SELECT receipt_id,owner_id,character_id,instance_id,instance_epoch,
  map_fingerprint,event_seq::text AS event_seq,server_session_id,
  action_session_id,lease_nonce::text AS lease_nonce,
  source_kind,reward_authorized
 FROM game3d_private_world_kill_lease_binding_185
 WHERE receipt_id=$1 AND owner_id=$2 AND character_id=$3
  AND instance_id=$4 AND instance_epoch=$5
  AND map_fingerprint=$6 AND event_seq=$7
`;

export function createGame3DPrivateWorldKillLeaseBinding185({
 worldStage180,serverRequestContext,scope,now=Date.now,enabled=false,
}={}){
 if(enabled!==true||
    process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    worldStage180?.version!=='18.0'||
    worldStage180.privateServerOnly!==true||
    worldStage180.publicPlayerRouteInstalled!==false||
    typeof worldStage180.resolveCurrentWorldLease183!=='function'||
    serverRequestContext===null||typeof serverRequestContext!=='object'||
    !scope||typeof scope!=='object'||
    !ID.test(scope.ownerId)||!ID.test(scope.characterId)||
    !KEY.test(scope.instanceId)||!KEY.test(scope.instanceEpoch)||
    !HASH.test(scope.mapFingerprint)||typeof now!=='function')
  throw Error('18.5 requires original trusted 15.3 world, live 18.3 lease and private staging');
 const pinned=Object.freeze({...scope});
 let stopped=false;
 const current=async()=>{
  if(stopped)return null;
  try{
   const lease=await worldStage180.resolveCurrentWorldLease183({
    serverRequestContext,
   });
   return validLease(lease,now(),pinned)&&!stopped?
    Object.freeze({...lease}):null;
  }catch{return null}
 };
 const matches=r=>validRecord(r)&&
  r.ownerId===pinned.ownerId&&r.characterId===pinned.characterId&&
  r.instanceId===pinned.instanceId&&
  r.instanceEpoch===pinned.instanceEpoch&&
  r.mapFingerprint===pinned.mapFingerprint;
 const checkRow=(row,record,lease)=>
  row?.receipt_id===record.receiptId&&
  row.owner_id===record.ownerId&&
  row.character_id===record.characterId&&
  row.instance_id===record.instanceId&&
  row.instance_epoch===record.instanceEpoch&&
  row.map_fingerprint===record.mapFingerprint&&
  Number(row.event_seq)===valueSeq(record.eventSeq)&&
  row.server_session_id===lease.serverSessionId&&
  row.action_session_id===lease.actionSessionId&&
  row.lease_nonce===lease.leaseNonce&&
  row.source_kind==='15.3-server-committed-18.5-lease'&&
  row.reward_authorized===false;

 // 15.3 calls this only AFTER its independently sealed combat event
 // successfully INSERTed the corresponding immutable 15.2 receipt.
 // Both operations use the EXACT same privileged writer PG transaction.
 const bindCommittedKill185=async(db,record)=>{
  if(stopped||typeof db?.query!=='function'||!matches(record))return false;
  const lease=await current();
  if(!lease)return false;
  let locked;
  try{locked=await db.query(QUEST_SESSION_LOCK_SQL_183,[
   lease.ownerId,lease.characterId,lease.worldInstanceId,lease.worldEpoch,
   lease.serverSessionId,lease.actionSessionId,lease.leaseNonce,
  ])}catch{return false;}
  const lockRow=locked?.rows?.[0];
  if(locked?.rowCount!==1||!lockRow||
     lockRow.owner_id!==lease.ownerId||
     lockRow.character_id!==lease.characterId||
     lockRow.world_instance_id!==lease.worldInstanceId||
     lockRow.world_epoch!==lease.worldEpoch||
     lockRow.world_session_id!==lease.serverSessionId||
     lockRow.action_session_id!==lease.actionSessionId||
     lockRow.lease_nonce!==lease.leaseNonce||
     lockRow.active!==true||lockRow.not_expired!==true)return false;
  let inserted;
  try{inserted=await db.query(KILL_LEASE_INSERT_SQL_185,[
   record.receiptId,record.ownerId,record.characterId,
   record.instanceId,record.instanceEpoch,record.mapFingerprint,
   valueSeq(record.eventSeq),lease.serverSessionId,
   lease.actionSessionId,lease.leaseNonce,
  ])}catch{return false;}
  return inserted?.rowCount===1&&
   inserted.rows?.[0]?.receipt_id===record.receiptId&&
   same(lease,await current());
 };
 // 15.2 calls this BEFORE objective matching and again BEFORE COMMIT,
 // from the same restricted transaction as its credit INSERTs.
 const verifyCommittedReceipt185=async(db,record)=>{
  if(stopped||typeof db?.query!=='function'||!matches(record))return false;
  const lease=await current();
  if(!lease)return false;
  let binding;
  try{binding=await db.query(KILL_LEASE_READ_SQL_185,[
   record.receiptId,record.ownerId,record.characterId,
   record.instanceId,record.instanceEpoch,record.mapFingerprint,
   valueSeq(record.eventSeq),
  ])}catch{return false;}
  return binding?.rowCount===1&&
   checkRow(binding.rows?.[0],record,lease)&&
   same(lease,await current());
 };
 const shutdown=()=>{stopped=true};
 return Object.freeze({version:'18.5',bindCommittedKill185,
  verifyCommittedReceipt185,shutdown,
  privateServerOnly:true,publicRouteInstalled:false,
  rewardsIssued:false,productionReady:false});
}
