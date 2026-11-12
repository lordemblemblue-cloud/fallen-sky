// Marketplace 20.0 — compose private funding and wallet candidate reviews.
// These are two independent read-only transactions: NEVER an atomic purchase,
// economic attestation, funding authorization, reservation or transferable title.
import {createGame3DCharacterServices199}
 from './characterServices199.mjs';

const blocked=(reason,gate)=>({
 ok:false,version:'20.0',reason,reviewOnly:true,
 fundingSourceReviewAvailable:false,walletDraftReviewAvailable:false,
 economicAuthorityVerified:false,agpMintEnabled:false,
 escrowEnabled:false,tradeEnabled:false,itemTransferEnabled:false,
 settlementAuthorized:false,paymentAuthorized:false,
 productionReady:false,release:gate,
});

export function getGame3DMarketplaceGate200(baseGate){
 // Always preserve the original, hard-coded 19.0 release denial.
 if(baseGate?.releaseAuthorized!==false||
    baseGate?.tradeEnabled!==false||
    baseGate?.currencyMovementEnabled!==false)
  throw Error('Market 20.0 refuses an enabled underlying release gate');
 return Object.freeze({
  version:'20.0',releaseAuthorized:false,tradeEnabled:false,
  productionReady:false,currencyMovementEnabled:false,
  itemTransferEnabled:false,escrowEnabled:false,
  reasons:[...baseGate.reasons,
   'agp_reward_ruleset_authorizer_not_integrated',
   'candidate_wallet_does_not_prove_funding',
   'seller_buyer_atomic_purchase_not_implemented'],
 });
}

// Structural composition only. Both inputs must come from backend private
// account-scoped inspectors; caller-provided copies are not trade evidence.
export function reviewGame3DMarketReadiness200({
 fundingReview,walletReview,release
}={}){
 const gate=getGame3DMarketplaceGate200(release);
 if(fundingReview?.ok!==true||fundingReview.reviewOnly!==true||
    fundingReview.simulationReceiptConsistent!==true||
    fundingReview.completionSourceConsistent!==true||
    fundingReview.agpRulesetVerified!==false||
    fundingReview.fundsMinted!==false||
    fundingReview.walletCredited!==false||
    fundingReview.paymentAuthorized!==false)
  return blocked('funding_source_candidate_inconsistent',gate);
 if(walletReview?.ok!==true||walletReview.reviewOnly!==true||
    walletReview.draftJournalReconciled!==true||
    walletReview.fundingVerified!==false||
    walletReview.spendableBalanceVerified!==false||
    walletReview.paymentAuthorized!==false||
    walletReview.accountSpendEnabled!==false)
  return blocked('unverified_wallet_draft_inconsistent',gate);
 if(fundingReview.ownerId!==walletReview.ownerAccountId)
  return blocked('funding_wallet_owner_mismatch',gate);
 return {ok:true,version:'20.0',reviewOnly:true,
  ownerAccountId:fundingReview.ownerId,
  fundingClaimId:fundingReview.claimId,
  fundingSourceReviewAvailable:true,walletDraftReviewAvailable:true,
  independentlyObservedSnapshots:true,
  // The independent snapshots do not establish an atomic ledger or a grant.
  economicAuthorityVerified:false,agpMintEnabled:false,
  escrowEnabled:false,tradeEnabled:false,itemTransferEnabled:false,
  settlementAuthorized:false,paymentAuthorized:false,
  productionReady:false,release:gate};
}

export function createGame3DCharacterServices200({
 pool,resolveAuthenticatedSubject
}={}){
 const base=createGame3DCharacterServices199({pool,resolveAuthenticatedSubject});
 const gate=()=>getGame3DMarketplaceGate200(base.inspectMarketplaceReleaseGate());
 const inspectMarketplaceFoundation=async args=>{
  const fundingReview=await base.inspectPrivateFundingCandidate(args);
  if(!fundingReview.ok)
   return blocked('funding_source_candidate_unavailable',gate());
  const walletReview=await base.inspectPrivateWalletDraft({
   serverRequestContext:args?.serverRequestContext,
  });
  return reviewGame3DMarketReadiness200({
   fundingReview,walletReview,release:base.inspectMarketplaceReleaseGate(),
  });
 };
 return Object.freeze({...base,version:'20.0',
  inspectMarketplaceFoundation,
  inspectMarketplaceReleaseGate:gate,
  readiness:async()=>({...await base.readiness(),
   sourceMilestone:'20.0',privateBetaOnly:true,
   sourceAndWalletPreviewComposition:true,
   auditedAGPFundingAuthorityEnabled:false,
   fundedWalletLedgerEnabled:false,
   settlementEnabled:false,marketplaceTradingEnabled:false,
   productionReady:false}),
  readOnly:true,productionReleaseAuthorized:false});
}
