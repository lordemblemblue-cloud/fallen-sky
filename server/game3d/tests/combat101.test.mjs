// Combat 10.1 source regression tests for isolated beta; not run.
import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateEngineBackedQuest} from '../engineQuestReview.mjs';
test('oversized/unsorted engine backed quest window fails closed',()=>{
 const x=evaluateEngineBackedQuest({ownerId:'o1',characterId:'c1',instanceId:'world1',questId:'axe_q_first_patrol',records:[{journal:{server_tick:2,event_id:'b'},outcome:{}},{journal:{server_tick:1,event_id:'a'},outcome:{}}]});
 assert.equal(x.ok,false);assert.equal(x.completedAuthorized,false);
});
