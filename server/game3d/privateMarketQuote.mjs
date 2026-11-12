// Marketplace Foundation 16.6 — private seller price proposal, NO listing writes.
// Price is a display-only ask, not a deducted, reserved or paid amount.
import {createAuthenticatedMarketReview} from './authenticatedMarketReview.mjs';
import {inspectGame3DMarketPrice} from './marketPricePolicy.mjs';
export function createGame3DPrivateMarketQuote({pool,resolveAuthenticatedSubject}={}){
 if(!pool?.connect||!pool?.query||
    typeof resolveAuthenticatedSubject!=='function')
  throw Error('Market quote review needs private PG and server authentication');
 const listings=createAuthenticatedMarketReview({pool,resolveAuthenticatedSubject});
 const inspect=async({serverRequestContext,characterId,listingId,
  askAGP,isAuction=false,durationHours=null}={})=>{
  const price=inspectGame3DMarketPrice({askAGP,isAuction,durationHours});
  if(!price.ok)return {ok:false,code:price.code,
   listingAuthorized:false,paymentAuthorized:false};
  const item=await listings.inspect({serverRequestContext,characterId,listingId});
  if(!item.ok)return {ok:false,code:'market_source_or_custody_inconsistent',
   listingAuthorized:false,paymentAuthorized:false};
  return {ok:true,ownerId:item.ownerId,characterId:item.characterId,
   listingId:item.listingId,itemInstanceId:item.itemInstanceId,
   sourceIntegrityDigest:item.sourceIntegrityDigest,
   inventorySlot:item.inventorySlot,askAGP:price.askAGP,isAuction:price.isAuction,
   durationHours:price.durationHours,
   provenanceConsistent:item.provenanceConsistent,
   originalInventoryAssigned:item.itemCurrentlyAllocatedToOwner,
   originalItemUnequipped:item.itemCurrentlyUnequipped,
   previewOnly:true,listingAuthorized:false,
   paymentAuthorized:false,currencyDebited:false,
   escrowAuthorized:false,marketplaceTradingEnabled:false};
 };
 return Object.freeze({inspect});
}
