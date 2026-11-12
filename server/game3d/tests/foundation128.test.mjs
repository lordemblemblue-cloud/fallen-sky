import test from 'node:test';import assert from 'node:assert/strict';
import {projectGame3DInventorySlots} from '../inventorySlotRead.mjs';
test('inventory count is derived from 0 to 199 server slots',()=>{const x=projectGame3DInventorySlots({ownerId:'o',characterId:'c',revision:0,rows:[]});assert.equal(x.ok,true);assert.equal(x.capacity,200);assert.equal(x.count,0)});
