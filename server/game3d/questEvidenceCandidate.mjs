// Combat 6.3 — server quest candidate, never a reward authorization.
// A candidate is a digest of private journal review plus an allowlisted rule.
// It cannot mint a completion token or upgrade a browser quest record.
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';
import {TRUSTED_QUEST_POLICY_VERSION,trustedQuestDefinition}
  from './trustedQuestRules.mjs';
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const str=x=>typeof x==='string'&&x.length>0&&x.length<=160;
const hash=x=>createHash('sha256').update(stableJournalJSON(x)).digest('hex');
export function createQuestEvidenceCandidate({journalReview,questId,
 epoch,expectedJournalDigest}={}){
 if(!str(epoch)||!str(questId)||!trustedQuestDefinition(questId)||
    !sha(expectedJournalDigest)||!journalReview?.ok||
    journalReview.questId!==questId||
    journalReview.policyVersion!==TRUSTED_QUEST_POLICY_VERSION||
    journalReview.journalDigest!==expectedJournalDigest||
    !str(journalReview.ownerId)||!str(journalReview.characterId)||
    !str(journalReview.instanceId))
  return {ok:false,code:'untrusted_or_stale_quest_journal',
   rewardEligible:false,rewardsIssued:false};
 const statement={
  version:1,epoch,questId,ownerId:journalReview.ownerId,
  characterId:journalReview.characterId,instanceId:journalReview.instanceId,
  policyVersion:journalReview.policyVersion,
  journalDigest:journalReview.journalDigest,
  counters:journalReview.counters,
  objectiveComplete:journalReview.complete===true,
 };
 return {
  ok:true,candidate:statement,candidateDigest:hash(statement),
  // Even complete progress is NOT a trusted earned quest claim.
  simulationAuthenticityVerified:false,
  rewardEligible:false,itemGrantAuthorized:false,
  xpGrantAuthorized:false,rewardsIssued:false,
 };
}
