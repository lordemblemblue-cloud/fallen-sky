// Combat 7.6 deferred beta source tests.
import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeWorldEventContext} from '../worldEventJournal.mjs';
test('world event nullability is canonical even if optional input absent',()=>{
 const x=normalizeWorldEventContext({eventId:'e',instanceId:'m',ownerId:'o',characterId:'c',type:'craft_completed',serverTick:1});
 assert.equal(x.tier,null);assert.equal(x.location,null);
});
