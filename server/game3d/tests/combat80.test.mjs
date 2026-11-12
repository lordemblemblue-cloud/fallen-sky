import test from 'node:test';import assert from 'node:assert/strict';
import {checkQuestCompletionEvidence} from '../questCompletionEvidence.mjs';
test('unattested quest candidate never unlocks prerequisites',()=>{
 const row={owner_id:'o1',character_id:'c1',quest_id:'q1',instance_id:'world1',
 journal_digest:'a'.repeat(64),objective_digest:'b'.repeat(64),
 quest_policy_version:'v1',source_authenticity:'pending_simulation_attestation'};
 const x=checkQuestCompletionEvidence({row,ownerId:'o1',characterId:'c1',questId:'q1',instanceId:'world1'});
 assert.equal(x.ok,true);assert.equal(x.prerequisiteAuthorized,false);
});
