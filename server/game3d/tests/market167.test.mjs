import test from 'node:test';import assert from 'node:assert/strict';
import {fingerprintGame3DMarketQuote} from '../marketQuoteFingerprint.mjs';
test('no seller proof or ownership means no marketplace preview fingerprint',()=>{
 assert.equal(fingerprintGame3DMarketQuote({ok:false}).ok,false);
 const q={ok:true,previewOnly:true,ownerId:'owner1',characterId:'hero1',
  listingId:'11111111-1111-4111-8111-111111111111',
  provenanceConsistent:true,originalInventoryAssigned:true,
  originalItemUnequipped:true,askAGP:'100',isAuction:false,
  durationHours:null};
 const first=fingerprintGame3DMarketQuote(q);
 assert.equal(first.ok,true);
 assert.equal(first.previewFingerprint.length,64);
 assert.notEqual(first.previewFingerprint,
  fingerprintGame3DMarketQuote({...q,askAGP:'101'}).previewFingerprint);
});
