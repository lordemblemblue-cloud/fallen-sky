// Combat 8.2 — deterministic, read-only quest candidate reconciliation.
// This comparison is NOT a world simulation attestation.
export function reconcileQuestCandidateToJournal({candidate,journal}={}){
 const denied=code=>({ok:false,code,prerequisiteAuthorized:false,
  rewardsEligible:false,rewardsIssued:false});
 if(candidate?.ok!==true||journal?.ok!==true)
  return denied('missing_candidate_or_journal');
 if(candidate.ownerId!==journal.ownerId||
    candidate.characterId!==journal.characterId||
    candidate.instanceId!==journal.instanceId||
    candidate.questId!==journal.questId)
  return denied('cross_character_or_quest');
 if(candidate.journalDigest!==journal.journalDigest)
  return denied('stale_journal_evidence');
 if(candidate.policyVersion!==journal.policyVersion||
    journal.complete!==true)
  return denied('policy_or_objective_mismatch');
 return {ok:true,ownerId:candidate.ownerId,
  characterId:candidate.characterId,
  questId:candidate.questId,instanceId:candidate.instanceId,
  journalDigest:candidate.journalDigest,
  objectiveCandidateConsistent:true,
  simulationAuthenticityVerified:false,
  prerequisiteAuthorized:false,rewardsEligible:false,
  rewardsIssued:false};
}
