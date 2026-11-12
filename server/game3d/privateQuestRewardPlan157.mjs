// Combat / Quest 15.7: private-only, NON-PAYABLE quest reward planning.
// Records immutable expected amounts from a server-owned catalog, solely
// after committed 15.6 turn-in. No public route, inventory/XP/wallet writes,
// claim tokens, settlement adapter, or entitlement that can be redeemed.
import {PRIVATE_QUEST_CATALOG_REVISION_154,getPrivateQuestDefinition154}
 from './privateQuestCatalog154.mjs';
import {PRIVATE_QUEST_REWARD_REVISION_157,getPrivateQuestReward157}
 from './privateQuestRewardCatalog157.mjs';

const validWho=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const denied=reason=>Object.freeze({
 ok:false,version:'15.7',reason,planRecorded:false,
 rewardIssued:false,privateServerOnly:true,productionReady:false,
});
const characterSQL=`
 SELECT owner_id,character_id FROM game3d_trusted_character
 WHERE owner_id=$1 AND character_id=$2 FOR UPDATE
`;
const completedSQL=`
 SELECT t.quest_id,t.catalog_revision,t.rewards_issued,
        h.status AS quest_status,h.reward_authorized
 FROM game3d_private_quest_turnin_156 t
 JOIN game3d_private_quest_acceptance_154 h
  ON h.owner_id=t.owner_id AND h.character_id=t.character_id
  AND h.quest_id=t.quest_id
 WHERE t.owner_id=$1 AND t.character_id=$2 AND t.quest_id=$3
 FOR UPDATE OF t,h
`;
const objectiveStatusSQL=`
 SELECT objective_id,objective_type,required_count,enemy_tier,enemy_id,status
 FROM game3d_private_quest_objective_binding_152
 WHERE owner_id=$1 AND character_id=$2 AND quest_id=$3
 ORDER BY objective_id FOR SHARE`;
const existingSQL=`
 SELECT quest_id,catalog_revision,reward_revision,xp_amount,points_amount,
        contribution_amount,reputation_amount,item_count,currency_amount,
        plan_only,reward_issued,planned_at
 FROM game3d_private_quest_reward_plan_157
 WHERE owner_id=$1 AND character_id=$2 AND quest_id=$3 FOR UPDATE
`;
const insertSQL=`
 INSERT INTO game3d_private_quest_reward_plan_157
 (owner_id,character_id,quest_id,catalog_revision,reward_revision,
  xp_amount,points_amount,contribution_amount,reputation_amount,
  item_count,currency_amount,plan_only,reward_issued,source_kind)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,0,true,false,
  'verified-private-quest-turnin-plan')
 RETURNING quest_id,planned_at
`;
const readSQL=`
 SELECT quest_id,catalog_revision,reward_revision,xp_amount,points_amount,
        contribution_amount,reputation_amount,plan_only,reward_issued,planned_at
 FROM game3d_private_quest_reward_plan_157
 WHERE owner_id=$1 AND character_id=$2
 ORDER BY planned_at,quest_id
`;
const pinnedRow=(row,reward)=>row.catalog_revision===
 PRIVATE_QUEST_CATALOG_REVISION_154&&
 row.reward_revision===PRIVATE_QUEST_REWARD_REVISION_157&&
 Number(row.xp_amount)===reward.xp&&
 Number(row.points_amount)===reward.points&&
 Number(row.contribution_amount)===reward.contribution&&
 Number(row.reputation_amount)===reward.reputation&&
 Number(row.item_count)===0&&Number(row.currency_amount)===0&&
 row.plan_only===true&&row.reward_issued===false;
const toView=(questId,reward,plannedAt,alreadyPlanned)=>Object.freeze({
 questId,plannedAt,alreadyPlanned,planRecorded:true,
 rewardRevision:PRIVATE_QUEST_REWARD_REVISION_157,
 proposedReward:Object.freeze({
  xp:reward.xp,points:reward.points,
  contribution:reward.contribution,reputation:reward.reputation,
 }),
 // A proposed amount is NOT owed or claimable in this milestone.
 rewardIssued:false,claimable:false,settlementAuthorized:false,
 privateServerOnly:true,productionReady:false,ok:true,version:'15.7',
});
export function createGame3DPrivateQuestRewardPlan157({
 pool,authorizeServerOperation
}={}){
 if(typeof pool?.connect!=='function'||
    typeof authorizeServerOperation!=='function')
  throw Error('15.7 requires private PostgreSQL and privileged authorization');

 const authorized=async(operation,ownerId,characterId,questId=null)=>{
  if(!validWho(ownerId)||!validWho(characterId))return false;
  try{return await authorizeServerOperation({
   operation,ownerId,characterId,...(questId===null?{}:{questId})
  })===true;}catch{return false;}
 };
 const plan=async({ownerId,characterId,questId}={})=>{
  const definition=getPrivateQuestDefinition154(questId);
  const reward=getPrivateQuestReward157(questId);
  if(!definition||!reward||definition.repeatable!==false||
     !Number.isSafeInteger(reward.xp)||reward.xp<0||
     ['points','contribution','reputation'].some(key=>
      !Number.isSafeInteger(reward[key])||reward[key]<0)||
     reward.items?.length!==0||reward.currency!==0)
   return denied('quest_reward_not_in_private_catalog');
  if(!await authorized('plan_verified_private_quest_reward',
       ownerId,characterId,questId))
   return denied('private_reward_plan_unauthorized');

  const db=await pool.connect();let started=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
   started=true;
   // Same character lock order as 15.4 acceptance and 15.6 turn-in.
   const character=await db.query(characterSQL,[ownerId,characterId]);
   if(character.rowCount!==1){
    await db.query('ROLLBACK');started=false;
    return denied('private_reward_character_missing');
   }
   const completion=await db.query(completedSQL,
    [ownerId,characterId,questId]);
   if(completion.rowCount!==1||
      completion.rows[0].quest_status!=='completed'||
      completion.rows[0].catalog_revision!==PRIVATE_QUEST_CATALOG_REVISION_154||
      completion.rows[0].rewards_issued!==false||
      completion.rows[0].reward_authorized!==false){
    await db.query('ROLLBACK');started=false;
    return denied('verified_quest_turnin_missing');
   }
   // An otherwise valid head cannot compensate for incomplete objective
   // states (e.g. an operator applied a partial migration).
   const objectives=await db.query(objectiveStatusSQL,
    [ownerId,characterId,questId]);
   const pinned=new Map(definition.objectives.map(o=>[o.id,o]));
   if(objectives.rowCount!==pinned.size||objectives.rows.some(row=>{
     const expected=pinned.get(row.objective_id);
     return !expected||row.status!=='completed'||
       row.objective_type!==expected.type||
       Number(row.required_count)!==expected.count||
       (row.enemy_tier??null)!==(expected.tier??null)||
       (row.enemy_id??null)!==(expected.targetId??null);
   })){
    await db.query('ROLLBACK');started=false;
    return denied('reward_plan_objectives_not_completed');
   }
   const existing=await db.query(existingSQL,
    [ownerId,characterId,questId]);
   if(existing.rowCount){
    if(existing.rowCount!==1||!pinnedRow(existing.rows[0],reward)){
     await db.query('ROLLBACK');started=false;
     return denied('reward_plan_revision_or_amount_mismatch');
    }
    await db.query('COMMIT');started=false;
    return toView(questId,reward,existing.rows[0].planned_at,true);
   }
   const inserted=await db.query(insertSQL,[
    ownerId,characterId,questId,PRIVATE_QUEST_CATALOG_REVISION_154,
    PRIVATE_QUEST_REWARD_REVISION_157,reward.xp,reward.points,
    reward.contribution,reward.reputation
   ]);
   if(inserted.rowCount!==1||inserted.rows[0]?.quest_id!==questId)
    throw Error('private reward plan insert refused');
   await db.query('COMMIT');started=false;
   return toView(questId,reward,inserted.rows[0].planned_at,false);
  }catch{
   if(started)try{await db.query('ROLLBACK')}catch{}
   return denied('private_reward_plan_database_failure');
  }finally{db.release()}
 };
 const readPlans=async({ownerId,characterId}={})=>{
  if(!await authorized('read_private_quest_reward_plans',
     ownerId,characterId))
   return denied('private_reward_plan_read_unauthorized');
  const db=await pool.connect();
  try{
   const r=await db.query(readSQL,[ownerId,characterId]);
   return Object.freeze({ok:true,version:'15.7',
    plans:Object.freeze(r.rows.map(row=>Object.freeze({
     questId:row.quest_id,catalogRevision:row.catalog_revision,
     rewardRevision:row.reward_revision,plannedAt:row.planned_at,
     proposedReward:Object.freeze({
      xp:Number(row.xp_amount),points:Number(row.points_amount),
      contribution:Number(row.contribution_amount),
      reputation:Number(row.reputation_amount),
     }),
     claimable:false,rewardIssued:false,settlementAuthorized:false,
    }))),
    privateServerOnly:true,productionReady:false});
  }catch{return denied('private_reward_plan_read_failed')}
  finally{db.release()}
 };
 return Object.freeze({version:'15.7',plan,readPlans,
  privateServerOnly:true,publicRouteInstalled:false,
  browserMounted:false,settlementWriterEnabled:false,
  xpWriterEnabled:false,itemWriterEnabled:false,
  walletWriterEnabled:false,productionReady:false});
}
