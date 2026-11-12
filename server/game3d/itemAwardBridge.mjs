// Combat 10.2 — item authorization and item mint share ONE transaction.
// Backend-only: no HTTP grant path, no client-provided owner/definition.
import {createGame3DSimulationReceiptLedger,verifyCommittedSimulationReceipt} from './simulationReceipts.mjs';
import {createGame3DCompletionSource} from './serverCompletionSource.mjs';
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
export function createGame3DItemAwardBridge({
 pool,attestWorldOutcome,authorizeItemAward
}={}){
 if(!pool?.connect||!pool?.query)throw Error('9.6 requires private PG');
 const available=typeof attestWorldOutcome==='function'&&
  typeof authorizeItemAward==='function';
 const simulator=createGame3DSimulationReceiptLedger({pool,attestWorldOutcome});
 const source=createGame3DCompletionSource({
  pool,confirmSimulation:simulator.confirmSimulation,
  authorizeIssuance:async({client,claim,sourceDigest})=>{
   if(!available)return false;
   // The source event is immutable and the 5.0 issuer already verifies it.
   // Resolve completion and server-defined award under the SAME transaction.
   const records=await client.query(
    'SELECT s.*,e.event_id AS verified_event_id '+
    'FROM game3d_verified_gameplay_event e '+
    'JOIN game3d_simulation_completion_receipt s '+
    'ON s.completion_id=e.completion_id '+
    'WHERE e.event_id=$1 AND e.owner_id=$2 AND e.character_id=$3 '+
    'AND e.source_kind=$4 AND e.definition_id=$5 AND e.award_index=$6 FOR SHARE',
    [claim.sourceEventId,claim.ownerId,claim.characterId,
     claim.sourceKind,claim.definitionId,claim.awardIndex]);
   if(records.rowCount!==1)return false;
   const completion=records.rows[0];
   verifyCommittedSimulationReceipt(completion);
   if(completion.owner_id!==claim.ownerId||
      completion.character_id!==claim.characterId||
      completion.source_kind!==claim.sourceKind||
      !Array.isArray(completion.awards))return false;
   const item=completion.awards.find(a=>
     a.awardIndex===claim.awardIndex&&
     a.definitionId===claim.definitionId);
   if(!item)return false;
   // Only server rules can authorize, NEVER a browser "verified" Boolean.
   return await authorizeItemAward({
    client,completion,item,awardIndex:claim.awardIndex,
    sourceDigest,claim})===true;
  },
 });
 const issue=async({completionId,awardIndex}={})=>{
  if(!valid(completionId)||!Number.isSafeInteger(awardIndex)||
     awardIndex<0||awardIndex>32)
   throw Error('Invalid server item award slot');
  if(!available)throw Error('Trusted engine item-award authorization unavailable');
  const result=await source.issueCommittedAward({completionId,awardIndex});
  return {...result,completionId,awardIndex,
   playerInventoryProjected:false,marketTransferAllowed:false,
   competitiveRewardEligible:false};
 };
 return Object.freeze({available,issue});
}
