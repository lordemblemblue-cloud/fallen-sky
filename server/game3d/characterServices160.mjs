// Inventory Foundation 16.0 — integrated private, authenticated read facade.
// No item grant, public HTTP route, forge mutation, market payment or trading.
import {createGame3DAccountScopeGuard} from './accountScopeGuard.mjs';
import {createGame3DAtomicLoadoutReviewer} from './atomicLoadoutReview.mjs';
import {createGame3DCharacterServicesUpgradeReview} from './characterServices156.mjs';
import {projectGame3DInventoryHud} from './inventoryHudProjection.mjs';
import {inspectGame3DUpgradeSchema} from './upgradeSchemaAudit.mjs';
import {fingerprintGame3DForgePreview} from './forgePreviewFingerprint.mjs';
import {createGame3DPrivateMarketQuote} from './privateMarketQuote.mjs';
import {fingerprintGame3DMarketQuote} from './marketQuoteFingerprint.mjs';
import {createGame3DPrivateSellerBoard} from './privateSellerBoard.mjs';
export function createGame3DCharacterServices160({
 pool,resolveAuthenticatedSubject
}={}){
 if(!pool?.connect||!pool?.query||
    typeof resolveAuthenticatedSubject!=='function')
  throw Error('16.0 private Character Services require PG and server session');
 const base=createGame3DCharacterServicesUpgradeReview({pool,resolveAuthenticatedSubject});
 const guard=createGame3DAccountScopeGuard({pool,resolveAuthenticatedSubject});
 const atomic=createGame3DAtomicLoadoutReviewer({pool});
 const quote=createGame3DPrivateMarketQuote({pool,resolveAuthenticatedSubject});
 const board=createGame3DPrivateSellerBoard({pool,resolveAuthenticatedSubject});
 const inspectAtomicLoadout=async({serverRequestContext,characterId}={})=>{
  const subject=await guard.authorizeRead({serverRequestContext,characterId});
  if(!subject.ok)return {ok:false,code:'unverified_character',
   readOnly:true,sourceSnapshotsAtomic:false,marketplaceTradingEnabled:false};
  return atomic.inspect({ownerId:subject.accountId,characterId});
 };
 const inspectInventoryHud=async args=>{
  const snapshot=await base.inspectInventory(args);
  return projectGame3DInventoryHud(snapshot);
 };
 const inspectSellerQuote=async args=>{
  const preview=await quote.inspect(args);
  if(!preview.ok)return {...preview,previewFingerprint:null,
   publiclyListed:false,tradeAuthorized:false};
  const fingerprint=fingerprintGame3DMarketQuote(preview);
  return {...preview,
   previewFingerprint:fingerprint.ok?fingerprint.previewFingerprint:null,
   quoteConsistent:fingerprint.ok,
   publiclyListed:false,tradeAuthorized:false,
   paymentAuthorized:false,escrowAuthorized:false};
 };
  const inspectForgeQuote=async args=>{
  const preview=await base.inspectForge(args);
  if(!preview.ok||!preview.previewAvailable)return {
   ...preview,previewFingerprint:null,upgradeAuthorized:false,
   materialsDebited:false,marketplaceTradingEnabled:false};
  const hash=fingerprintGame3DForgePreview(preview);
  return {...preview,previewFingerprint:hash.ok?hash.previewFingerprint:null,
   previewConsistent:hash.ok,upgradeAuthorized:false,
   materialsDebited:false,marketplaceTradingEnabled:false};
 };
 return Object.freeze({...base,version:'16.0',
  inspectAtomicLoadout,inspectInventoryHud,inspectForgeQuote,
  inspectSellerQuote,listPrivateSellerPreviews:args=>board.list(args),
  readiness:async()=>({...await inspectGame3DUpgradeSchema({pool}),
   sourceMilestone:'16.0',privateBetaOnly:true,
   upgradeWriterConnected:false,materialDebitsEnabled:false,
   itemGrantsEnabled:false,marketplaceTradingEnabled:false,
   productionReady:false}),
  readOnly:true,productionReleaseAuthorized:false});
}
