// Game 3D Quest 15.8 — PRIVATE, XP-only, exactly-once settlement.
// Reuses canonical 5.0 trusted event ledger and character XP/revision;
// 9.5 simulation-only credit receipts are separate and NEVER fabricated.
// The existing 15.7 plan is not itself an entitlement or browser claim.
import {createHash} from 'node:crypto';
import {validateTrustedGameEvent} from './trustedCharacterLedger.mjs';
import {deriveCharacterLevel} from './progressionLevelPolicy.mjs';
import {getPrivateQuestDefinition154,PRIVATE_QUEST_CATALOG_REVISION_154}
 from './privateQuestCatalog154.mjs';
import {getPrivateQuestReward157,PRIVATE_QUEST_REWARD_REVISION_157}
 from './privateQuestRewardCatalog157.mjs';

const who=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s)&&
 !['__anon__','__default__'].includes(s);
const denied=reason=>Object.freeze({ok:false,version:'15.8',reason,
 xpApplied:false,pointsApplied:false,reputationApplied:false,
 contributionApplied:false,itemsIssued:false,currencyIssued:false,
 privateServerOnly:true,productionReady:false});
const charSQL=`
 SELECT owner_id,character_id,xp_total::text AS xp_total,
  revision::text AS revision
 FROM game3d_trusted_character
 WHERE owner_id=$1 AND character_id=$2 FOR UPDATE
`;
const planSQL=`
 SELECT p.quest_id,p.catalog_revision,p.reward_revision,p.xp_amount,
  p.points_amount,p.contribution_amount,p.reputation_amount,
  p.item_count,p.currency_amount,p.plan_only,p.reward_issued,
  h.status AS quest_status,h.reward_authorized,
  t.rewards_issued AS turnin_rewards_issued
 FROM game3d_private_quest_reward_plan_157 p
 JOIN game3d_private_quest_turnin_156 t
 ON t.owner_id=p.owner_id AND t.character_id=p.character_id
 AND t.quest_id=p.quest_id
 JOIN game3d_private_quest_acceptance_154 h
 ON h.owner_id=p.owner_id AND h.character_id=p.character_id
 AND h.quest_id=p.quest_id
 WHERE p.owner_id=$1 AND p.character_id=$2 AND p.quest_id=$3
 FOR SHARE OF p,t,h
`;
const existingSQL=`
 SELECT s.grant_event_id,s.grant_digest,s.xp_amount,s.reward_revision,
  s.xp_credited,s.points_credited,s.reputation_credited,
  s.contribution_credited,s.items_issued,s.currency_issued,
  e.owner_id AS grant_owner,e.character_id AS grant_character,
  e.event_type,e.event_digest,e.provenance
 FROM game3d_private_quest_xp_settlement_158 s
 JOIN game3d_trusted_grant_event e ON e.event_id=s.grant_event_id
 WHERE s.owner_id=$1 AND s.character_id=$2 AND s.quest_id=$3
 FOR SHARE OF s,e
`;
const grantLookupSQL=`
 SELECT event_id FROM game3d_trusted_grant_event WHERE event_id=$1 FOR SHARE
`;
const grantSQL=`
 INSERT INTO game3d_trusted_grant_event
 (event_id,owner_id,character_id,event_type,event_digest,provenance)
 VALUES($1,$2,$3,'xp',$4,'verified-gameplay-event')
 RETURNING event_id
`;
const xpSQL=`
 UPDATE game3d_trusted_character
 SET xp_total=$3::bigint,revision=revision+1
 WHERE owner_id=$1 AND character_id=$2
 RETURNING xp_total::text AS xp_total,revision::text AS revision
`;
const journalSQL=`
 INSERT INTO game3d_private_quest_xp_settlement_158
 (owner_id,character_id,quest_id,grant_event_id,grant_digest,
  xp_amount,reward_revision,source_kind,xp_credited)
 VALUES($1,$2,$3,$4,$5,$6,$7,'server-verified-private-quest-xp',true)
 RETURNING quest_id
`;
const readSQL=`
 SELECT quest_id,grant_event_id,xp_amount,reward_revision,settled_at
 FROM game3d_private_quest_xp_settlement_158
 WHERE owner_id=$1 AND character_id=$2 ORDER BY settled_at,quest_id
`;
const eventFor=(ownerId,characterId,questId,reward)=>{
 const id='qxp-'+createHash('sha256').update(
  JSON.stringify(['private-quest-xp-v1',ownerId,characterId,questId]))
  .digest('hex');
 return {eventId:id,ownerId,characterId,provenance:'verified-gameplay-event',
  type:'xp',sourceId:questId,sourceType:'server-quest',amount:reward.xp};
};
const validPlan=(row,reward)=>row?.catalog_revision===
 PRIVATE_QUEST_CATALOG_REVISION_154&&row.reward_revision===
 PRIVATE_QUEST_REWARD_REVISION_157&&
 row.quest_status==='completed'&&row.reward_authorized===false&&
 row.turnin_rewards_issued===false&&row.plan_only===true&&
 row.reward_issued===false&&Number(row.xp_amount)===reward.xp&&
 Number(row.points_amount)===reward.points&&
 Number(row.contribution_amount)===reward.contribution&&
 Number(row.reputation_amount)===reward.reputation&&
 Number(row.item_count)===0&&Number(row.currency_amount)===0;
const validatePrior=(r,event,digest,amount)=>r?.grant_event_id===event.eventId&&
 r.grant_digest===digest&&r.event_digest===digest&&
 r.grant_owner===event.ownerId&&r.grant_character===event.characterId&&
 r.event_type==='xp'&&r.provenance==='verified-gameplay-event'&&
 r.reward_revision===PRIVATE_QUEST_REWARD_REVISION_157&&
 Number(r.xp_amount)===amount&&r.xp_credited===true&&
 r.points_credited===false&&r.reputation_credited===false&&
 r.contribution_credited===false&&r.items_issued===false&&
 r.currency_issued===false;
function success({questId,reward,totalXP,revision,created,eventId}){
 return Object.freeze({ok:true,version:'15.8',questId,
  grantEventId:eventId,xpAmount:reward.xp,xpApplied:created,
  alreadySettled:!created,totalXP,characterRevision:revision,
  level:deriveCharacterLevel(totalXP).level,
  pointsApplied:false,reputationApplied:false,
  contributionApplied:false,itemsIssued:false,currencyIssued:false,
  privateServerOnly:true,publicRouteInstalled:false,
  productionReady:false});
}

export function createGame3DPrivateQuestXPSettlement158({
 pool,authorizeServerOperation
}={}){
 if(typeof pool?.connect!=='function'||
    typeof authorizeServerOperation!=='function')
  throw Error('15.8 requires private PostgreSQL and trusted server operator');

 const authorized=async(operation,ownerId,characterId,questId=null)=>{
  if(!who(ownerId)||!who(characterId))return false;
  try{return await authorizeServerOperation({operation,ownerId,characterId,
   ...(questId===null?{}:{questId})})===true}
  catch{return false}
 };
 const settleXP=async({ownerId,characterId,questId}={})=>{
  const definition=getPrivateQuestDefinition154(questId);
  const reward=getPrivateQuestReward157(questId);
  if(!definition||definition.repeatable!==false||!reward||
     !Number.isSafeInteger(reward.xp)||reward.xp<1||reward.xp>10000)
   return denied('quest_xp_not_in_server_catalog');
  if(!await authorized('settle_verified_private_quest_xp',
     ownerId,characterId,questId))
   return denied('private_quest_xp_unauthorized');

  const event=eventFor(ownerId,characterId,questId,reward);
  const evidence=validateTrustedGameEvent(event);
  if(!evidence.ok)return denied('invalid_canonical_xp_event');
  const db=await pool.connect();let begun=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
   begun=true;
   // Canonical character lock serializes all 5.0 character grants and 15.8
   // settlements for this account, including simultaneous retry requests.
   const actor=await db.query(charSQL,[ownerId,characterId]);
   if(actor.rowCount!==1){
    await db.query('ROLLBACK');begun=false;
    return denied('trusted_quest_xp_character_missing');
   }
   const plan=await db.query(planSQL,[ownerId,characterId,questId]);
   if(plan.rowCount!==1||!validPlan(plan.rows[0],reward)){
    await db.query('ROLLBACK');begun=false;
    return denied('verified_quest_reward_plan_missing_or_modified');
   }
   const before=BigInt(actor.rows[0].xp_total);
   const revision=BigInt(actor.rows[0].revision);
   if(before<0n||before>BigInt(Number.MAX_SAFE_INTEGER)||
      revision<0n||revision>BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('unsafe canonical XP state');
   const old=await db.query(existingSQL,[ownerId,characterId,questId]);
   if(old.rowCount){
    if(old.rowCount!==1||!validatePrior(old.rows[0],event,
       evidence.digest,reward.xp)){
     await db.query('ROLLBACK');begun=false;
     return denied('conflicting_quest_xp_settlement_replay');
    }
    await db.query('COMMIT');begun=false;
    return success({questId,reward,totalXP:before.toString(),
     revision:revision.toString(),created:false,eventId:event.eventId});
   }
   // A previously inserted identical event without a settlement journal is
   // not automatically trusted. The normal transaction writes BOTH or NEITHER.
   if((await db.query(grantLookupSQL,[event.eventId])).rowCount!==0){
    await db.query('ROLLBACK');begun=false;
    return denied('unpaired_canonical_xp_grant_event');
   }
   const total=before+BigInt(reward.xp);
   if(total>BigInt(Number.MAX_SAFE_INTEGER)){
    await db.query('ROLLBACK');begun=false;
    return denied('canonical_xp_overflow');
   }
   const grant=await db.query(grantSQL,[
    event.eventId,ownerId,characterId,evidence.digest
   ]);
   if(grant.rowCount!==1)throw Error('canonical trusted grant missing');
   const updated=await db.query(xpSQL,[ownerId,characterId,total.toString()]);
   if(updated.rowCount!==1||updated.rows[0].xp_total!==total.toString()||
      BigInt(updated.rows[0].revision)!==revision+1n)
    throw Error('canonical character XP update missing');
   const recorded=await db.query(journalSQL,[
    ownerId,characterId,questId,event.eventId,evidence.digest,
    reward.xp,PRIVATE_QUEST_REWARD_REVISION_157
   ]);
   if(recorded.rowCount!==1)throw Error('quest XP settlement record missing');
   await db.query('COMMIT');begun=false;
   return success({questId,reward,totalXP:total.toString(),
    revision:(revision+1n).toString(),created:true,eventId:event.eventId});
  }catch{
   if(begun)try{await db.query('ROLLBACK')}catch{}
   return denied('private_quest_xp_transaction_failed');
  }finally{db.release()}
 };
 const readSettledXP=async({ownerId,characterId}={})=>{
  if(!await authorized('read_private_quest_xp_settlements',
     ownerId,characterId))return denied('private_quest_xp_read_unauthorized');
  const db=await pool.connect();
  try{
   const r=await db.query(readSQL,[ownerId,characterId]);
   return Object.freeze({ok:true,version:'15.8',
    settlements:Object.freeze(r.rows.map(x=>Object.freeze({
     questId:x.quest_id,xpAmount:Number(x.xp_amount),
     grantEventId:x.grant_event_id,rewardRevision:x.reward_revision,
     settledAt:x.settled_at,
    }))),privateServerOnly:true,productionReady:false});
  }catch{return denied('private_quest_xp_read_failed')}
  finally{db.release()}
 };
 return Object.freeze({version:'15.8',settleXP,readSettledXP,
  privateServerOnly:true,publicRouteInstalled:false,
  hostedWorldWorkerInstalled:false,
  xpWriterEnabled:true,pointsWriterEnabled:false,
  reputationWriterEnabled:false,contributionWriterEnabled:false,
  itemWriterEnabled:false,walletWriterEnabled:false,
  productionReady:false});
}
