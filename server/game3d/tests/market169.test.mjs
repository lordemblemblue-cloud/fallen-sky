import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DCharacterServices160} from '../characterServices160.mjs';
test('private Character Services exposes previews, not purchases',()=>{
 const s=createGame3DCharacterServices160({
  pool:{query:async()=>{},connect:async()=>{}},
  resolveAuthenticatedSubject:async()=>null});
 assert.equal(typeof s.inspectSellerQuote,'function');
 assert.equal(typeof s.listPrivateSellerPreviews,'function');
 for(const name of ['purchaseItem','postListing','executeTrade','debitAGP'])
  assert.equal(name in s,false);
});
