// Deferred private beta contract.
import test from 'node:test';import assert from 'node:assert/strict';
import {createQuestEvidenceReader} from '../questEvidenceReader.mjs';
test('anonymous owner cannot query candidate ledger',async()=>{
 const reader=createQuestEvidenceReader({pool:{connect:()=>{throw Error('unexpected')}}});
 await assert.rejects(()=>reader.inspect({ownerId:'__anon__',characterId:'hero',questId:'q',instanceId:'w'}),/Invalid quest evidence/);
});
