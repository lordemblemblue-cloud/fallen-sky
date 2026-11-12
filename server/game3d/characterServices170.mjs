// Marketplace Foundation 17.0 — private authenticated item-bound seller review.
// This wraps 16.9 Character Services; no public route or economy writer exists.
import {createGame3DCharacterServices160} from './characterServices160.mjs';
import {compareGame3DSellerPreviewSnapshot} from './marketSnapshot170.mjs';

export function createGame3DCharacterServices170({
 pool,resolveAuthenticatedSubject
}={}){
 const base=createGame3DCharacterServices160({pool,resolveAuthenticatedSubject});
 const inspectSellerSnapshot=async({
  serverRequestContext,characterId,listingId,askAGP,
  isAuction=false,durationHours=null,expectedFingerprint=null
 }={})=>{
  // Re-check the authenticated owner, issuance provenance, inventory custody
  // and current unequipped status on every call, before comparing fingerprints.
  const quote=await base.inspectSellerQuote({
   serverRequestContext,characterId,listingId,askAGP,
   isAuction,durationHours,
  });
  if(!quote.ok)return {ok:false,code:quote.code||'seller_snapshot_unavailable',
   snapshotFingerprint:null,previewOnly:true,
   listingAuthorized:false,tradeAuthorized:false,
   transferAuthorized:false,paymentAuthorized:false,
   escrowAuthorized:false};
  const current=compareGame3DSellerPreviewSnapshot({quote,expectedFingerprint});
  return {...current,version:'17.0',
   // Neither same-hash nor custody consistency creates permission to trade.
   publicMarketplaceEnabled:false,originalOwnerOnly:true,
   itemReserved:false,currencyDebited:false,
   productionReady:false};
 };
 return Object.freeze({...base,version:'17.0',inspectSellerSnapshot,
  readiness:async()=>({...await base.readiness(),
   sourceMilestone:'17.0',privateBetaOnly:true,
   itemBoundSellerReviewAvailable:true,
   sellerSnapshotTradeAuthority:false,
   marketplaceTradingEnabled:false,
   productionReady:false}),
  readOnly:true,productionReleaseAuthorized:false});
}
