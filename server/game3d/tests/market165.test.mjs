import test from 'node:test';import assert from 'node:assert/strict';
import {isPrivateMarketCustodyConsistent} from '../marketPreviewAudit.mjs';
test('empty, padding, negative or nonexistent inventory slot is not custody',()=>{
 for(const slot of [null,undefined,'','00','-1',-1,200,1.1])
  assert.equal(isPrivateMarketCustodyConsistent({inventorySlot:slot}),false);
 assert.equal(isPrivateMarketCustodyConsistent({inventorySlot:0,equippedId:null}),true);
 assert.equal(isPrivateMarketCustodyConsistent({inventorySlot:199,equippedId:'item'}),false);
});
