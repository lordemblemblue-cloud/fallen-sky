// Character Services Foundation 17.0 — private source handoff, not a release.
// Combines owner-authenticated, read-only Inventory / Blacksmith / Marketplace.
import {createGame3DCharacterServices160} from './characterServices160.mjs';
export const CHARACTER_SERVICES_MILESTONE='17.0';
export const CHARACTER_SERVICES_MANUAL_MIGRATIONS=Object.freeze([
 '019_foundation126_inventory_slots.sql',
 '020_foundation154_item_upgrades.sql',
]);
export function createGame3DCharacterServices17({
 pool,resolveAuthenticatedSubject
}={}){
 const base=createGame3DCharacterServices160({pool,resolveAuthenticatedSubject});
 return Object.freeze({...base,version:CHARACTER_SERVICES_MILESTONE,
  sourceMilestone:CHARACTER_SERVICES_MILESTONE,
  requiredManualMigrations:[...CHARACTER_SERVICES_MANUAL_MIGRATIONS],
  readOnly:true,
  productionReleaseAuthorized:false,
  executeForgeEnabled:false,realAGPSettlementEnabled:false,
  publicTradingEnabled:false,serverInventoryRewardGrantsEnabled:false,
  readiness:async()=>({...await base.readiness(),
   sourceMilestone:CHARACTER_SERVICES_MILESTONE,
   betaTestsExecuted:false,
   gameEngineAttesterInstalled:false,
   gameUiBoundToPrivateServices:false,
   inventoryTransferLedgerReady:false,
   doubleEntryAGPLedgerReady:false,
   actualBlacksmithMaterialLedgerReady:false,
   paymentsEnabled:false,publicTradingEnabled:false,
   rankedEquipmentBonusesEnabled:false,
   productionReady:false}),
 });
}
