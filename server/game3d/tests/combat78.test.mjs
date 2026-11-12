// Deferred beta test.
import test from 'node:test';import assert from 'node:assert/strict';
import {verifyWorldEventOrder} from '../worldEventOrder.mjs';
test('rejects rounded, noncanonical PostgreSQL ticks',()=>{
 assert.equal(verifyWorldEventOrder([{event_id:'a',server_tick:'1'}]).ok,true);
 assert.equal(verifyWorldEventOrder([{event_id:'a',server_tick:'0001'}]).ok,false);
 assert.equal(verifyWorldEventOrder([{event_id:'a',server_tick:'9007199254740993'}]).ok,false);
});
