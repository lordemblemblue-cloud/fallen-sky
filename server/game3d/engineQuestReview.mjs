// Combat 9.4 — owner-scoped quest review requires engine-committed outcomes.
// Client quest progress is neither fetched nor accepted as trusted evidence.
import {engineOutcomeBody,engineOutcomeDigest} from './engineOutcomeStore.mjs';
import {verifyStoredWorldEvent} from './worldEventProofRead.mjs';
import {verifyWorldEventOrder} from './worldEventOrder.mjs';
import {evaluateServerQuestObjectives} from './trustedQuestRules.mjs';

const key=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const blocked=code=>({ok:false,code,completedAuthorized:false,
 xpAuthorized:false,itemRewardsAuthorized:false});
export function evaluateEngineBackedQuest({
 ownerId,characterId,instanceId,questId,records
}={}){
 if(!who(ownerId)||!who(characterId)||!key(instanceId)||!key(questId)||
    !Array.isArray(records)||records.length>250)return blocked('invalid_quest_scope');
 const order=verifyWorldEventOrder(records.map(r=>r?.journal??{}));
 if(!order.ok)return blocked(order.code);
 const events=[],seen=new Set();
 for(const row of records){
  const j=row?.journal,o=row?.outcome;
  if(!o||!verifyStoredWorldEvent({
    row:j,ownerId,characterId,instanceId}).ok ||
    !key(j.event_id)||seen.has(j.event_id))return blocked('missing_engine_or_journal_proof');
  seen.add(j.event_id);
  let canonical;
  try{
   canonical=engineOutcomeBody({
     eventId:o.event_id,instanceId:o.instance_id,
     ownerId:o.owner_id,characterId:o.character_id,
     type:o.event_type,serverTick:Number(o.server_tick),
     tier:o.tier,location:o.location,
   },o.evidence_digest);
  }catch{return blocked('corrupt_engine_outcome')}
  if(engineOutcomeDigest(canonical)!==o.outcome_digest||
     canonical.eventId!==j.event_id||
     canonical.instanceId!==instanceId||
     canonical.ownerId!==ownerId||
     canonical.characterId!==characterId||
     canonical.type!==j.event_type||
     canonical.serverTick!==Number(j.server_tick)||
     canonical.tier!==(j.tier??null)||
     canonical.location!==(j.location??null)||
     canonical.evidenceDigest!==j.evidence_digest)
   return blocked('engine_journal_mismatch');
  if(canonical.type!=='craft_completed')
   events.push({eventId:canonical.eventId,type:canonical.type,
    tier:canonical.tier,location:canonical.location,
    serverTick:canonical.serverTick});
 }
 const review=evaluateServerQuestObjectives({questId,events,
  priorCompleted:[]});
 if(!review.ok)return blocked(review.code);
 return {ok:true,ownerId,characterId,questId,instanceId,
  objectiveComplete:review.complete===true,
  verifiedAgainstCommittedEngineRows:true,
  // The originating writer needs an actual live engine attester.
  realSimulationDeploymentVerified:false,
  completedAuthorized:false,xpAuthorized:false,itemRewardsAuthorized:false};
}
export function createGame3DEngineQuestReview({pool}={}){
 if(!pool?.connect)throw Error('9.4 requires private PG');
 const inspect=async({ownerId,characterId,instanceId,questId}={})=>{
  if(!who(ownerId)||!who(characterId)||!key(instanceId)||!key(questId))
   throw Error('Invalid quest owner and world scope');
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const r=await c.query(
    'SELECT row_to_json(j) AS journal,row_to_json(o) AS outcome '+
    'FROM game3d_world_event_journal j LEFT JOIN game3d_engine_outcome o '+
    'ON o.event_id=j.event_id AND o.owner_id=j.owner_id '+
    'AND o.character_id=j.character_id AND o.instance_id=j.instance_id '+
    'WHERE j.owner_id=$1 AND j.character_id=$2 AND j.instance_id=$3 '+
    'ORDER BY j.server_tick,j.event_id LIMIT 251',
    [ownerId,characterId,instanceId]);
   const verdict=evaluateEngineBackedQuest({
    ownerId,characterId,instanceId,questId,records:r.rows});
   await c.query('COMMIT');
   return verdict;
  }catch(error){try{await c.query('ROLLBACK')}catch{}throw error}
  finally{c.release()}
 };
 return Object.freeze({inspect});
}
