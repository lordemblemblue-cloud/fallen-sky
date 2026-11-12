import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DAtomicLoadoutReviewer} from '../atomicLoadoutReview.mjs';
test('invalid account scope never opens a database transaction',async()=>{
 const v=createGame3DAtomicLoadoutReviewer({
  pool:{connect:async()=>{throw Error('PG should not be opened')}}});
 const result=await v.inspect({ownerId:'__anon__',characterId:'c'});
 assert.equal(result.ok,false);
 assert.equal(result.sourceSnapshotsAtomic,false);
});
