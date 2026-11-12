// Marketplace 19.3 — private UNVERIFIED wallet-candidate observation.
// Existing 19.2 and earlier services remain untouched; no economic writes.
import {createGame3DCharacterServices192} from './characterServices192.mjs';
import {createGame3DMarketWalletReviewer193} from './marketWalletReview193.mjs';

export function createGame3DCharacterServices193({
 pool,resolveAuthenticatedSubject
}={}){
 const base=createGame3DCharacterServices192({pool,resolveAuthenticatedSubject});
 const wallets=createGame3DMarketWalletReviewer193({
  pool,resolveAuthenticatedSubject,
 });
 return Object.freeze({...base,version:'19.3',
  inspectPrivateWalletDraft:args=>wallets.inspect(args),
  readiness:async()=>({...await base.readiness(),
   sourceMilestone:'19.3',privateBetaOnly:true,
   requiresManualMigration:'024_foundation193_agp_wallet_candidates.sql',
   walletDraftReconciliationAvailable:true,
   fundingProvenanceVerified:false,
   fundedWalletLedgerEnabled:false,
   sellerBuyerAtomicSettlementAvailable:false,
   itemTransferEnabled:false,marketplaceTradingEnabled:false,
   productionReady:false}),
  readOnly:true,productionReleaseAuthorized:false});
}
