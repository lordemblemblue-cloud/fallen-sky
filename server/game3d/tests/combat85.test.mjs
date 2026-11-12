import test from 'node:test';import assert from 'node:assert/strict';
import {inspectMarketplaceItemSource} from '../marketplaceSourceAudit.mjs';
test('empty or forged item cannot be listed or escrowed',()=>{
 const r=inspectMarketplaceItemSource({ownerId:'o',characterId:'c',itemInstanceId:'i',evidence:{}});
 assert.equal(r.ok,false);assert.equal(r.listingPermitted,false);assert.equal(r.escrowAuthorized,false);
});
