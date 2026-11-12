import test from 'node:test';import assert from 'node:assert/strict';
import {parsePrivateInventoryRevision} from '../inventorySlotRead.mjs';
test('reorder revision parser rejects lossy postgresql bigint',()=>{
 assert.equal(parsePrivateInventoryRevision('3'),3);
 assert.equal(parsePrivateInventoryRevision('9007199254740993'),null);
});
