// Combat Foundation 5.4 — READ ONLY, server-internal provenance review.
// This is NOT an award, account credit or ranked eligibility authorization.
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';

const hash=x=>createHash('sha256').update(stableJournalJSON(x)).digest('hex');
const uid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
  x!=='__anon__'&&x!=='__default__';
const itemId=x=>typeof x==='string'&&/^[0-9a-f-]{36}$/i.test(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const id=x=>typeof x==='string'&&x.length>0&&x.length<=160;
const fail=(code)=>({ok:false,code,
  statsVerified:false,gearEffectsEnabled:false,rewardsEligible:false,
  rewardsIssued:false});
const normalizeAwards=awards=>{
  if(!Array.isArray(awards)||awards.length<1||awards.length>33)throw Error('Missing server awards');
  const result=awards.map(a=>({
    awardIndex:Number(a.awardIndex),definitionId:a.definitionId,
  })).sort((a,b)=>a.awardIndex-b.awardIndex);
  if(result.some(a=>!Number.isSafeInteger(a.awardIndex)||a.awardIndex<0||
     a.awardIndex>32||!id(a.definitionId))||
     new Set(result.map(a=>a.awardIndex)).size!==result.length)
    throw Error('Malformed award evidence');
  return result;
};
// A single consistency check replays all four canonical source digests.
// Database role access remains privileged; hash agreement does NOT prove the
// game server authentically earned the loot unless it originated in a trusted
// simulation writer, which is still a future integration.
export function verifyItemProvenanceChain({issued:i,event:e,completion:c,simulation:s}={}) {
  if(!i||!e||!c||!s)return fail('incomplete_provenance');
  try{
    if(!uid(i.owner_id)||!uid(i.character_id)||
       !itemId(String(i.item_instance_id))||!id(i.definition_id)||
       !id(i.source_event_id)||!id(i.source_kind)||
       !Number.isSafeInteger(Number(i.award_index))||
       ![i.source_digest,i.claim_digest,e.event_digest,e.proof_digest,
         c.source_digest,c.receipt_digest,s.receipt_digest,s.evidence_digest].every(sha))
      return fail('invalid_evidence_identity');
    const awardIndex=Number(i.award_index);
    const eventAward=Number(e.award_index);
    if(eventAward!==awardIndex||e.event_id!==i.source_event_id||
       e.owner_id!==i.owner_id||e.character_id!==i.character_id||
       e.definition_id!==i.definition_id||e.source_kind!==i.source_kind||
       e.completion_id!==c.completion_id||
       c.completion_id!==s.completion_id||
       [c.owner_id,s.owner_id].some(v=>v!==i.owner_id)||
       [c.character_id,s.character_id].some(v=>v!==i.character_id)||
       [c.source_kind,s.source_kind].some(v=>v!==i.source_kind))
      return fail('cross_source_identity_mismatch');
    const awards=normalizeAwards(c.awards);
    const simulationAwards=normalizeAwards(s.awards);
    if(stableJournalJSON(awards)!==stableJournalJSON(simulationAwards)||
       !awards.some(a=>a.awardIndex===awardIndex&&
         a.definitionId===i.definition_id))
      return fail('award_definition_mismatch');
    const simulationHash=hash({
      completionId:s.completion_id,simulationId:s.simulation_id,
      simulationTick:Number(s.simulation_tick),ownerId:s.owner_id,
      characterId:s.character_id,sourceKind:s.source_kind,
      awards:simulationAwards,evidenceDigest:s.evidence_digest,
    });
    if(simulationHash!==s.receipt_digest||
       c.receipt_digest!==s.receipt_digest)
      return fail('simulation_receipt_digest_mismatch');
    const completionHash=hash({
      ownerId:c.owner_id,characterId:c.character_id,
      completionId:c.completion_id,sourceKind:c.source_kind,
      receiptDigest:c.receipt_digest,awards,
    });
    if(completionHash!==c.source_digest||e.proof_digest!==c.source_digest)
      return fail('completion_digest_mismatch');
    const eventHash=hash({
      ownerId:e.owner_id,characterId:e.character_id,
      completionId:e.completion_id,sourceKind:e.source_kind,
      definitionId:e.definition_id,awardIndex:eventAward,
      proofDigest:e.proof_digest,
    });
    if(eventHash!==e.event_digest||i.source_digest!==e.event_digest)
      return fail('event_digest_mismatch');
    const issuanceHash=hash({
      ownerId:i.owner_id,characterId:i.character_id,
      sourceEventId:i.source_event_id,definitionId:i.definition_id,
      sourceKind:i.source_kind,awardIndex,sourceDigest:i.source_digest,
    });
    if(issuanceHash!==i.claim_digest)return fail('issuance_digest_mismatch');
    return {
      ok:true,source:'postgres-issuance-provenance',
      ownerId:i.owner_id,characterId:i.character_id,
      itemInstanceId:String(i.item_instance_id),
      definitionId:i.definition_id,sourceKind:i.source_kind,
      completionId:c.completion_id,
      sourceDigest:i.source_digest,
      simulationReceiptDigest:s.receipt_digest,
      provenanceConsistencyVerified:true,
      simulationAuthenticityVerified:false,
      statsVerified:false,gearEffectsEnabled:false,
      rewardsEligible:false,rewardsIssued:false,
    };
  }catch{return fail('unreadable_evidence');}
}

export function createGame3DProvenanceReviewer({pool}={}){
  if(!pool?.connect)throw Error('Provenance review needs a private PostgreSQL pool');
  const readIssuedItem=async({ownerId,characterId,itemInstanceId}={})=>{
    if(!uid(ownerId)||!uid(characterId)||!itemId(itemInstanceId))
      throw Error('Invalid provenance review identity');
    const client=await pool.connect();
    try{
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      // Every join is owner/character scoped; never expose a global item
      // lookup to the browser. Returns a flat consistency classification only.
      const result=await client.query(
        'SELECT row_to_json(i) AS issued, row_to_json(e) AS event, '+
        'row_to_json(c) AS completion, row_to_json(s) AS simulation '+
        'FROM game3d_item_issuance i '+
        'LEFT JOIN game3d_verified_gameplay_event e '+
        'ON e.event_id::text=i.source_event_id '+
        'LEFT JOIN game3d_server_completion_source c '+
        'ON c.completion_id=e.completion_id '+
        'LEFT JOIN game3d_simulation_completion_receipt s '+
        'ON s.completion_id=c.completion_id '+
        'WHERE i.item_instance_id=$1 AND i.owner_id=$2 AND i.character_id=$3',
        [itemInstanceId,ownerId,characterId]);
      const verdict=result.rowCount===1
        ?verifyItemProvenanceChain(result.rows[0])
        :fail('item_not_found_for_character');
      await client.query('COMMIT');
      return verdict;
    }catch(error){
      try{await client.query('ROLLBACK')}catch{}
      throw error;
    }finally{client.release()}
  };
  return Object.freeze({readIssuedItem});
}
