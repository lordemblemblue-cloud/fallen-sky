// 7.0 deferred beta tests (NOT RUN).
import test from 'node:test';import assert from 'node:assert/strict';
import {verifyStoredWorldEvent} from '../worldEventProofRead.mjs';
test('cross-player world events never validate',()=>{
 const x=verifyStoredWorldEvent({ownerId:'o1',characterId:'c1',
  instanceId:'world1',row:{owner_id:'stranger',
   character_id:'c1',instance_id:'world1',event_id:'e1',
   evidence_digest:'f'.repeat(64),event_digest:'a'.repeat(64)}});
 assert.equal(x.ok,false);assert.equal(x.trusted,false);
});
