// Combat / Quest 15.4 — PRIVATE, server-owned accepted quest bindings.
// Does not accept client objective data, level, reward or progress. Only a
// privileged operator-approved quest ID from the pinned 15.4 catalog.
// This is not a public quest accept/turn-in API and has NO reward writer.
import {deriveCharacterLevel} from './progressionLevelPolicy.mjs';
import {getPrivateQuestDefinition154,
 PRIVATE_QUEST_CATALOG_REVISION_154} from './privateQuestCatalog154.mjs';

const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const validQuestId=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const denied=reason=>Object.freeze({ok:false,version:'15.4',reason,
 accepted:false,objectivesBound:false,questProgressCommitted:false,
 rewardAuthorized:false,privateServerOnly:true,productionReady:false});

const characterSQL=`
 SELECT owner_id,character_id,xp_total::text AS xp_total
 FROM game3d_trusted_character WHERE owner_id=$1 AND character_id=$2
 FOR UPDATE
`;
const currentSQL=`
 SELECT quest_id,status,catalog_revision
 FROM game3d_private_quest_acceptance_154
 WHERE owner_id=$1 AND character_id=$2 AND quest_id=$3
 FOR UPDATE
`;
const addQuestSQL=`
 INSERT INTO game3d_private_quest_acceptance_154
  (owner_id,character_id,quest_id,catalog_revision,status,
   reward_authorized)
 VALUES ($1,$2,$3,$4,'accepted',false)
 RETURNING quest_id,accepted_at
`;
const addObjectiveSQL=`
 INSERT INTO game3d_private_quest_objective_binding_152
  (owner_id,character_id,quest_id,objective_id,objective_type,
   enemy_tier,enemy_id,required_count,status,accepted_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'accepted',$9)
`;
const acceptedSQL=`
 SELECT a.quest_id,a.status,a.catalog_revision,
  a.accepted_at,
  COALESCE(json_agg(json_build_object('id',o.objective_id,
   'type',o.objective_type,'count',o.required_count,'tier',o.enemy_tier,
   'targetId',o.enemy_id)) FILTER (WHERE o.objective_id IS NOT NULL),
   '[]'::json) AS objectives
 FROM game3d_private_quest_acceptance_154 a
 LEFT JOIN game3d_private_quest_objective_binding_152 o
   ON o.owner_id=a.owner_id AND o.character_id=a.character_id
   AND o.quest_id=a.quest_id
 WHERE a.owner_id=$1 AND a.character_id=$2
 GROUP BY a.quest_id,a.status,a.catalog_revision,a.accepted_at
 ORDER BY a.accepted_at,a.quest_id
`;

export function createGame3DPrivateQuestAcceptance154({
 pool,authorizeServerOperation,transactionFence=null,
}={}){
 if(typeof pool?.connect!=='function'||
   typeof authorizeServerOperation!=='function'||
   transactionFence!==null&&typeof transactionFence!=='function')
  throw Error('15.4 requires private PostgreSQL and trusted quest authority');

 const authorize=async(operation,ownerId,characterId,questId=null)=>{
  if(!who(ownerId)||!who(characterId)||
    (questId!==null&&!validQuestId(questId)))return false;
  try{
   return await authorizeServerOperation({
    operation,ownerId,characterId,...(questId===null?{}:{questId})
   })===true;
  }catch{return false}
 };

 const accept=async({ownerId,characterId,questId}={})=>{
  const definition=getPrivateQuestDefinition154(questId);
  if(!definition)return denied('quest_not_in_private_server_catalog');
  if(!await authorize('accept_private_server_quest',ownerId,characterId,questId))
   return denied('private_quest_acceptance_unauthorized');
  if(definition.repeatable!==false||
     !Array.isArray(definition.objectives)||
     definition.objectives.length===0||definition.objectives.length>16)
   return denied('unsupported_private_quest_definition');
  const client=await pool.connect();
  let begun=false;
  try{
   await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
   begun=true;
   // Single owner/character lock serializes acceptance and prevents racing
   // concurrent NPC interactions from binding duplicate objectives.
   const character=await client.query(characterSQL,[ownerId,characterId]);
   if(character.rowCount!==1||
      character.rows[0]?.owner_id!==ownerId||
      character.rows[0]?.character_id!==characterId){
    await client.query('ROLLBACK');begun=false;
    return denied('trusted_quest_character_missing');
   }
   // 18.3 opt-in: lock the active lease row in THIS PostgreSQL transaction.
   // The independent session revoker must UPDATE the same row; an expired
   // or rotated lease can never authorize a quest insert after its revocation
   // transaction has committed.
   const fenceRequest=Object.freeze({ownerId,characterId,questId,
    operation:'accept_private_server_quest'});
   if(transactionFence!==null&&
      await transactionFence(client,fenceRequest)!==true){
    await client.query('ROLLBACK');begun=false;
    return denied('transaction_world_session_unverified');
   }
   const level=deriveCharacterLevel(character.rows[0].xp_total).level;
   if(level<definition.unlockLevel){
    await client.query('ROLLBACK');begun=false;
    return denied('quest_level_not_unlocked');
   }
   if(definition.requires){
    // Checking DB-owned completed quest head, not local completion flags.
    // There is intentionally NO completion/turn-in writer in 15.4.
    const prerequisite=await client.query(currentSQL,
     [ownerId,characterId,definition.requires]);
    if(prerequisite.rowCount!==1||
       prerequisite.rows[0].status!=='completed'){
      await client.query('ROLLBACK');begun=false;
      return denied('quest_prerequisite_unfinished');
    }
   }
   const existing=await client.query(currentSQL,[ownerId,characterId,questId]);
   if(existing.rowCount!==0){
    await client.query('ROLLBACK');begun=false;
    return denied('nonrepeatable_quest_already_registered');
   }
   const created=await client.query(addQuestSQL,[
    ownerId,characterId,questId,PRIVATE_QUEST_CATALOG_REVISION_154
   ]);
   if(created.rowCount!==1||created.rows[0].quest_id!==questId)
    throw Error('private quest acceptance insert refused');
   const acceptedAt=created.rows[0].accepted_at;
   for(const objective of definition.objectives){
    if(!['kill','kill_tier'].includes(objective.type)||
       !validQuestId(objective.id)||!Number.isSafeInteger(objective.count)||
       objective.count<1||objective.count>10000||
       (objective.type==='kill_tier'&&!objective.tier))
     throw Error('unsupported private kill objective');
    const result=await client.query(addObjectiveSQL,[
     ownerId,characterId,questId,objective.id,objective.type,
     objective.tier??null,objective.targetId??null,objective.count,
     acceptedAt,
    ]);
    if(result.rowCount!==1)throw Error('private quest objective insert refused');
   }
   // Verify again immediately before COMMIT to catch expiry or an
   // in-process world generation change during objective insertion.
   if(transactionFence!==null&&
      await transactionFence(client,fenceRequest)!==true){
    await client.query('ROLLBACK');begun=false;
    return denied('transaction_world_session_changed');
   }
   await client.query('COMMIT');begun=false;
   return Object.freeze({ok:true,version:'15.4',
    questId,catalogRevision:PRIVATE_QUEST_CATALOG_REVISION_154,
    accepted:true,objectivesBound:true,
    objectiveCount:definition.objectives.length,
    questProgressCommitted:false,rewardAuthorized:false,
    privateServerOnly:true,productionReady:false});
  }catch{
   if(begun)try{await client.query('ROLLBACK')}catch{}
   return denied('private_quest_acceptance_failed');
  }finally{client.release()}
 };

 const readAccepted=async({ownerId,characterId}={})=>{
  if(!await authorize('read_private_server_quests',ownerId,characterId))
   return denied('private_quest_read_unauthorized');
  const client=await pool.connect();
  try{
   const r=await client.query(acceptedSQL,[ownerId,characterId]);
   return Object.freeze({ok:true,version:'15.4',
    quests:Object.freeze(r.rows.map(x=>Object.freeze({
     id:x.quest_id,status:x.status,
     catalogRevision:x.catalog_revision,
     acceptedAt:x.accepted_at,
     objectives:Object.freeze(x.objectives.map(o=>Object.freeze(o))),
    }))),
    privateServerOnly:true,rewardAuthorized:false,productionReady:false});
  }catch{return denied('private_quest_read_failed')}
  finally{client.release()}
 };

 return Object.freeze({version:'15.4',accept,readAccepted,
  privateServerOnly:true,authoritativeCatalog:true,
  trustedSchedulerIntegrationInstalled:false,
  publicQuestEndpointInstalled:false,
  questCompletionWriterEnabled:false,rewardWriterEnabled:false,
  productionReady:false});
}
