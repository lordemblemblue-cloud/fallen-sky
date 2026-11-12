import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGame3DMarketLedgerDraft179} from '../marketEconomy179.mjs';
import {planGame3DMarketTransfer189} from '../marketTransfer189.mjs';
import {
 getGame3DMarketReleaseGate190,reviewGame3DMarketDryRun190,
} from '../marketIntegration190.mjs';
import {createGame3DCharacterServices190} from '../characterServices190.mjs';

const ledger=()=>buildGame3DMarketLedgerDraft179({
 requestId:'11111111-1111-4111-8111-111111111111',
 listingId:'22222222-2222-4222-8222-222222222222',
 itemInstanceId:'33333333-3333-4333-8333-333333333333',
 sellerAccountId:'seller1',buyerAccountId:'buyer1',
 askAGP:'100',expectedSnapshotFingerprint:'a'.repeat(64),
});
const title=l=>planGame3DMarketTransfer189({
 ledgerDraft:l,
 transferId:'44444444-4444-4444-8444-444444444444',
 sellerCharacterId:'sellerHero',buyerCharacterId:'buyerHero',
 observedOwnerAccountId:'seller1',observedOwnerCharacterId:'sellerHero',
 observedSellerSlot:1,proposedBuyerSlot:2,
 observedEquipped:false,observedBuyerSlotVacant:true,
});
const seller=l=>({
 ok:true,version:'17.1',preflightOnly:true,sellerSnapshotMatches:true,
 sourceConsistencyObserved:true,inventoryAllocationObserved:true,
 unequippedObserved:true,noExistingIntentObserved:true,
 snapshotFingerprint:l.expectedSnapshotFingerprint,
 itemInstanceId:l.itemInstanceId,askAGP:l.askAGP,
 inventorySlot:1,custodyReserved:false,
 settlementAuthorized:false,paymentAuthorized:false,
 productionReady:false,
});
test('19.0 no-release status is nonnegotiable',()=>{
 const r=getGame3DMarketReleaseGate190();
 assert.equal(r.releaseAuthorized,false);
 assert.equal(r.tradeEnabled,false);
 assert.equal(r.itemTransferEnabled,false);
 assert.equal(r.currencyMovementEnabled,false);
 assert.equal(r.productionReady,false);
 assert.ok(r.reasons.includes('funded_agp_wallet_ledger_not_implemented'));
 assert.ok(r.reasons.includes('postgres_concurrency_security_economic_tests_not_run'));
});
test('19.0 cross-checks seller preflight, buyer draft and transfer blueprint',()=>{
 const l=ledger(),s=title(l),p=seller(l);
 const r=reviewGame3DMarketDryRun190({
  sellerPreflight:p,ledgerDraft:l,transferScenario:s,
 });
 assert.equal(r.ok,true);
 assert.equal(r.planCompatible,true);
 for(const k of ['sellerSourceTrustedForTrading','buyerAuthenticated',
  'balanceVerified','replayProtected','custodyReserved',
  'settlementAuthorized','paymentAuthorized','itemTransferred',
  'productionReady'])assert.equal(r[k],false,k);
 assert.equal(r.release.releaseAuthorized,false);
 for(const changed of [
  {snapshotFingerprint:'b'.repeat(64)},
  {inventorySlot:3},
  {itemInstanceId:'55555555-5555-4555-8555-555555555555'},
  {askAGP:'101'},{sellerSnapshotMatches:false},
  {settlementAuthorized:true},
 ]){
  const invalid=reviewGame3DMarketDryRun190({
   sellerPreflight:{...p,...changed},ledgerDraft:l,transferScenario:s,
  });
  assert.equal(invalid.ok,false);
  assert.equal(invalid.release.tradeEnabled,false);
 }
 assert.equal(reviewGame3DMarketDryRun190({
  sellerPreflight:p,ledgerDraft:l,
  transferScenario:{...s,blueprintFingerprint:'b'.repeat(64)},
 }).ok,false);
});
test('19.0 private facade retains no economic or trade mutation endpoint',async()=>{
 const svc=createGame3DCharacterServices190({
  pool:{query:async()=>{throw Error('Not needed')},
   connect:async()=>{throw Error('Not needed')}},
  resolveAuthenticatedSubject:async()=>null,
 });
 assert.equal(svc.version,'19.0');
 assert.equal(svc.readOnly,true);
 assert.equal(svc.productionReleaseAuthorized,false);
 assert.equal(svc.inspectMarketplaceReleaseGate().releaseAuthorized,false);
 for(const k of ['postListing','reserveItem','purchaseItem',
  'settlePurchase','debitAGP','creditAGP','transferItem','executeTrade'])
  assert.equal(k in svc,false,k);
 const response=await svc.inspectSellerDevelopmentReadiness({
  characterId:'sellerHero',
  listingId:'22222222-2222-4222-8222-222222222222',
  askAGP:'100',expectedFingerprint:'a'.repeat(64),
 });
 assert.equal(response.ok,false);
 assert.equal(response.productionReady,false);
 assert.equal(response.release.releaseAuthorized,false);
});
