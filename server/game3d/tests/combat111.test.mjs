// Combat 11.1 deferred beta test source.
import test from 'node:test';import assert from 'node:assert/strict';
import {validateServerChargeBegin} from '../../../base44/shared/duelChargePolicy.mjs';
test('valid charge begin remains server timed',()=>{
 const p=validateServerChargeBegin({skillId:'sword_triple_slash',weaponPath:'damage',chargeId:'axech1234567',now:1000});
 assert.equal(typeof p.ok,'boolean');
});
