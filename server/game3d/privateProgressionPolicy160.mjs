// Game 3D Combat/Quest 16.0 — private, READ-ONLY trusted progression policy.
// Reuses 10.4 server level policy, 5.0 canonical XP, 15.8 XP settlement,
// and 15.9 nonspendable reward reviews. No second player wallet or HUD store.
// No stat allocation, contribution spend/refund, faction rank or public route.
import {deriveCharacterLevel,CHARACTER_LEVEL_POLICY_VERSION}
 from './progressionLevelPolicy.mjs';
import {getPrivateQuestReward157,PRIVATE_QUEST_REWARD_REVISION_157}
 from './privateQuestRewardCatalog157.mjs';
import {getPrivateQuestDefinition154,PRIVATE_QUEST_CATALOG_REVISION_154}
 from './privateQuestCatalog154.mjs';

export const PROGRESSION_POLICY_VERSION_160='game3d-private-progression-policy-160';
export const LEVEL_STAT_POINTS_POLICY_160=3; // existing Game 3D playerHUDStore
const identity=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const rejected=reason=>Object.freeze({
 ok:false,version:'16.0',reason,
 privateServerOnly:true,spendable:false,statAllocationEnabled:false,
 contributionSpendingEnabled:false,productionReady:false,
});
const characterSQL=`
 SELECT owner_id,character_id,xp_total::text AS xp_total,
  revision::text AS revision
 FROM game3d_trusted_character WHERE owner_id=$1 AND character_id=$2
`;
const countsSQL=`
 SELECT COUNT(*)::text AS settled_count
 FROM game3d_private_quest_xp_settlement_158
 WHERE owner_id=$1 AND character_id=$2
`;
const reviewSQL=`
 SELECT r.quest_id,r.reward_revision,r.xp_grant_event_id,
  r.points_amount,r.contribution_amount,r.reputation_amount,
  r.policy_status,r.nonspendable,r.points_posted,
  r.contribution_posted,r.reputation_posted,r.item_issued,r.currency_issued,
  p.catalog_revision,p.reward_revision AS plan_revision,
  p.points_amount AS plan_points,p.contribution_amount AS plan_contribution,
  p.reputation_amount AS plan_reputation,p.xp_amount AS plan_xp,
  p.plan_only,p.reward_issued,
  x.grant_event_id AS settled_event_id,x.reward_revision AS settled_revision,
  x.xp_amount AS settled_xp,x.xp_credited,
  t.rewards_issued AS turnin_rewards_issued,
  h.status AS quest_status,h.reward_authorized,
  e.owner_id AS grant_owner,e.character_id AS grant_character,
  e.event_type,e.provenance
 FROM game3d_private_quest_nonxp_review_159 r
 LEFT JOIN game3d_private_quest_reward_plan_157 p
  ON p.owner_id=r.owner_id AND p.character_id=r.character_id
  AND p.quest_id=r.quest_id
 LEFT JOIN game3d_private_quest_xp_settlement_158 x
  ON x.owner_id=r.owner_id AND x.character_id=r.character_id
  AND x.quest_id=r.quest_id
 LEFT JOIN game3d_private_quest_turnin_156 t
  ON t.owner_id=r.owner_id AND t.character_id=r.character_id
  AND t.quest_id=r.quest_id
 LEFT JOIN game3d_private_quest_acceptance_154 h
  ON h.owner_id=r.owner_id AND h.character_id=r.character_id
  AND h.quest_id=r.quest_id
 LEFT JOIN game3d_trusted_grant_event e ON e.event_id=x.grant_event_id
 WHERE r.owner_id=$1 AND r.character_id=$2
 ORDER BY r.quest_id
`;
const positiveInt=(x,max)=>Number.isSafeInteger(Number(x))&&
 Number(x)>=0&&Number(x)<=max;
function validReview(r,ownerId,characterId){
 const def=getPrivateQuestDefinition154(r.quest_id);
 const reward=getPrivateQuestReward157(r.quest_id);
 if(!def||def.repeatable!==false||!reward)return false;
 return r.reward_revision===PRIVATE_QUEST_REWARD_REVISION_157&&
  r.plan_revision===PRIVATE_QUEST_REWARD_REVISION_157&&
  r.settled_revision===PRIVATE_QUEST_REWARD_REVISION_157&&
  r.catalog_revision===PRIVATE_QUEST_CATALOG_REVISION_154&&
  r.quest_status==='completed'&&r.reward_authorized===false&&
  r.turnin_rewards_issued===false&&r.xp_credited===true&&
  r.plan_only===true&&r.reward_issued===false&&
  r.policy_status==='awaiting-separate-authorities'&&r.nonspendable===true&&
  r.points_posted===false&&r.contribution_posted===false&&
  r.reputation_posted===false&&r.item_issued===false&&
  r.currency_issued===false&&
  r.grant_owner===ownerId&&r.grant_character===characterId&&
  r.event_type==='xp'&&r.provenance==='verified-gameplay-event'&&
  typeof r.xp_grant_event_id==='string'&&
  r.xp_grant_event_id===r.settled_event_id&&
  r.xp_grant_event_id.startsWith('qxp-')&&
  Number(r.plan_xp)===reward.xp&&Number(r.settled_xp)===reward.xp&&
  Number(r.points_amount)===reward.points&&
  Number(r.plan_points)===reward.points&&
  Number(r.contribution_amount)===reward.contribution&&
  Number(r.plan_contribution)===reward.contribution&&
  Number(r.reputation_amount)===reward.reputation&&
  Number(r.plan_reputation)===reward.reputation;
}
const countBigInt=x=>typeof x==='string'&&/^(0|[1-9][0-9]*)$/.test(x)
 ?BigInt(x):null;
const castSafe=(x)=>{
 if(typeof x!=='bigint'||x<0n||x>BigInt(Number.MAX_SAFE_INTEGER))
  throw Error('Progression policy exceeds safe range');
 return Number(x);
};
// These are NOT spendable balance calculations, only an authoritative
// read of what policy could later make available after a reviewed migration.
export function createGame3DPrivateProgressionPolicy160({
 pool,authorizeServerOperation
}={}){
 if(typeof pool?.connect!=='function'||typeof authorizeServerOperation!=='function')
  throw Error('16.0 requires private PostgreSQL and verified server operator');

 const readPolicy=async({ownerId,characterId}={})=>{
  if(!identity(ownerId)||!identity(characterId))
   return rejected('private_progression_identity_invalid');
  let authorized=false;
  try{authorized=await authorizeServerOperation({
    operation:'read_private_progression_policy',
    ownerId,characterId
  })===true}catch{}
  if(!authorized)return rejected('private_progression_read_unauthorized');
  const db=await pool.connect();let txn=false;
  try{
   // Prevent double-reading a concurrent reward settlement midway.
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   txn=true;
   const ch=await db.query(characterSQL,[ownerId,characterId]);
   if(ch.rowCount!==1||ch.rows[0].owner_id!==ownerId||
      ch.rows[0].character_id!==characterId){
    await db.query('ROLLBACK');txn=false;
    return rejected('trusted_progression_character_missing');
   }
   const xp=ch.rows[0].xp_total,revision=ch.rows[0].revision;
   if(countBigInt(xp)===null||countBigInt(revision)===null)
    throw Error('Corrupt trusted character totals');
   const level=deriveCharacterLevel(xp);
   const counts=await db.query(countsSQL,[ownerId,characterId]);
   const reviews=await db.query(reviewSQL,[ownerId,characterId]);
   if(counts.rowCount!==1||
      countBigInt(counts.rows[0].settled_count)===null)
    throw Error('Corrupt trusted XP settlement count');
   if(BigInt(reviews.rowCount)>countBigInt(counts.rows[0].settled_count))
    throw Error('Orphan/duplicated non-XP review detected');
   let pointBonus=0n,contribution=0n,reputation=0n;
   for(const row of reviews.rows){
    if(!validReview(row,ownerId,characterId))
     throw Error('Unverified pending quest reward review');
    pointBonus+=BigInt(row.points_amount);
    contribution+=BigInt(row.contribution_amount);
    reputation+=BigInt(row.reputation_amount);
   }
   const levelPoints=BigInt(level.level-1)*
     BigInt(LEVEL_STAT_POINTS_POLICY_160);
   const preview=Object.freeze({
    level:level.level,committedXP:xp,
    characterRevision:revision,
    levelPolicyVersion:CHARACTER_LEVEL_POLICY_VERSION,
    policyVersion:PROGRESSION_POLICY_VERSION_160,
    levelEarnedStatPointCeiling:castSafe(levelPoints),
    verifiedQuestBonusPointCeiling:castSafe(pointBonus),
    totalPotentialStatPointCeiling:castSafe(levelPoints+pointBonus),
    reviewedQuestContribution:castSafe(contribution),
    reviewedQuestFactionReputation:castSafe(reputation),
    reviewsRecorded:reviews.rowCount,
    questsWithSettledXP:castSafe(countBigInt(counts.rows[0].settled_count)),
    allXPSettlementsReviewed:BigInt(reviews.rowCount)===
     countBigInt(counts.rows[0].settled_count),
    // No authoritative spend/refund journal or faction binding exists yet.
    availableStatPoints:null,statPointsSpent:null,
    spendableContributionBalance:null,contributionSpent:null,
    factionReputationBalance:null,
    migrationRequired:true,statAllocationEnabled:false,
    contributionSpendingEnabled:false,factionRepWriterEnabled:false,
    browserSyncEnabled:false,
    noLegacyBalanceImported:true,privateServerOnly:true,
    productionReady:false,
   });
   await db.query('COMMIT');txn=false;
   return Object.freeze({ok:true,version:'16.0',preview,
    readOnly:true,privateServerOnly:true,productionReady:false});
  }catch{
   if(txn)try{await db.query('ROLLBACK')}catch{}
   return rejected('private_progression_policy_unverified');
  }finally{db.release()}
 };
 return Object.freeze({
  version:'16.0',readPolicy,privateServerOnly:true,
  browserStoreConnected:false,publicEndpointInstalled:false,
  statPointWriterEnabled:false,contributionWriterEnabled:false,
  factionReputationWriterEnabled:false,productionReady:false,
 });
}
