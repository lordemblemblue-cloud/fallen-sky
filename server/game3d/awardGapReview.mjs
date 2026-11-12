// Combat Foundation 5.7 — read-only per-completion award gap review.
// A missing event or item remains MISSING: never auto-mint or grant XP.
import {verifyItemProvenanceChain} from './itemProvenanceReview.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const deny=reason=>({ok:false,reason,reconciled:false,
 rewardsEligible:false,rewardsIssued:false});
export function reviewCompletionAwardGaps({
 ownerId,characterId,completionId,rows
}={}){
 if(!id(ownerId)||!id(characterId)||!key(completionId)||
    !Array.isArray(rows)||rows.length<1||rows.length>33)
  return deny('invalid_completion_review');
 const base=rows[0].completion;
 if(!base||base.owner_id!==ownerId||
    base.character_id!==characterId||base.completion_id!==completionId||
    !Array.isArray(base.awards)||base.awards.length!==rows.length||
    !base.awards.length||base.awards.length>33)
  return deny('completion_source_mismatch');
 const awards=new Map();
 for(const a of base.awards){
   if(!a||!Number.isSafeInteger(a.awardIndex)||
      a.awardIndex<0||a.awardIndex>32||!key(a.definitionId)||
      awards.has(a.awardIndex))
     return deny('invalid_source_awards');
   awards.set(a.awardIndex,a.definitionId);
 }
 const seen=new Set(),decisions=[];
 for(const r of rows){
   const n=Number(r.award?.awardIndex);
   if(!Number.isSafeInteger(n)||!awards.has(n)||
      r.award?.definitionId!==awards.get(n)||seen.has(n)||
      !r.simulation||r.simulation.completion_id!==completionId)
      return deny('partial_or_conflicting_award_rows');
   seen.add(n);
   if(r.event && (r.event.owner_id!==ownerId ||
      r.event.character_id!==characterId ||
      r.event.completion_id!==completionId ||
      r.event.source_kind!==base.source_kind ||
      Number(r.event.award_index)!==n ||
      r.event.definition_id!==awards.get(n)))
     return deny('verified_event_identity_mismatch');
   // Never silently downgrade an orphan issued item into a harmless
   // "missing event" diagnosis. Source/owner contradictions are corruption.
   if(r.issued && !r.event)
     return deny('orphan_item_without_event');
   if(r.issued && (
      r.issued.owner_id!==ownerId ||
      r.issued.character_id!==characterId ||
      r.issued.source_kind!==base.source_kind ||
      r.issued.definition_id!==awards.get(n) ||
      r.issued.source_event_id!==r.event?.event_id ||
      Number(r.issued.award_index)!==n))
     return deny('issued_item_source_binding_mismatch');
   if(!r.event){
     decisions.push({awardIndex:n,status:'missing_verified_event'});
   }else if(!r.issued){
     decisions.push({awardIndex:n,status:'missing_item_issuance'});
   }else{
     const v=verifyItemProvenanceChain({
       issued:r.issued,event:r.event,
       completion:r.completion,simulation:r.simulation,
     });
     decisions.push({awardIndex:n,status:v.ok?'consistent':'review_required',
       ...(v.ok?{itemInstanceId:v.itemInstanceId}:{reason:v.code})});
   }
 }
 if(seen.size!==awards.size)return deny('missing_award_projection');
 decisions.sort((a,b)=>a.awardIndex-b.awardIndex);
 return {
   ok:true,completionId,ownerId,characterId,
   decisions,requiresManualReview:decisions.some(d=>d.status!=='consistent'),
   // A completed and consistent projection is not an authorization to pay.
   reconciled:false,autoRepairEnabled:false,
   rewardsEligible:false,rewardsIssued:false,
 };
}
export function createGame3DAwardGapReviewer({pool}={}){
 if(!pool?.connect)throw Error('5.7 requires a private PostgreSQL pool');
 const inspect=async({ownerId,characterId,completionId}={})=>{
  if(!id(ownerId)||!id(characterId)||!key(completionId))
   throw Error('Invalid owner-bound completion lookup');
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const result=await c.query(
    'SELECT row_to_json(src) AS completion, '+
    'row_to_json(sim) AS simulation, award.value AS award, '+
    'row_to_json(ev) AS event, row_to_json(it) AS issued '+
    'FROM game3d_server_completion_source src '+
    'JOIN LATERAL jsonb_array_elements(src.awards) award(value) ON true '+
    'LEFT JOIN game3d_simulation_completion_receipt sim '+
    'ON sim.completion_id=src.completion_id '+
    'LEFT JOIN game3d_verified_gameplay_event ev '+
    'ON ev.completion_id=src.completion_id AND '+
    "ev.award_index=(award.value->>'awardIndex')::integer "+
    'LEFT JOIN game3d_item_issuance it '+
    'ON it.source_event_id=ev.event_id::text AND '+
    'it.award_index=ev.award_index '+
    'WHERE src.owner_id=$1 AND src.character_id=$2 AND src.completion_id=$3 '+
    "ORDER BY (award.value->>'awardIndex')::integer LIMIT 34",
    [ownerId,characterId,completionId]);
   const output=reviewCompletionAwardGaps({
     ownerId,characterId,completionId,rows:result.rows});
   await c.query('COMMIT');
   return output;
  }catch(error){
   try{await c.query('ROLLBACK')}catch{}
   throw error;
  }finally{c.release()}
 };
 return Object.freeze({inspect});
}
