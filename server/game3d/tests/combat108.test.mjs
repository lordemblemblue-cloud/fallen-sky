import test from 'node:test';import assert from 'node:assert/strict';
import {inspectMasteredCharge} from '../combatMasteryRules.mjs';
test('triple only charges on rank 10 after 1000 server ms',()=>{
 assert.equal(inspectMasteredCharge({skillId:'triple_hit',rank:10,holdMs:999}).chargeReady,false);
 assert.equal(inspectMasteredCharge({skillId:'triple_hit',rank:10,holdMs:1000}).chargeReady,true);
 assert.equal(inspectMasteredCharge({skillId:'single_hit',rank:10,holdMs:3000}).chargeReady,false);
});
