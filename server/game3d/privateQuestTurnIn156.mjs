// Game 3D Combat / Quest 15.6 — PRIVATE, server-authorized turn-in.
// Only *already committed* 15.2 objective credits qualify. The turn-in
// journal is durable, one-time and reward-free; no public/player route.
import {getPrivateQuestDefinition154,
 PRIVATE_QUEST_CATALOG_REVISION_154}
 from './privateQuestCatalog154.mjs';

const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const qid=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const denied=(reason,alreadyCompleted=false)=>Object.freeze({
 ok:false,version:'15.6',reason,alreadyCompleted,
 questTurnInCommitted:false,rewardsIssued:false,privateServerOnly:true,
 productionReady:false,
});
const lockCharacterSQL=`
 SELECT owner_id,character_id FROM game3d_trusted_character
 WHERE owner_id=$1 AND character_id=$2 FOR UPDATE
`;
const lockHeadSQL=`
 SELECT quest_id,status,catalog_revision,accepted_at,reward_authorized
 FROM game3d_private_quest_acceptance_154
 WHERE owner_id=$1 AND character_id=$2 AND quest_id=$3 FOR UPDATE
`;
const lockObjectivesSQL=`
 SELECT objective_id,objective_type,required_count,enemy_tier,enemy_id,status
 FROM game3d_private_quest_objective_binding_152
 WHERE owner_id=$1 AND character_id=$2 AND quest_id=$3
 ORDER BY objective_id FOR UPDATE
`;
const readCreditSQL=`
 SELECT COUNT(*)::integer AS n
 FROM game3d_private_quest_kill_credit_152
 WHERE owner_id=$1 AND character_id=$2
 AND quest_id=$3 AND objective_id=$4
`;
const setObjectivesSQL=`
 UPDATE game3d_private_quest_objective_binding_152
 SET status='completed',updated_at=clock_timestamp()
 WHERE owner_id=$1 AND character_id=$2 AND quest_id=$3 AND status='accepted'
 RETURNING objective_id
`;
const setHeadSQL=`
 UPDATE game3d_private_quest_acceptance_154
 SET status='completed',updated_at=clock_timestamp()
 WHERE owner_id=$1 AND character_id=$2 AND quest_id=$3
 AND status='accepted' AND reward_authorized=false
 RETURNING quest_id,catalog_revision
`;
const addJournalSQL=`
 INSERT INTO game3d_private_quest_turnin_156
 (owner_id,character_id,quest_id,catalog_revision,source_kind,rewards_issued)
 VALUES($1,$2,$3,$4,'server-verified-private-quest-turnin',false)
 RETURNING quest_id,completed_at
`;
const readJournalSQL=`
 SELECT quest_id,catalog_revision,completed_at,rewards_issued
 FROM game3d_private_quest_turnin_156
 WHERE owner_id=$1 AND character_id=$2
 ORDER BY completed_at,quest_id
`;
function matchesPinnedObjective(db,expected){
 return db?.objective_id===expected.id&&db?.objective_type===expected.type&&
  Number(db.required_count)===expected.count&&
  (db.enemy_tier??null)===(expected.tier??null)&&
  (db.enemy_id??null)===(expected.targetId??null)&&
  db.status==='accepted';
}
export function createGame3DPrivateQuestTurnIn156({
 pool,authorizeServerOperation,transactionFence=null,
 sessionFenceMode='legacy'
}={}){
 if(typeof pool?.connect!=='function'||
    typeof authorizeServerOperation!=='function'||
    (transactionFence!==null&&typeof transactionFence!=='function')||
    !['legacy','per-quest'].includes(sessionFenceMode))
  throw Error('15.6 requires private database and trusted operator');
 const authorized=async(operation,ownerId,characterId,questId=null)=>{
  if(!who(ownerId)||!who(characterId)||
     (questId!==null&&!qid(questId)))return false;
  try{
   return await authorizeServerOperation({
    operation,ownerId,characterId,
    ...(questId===null?{}:{questId})
   })===true;
  }catch{return false}
 };
 const turnIn=async({ownerId,characterId,questId}={})=>{
  const definition=getPrivateQuestDefinition154(questId);
  if(!definition||definition.repeatable!==false||
     !Array.isArray(definition.objectives)||
     definition.objectives.length<1||definition.objectives.length>16)
   return denied('quest_not_eligible_for_private_turnin');
  if(!await authorized('turn_in_private_server_quest',
    ownerId,characterId,questId))
   return denied('private_quest_turnin_unauthorized');

  const client=await pool.connect();
  let started=false;
  try{
   await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
   started=true;
   // Coordinate with 15.4 acceptance, and lock 15.2 objective rows before
   // counting credits to block late concurrent projections.
   const character=await client.query(lockCharacterSQL,[ownerId,characterId]);
   if(character.rowCount!==1){
    await client.query('ROLLBACK');started=false;
    return denied('trusted_turnin_character_missing');
   }
   const fenceRequest=Object.freeze({ownerId,characterId,questId,
    operation:'turn_in_private_server_quest'});
   // 18.4: hold a lock on the current independently issued world lease
   // during the SAME PostgreSQL turn-in transaction. Do not rely on an
   // earlier HTTP proof or NPC encounter alone.
   if(transactionFence!==null&&
      await transactionFence(client,fenceRequest)!==true){
    await client.query('ROLLBACK');started=false;
    return denied(sessionFenceMode==='legacy'
     ?'private_world_turnin_session_unverified'
     :'transaction_world_session_unverified');
   }
   const head=await client.query(lockHeadSQL,[ownerId,characterId,questId]);
   if(head.rowCount!==1){
    await client.query('ROLLBACK');started=false;
    return denied('quest_not_accepted');
   }
   const accepted=head.rows[0];
   if(accepted.catalog_revision!==PRIVATE_QUEST_CATALOG_REVISION_154||
      accepted.reward_authorized!==false){
    await client.query('ROLLBACK');started=false;
    return denied('untrusted_quest_revision_or_reward_state');
   }
   if(accepted.status!=='accepted'){
    await client.query('ROLLBACK');started=false;
    return denied('quest_already_closed',accepted.status==='completed');
   }
   const result=await client.query(lockObjectivesSQL,
    [ownerId,characterId,questId]);
   const expected=new Map(definition.objectives.map(o=>[o.id,o]));
   if(result.rowCount!==expected.size||
      result.rows.some(row=>!expected.has(row.objective_id)||
       !matchesPinnedObjective(row,expected.get(row.objective_id)))){
    await client.query('ROLLBACK');started=false;
    return denied('untrusted_quest_objective_binding');
   }
   let total=0;
   for(const row of result.rows){
    const count=await client.query(readCreditSQL,
     [ownerId,characterId,questId,row.objective_id]);
    const n=Number(count.rows[0]?.n);
    if(count.rowCount!==1||!Number.isSafeInteger(n)||n<0||
       n<Number(row.required_count)){
      await client.query('ROLLBACK');started=false;
      return denied('quest_objectives_incomplete');
    }
    total+=n;
   }
   const objectives=await client.query(setObjectivesSQL,
    [ownerId,characterId,questId]);
   const updated=await client.query(setHeadSQL,
    [ownerId,characterId,questId]);
   if(objectives.rowCount!==expected.size||
      updated.rowCount!==1||updated.rows[0]?.quest_id!==questId||
      updated.rows[0]?.catalog_revision!==PRIVATE_QUEST_CATALOG_REVISION_154)
    throw Error('private_quest_turnin_inconsistent');
   const journal=await client.query(addJournalSQL,[
    ownerId,characterId,questId,PRIVATE_QUEST_CATALOG_REVISION_154
   ]);
   if(journal.rowCount!==1||journal.rows[0]?.quest_id!==questId)
    throw Error('private_quest_turnin_journal_missing');
   // Recheck AFTER objective/head/journal writes and BEFORE COMMIT. A
   // stale world epoch or revoked/expired Base44 session rolls everything
   // back; a successful turn-in never issues XP, items, or currency.
   if(transactionFence!==null&&
      await transactionFence(client,fenceRequest)!==true){
    await client.query('ROLLBACK');started=false;
    return denied(sessionFenceMode==='legacy'
     ?'private_world_turnin_session_changed'
     :'transaction_world_session_changed');
   }
   await client.query('COMMIT');started=false;
   return Object.freeze({
    ok:true,version:'15.6',questId,
    creditedDefeats:total,
    completedAt:journal.rows[0].completed_at,
    questTurnInCommitted:true,alreadyCompleted:false,
    privateServerOnly:true,rewardsIssued:false,
    rewardSettlementAuthorized:false,productionReady:false,
   });
  }catch{
   if(started)try{await client.query('ROLLBACK')}catch{}
   return denied('private_quest_turnin_transaction_failed');
  }finally{client.release()}
 };
 const readCompleted=async({ownerId,characterId}={})=>{
  if(!await authorized('read_private_quest_turnins',ownerId,characterId))
   return denied('private_quest_turnin_read_unauthorized');
  const client=await pool.connect();
  try{
   const r=await client.query(readJournalSQL,[ownerId,characterId]);
   if(r.rows.some(x=>x.rewards_issued!==false))
    return denied('unexpected_reward_state');
   return Object.freeze({
    ok:true,version:'15.6',
    completed:Object.freeze(r.rows.map(row=>Object.freeze({
     questId:row.quest_id,catalogRevision:row.catalog_revision,
     completedAt:row.completed_at,
    }))),
    privateServerOnly:true,rewardsIssued:false,productionReady:false,
   });
  }catch{return denied('private_turnin_read_failed')}
  finally{client.release()}
 };
 return Object.freeze({
  version:'15.6',turnIn,readCompleted,
  privateServerOnly:true,publicRouteInstalled:false,
  liveBrowserQuestMounted:false,questTurnInWriterEnabled:true,
  rewardWriterEnabled:false,productionReady:false,
 });
}
