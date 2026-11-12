// Game 3D Combat/Quest 16.3 — PRIVATE faction membership + reputation.
// NEVER treat browser selected faction, quest faction fallback, or 15.9
// pending reputation as an authenticated server faction assignment.
// The server injects a separately audited assignment authority. No public API.
import {createHash} from 'node:crypto';
import {getPrivateQuestDefinition154,PRIVATE_QUEST_CATALOG_REVISION_154}
 from './privateQuestCatalog154.mjs';
import {getPrivateQuestReward157,PRIVATE_QUEST_REWARD_REVISION_157}
 from './privateQuestRewardCatalog157.mjs';

export const PRIVATE_AXE_FACTIONS_163=Object.freeze([
 'AXE_Faction_1','AXE_Faction_2','AXE_Faction_3'
]);
export const PRIVATE_REPUTATION_RANKS_163=Object.freeze([
 Object.freeze({id:'outsider',min:0}),
 Object.freeze({id:'known',min:100}),
 Object.freeze({id:'trusted',min:500}),
 Object.freeze({id:'honored',min:1500}),
 Object.freeze({id:'exalted',min:4000}),
]);
const validFaction=x=>PRIVATE_AXE_FACTIONS_163.includes(x);
const validWho=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const denied=reason=>Object.freeze({ok:false,version:'16.3',reason,
 reputationCredited:false,privateServerOnly:true,
 legacyReputationImported:false,liveFactionGameplayMounted:false,
 productionReady:false});
const MAX_REP=9000000000000000n;
const characterSQL=`
 SELECT owner_id,character_id FROM game3d_trusted_character
 WHERE owner_id=$1 AND character_id=$2 FOR UPDATE
`;
const membershipSQL=`
 SELECT faction_id,source_kind FROM game3d_private_faction_membership_163
 WHERE owner_id=$1 AND character_id=$2
`;
const insertMemberSQL=`
 INSERT INTO game3d_private_faction_membership_163
 (owner_id,character_id,faction_id,source_kind)
 VALUES($1,$2,$3,'trusted-server-faction-assignment')
 RETURNING faction_id
`;
const insertAccountSQL=`
 INSERT INTO game3d_private_faction_reputation_account_163
 (owner_id,character_id,faction_id)
 VALUES($1,$2,$3) ON CONFLICT DO NOTHING
`;
const accountSQL=`
 SELECT faction_id,reputation::text AS reputation,revision::text AS revision
 FROM game3d_private_faction_reputation_account_163
 WHERE owner_id=$1 AND character_id=$2 AND faction_id=$3 FOR UPDATE
`;
const readAccountSQL=accountSQL.replace(' FOR UPDATE','');
const eventsSQL=`
 SELECT faction_id,quest_id,event_id,reward_revision,
 amount::text AS amount,reputation_after::text AS reputation_after,
 revision::text AS revision,source_kind
 FROM game3d_private_faction_reputation_event_163
 WHERE owner_id=$1 AND character_id=$2
 ORDER BY revision
`;
const sourceSQL=`
 SELECT r.quest_id,r.reward_revision,r.reputation_amount,r.nonspendable,
 r.policy_status,r.reputation_posted,r.points_posted,r.contribution_posted,
 r.item_issued,r.currency_issued,r.xp_grant_event_id,
 p.catalog_revision,p.reward_revision AS plan_revision,
 p.reputation_amount AS planned_reputation,p.plan_only,p.reward_issued,
 h.status AS quest_status,h.reward_authorized,
 t.rewards_issued AS turnin_rewards_issued,
 x.grant_event_id,x.xp_credited,x.reward_revision AS xp_revision,
 e.owner_id AS grant_owner,e.character_id AS grant_character,
 e.event_type,e.provenance
 FROM game3d_private_quest_nonxp_review_159 r
 JOIN game3d_private_quest_reward_plan_157 p USING(owner_id,character_id,quest_id)
 JOIN game3d_private_quest_acceptance_154 h USING(owner_id,character_id,quest_id)
 JOIN game3d_private_quest_turnin_156 t USING(owner_id,character_id,quest_id)
 JOIN game3d_private_quest_xp_settlement_158 x USING(owner_id,character_id,quest_id)
 JOIN game3d_trusted_grant_event e ON e.event_id=x.grant_event_id
 WHERE r.owner_id=$1 AND r.character_id=$2 AND r.quest_id=$3
 FOR SHARE OF r,p,h,t,x,e
`;
const journalSQL=`
 INSERT INTO game3d_private_faction_reputation_event_163
 (owner_id,character_id,faction_id,quest_id,event_id,reward_revision,
 amount,reputation_after,revision,source_kind)
 VALUES($1,$2,$3,$4,$5,$6,$7::bigint,$8::bigint,$9::bigint,
 'verified-private-quest-faction-reputation')
 RETURNING event_id
`;
const updateSQL=`
 UPDATE game3d_private_faction_reputation_account_163
 SET reputation=$4::bigint,revision=$5::bigint,updated_at=clock_timestamp()
 WHERE owner_id=$1 AND character_id=$2 AND faction_id=$3
 AND revision=$6::bigint
 RETURNING revision::text AS revision
`;
const int=x=>typeof x==='string'&&/^(0|[1-9][0-9]*)$/.test(x)
 ?BigInt(x):null;
const eventId=(ownerId,characterId,questId)=>
 'factionquest-'+createHash('sha256').update(JSON.stringify([
  'private-faction-rep-163-v1',ownerId,characterId,questId
 ])).digest('hex');
const expectedAmount=(row,ownerId,characterId,questId)=>{
 const definition=getPrivateQuestDefinition154(questId);
 const reward=getPrivateQuestReward157(questId);
 if(!definition||definition.repeatable!==false||!reward||!row)return null;
 if(row.quest_id!==questId||
 row.reward_revision!==PRIVATE_QUEST_REWARD_REVISION_157||
 row.plan_revision!==PRIVATE_QUEST_REWARD_REVISION_157||
 row.xp_revision!==PRIVATE_QUEST_REWARD_REVISION_157||
 row.catalog_revision!==PRIVATE_QUEST_CATALOG_REVISION_154||
 row.quest_status!=='completed'||row.reward_authorized!==false||
 row.turnin_rewards_issued!==false||row.xp_credited!==true||
 row.plan_only!==true||row.reward_issued!==false||
 row.nonspendable!==true||
 row.policy_status!=='awaiting-separate-authorities'||
 row.reputation_posted!==false||row.points_posted!==false||
 row.contribution_posted!==false||row.item_issued!==false||
 row.currency_issued!==false||row.xp_grant_event_id!==row.grant_event_id||
 row.grant_owner!==ownerId||row.grant_character!==characterId||
 row.event_type!=='xp'||row.provenance!=='verified-gameplay-event'||
 Number(row.reputation_amount)!==reward.reputation||
 Number(row.planned_reputation)!==reward.reputation)return null;
 const n=BigInt(reward.reputation);
 return n>0n&&n<=1000000n?n:null;
};
function audit(factionId,account,events){
 if(!validFaction(factionId))throw Error('Unknown assigned faction');
 let total=0n,rev=0n;
 const quests=new Map(),ids=new Set();
 for(const row of events){
  const amount=int(row.amount),after=int(row.reputation_after),revision=int(row.revision);
  if(row.faction_id!==factionId||
     row.source_kind!=='verified-private-quest-faction-reputation'||
     row.reward_revision!==PRIVATE_QUEST_REWARD_REVISION_157||
     !getPrivateQuestDefinition154(row.quest_id)||
     row.event_id!==eventId(account.ownerId,account.characterId,row.quest_id)||
     ids.has(row.event_id)||quests.has(row.quest_id)||
     amount===null||amount<1n||amount>1000000n||
     revision!==rev+1n||after!==total+amount)
    throw Error('Corrupted private faction journal');
  ids.add(row.event_id);quests.set(row.quest_id,amount);
  total+=amount;rev=revision;
 }
 if(total>MAX_REP||int(account.reputation)!==total||
    int(account.revision)!==rev)
  throw Error('Private faction account / journal mismatch');
 return {total,revision:rev,quests};
}
function rankFor(reputation){
 let rank=PRIVATE_REPUTATION_RANKS_163[0].id;
 for(const item of PRIVATE_REPUTATION_RANKS_163){
  if(reputation>=BigInt(item.min))rank=item.id;
 }
 return rank;
}
function view(factionId,state,{questId=null,amount=null,posted=false,
 alreadyPosted=false,readOnly=false}={}){
 if(state.total>BigInt(Number.MAX_SAFE_INTEGER))
  throw Error('Faction reputation overflow');
 return Object.freeze({ok:true,version:'16.3',factionId,questId,
  amount:amount===null?null:Number(amount),reputation:Number(state.total),
  rank:rankFor(state.total),revision:state.revision.toString(),
  posted,alreadyPosted,readOnly,
  legacyReputationImported:false,legacyFactionImported:false,
  membershipChangeEnabled:false,liveFactionGameplayMounted:false,
  privateServerOnly:true,productionReady:false});
}
export function createGame3DPrivateFactionReputation163({
 pool,authorizeServerOperation,resolveTrustedFactionAssignment
}={}){
 if(typeof pool?.connect!=='function'||
    typeof authorizeServerOperation!=='function')
  throw Error('16.3 requires private PostgreSQL and operator authorization');
 const allow=async(operation,ownerId,characterId,questId=null)=>{
  if(!validWho(ownerId)||!validWho(characterId))return false;
  try{return await authorizeServerOperation({operation,ownerId,characterId,
   ...(questId===null?{}:{questId})})===true}catch{return false}
 };
 const bindFaction=async({ownerId,characterId}={})=>{
  if(!await allow('bind_trusted_private_faction',ownerId,characterId))
   return denied('private_faction_binding_unauthorized');
  if(typeof resolveTrustedFactionAssignment!=='function')
   return denied('trusted_faction_authority_not_installed');
  // This must independently query signed, server-owned faction-selection
  // evidence; it must not echo the request or browser activeCharacter.
  let selection;
  try{selection=await resolveTrustedFactionAssignment({ownerId,characterId})}
  catch{return denied('trusted_faction_authority_unavailable')}
  if(selection?.approved!==true||
     selection.ownerId!==ownerId||selection.characterId!==characterId||
     selection.sourceKind!=='trusted-server-faction-assignment'||
     !validFaction(selection.factionId))
   return denied('invalid_trusted_faction_assignment');
  const db=await pool.connect();let tx=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');tx=true;
   const character=await db.query(characterSQL,[ownerId,characterId]);
   if(character.rowCount!==1)throw Error('Canonical character absent');
   const current=await db.query(membershipSQL,[ownerId,characterId]);
   if(current.rowCount){
    if(current.rowCount!==1||current.rows[0].faction_id!==selection.factionId||
       current.rows[0].source_kind!=='trusted-server-faction-assignment'){
      await db.query('ROLLBACK');tx=false;
      return denied('private_faction_assignment_conflict');
    }
   }else{
    const inserted=await db.query(insertMemberSQL,
     [ownerId,characterId,selection.factionId]);
    if(inserted.rowCount!==1)throw Error('Missing private faction membership');
   }
   await db.query(insertAccountSQL,[ownerId,characterId,selection.factionId]);
   const account=await db.query(accountSQL,[ownerId,characterId,selection.factionId]);
   if(account.rowCount!==1)throw Error('Private faction account missing');
   const events=await db.query(eventsSQL,[ownerId,characterId]);
   const state=audit(selection.factionId,
    {...account.rows[0],ownerId,characterId},events.rows);
   await db.query('COMMIT');tx=false;
   return Object.freeze({...view(selection.factionId,state),
    newlyBound:current.rowCount===0});
  }catch{
   if(tx)try{await db.query('ROLLBACK')}catch{}
   return denied('private_faction_binding_transaction_failed');
  }finally{db.release()}
 };
 const creditQuest=async({ownerId,characterId,questId}={})=>{
  if(typeof questId!=='string'||!getPrivateQuestDefinition154(questId))
   return denied('invalid_private_faction_quest');
  if(!await allow('credit_verified_private_faction_quest',ownerId,characterId,questId))
   return denied('private_faction_reputation_unauthorized');
  const db=await pool.connect();let tx=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');tx=true;
   const character=await db.query(characterSQL,[ownerId,characterId]);
   if(character.rowCount!==1)throw Error('Canonical character absent');
   const membership=await db.query(membershipSQL,[ownerId,characterId]);
   if(membership.rowCount!==1||!validFaction(membership.rows[0].faction_id)||
      membership.rows[0].source_kind!=='trusted-server-faction-assignment'){
    await db.query('ROLLBACK');tx=false;
    return denied('trusted_faction_membership_missing');
   }
   const factionId=membership.rows[0].faction_id;
   const account=await db.query(accountSQL,[ownerId,characterId,factionId]);
   if(account.rowCount!==1)throw Error('Private faction account absent');
   const events=await db.query(eventsSQL,[ownerId,characterId]);
   const state=audit(factionId,
    {...account.rows[0],ownerId,characterId},events.rows);
   const source=await db.query(sourceSQL,[ownerId,characterId,questId]);
   const amount=source.rowCount===1
    ?expectedAmount(source.rows[0],ownerId,characterId,questId):null;
   if(amount===null){
    await db.query('ROLLBACK');tx=false;
    return denied('verified_faction_quest_reward_missing');
   }
   const prior=state.quests.get(questId);
   if(prior!==undefined){
    if(prior!==amount){
     await db.query('ROLLBACK');tx=false;
     return denied('conflicting_faction_reputation_replay');
    }
    await db.query('COMMIT');tx=false;
    return view(factionId,state,{questId,amount,alreadyPosted:true});
   }
   if(state.total+amount>MAX_REP||
      state.revision>=BigInt(Number.MAX_SAFE_INTEGER))throw Error('Rep limit');
   const newTotal=state.total+amount,revision=state.revision+1n;
   const insert=await db.query(journalSQL,[ownerId,characterId,factionId,questId,
    eventId(ownerId,characterId,questId),PRIVATE_QUEST_REWARD_REVISION_157,
    amount.toString(),newTotal.toString(),revision.toString()]);
   if(insert.rowCount!==1)throw Error('Private reputation event absent');
   const updated=await db.query(updateSQL,[ownerId,characterId,factionId,
    newTotal.toString(),revision.toString(),state.revision.toString()]);
   if(updated.rowCount!==1)throw Error('Private reputation CAS failed');
   await db.query('COMMIT');tx=false;
   return view(factionId,{total:newTotal,revision},{questId,amount,posted:true});
  }catch{
   if(tx)try{await db.query('ROLLBACK')}catch{}
   return denied('private_faction_reputation_transaction_failed');
  }finally{db.release()}
 };
 const readFaction=async({ownerId,characterId}={})=>{
  if(!await allow('read_trusted_private_faction',ownerId,characterId))
   return denied('private_faction_read_unauthorized');
  const db=await pool.connect();let tx=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');tx=true;
   const character=await db.query(
    'SELECT 1 FROM game3d_trusted_character WHERE owner_id=$1 AND character_id=$2',
    [ownerId,characterId]);
   if(character.rowCount!==1)throw Error('Canonical character missing');
   const membership=await db.query(membershipSQL,[ownerId,characterId]);
   if(membership.rowCount===0){
    const events=await db.query(eventsSQL,[ownerId,characterId]);
    if(events.rowCount)throw Error('Orphan private reputation events');
    await db.query('COMMIT');tx=false;
    return Object.freeze({ok:true,version:'16.3',factionId:null,
     reputation:0,rank:'outsider',membershipBound:false,
     legacyFactionImported:false,privateServerOnly:true,
     liveFactionGameplayMounted:false,productionReady:false});
   }
   if(membership.rowCount!==1||!validFaction(membership.rows[0].faction_id)||
      membership.rows[0].source_kind!=='trusted-server-faction-assignment')
    throw Error('Corrupt private faction membership');
   const factionId=membership.rows[0].faction_id;
   const account=await db.query(readAccountSQL,[ownerId,characterId,factionId]);
   const events=await db.query(eventsSQL,[ownerId,characterId]);
   if(account.rowCount!==1)throw Error('Orphan private faction account');
   const state=audit(factionId,
    {...account.rows[0],ownerId,characterId},events.rows);
   await db.query('COMMIT');tx=false;
   return Object.freeze({...view(factionId,state,{readOnly:true}),
    membershipBound:true});
  }catch{
   if(tx)try{await db.query('ROLLBACK')}catch{}
   return denied('private_faction_read_failed');
  }finally{db.release()}
 };
 return Object.freeze({version:'16.3',bindFaction,creditQuest,readFaction,
  privateServerOnly:true,publicRouteInstalled:false,
  browserFactionStoreConnected:false,
  trustedAssignmentSourceInstalled:typeof resolveTrustedFactionAssignment==='function',
  factionSwitchingEnabled:false,warRewardsEnabled:false,
  productionReady:false});
}
