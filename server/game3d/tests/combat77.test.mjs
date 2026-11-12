// Source tests reserved for private beta.
import test from 'node:test';import assert from 'node:assert/strict';
import {verifyStoredWorldEvent} from '../worldEventProofRead.mjs';
test('kill event cannot be verified as a discovery record',()=>{
 const row={event_id:'evt1',instance_id:'world1',owner_id:'owner1',character_id:'hero1',event_type:'enemy_killed',server_tick:1,tier:null,location:'x',evidence_digest:'a'.repeat(64),event_digest:'b'.repeat(64)};
 assert.equal(verifyStoredWorldEvent({row,ownerId:'owner1',characterId:'hero1',instanceId:'world1'}).ok,false);
});
