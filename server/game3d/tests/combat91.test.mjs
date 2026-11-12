// Prepared for private beta; NOT executed in this phase.
import test from 'node:test';import assert from 'node:assert/strict';
import {engineOutcomeBody,createGame3DEngineOutcomeStore}
 from '../engineOutcomeStore.mjs';
const raw={eventId:'event1',instanceId:'instance1',ownerId:'owner1',
 characterId:'hero1',type:'enemy_killed',serverTick:1,tier:'normal',location:null};
test('rejects invalid or browser-like outcomes',()=>{
 assert.equal(engineOutcomeBody(raw,'a'.repeat(64)).eventId,'event1');
 assert.throws(()=>engineOutcomeBody({...raw,ownerId:'__anon__'},'a'.repeat(64)));
 assert.throws(()=>engineOutcomeBody({...raw,type:'craft_completed'},'a'.repeat(64)));
});
test('without trusted game attester no PG connection is opened',async()=>{
 const store=createGame3DEngineOutcomeStore({pool:{connect:async()=>{throw Error('unexpected')},query:async()=>{}}});
 await assert.rejects(()=>store.commit(raw),/not installed/);
});
