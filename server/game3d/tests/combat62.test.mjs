// Combat 6.2 deferred beta test source.
import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyWorldEventOrder} from '../worldEventOrder.mjs';
test('strict sequence sorts by tick then event key',()=>{
 assert.equal(verifyWorldEventOrder([
  {server_tick:1,event_id:'e1'},{server_tick:1,event_id:'e2'},
  {server_tick:2,event_id:'e1-other'}
 ]).ok,true);
 assert.equal(verifyWorldEventOrder([
  {server_tick:2,event_id:'e1'},{server_tick:1,event_id:'e2'}
 ]).ok,false);
 assert.equal(verifyWorldEventOrder([
  {server_tick:1,event_id:'e1'},{server_tick:2,event_id:'e1'}
 ]).ok,false);
});
