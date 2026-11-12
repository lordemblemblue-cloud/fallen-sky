// Foundation 15.0 — Game 3D private character-services integration.
// Source only. This is not an HTTP route or a production commerce gateway.
// No user-controlled owner ID, free gear grant or AGP payment action exists.
import {createAuthenticatedGame3DInventory} from './authenticatedInventory.mjs';
import {createPrivateInventoryReader} from './privateInventoryReader.mjs';
import {createGame3DEquipmentSnapshotReader} from './characterEquipmentSnapshot.mjs';
import {reconcileGame3DInventoryEquipment} from './inventoryEquipmentReconcile.mjs';
import {createGame3DForgePreview} from './forgePreview.mjs';
import {createAuthenticatedMarketReview} from './authenticatedMarketReview.mjs';
import {inspectGame3DInventorySchema} from './inventorySchemaAudit.mjs';
import {inspectGame3DMarketPrice} from './marketPricePolicy.mjs';

export const CHARACTER_SERVICES_FOUNDATION_VERSION='15.0';
export function createGame3DCharacterServicesPreview({
 pool,resolveAuthenticatedSubject,readServerUpgradeState
}={}){
 if(!pool?.query||!pool?.connect||
    typeof resolveAuthenticatedSubject!=='function'||
    typeof readServerUpgradeState!=='function')
  throw Error('Character Services require trusted DB, session and upgrade provider');
 const inventory=createAuthenticatedGame3DInventory({
  pool,resolveAuthenticatedSubject});
 const inventoryPage=createPrivateInventoryReader({
  pool,resolveAuthenticatedSubject});
 const equipped=createGame3DEquipmentSnapshotReader({pool});
 const blacksmith=createGame3DForgePreview({
  pool,resolveAuthenticatedSubject,readServerUpgradeState});
 const market=createAuthenticatedMarketReview({
  pool,resolveAuthenticatedSubject});
 // Separate repeatable-read sources are compared for private QA only.
 // Never use this cross-transaction result to equip items or settle trades.
 const inspectEquipmentConsistency=async({
  serverRequestContext,characterId,expectedEquipmentRevision
 }={})=>{
  const blocked=code=>({ok:false,code,readOnly:true,
   sourceSnapshotsAtomic:false,competitiveBonusesEnabled:false,
   marketplaceTradingEnabled:false});
  if(!Number.isSafeInteger(expectedEquipmentRevision)||
     expectedEquipmentRevision<0)return blocked('invalid_equipment_revision');
  const owned=await inventory.inspect({serverRequestContext,characterId});
  if(!owned.ok)return blocked('unverified_inventory_identity');
  const gear=await equipped.inspect({ownerId:owned.ownerId,characterId,
   expectedRevision:expectedEquipmentRevision});
  const review=reconcileGame3DInventoryEquipment({inventory:owned,equipment:gear});
  return {...review,readOnly:true,sourceSnapshotsAtomic:false,
   competitiveBonusesEnabled:false,marketplaceTradingEnabled:false};
 };
 const readiness=async()=>{
  const schema=await inspectGame3DInventorySchema({pool});
  return {...schema,sourceMilestone:CHARACTER_SERVICES_FOUNDATION_VERSION,
   inventoryClientConnected:false,forgeMutationEnabled:false,
   inventoryEquipmentLiveIntegrationTested:false,
   crossServiceSnapshotAtomic:false,
   marketplacePublicTradesEnabled:false,rankedGearEnabled:false,
   productionReady:false};
 };
 return Object.freeze({
  version:CHARACTER_SERVICES_FOUNDATION_VERSION,
  readOnly:true,productionReleaseAuthorized:false,
  inspectInventory:args=>inventory.inspect(args),
  inspectInventoryPage:args=>inventoryPage.list(args),
  inspectEquipmentConsistency,
  inspectForge:args=>blacksmith.inspect(args),
  inspectMarketListing:args=>market.inspect(args),
  inspectMarketPrice:args=>inspectGame3DMarketPrice(args),
  readiness,
 });
}
