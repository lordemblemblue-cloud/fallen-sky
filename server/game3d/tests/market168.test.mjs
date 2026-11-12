import test from 'node:test';import assert from 'node:assert/strict';
import {validatePrivateSellerPage} from '../privateSellerBoard.mjs';
test('seller board pages are bounded and cannot accept fake UUID cursors',()=>{
 assert.equal(validatePrivateSellerPage({characterId:'hero1',pageSize:20,afterListingId:null}),true);
 assert.equal(validatePrivateSellerPage({characterId:'__anon__',pageSize:20,afterListingId:null}),false);
 assert.equal(validatePrivateSellerPage({characterId:'hero1',pageSize:51,afterListingId:null}),false);
 assert.equal(validatePrivateSellerPage({characterId:'hero1',pageSize:20,afterListingId:'not-a-uuid'}),false);
});
