// Marketplace 19.9 — private seller/buyer/account foundation extension.
// This never grants AGP, item title, or market sale capabilities.
import {createGame3DCharacterServices193} from './characterServices193.mjs';
import {createGame3DFundingCandidateReviewer199}
 from './marketFundingReview199.mjs';

export function createGame3DCharacterServices199({
 pool,resolveAuthenticatedSubject
}={}){
 const base=createGame3DCharacterServices193({pool,resolveAuthenticatedSubject});
 const funding=createGame3DFundingCandidateReviewer199({
  pool,resolveAuthenticatedSubject,
 });
 return Object.freeze({...base,version:'19.9',
  inspectPrivateFundingCandidate:args=>funding.inspect(args),
  readiness:async()=>({...await base.readiness(),
   sourceMilestone:'19.9',privateBetaOnly:true,
   requiresManualMigration:'025_foundation199_agp_funding_candidates.sql',
   agpFundingCandidateReviewAvailable:true,
   agpFundingRulesetAuthoritative:false,
   sourceAuthenticityIndependentlyProven:false,
   fundedWalletLedgerEnabled:false,
   agpMintEnabled:false,marketplaceTradingEnabled:false,
   productionReady:false}),
  readOnly:true,productionReleaseAuthorized:false});
}
