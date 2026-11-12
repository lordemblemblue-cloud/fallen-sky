import test from 'node:test';import assert from 'node:assert/strict';
import {parsePrivateInventoryRevision,projectGame3DInventorySlots} from '../inventorySlotRead.mjs';
test('inventory revisions cannot round or accept leading zeros',()=>{
 assert.equal(parsePrivateInventoryRevision('0'),0);
 assert.equal(parsePrivateInventoryRevision('42'),42);
 for(const v of ['0001','01','-1','1.0','9007199254740993',NaN,Infinity])
  assert.equal(parsePrivateInventoryRevision(v),null);
 assert.equal(projectGame3DInventorySlots({ownerId:'o1',characterId:'c1',
  rows:[],revision:'9007199254740993'}).ok,false);
});
