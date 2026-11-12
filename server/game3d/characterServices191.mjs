// Marketplace 19.1 — additive private Character Services buyer review.
import {createGame3DCharacterServices190} from './characterServices190.mjs';
import {createGame3DBuyerCapacityReviewer191} from './marketBuyerCapacity191.mjs';

export function createGame3DCharacterServices191({
 pool,resolveAuthenticatedSubject
}={}){
 const base=createGame3DCharacterServices190({
  pool,resolveAuthenticatedSubject,
 });
 const buyer=createGame3DBuyerCapacityReviewer191({
  pool,resolveAuthenticatedSubject,
 });
 return Object.freeze({...base,version:'19.1',
  inspectBuyerInventoryCapacity:args=>buyer.inspect(args),
  readiness:async()=>({...await base.readiness(),
   sourceMilestone:'19.1',privateBetaOnly:true,
   requiresExistingInventoryMigration:'019_foundation126_inventory_slots.sql',
   authenticatedBuyerCapacityReviewAvailable:true,
   buyerCapacitySnapshotGrantsReservation:false,
   sellerBuyerAtomicSettlementAvailable:false,
   buyerFundsVerified:false,itemTransferEnabled:false,
   marketplaceTradingEnabled:false,productionReady:false}),
  readOnly:true,productionReleaseAuthorized:false});
}
