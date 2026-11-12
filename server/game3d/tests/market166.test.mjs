import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DPrivateMarketQuote} from '../privateMarketQuote.mjs';
test('invalid AGP price blocks before database/account inspection',async()=>{
 let read=false;
 const service=createGame3DPrivateMarketQuote({
  pool:{connect:async()=>{read=true},query:async()=>{read=true}},
  resolveAuthenticatedSubject:async()=>{read=true;return null}});
 const r=await service.inspect({askAGP:'0',characterId:'c1',listingId:'bad'});
 assert.equal(r.ok,false);assert.equal(read,false);
});
