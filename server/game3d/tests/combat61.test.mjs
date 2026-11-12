// Deferred Combat 6.1 beta contract tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyServerQuestEvents} from '../serverQuestJournalRead.mjs';
test('empty trusted journal cannot complete patrol or reward',()=>{
 const r=classifyServerQuestEvents({ownerId:'o1',
  characterId:'c1',instanceId:'world1',questId:'axe_q_first_patrol',rows:[]});
 assert.equal(r.ok,true);assert.equal(r.complete,false);
 assert.equal(r.awardEligible,false);
});
test('other-account world event is rejected',()=>{
 const r=classifyServerQuestEvents({ownerId:'o1',characterId:'c1',
  instanceId:'world1',questId:'axe_q_first_patrol',
  rows:[{event_id:'e1',instance_id:'world1',
   owner_id:'stranger',character_id:'c1',
   event_type:'enemy_killed',server_tick:1,tier:'normal',
   evidence_digest:'f'.repeat(64),event_digest:'f'.repeat(64)}]});
 assert.equal(r.ok,false);
});
