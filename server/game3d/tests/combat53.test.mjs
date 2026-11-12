// Combat Foundation 5.3 tests prepared for isolated beta; not executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DSimulationReceiptLedger} from '../simulationReceipts.mjs';
const pool={connect:async()=>{throw Error('unexpected DB call')},
 query:async()=>({rowCount:0,rows:[]})};
test('uninstalled server attester fails closed before writing',async()=>{
 const x=createGame3DSimulationReceiptLedger({pool});
 assert.equal(x.enabled,false);
 await assert.rejects(()=>x.record({completionId:'quest-preview',
  simulationId:'world-01',simulationTick:3,ownerId:'owner1',
  characterId:'hero1',sourceKind:'quest'}),/not installed/);
});
test('cannot attest browser-derived invalid completion identity',async()=>{
 const x=createGame3DSimulationReceiptLedger({pool,
  attestWorldOutcome:async()=>{throw Error('should never be called')}});
 await assert.rejects(()=>x.record({ownerId:'__anon__',
  characterId:'hero',completionId:'quest-1',simulationId:'s',
  simulationTick:0,sourceKind:'quest'}),/Invalid server simulation context/);
});
