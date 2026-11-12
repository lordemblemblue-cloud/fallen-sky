// Combat 6.4 deferred beta-only encounter review cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectEncounterEliminations} from '../encounterEvidenceRead.mjs';
test('empty journal produces no invented kills or drops',()=>{
 const x=inspectEncounterEliminations({ownerId:'o1',characterId:'c1',
  instanceId:'instance1',rows:[],requiredTier:'elite'});
 assert.equal(x.ok,true);assert.equal(x.killCount,0);
 assert.equal(x.itemDropAuthorized,false);
});
test('foreign encounter identity is denied',()=>{
 const x=inspectEncounterEliminations({ownerId:'o1',characterId:'c1',
  instanceId:'instance1',rows:[{event_id:'kill1',instance_id:'i2',
  owner_id:'o1',character_id:'c1',event_type:'enemy_killed',
  server_tick:3,tier:'elite',evidence_digest:'a'.repeat(64),
  event_digest:'b'.repeat(64)}]});
 assert.equal(x.ok,false);
});
