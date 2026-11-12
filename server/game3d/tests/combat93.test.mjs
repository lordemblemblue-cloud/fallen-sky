// Source-only beta test.
import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DEngineEventPipeline} from '../engineEventPipeline.mjs';
test('no real engine attester means pipeline cannot post events',async()=>{
 const pipeline=createGame3DEngineEventPipeline({pool:{
  connect:async()=>{throw Error('should not connect')},query:async()=>{}}});
 assert.equal(pipeline.enabled,false);
 await assert.rejects(()=>pipeline.commitAndJournal({}),/attester is required/);
});
