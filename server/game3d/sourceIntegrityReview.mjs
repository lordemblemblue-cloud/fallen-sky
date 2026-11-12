// Combat Foundation 6.7 — internal provenance risk summary.
// This only classifies offline evidence; it never resolves player identity
// or issues rewards. Pure to avoid accidental database write behavior.
const KINDS=['questCandidate','encounterEvidence','craftEvidence',
 'equipmentSnapshot','itemProvenanceAudit'];
const blocked=(code)=>({ok:false,code,readOnly:true,
 releaseEligible:false,autoGrantAllowed:false,rewardsIssued:false});
export function buildGame3DSourceIntegrityOverview(evidence={}){
 if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))
  return blocked('invalid_source_overview');
 const findings=[];
 for(const kind of KINDS){
  const value=evidence[kind];
  if(value===undefined||value===null){
   findings.push({kind,status:'not_supplied'});continue;
  }
  if(typeof value!=='object'||Array.isArray(value)||
     value.rewardsIssued===true||value.rewardEligible===true||
     value.rewardsEligible===true||value.itemGrantAuthorized===true||
     value.craftAuthorized===true||value.loadoutEligible===true)
   return blocked('unsupported_reward_authority_claim');
  findings.push({kind,status:value.ok===true?
    'read_only_consistency_report':'requires_review',
    ...(value.ok===false?{reason:String(value.code||value.reason||
      'unverified_source').slice(0,160)}:{})});
 }
 return {
  ok:true,findings,
  missingSources:findings.filter(f=>f.status==='not_supplied')
    .map(f=>f.kind),
  requiresReview:findings.some(f=>f.status!=='read_only_consistency_report'),
  sourceAuthenticityVerified:false,readOnly:true,
  releaseEligible:false,autoGrantAllowed:false,
  combatStatsTrusted:false,rewardsIssued:false,
 };
}
