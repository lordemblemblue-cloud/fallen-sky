import test from 'node:test';import assert from 'node:assert/strict';
import {deriveCharacterLevel} from '../progressionLevelPolicy.mjs';
test('server XP level boundary uses integer-safe totals',()=>{
 assert.equal(deriveCharacterLevel('0').level,1);
 assert.equal(deriveCharacterLevel('100').level,2);
 assert.throws(()=>deriveCharacterLevel(100));
 assert.throws(()=>deriveCharacterLevel('-1'));
});
