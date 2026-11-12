// Source-only beta regression: duel queue fairness.
import test from 'node:test';import assert from 'node:assert/strict';
import {MATCH_RULES} from '../authority.mjs';
test('single participant cannot occupy the complete duel command queue',()=>{
 assert.equal(MATCH_RULES.maxQueue/MATCH_RULES.maxPlayers,24);
});
