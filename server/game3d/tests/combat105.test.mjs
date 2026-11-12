import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DProgressionSnapshotReader} from '../progressionSnapshotRead.mjs';
test('unknown character ID cannot query progression DB',async()=>{
 const x=createGame3DProgressionSnapshotReader({pool:{connect:async()=>{throw Error('should not connect')}}});
 await assert.rejects(()=>x.inspect({ownerId:'__anon__',characterId:'hero'}),/Invalid progression owner/);
});
