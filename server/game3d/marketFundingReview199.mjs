// Marketplace 19.4–19.9: authenticated, read-only AGP funding *candidate*.
// A verified gameplay receipt is NOT an AGP award authorization.
// No funding issuer, ruleset, mint ledger, wallet credit, or purchase writer.
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';
import {verifyCommittedSimulationReceipt} from './simulationReceipts.mjs';
import {validateAccountCharacterScope} from './accountScopeGuard.mjs';

const key=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const uuid=x=>typeof x==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const sourceId=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const amount=x=>{
 const s=typeof x==='string'?x:
  typeof x==='bigint'?x.toString():
  typeof x==='number'&&Number.isSafeInteger(x)?String(x):null;
 return s&&/^[1-9][0-9]*$/.test(s)&&s.length<=9&&
  BigInt(s)<=100000000n?s:null;
};
const hash=x=>createHash('sha256').update(stableJournalJSON(x)).digest('hex');
const deny=code=>({ok:false,code,version:'19.9',
 reviewOnly:true,simulationReceiptConsistent:false,
 completionSourceConsistent:false,agpRulesetVerified:false,
 earnedCurrencyVerified:false,fundsMinted:false,
 walletCredited:false,paymentAuthorized:false,
 settlementAuthorized:false,productionReady:false});
const awards=x=>{
 if(!Array.isArray(x)||x.length<1||x.length>33)return null;
 const a=x.map(i=>({awardIndex:i?.awardIndex,definitionId:i?.definitionId}));
 if(a.some(i=>!Number.isSafeInteger(i.awardIndex)||
    i.awardIndex<0||i.awardIndex>32||!sourceId(i.definitionId))||
    new Set(a.map(i=>i.awardIndex)).size!==a.length)return null;
 return a.sort((l,r)=>l.awardIndex-r.awardIndex);
};

// This verifies *continuity* of a source receipt and AGP proposal in a PG
// snapshot, not the legitimacy of a player earning the proposed AGP amount.
// The completion awards array contains ITEM awards, not AGP amounts.
export function assessGame3DFundingCandidate199({
 candidate,simulation,completion,ownerId,characterId
}={}){
 if(!key(ownerId)||!key(characterId)||!candidate||
    !uuid(String(candidate.claim_id??''))||
    !sourceId(candidate.completion_id)||
    candidate.owner_id!==ownerId||
    candidate.character_id!==characterId||
    candidate.record_kind!=='unverified_funding_candidate'||
    candidate.ruleset_verification_attached!==false||
    candidate.agp_mint_enabled!==false||
    candidate.wallet_credit_enabled!==false||
    !amount(candidate.proposed_agp)||
    !digest(candidate.expected_receipt_digest)||
    !digest(candidate.expected_completion_digest))
  return deny('invalid_funding_candidate');
 let receipt;
 try{receipt=verifyCommittedSimulationReceipt(simulation)}
 catch{return deny('invalid_simulation_receipt')}
 if(receipt.completionId!==candidate.completion_id||
    receipt.ownerId!==ownerId||receipt.characterId!==characterId||
    receipt.receiptDigest!==candidate.expected_receipt_digest)
  return deny('funding_simulation_identity_mismatch');
 const normalized=awards(completion?.awards);
 if(!normalized||!completion||
    completion.completion_id!==candidate.completion_id||
    completion.owner_id!==ownerId||
    completion.character_id!==characterId||
    completion.source_kind!==receipt.sourceKind||
    completion.receipt_digest!==receipt.receiptDigest||
    !digest(completion.source_digest)||
    stableJournalJSON(normalized)!==stableJournalJSON(receipt.awards))
  return deny('funding_completion_identity_mismatch');
 const canonical={
  ownerId,characterId,completionId:receipt.completionId,
  sourceKind:receipt.sourceKind,receiptDigest:receipt.receiptDigest,
  awards:normalized,
 };
 if(hash(canonical)!==completion.source_digest||
    candidate.expected_completion_digest!==completion.source_digest)
  return deny('funding_completion_digest_mismatch');
 return {ok:true,version:'19.9',reviewOnly:true,
  claimId:String(candidate.claim_id),
  ownerId,characterId,completionId:receipt.completionId,
  proposedAGP:amount(candidate.proposed_agp),
  simulationReceiptDigest:receipt.receiptDigest,
  completionSourceDigest:completion.source_digest,
  simulationReceiptConsistent:true,completionSourceConsistent:true,
  // SHA continuity does not establish trusted economic game rules.
  agpRulesetVerified:false,earnedCurrencyVerified:false,
  fundsMinted:false,walletCredited:false,
  paymentAuthorized:false,settlementAuthorized:false,
  productionReady:false};
}

export function createGame3DFundingCandidateReviewer199({
 pool,resolveAuthenticatedSubject
}={}){
 if(!pool?.connect||typeof resolveAuthenticatedSubject!=='function')
  throw Error('19.9 requires private PostgreSQL and trusted server sessions');
 const inspect=async({
  serverRequestContext,characterId,claimId
 }={})=>{
  if(!key(characterId)||!uuid(claimId))
   return deny('invalid_funding_review_request');
  const subject=await resolveAuthenticatedSubject(serverRequestContext);
  if(!subject||subject.authenticated!==true||
     subject.identitySource!=='trusted-server-session'||
     !key(subject.accountId))
   return deny('unauthenticated_funding_review');
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
   const owner=await c.query(
    'SELECT owner_id,character_id,revision '+
    'FROM game3d_trusted_character WHERE owner_id=$1 AND character_id=$2',
    [subject.accountId,characterId]);
   const auth=owner.rowCount===1?
    validateAccountCharacterScope({subject,characterRow:owner.rows[0]}):
    {ok:false};
   if(!auth.ok||auth.characterId!==characterId){
    await c.query('COMMIT');
    return deny('funding_character_scope_denied');
   }
   const source=await c.query(
    'SELECT row_to_json(f) AS candidate,'+
    'row_to_json(s) AS simulation,'+
    'row_to_json(c) AS completion '+
    'FROM game3d_market_agp_funding_candidate f '+
    'LEFT JOIN game3d_simulation_completion_receipt s '+
    'ON s.completion_id=f.completion_id AND s.owner_id=f.owner_id '+
    'AND s.character_id=f.character_id '+
    'LEFT JOIN game3d_server_completion_source c '+
    'ON c.completion_id=f.completion_id AND c.owner_id=f.owner_id '+
    'AND c.character_id=f.character_id '+
    'WHERE f.claim_id=$1 AND f.owner_id=$2 AND f.character_id=$3',
    [claimId,subject.accountId,characterId]);
   const verdict=source.rowCount===1?
    assessGame3DFundingCandidate199({
     ...source.rows[0],ownerId:subject.accountId,characterId,
    }):deny('funding_candidate_not_found_or_ambiguous');
   await c.query('COMMIT');
   return verdict;
  }catch(error){
   try{await c.query('ROLLBACK')}catch{}
   throw error;
  }finally{c.release()}
 };
 return Object.freeze({inspect,readOnly:true,
  fundingEnabled:false,productionReady:false});
}
