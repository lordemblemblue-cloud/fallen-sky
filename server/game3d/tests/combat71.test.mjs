// Combat 7.1 deferred private beta tests (not executed).
import test from 'node:test';import assert from 'node:assert/strict';
import {classifyServerQuestEvents} from '../serverQuestJournalRead.mjs';
import {inspectEncounterEliminations} from '../encounterEvidenceRead.mjs';
test('quest and encounter readers both refuse false canonical digest',()=>{
 const row={owner_id:'owner1',character_id:'hero1',
  instance_id:'world1',event_id:'kill1',event_type:'enemy_killed',
  server_tick:1,tier:'normal',location:null,
  evidence_digest:'f'.repeat(64),event_digest:'a'.repeat(64)};
 assert.equal(classifyServerQuestEvents({
  ownerId:'owner1',characterId:'hero1',instanceId:'world1',
  questId:'axe_q_first_patrol',rows:[row]}).ok,false);
 assert.equal(inspectEncounterEliminations({
  ownerId:'owner1',characterId:'hero1',instanceId:'world1',
  rows:[row]}).ok,false);
});
