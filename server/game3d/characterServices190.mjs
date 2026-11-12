// Marketplace 19.0 — integration-only Character Services facade.
// Existing 16.0, 17.0, 17.1 imports and public routes remain unchanged.
import {createGame3DCharacterServices171} from './characterServices171.mjs';
import {
 getGame3DMarketReleaseGate190,reviewGame3DMarketDryRun190,
} from './marketIntegration190.mjs';

export function createGame3DCharacterServices190({
 pool,resolveAuthenticatedSubject
}={}){
 const base=createGame3DCharacterServices171({
  pool,resolveAuthenticatedSubject,
 });
 const inspectSellerDevelopmentReadiness=async args=>{
  const preflight=await base.inspectSellerCustodyPreflight(args);
  return {...preflight,
   release:getGame3DMarketReleaseGate190(),
   publicMarketplaceEnabled:false,settlementAuthorized:false,
   paymentAuthorized:false,productionReady:false};
 };
 return Object.freeze({...base,version:'19.0',
  inspectSellerDevelopmentReadiness,
  inspectMarketplaceReleaseGate:()=>getGame3DMarketReleaseGate190(),
  // Offline-only: caller-supplied snapshots are *not* trusted attestations.
  reviewOfflineMarketplaceScenario:args=>reviewGame3DMarketDryRun190(args),
  readiness:async()=>({...await base.readiness(),
   sourceMilestone:'19.0',privateBetaOnly:true,
   draftLedgerAvailable:true,titleTransferBlueprintAvailable:true,
   marketDryRunCompatibilityAvailable:true,
   sellerBuyerAtomicSettlementAvailable:false,
   currencyMovementEnabled:false,marketplaceTradingEnabled:false,
   productionReady:false}),
  readOnly:true,productionReleaseAuthorized:false});
}
