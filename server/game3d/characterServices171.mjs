// Marketplace Foundation 17.1 — private custody/settlement preflight only.
// Extends 17.0 without enabling any economic or inventory mutation paths.
import {createGame3DCharacterServices170} from './characterServices170.mjs';
import {createGame3DMarketCustodyPreflight171} from './marketCustodyPreflight171.mjs';

export function createGame3DCharacterServices171({
 pool,resolveAuthenticatedSubject
}={}){
 const base=createGame3DCharacterServices170({
  pool,resolveAuthenticatedSubject,
 });
 const custody=createGame3DMarketCustodyPreflight171({
  pool,resolveAuthenticatedSubject,
 });
 return Object.freeze({...base,version:'17.1',
  inspectSellerCustodyPreflight:args=>custody.inspect(args),
  readiness:async()=>({...await base.readiness(),
   sourceMilestone:'17.1',privateBetaOnly:true,
   requiresManualMigration:'021_foundation171_market_custody_intents.sql',
   custodyIntentWritesEnabled:false,custodyReserved:false,
   liveCurrencyLedgerEnabled:false,itemTransferEnabled:false,
   purchaseEnabled:false,settlementEnabled:false,
   marketplaceTradingEnabled:false,productionReady:false}),
  readOnly:true,productionReleaseAuthorized:false});
}
