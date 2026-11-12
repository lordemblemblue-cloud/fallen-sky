import test from 'node:test';import assert from 'node:assert/strict';
import {isPrivateMarketCustodyConsistent} from '../marketPreviewAudit.mjs';
test('preview listing requires a slot and no equipped item',()=>{
 assert.equal(isPrivateMarketCustodyConsistent({inventorySlot:0,equippedId:null}),true);
 assert.equal(isPrivateMarketCustodyConsistent({inventorySlot:null,equippedId:null}),false);
 assert.equal(isPrivateMarketCustodyConsistent({inventorySlot:199,equippedId:'item'}),false);
 assert.equal(isPrivateMarketCustodyConsistent({inventorySlot:200,equippedId:null}),false);
});
