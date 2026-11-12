import test from 'node:test';
import assert from 'node:assert/strict';
import {
 fingerprintGame3DItemBoundSellerPreview,
 compareGame3DSellerPreviewSnapshot,
} from '../marketSnapshot170.mjs';
import {createGame3DCharacterServices170} from '../characterServices170.mjs';

const original=()=>({
 ok:true,previewOnly:true,ownerId:'owner1',characterId:'hero1',
 listingId:'11111111-1111-4111-8111-111111111111',
 itemInstanceId:'22222222-2222-4222-8222-222222222222',
 sourceIntegrityDigest:'a'.repeat(64),inventorySlot:0,
 askAGP:'100',isAuction:false,durationHours:null,
 provenanceConsistent:true,originalInventoryAssigned:true,
 originalItemUnequipped:true,listingAuthorized:false,
 paymentAuthorized:false,escrowAuthorized:false,
 marketplaceTradingEnabled:false,currencyDebited:false,
});
test('17.0 review token binds actual item, evidence, slot, price and seller',()=>{
 const q=original();
 const b=fingerprintGame3DItemBoundSellerPreview(q);
 assert.equal(b.ok,true);
 assert.match(b.snapshotFingerprint,/^[a-f0-9]{64}$/);
 for(const change of [
  {itemInstanceId:'33333333-3333-4333-8333-333333333333'},
  {sourceIntegrityDigest:'b'.repeat(64)},
  {inventorySlot:199},{askAGP:'101'},{ownerId:'owner2'},
  {isAuction:true,durationHours:24},
 ]){
  const next=fingerprintGame3DItemBoundSellerPreview({...q,...change});
  assert.equal(next.ok,true);
  assert.notEqual(next.snapshotFingerprint,b.snapshotFingerprint);
 }
 assert.equal(b.tradeAuthorized,false);
 assert.equal(b.paymentAuthorized,false);
});
test('unsafe states cannot be hashed into a trusted looking preview',()=>{
 const q=original();
 for(const change of [
  {inventorySlot:200},{inventorySlot:'0'},
  {sourceIntegrityDigest:'x'.repeat(64)},
  {itemInstanceId:'not-a-uuid'}, {provenanceConsistent:false},
  {originalItemUnequipped:false},{listingAuthorized:true},
  {paymentAuthorized:true},{escrowAuthorized:true},
  {marketplaceTradingEnabled:true},{currencyDebited:true},
 ]){
  assert.equal(fingerprintGame3DItemBoundSellerPreview({...q,...change}).ok,false);
 }
});
test('expected fingerprint comparison is descriptive and never grants sale',()=>{
 const q=original();
 const first=fingerprintGame3DItemBoundSellerPreview(q);
 const same=compareGame3DSellerPreviewSnapshot({
  quote:q,expectedFingerprint:first.snapshotFingerprint});
 assert.equal(same.matchesExpectedFingerprint,true);
 assert.equal(same.tradeAuthorized,false);
 const changed=compareGame3DSellerPreviewSnapshot({
  quote:{...q,inventorySlot:1},
  expectedFingerprint:first.snapshotFingerprint});
 assert.equal(changed.changedSinceLastPreview,true);
 assert.equal(changed.listingAuthorized,false);
 assert.equal(compareGame3DSellerPreviewSnapshot({
  quote:q,expectedFingerprint:'bad'}).ok,false);
});
test('private Character Services 17.0 exposes only an authenticated review',async()=>{
 const service=createGame3DCharacterServices170({
  pool:{query:async()=>{throw Error('No DB access on failed authentication')},
   connect:async()=>{throw Error('No DB access on failed authentication')}},
  resolveAuthenticatedSubject:async()=>null});
 assert.equal(service.version,'17.0');
 const response=await service.inspectSellerSnapshot({
  characterId:'hero1',
  listingId:'11111111-1111-4111-8111-111111111111',
  askAGP:'100'});
 assert.equal(response.ok,false);
 assert.equal(response.tradeAuthorized,false);
 for(const name of ['postListing','purchaseItem','debitAGP','executeTrade'])
  assert.equal(name in service,false);
});
