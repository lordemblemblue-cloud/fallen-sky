import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileQuestCandidateToJournal} from '../questEvidenceReconciliation.mjs';
test('matching quest hashes do not unlock progression',()=>{
 const c={ok:true,ownerId:'o',characterId:'c',questId:'q',instanceId:'w',journalDigest:'a',policyVersion:'v'};
 const j={...c,complete:true};const x=reconcileQuestCandidateToJournal({candidate:c,journal:j});
 assert.equal(x.ok,true);assert.equal(x.prerequisiteAuthorized,false);
 assert.equal(reconcileQuestCandidateToJournal({candidate:c,journal:{...j,journalDigest:'b'}}).ok,false);
});
