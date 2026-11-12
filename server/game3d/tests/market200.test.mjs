import test from 'node:test';
import assert from 'node:assert/strict';
import {
 getGame3DMarketplaceGate200,reviewGame3DMarketReadiness200,
 createGame3DCharacterServices200,
} from '../characterServices200.mjs';
import {getGame3DMarketReleaseGate190}
 from '../marketIntegration190.mjs';

const release=()=>getGame3DMarketReleaseGate190();
const funding=()=>({
 ok:true,version:'19.9',reviewOnly:true,
 ownerId:'owner1',claimId:'11111111-1111-4111-8111-111111111111',
 simulationReceiptConsistent:true,completionSourceConsistent:true,
 agpRulesetVerified:false,fundsMinted:false,walletCredited:false,
 paymentAuthorized:false,settlementAuthorized:false,productionReady:false,
});
const wallet=()=>({
 ok:true,version:'19.3',reviewOnly:true,
 ownerAccountId:'owner1',draftJournalReconciled:true,
 fundingVerified:false,spendableBalanceVerified:false,
 accountSpendEnabled:false,paymentAuthorized:false,
 productionReady:false,
});

test('20.0 composes only structural reviews; neither AGP nor sale enabled',()=>{
 const result=reviewGame3DMarketReadiness200({
  fundingReview:funding(),walletReview:wallet(),release:release(),
 });
 assert.equal(result.ok,true);
 assert.equal(result.fundingSourceReviewAvailable,true);
 assert.equal(result.walletDraftReviewAvailable,true);
 for(const k of ['economicAuthorityVerified','agpMintEnabled','escrowEnabled',
  'tradeEnabled','itemTransferEnabled','settlementAuthorized',
  'paymentAuthorized','productionReady'])
  assert.equal(result[k],false,k);
 assert.equal(result.release.releaseAuthorized,false);
 assert.equal(result.release.currencyMovementEnabled,false);
});
test('20.0 keeps strong release denial even with consistent candidate records',()=>{
 const g=getGame3DMarketplaceGate200(release());
 assert.equal(g.version,'20.0');
 assert.equal(g.releaseAuthorized,false);
 assert.equal(g.itemTransferEnabled,false);
 assert.ok(g.reasons.includes('candidate_wallet_does_not_prove_funding'));
 assert.throws(()=>getGame3DMarketplaceGate200({
  ...release(),releaseAuthorized:true,
 }),/refuses an enabled underlying release gate/);
});
test('20.0 blocks missing, changed, cross-owner, or credited input',()=>{
 for(const changed of [
  {fundingReview:null},
  {fundingReview:{...funding(),fundsMinted:true}},
  {fundingReview:{...funding(),walletCredited:true}},
  {fundingReview:{...funding(),agpRulesetVerified:true}},
  {fundingReview:{...funding(),completionSourceConsistent:false}},
  {walletReview:null},
  {walletReview:{...wallet(),ownerAccountId:'other'}},
  {walletReview:{...wallet(),fundingVerified:true}},
  {walletReview:{...wallet(),accountSpendEnabled:true}},
  {walletReview:{...wallet(),draftJournalReconciled:false}},
 ]){
  const result=reviewGame3DMarketReadiness200({
   fundingReview:'fundingReview' in changed?changed.fundingReview:funding(),
   walletReview:'walletReview' in changed?changed.walletReview:wallet(),
   release:release(),
  });
  assert.equal(result.ok,false);
  assert.equal(result.release.releaseAuthorized,false);
  assert.equal(result.paymentAuthorized,false);
 }
});
test('20.0 private facade offers no transaction or currency mutation endpoints',async()=>{
 const service=createGame3DCharacterServices200({
  pool:{connect:async()=>{throw Error('no PG should be contacted')},
   query:async()=>{throw Error('no PG should be contacted')}},
  resolveAuthenticatedSubject:async()=>null,
 });
 assert.equal(service.version,'20.0');
 assert.equal(typeof service.inspectMarketplaceFoundation,'function');
 assert.equal(typeof service.inspectPrivateFundingCandidate,'function');
 assert.equal(typeof service.inspectPrivateWalletDraft,'function');
 assert.equal(service.inspectMarketplaceReleaseGate().releaseAuthorized,false);
 assert.equal(service.readOnly,true);
 assert.equal(service.productionReleaseAuthorized,false);
 const failed=await service.inspectMarketplaceFoundation({
  characterId:'hero1',claimId:'11111111-1111-4111-8111-111111111111',
 });
 assert.equal(failed.ok,false);
 assert.equal(failed.tradeEnabled,false);
 assert.equal(failed.release.releaseAuthorized,false);
 for(const action of [
  'postListing','purchaseItem','paySeller','settlePurchase',
  'creditAGP','mintAGP','debitAGP','transferItem','reserveBuyerSlot',
 ]){
  assert.equal(action in service,false,action);
 }
});
