// Deferred private beta test.
import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateEngineBackedQuest} from '../engineQuestReview.mjs';
test('missing original engine rows cannot advance a quest',()=>{
 const x=evaluateEngineBackedQuest({
  ownerId:'owner1',characterId:'hero1',instanceId:'map1',
  questId:'axe_q_first_patrol',
  records:[{journal:{event_id:'kill1'},outcome:null}]});
 assert.equal(x.ok,false);assert.equal(x.completedAuthorized,false);
});
test('empty valid journal does not invent quest completion',()=>{
 const x=evaluateEngineBackedQuest({
  ownerId:'owner1',characterId:'hero1',instanceId:'map1',
  questId:'axe_q_first_patrol',records:[]});
 assert.equal(x.ok,true);assert.equal(x.objectiveComplete,false);
});
