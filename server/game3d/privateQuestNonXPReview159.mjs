// 15.9 — PRIVATE non-spendable review of still-unsettled non-XP rewards.
// The live browser stores points, Contribution Points and faction reputation
// character-locally; none is proven authoritative on the private server yet.
// This records policy work without fabricating a new spendable game balance.
import {getPrivateQuestDefinition154,PRIVATE_QUEST_CATALOG_REVISION_154}
 from './privateQuestCatalog154.mjs';
import {getPrivateQuestReward157,PRIVATE_QUEST_REWARD_REVISION_157}
 from './privateQuestRewardCatalog157.mjs';

const validWho=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v)&&
 !['__anon__','__default__'].includes(v);
const denied=reason=>Object.freeze({
 ok:false,version:'15.9',reason,reviewRecorded:false,
 grantsIssued:false,spendable:false,productionReady:false,
 privateServerOnly:true,
});
const characterSQL=`
 SELECT owner_id,character_id
 FROM game3d_trusted_character
 WHERE owner_id=$1 AND character_id=$2 FOR UPDATE
`;
const sourceSQL=`
 SELECT p.quest_id,p.catalog_revision,p.reward_revision,
 p.xp_amount,p.points_amount,p.contribution_amount,p.reputation_amount,
 p.plan_only,p.reward_issued,p.item_count,p.currency_amount,
 h.status AS quest_status,h.reward_authorized,
 t.rewards_issued AS turnin_rewards_issued,
 x.xp_amount AS settled_xp,x.xp_credited,x.reward_revision AS xp_reward_revision,
 x.grant_event_id,
 e.owner_id AS grant_owner,e.character_id AS grant_character,
 e.event_type,e.provenance
 FROM game3d_private_quest_reward_plan_157 p
 JOIN game3d_private_quest_turnin_156 t
  ON t.owner_id=p.owner_id AND t.character_id=p.character_id
  AND t.quest_id=p.quest_id
 JOIN game3d_private_quest_acceptance_154 h
  ON h.owner_id=p.owner_id AND h.character_id=p.character_id
  AND h.quest_id=p.quest_id
 JOIN game3d_private_quest_xp_settlement_158 x
  ON x.owner_id=p.owner_id AND x.character_id=p.character_id
  AND x.quest_id=p.quest_id
 JOIN game3d_trusted_grant_event e ON e.event_id=x.grant_event_id
 WHERE p.owner_id=$1 AND p.character_id=$2 AND p.quest_id=$3
 FOR SHARE OF p,t,h,x,e
`;
const existingSQL=`
 SELECT reward_revision,xp_grant_event_id,points_amount,
 contribution_amount,reputation_amount,policy_status,nonspendable,
 points_posted,contribution_posted,reputation_posted,item_issued,
 currency_issued,reviewed_at
 FROM game3d_private_quest_nonxp_review_159
 WHERE owner_id=$1 AND character_id=$2 AND quest_id=$3 FOR SHARE
`;
const insertSQL=`
 INSERT INTO game3d_private_quest_nonxp_review_159
 (owner_id,character_id,quest_id,reward_revision,xp_grant_event_id,
 points_amount,contribution_amount,reputation_amount,policy_status,
 nonspendable,source_kind)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'awaiting-separate-authorities',
 true,'verified-private-quest-nonxp-review')
 RETURNING reviewed_at
`;
const readSQL=`
 SELECT quest_id,reward_revision,points_amount,contribution_amount,
 reputation_amount,reviewed_at,policy_status,nonspendable
 FROM game3d_private_quest_nonxp_review_159
 WHERE owner_id=$1 AND character_id=$2
 ORDER BY reviewed_at,quest_id
`;
const expectedSource=(r,reward,ownerId,characterId)=>
 r?.catalog_revision===PRIVATE_QUEST_CATALOG_REVISION_154&&
 r.reward_revision===PRIVATE_QUEST_REWARD_REVISION_157&&
 r.xp_reward_revision===PRIVATE_QUEST_REWARD_REVISION_157&&
 r.quest_status==='completed'&&r.reward_authorized===false&&
 r.turnin_rewards_issued===false&&r.plan_only===true&&
 r.reward_issued===false&&r.xp_credited===true&&
 Number(r.xp_amount)===reward.xp&&
 Number(r.settled_xp)===reward.xp&&
 Number(r.points_amount)===reward.points&&
 Number(r.contribution_amount)===reward.contribution&&
 Number(r.reputation_amount)===reward.reputation&&
 Number(r.item_count)===0&&Number(r.currency_amount)===0&&
 r.grant_owner===ownerId&&r.grant_character===characterId&&
 r.event_type==='xp'&&r.provenance==='verified-gameplay-event'&&
 typeof r.grant_event_id==='string'&&r.grant_event_id.startsWith('qxp-');
const matchingReview=(r,reward,grantId)=>
 r?.reward_revision===PRIVATE_QUEST_REWARD_REVISION_157&&
 r.xp_grant_event_id===grantId&&
 Number(r.points_amount)===reward.points&&
 Number(r.contribution_amount)===reward.contribution&&
 Number(r.reputation_amount)===reward.reputation&&
 r.policy_status==='awaiting-separate-authorities'&&
 r.nonspendable===true&&r.points_posted===false&&
 r.contribution_posted===false&&r.reputation_posted===false&&
 r.item_issued===false&&r.currency_issued===false;
const pending=reward=>Object.freeze({
 statPoints:reward.points,characterContribution:reward.contribution,
 factionReputation:reward.reputation,
});
const view=(questId,reward,at,alreadyReviewed)=>Object.freeze({
 ok:true,version:'15.9',questId,reviewedAt:at,alreadyReviewed,
 reviewRecorded:true,proposedNonSpendable:pending(reward),
 requiredAuthorities:Object.freeze([
  'trusted-stat-point-budget','trusted-character-contribution',
  'trusted-faction-membership-and-reputation'
 ]),
 grantsIssued:false,spendable:false,claimable:false,
 privateServerOnly:true,productionReady:false,
});
export function createGame3DPrivateQuestNonXPReview159({
 pool,authorizeServerOperation
}={}){
 if(typeof pool?.connect!=='function'||
    typeof authorizeServerOperation!=='function')
  throw Error('15.9 requires private PostgreSQL and privileged review authorization');
 const authorized=async(operation,ownerId,characterId,questId=null)=>{
  if(!validWho(ownerId)||!validWho(characterId))return false;
  try{return await authorizeServerOperation({
   operation,ownerId,characterId,...(questId===null?{}:{questId})
  })===true}catch{return false}
 };
 const review=async({ownerId,characterId,questId}={})=>{
  if(!getPrivateQuestDefinition154(questId))
   return denied('unknown_private_quest');
  const reward=getPrivateQuestReward157(questId);
  if(!reward||!Number.isSafeInteger(reward.points)||
     !Number.isSafeInteger(reward.contribution)||
     !Number.isSafeInteger(reward.reputation))
   return denied('unknown_nonxp_reward_policy');
  if(!await authorized('review_private_quest_nonxp',
    ownerId,characterId,questId))return denied('private_nonxp_review_unauthorized');
  const db=await pool.connect();let inTxn=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');inTxn=true;
   const ch=await db.query(characterSQL,[ownerId,characterId]);
   if(ch.rowCount!==1||ch.rows[0].owner_id!==ownerId||
      ch.rows[0].character_id!==characterId){
    await db.query('ROLLBACK');inTxn=false;
    return denied('trusted_review_character_missing');
   }
   const src=await db.query(sourceSQL,[ownerId,characterId,questId]);
   if(src.rowCount!==1||!expectedSource(src.rows[0],reward,ownerId,characterId)){
    await db.query('ROLLBACK');inTxn=false;
    return denied('verified_nonxp_source_missing_or_modified');
   }
   const prev=await db.query(existingSQL,[ownerId,characterId,questId]);
   if(prev.rowCount){
    if(prev.rowCount!==1||!matchingReview(prev.rows[0],reward,
       src.rows[0].grant_event_id)){
      await db.query('ROLLBACK');inTxn=false;
      return denied('conflicting_nonxp_review_replay');
    }
    await db.query('COMMIT');inTxn=false;
    return view(questId,reward,prev.rows[0].reviewed_at,true);
   }
   const result=await db.query(insertSQL,[
    ownerId,characterId,questId,PRIVATE_QUEST_REWARD_REVISION_157,
    src.rows[0].grant_event_id,
    reward.points,reward.contribution,reward.reputation
   ]);
   if(result.rowCount!==1)throw Error('missing nonspendable review journal');
   await db.query('COMMIT');inTxn=false;
   return view(questId,reward,result.rows[0].reviewed_at,false);
  }catch{
   if(inTxn)try{await db.query('ROLLBACK')}catch{}
   return denied('private_nonxp_review_transaction_failed');
  }finally{db.release()}
 };
 const readReviews=async({ownerId,characterId}={})=>{
  if(!await authorized('read_private_quest_nonxp_reviews',
    ownerId,characterId))return denied('private_nonxp_read_unauthorized');
  const db=await pool.connect();
  try{
   const r=await db.query(readSQL,[ownerId,characterId]);
   if(r.rows.some(x=>x.nonspendable!==true||
       x.policy_status!=='awaiting-separate-authorities'))
    return denied('invalid_nonxp_review_state');
   return Object.freeze({ok:true,version:'15.9',
    reviews:Object.freeze(r.rows.map(x=>Object.freeze({
     questId:x.quest_id,rewardRevision:x.reward_revision,
     reviewedAt:x.reviewed_at,
     proposedNonSpendable:Object.freeze({
      statPoints:Number(x.points_amount),
      characterContribution:Number(x.contribution_amount),
      factionReputation:Number(x.reputation_amount)
     }),
     claimable:false,spendable:false,grantsIssued:false,
    }))),privateServerOnly:true,productionReady:false});
  }catch{return denied('private_nonxp_review_read_failed')}
  finally{db.release()}
 };
 return Object.freeze({version:'15.9',review,readReviews,
  privateServerOnly:true,publicEndpointInstalled:false,
  browserStoreConnected:false,statPointWriterEnabled:false,
  contributionWriterEnabled:false,factionReputationWriterEnabled:false,
  walletWriterEnabled:false,inventoryWriterEnabled:false,
  productionReady:false,
 });
}
