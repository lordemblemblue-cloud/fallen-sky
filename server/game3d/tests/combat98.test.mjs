// Deferred private beta source test.
import test from 'node:test';import assert from 'node:assert/strict';
import {createAuthenticatedMarketReview} from '../authenticatedMarketReview.mjs';
test('cannot use unauthenticated player account for Trading Post preview',()=>{
 assert.throws(()=>createAuthenticatedMarketReview({
  pool:{connect:async()=>{},query:async()=>{}}}),
  /real server authentication/);
});
