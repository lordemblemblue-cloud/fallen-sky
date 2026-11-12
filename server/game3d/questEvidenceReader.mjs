// Combat 8.1 — exact owner-bound, read-only candidate evidence query.
// Rows from migration 014 never authorize a quest prerequisite or reward.
import {checkQuestCompletionEvidence} from './questCompletionEvidence.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
export function createQuestEvidenceReader({pool}={}){
 if(!pool?.connect)throw Error('8.1 requires private PG reader');
 const inspect=async({ownerId,characterId,questId,instanceId}={})=>{
  if(!who(ownerId)||!who(characterId)||!id(questId)||!id(instanceId))
   throw Error('Invalid quest evidence read identity');
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const r=await c.query(
    'SELECT * FROM game3d_quest_completion_evidence '+
    'WHERE owner_id=$1 AND character_id=$2 '+
    'AND quest_id=$3 AND instance_id=$4',
    [ownerId,characterId,questId,instanceId]);
   const result=r.rowCount===1
    ?checkQuestCompletionEvidence({row:r.rows[0],ownerId,characterId,questId,instanceId})
    :{ok:false,code:'no_committed_quest_candidate',completedQuestAuthorized:false};
   await c.query('COMMIT');
   return result;
  }catch(e){try{await c.query('ROLLBACK')}catch{}throw e}
  finally{c.release()}
 };
 return Object.freeze({inspect});
}
