// 6.3 source-only beta contracts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuestEvidenceCandidate} from '../questEvidenceCandidate.mjs';
import {TRUSTED_QUEST_POLICY_VERSION} from '../trustedQuestRules.mjs';
test('journal cursor and epoch must match; rewards always blocked',()=>{
 const j={ok:true,questId:'axe_q_first_patrol',
  ownerId:'o1',characterId:'c1',instanceId:'world1',
  policyVersion:TRUSTED_QUEST_POLICY_VERSION,
  journalDigest:'e'.repeat(64),counters:{patrol_kills:3},complete:true};
 const args={journalReview:j,questId:j.questId,epoch:'epoch1',
  expectedJournalDigest:j.journalDigest};
 const result=createQuestEvidenceCandidate(args);
 assert.equal(result.ok,true);
 assert.equal(result.candidate.objectiveComplete,true);
 assert.equal(result.rewardEligible,false);
 assert.equal(result.rewardsIssued,false);
 assert.equal(createQuestEvidenceCandidate({...args,
  expectedJournalDigest:'0'.repeat(64)}).ok,false);
});
