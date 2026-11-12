// 6.0 tests are deferred until isolated private beta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DWorldEventJournal} from '../worldEventJournal.mjs';
const pool={connect:async()=>{throw Error('should not connect')}};
test('untrusted browser events are not journaled',async()=>{
 const x=createGame3DWorldEventJournal({pool});
 assert.equal(x.enabled,false);
 await assert.rejects(()=>x.append({
  eventId:'evt1',instanceId:'w1',ownerId:'o1',characterId:'c1',
  type:'enemy_killed',serverTick:4,tier:'normal',location:null,
 }),/attester missing/);
 await assert.rejects(()=>x.append({
  eventId:'evt1',instanceId:'w1',ownerId:'__anon__',
  characterId:'c1',type:'enemy_killed',serverTick:4,tier:'normal',
 }),/Invalid world event/);
});
