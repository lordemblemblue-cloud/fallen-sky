// Deferred private beta source tests.
import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DItemAwardBridge} from '../itemAwardBridge.mjs';
test('missing gameplay rules do not issue item UUIDs',async()=>{
 const service=createGame3DItemAwardBridge({pool:{
  connect:async()=>{throw Error('unexpected PG')},query:async()=>{}}});
 assert.equal(service.available,false);
 await assert.rejects(()=>service.issue({
  completionId:'quest1',awardIndex:0}),/unavailable/);
 await assert.rejects(()=>service.issue({
  completionId:'quest1',awardIndex:-1}),/Invalid server item award/);
});
