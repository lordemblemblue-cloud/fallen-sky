// Deferred beta integration tests.
import test from 'node:test';import assert from 'node:assert/strict';
import {createEngineOutcomeJournalBridge} from '../engineOutcomeJournalBridge.mjs';
test('unknown committed outcome cannot become a journal event',async()=>{
 const bridge=createEngineOutcomeJournalBridge({pool:{
  connect:async()=>{},query:async()=>{}}});
 await assert.rejects(()=>bridge.verifyWorldEvent({
  client:{query:async()=>({rowCount:0,rows:[]})},
  context:{eventId:'unknown-event'}}),/No committed engine outcome/);
});
