// 7.4 deferred beta regression; DO NOT RUN until beta.
import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DQuestJournalRead}
 from '../serverQuestJournalRead.mjs';
import {inspectEncounterEliminations}
 from '../encounterEvidenceRead.mjs';
test('caller cannot manufacture completed prerequisite quest',async()=>{
 const reader=createGame3DQuestJournalRead({pool:{
  connect:async()=>({query:async()=>({rows:[]}),release:()=>{}})}});
 const x=await reader.inspect({ownerId:'owner1',characterId:'hero1',
  instanceId:'world1',questId:'axe_q_first_elite',
  priorCompleted:['axe_q_first_patrol']});
 assert.equal(x.ok,false);
 assert.equal(x.awardEligible,false);
});
test('local placeholder characters cannot receive empty encounter evidence',()=>{
 const x=inspectEncounterEliminations({ownerId:'owner1',
  characterId:'__anon__',instanceId:'world1',rows:[]});
 assert.equal(x.ok,false);
});
