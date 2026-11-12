// Inventory Foundation 15.6 — trusted upgrade-table backed services review.
// Reuses 14.0/15.0 read-only previews. No live endpoint registered.
import {createGame3DCharacterServicesPreview} from './characterServices14.mjs';
import {createGame3DTrustedUpgradeStateReader} from './trustedUpgradeStateRead.mjs';
export const GAME3D_SERVICES_PREVIEW_VERSION='15.6';
export function createGame3DCharacterServicesUpgradeReview({
 pool,resolveAuthenticatedSubject
}={}){
 if(!pool?.query||!pool?.connect||
    typeof resolveAuthenticatedSubject!=='function')
  throw Error('Private PG and trusted session required for Character Services');
 const reader=createGame3DTrustedUpgradeStateReader({pool});
 const base=createGame3DCharacterServicesPreview({
  pool,resolveAuthenticatedSubject,readServerUpgradeState:reader.read});
 return Object.freeze({
  ...base,version:GAME3D_SERVICES_PREVIEW_VERSION,
  privateUpgradeStateSource:'game3d_item_upgrade_state',
  inspectForge:args=>base.inspectForge(args),
  readiness:async()=>({...await base.readiness(),
   sourceMilestone:GAME3D_SERVICES_PREVIEW_VERSION,
   manualUpgradeMigration:'020_foundation154_item_upgrades.sql',
   upgradeWriterConnected:false,materialDebitsEnabled:false,
   competitiveEquipmentBonusesEnabled:false,productionReady:false}),
 });
}
