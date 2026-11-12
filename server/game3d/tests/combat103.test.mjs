import test from 'node:test';import assert from 'node:assert/strict';
import {verifyCommittedSimulationReceipt} from '../simulationReceipts.mjs';
test('a matching-looking receipt hash without its actual body is denied',()=>{
 assert.throws(()=>verifyCommittedSimulationReceipt({owner_id:'o1',character_id:'c1',receipt_digest:'a'.repeat(64),awards:[{awardIndex:0,definitionId:'sword'}]}));
});
