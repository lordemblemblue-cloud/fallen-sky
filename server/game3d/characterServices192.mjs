// Marketplace 19.2 — private, read-only economy draft integrity review.
import {createGame3DCharacterServices191} from './characterServices191.mjs';
import {createGame3DMarketAGPDraftInspector192}
 from './marketAGPDraftAudit192.mjs';

export function createGame3DCharacterServices192({
 pool,resolveAuthenticatedSubject
}={}){
 const base=createGame3DCharacterServices191({
  pool,resolveAuthenticatedSubject,
 });
 const agp=createGame3DMarketAGPDraftInspector192({
  pool,resolveAuthenticatedSubject,
 });
 return Object.freeze({...base,version:'19.2',
  inspectPrivateAGPDraft:args=>agp.inspect(args),
  readiness:async()=>({...await base.readiness(),
   sourceMilestone:'19.2',privateBetaOnly:true,
   requiresManualMigration:'022_foundation179_economic_drafts.sql',
   authenticatedAGPDraftAuditAvailable:true,
   agpFundingAuthoritative:false,agpWalletLedgerConnected:false,
   itemTransferEnabled:false,marketplaceTradingEnabled:false,
   productionReady:false}),
  readOnly:true,productionReleaseAuthorized:false});
}
