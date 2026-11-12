import test from 'node:test';import assert from 'node:assert/strict';
import {reviewPrivateMarketPreview} from '../marketListingPreview.mjs';
test('preview row cannot authorize trade even when owned',()=>{
 const row={listing_id:'id',owner_id:'o',character_id:'c',item_instance_id:'i',record_kind:'private_preview',payment_enabled:false,transfer_enabled:false};
 const x=reviewPrivateMarketPreview({row,ownerId:'o',characterId:'c',itemInstanceId:'i'});
 assert.equal(x.ok,true);assert.equal(x.marketLive,false);
 assert.equal(reviewPrivateMarketPreview({row:{...row,transfer_enabled:true},ownerId:'o',characterId:'c',itemInstanceId:'i'}).ok,false);
});
