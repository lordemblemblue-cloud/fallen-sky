import test from 'node:test';import assert from 'node:assert/strict';
import {projectCommittedDuelLifecycle} from '../../../base44/shared/duelJournalLifecycle.mjs';
test('null-winner knockout is an accepted nonreward draw',()=>{
 const snapshot={matchId:'d1',seq:1,status:'finished',winnerId:null,finishReason:'knockout',players:[{id:'a'},{id:'b'}]};
 const v=projectCommittedDuelLifecycle({duelId:'d1',epoch:'e',reportSequence:1,simulationSequence:1,settled:true,resultId:'result1',snapshot,participants:['a','b']});
 assert.equal(v.ok,true);assert.equal(v.draw,true);assert.equal(v.rewardsIssued,false);
});
