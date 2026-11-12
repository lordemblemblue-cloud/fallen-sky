// Marketplace Foundation 16.7 — deterministic preview identity.
// A SHA hash does NOT authenticate a seller, reserve currency or sign a trade.
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';
import {inspectGame3DMarketPrice} from './marketPricePolicy.mjs';
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const uuid=x=>typeof x==='string'&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
export function fingerprintGame3DMarketQuote(quote){
 if(quote?.ok!==true||quote.previewOnly!==true||
    !who(quote.ownerId)||!who(quote.characterId)||!uuid(quote.listingId)||
    quote.provenanceConsistent!==true||
    quote.originalInventoryAssigned!==true||
    quote.originalItemUnequipped!==true)
  return {ok:false,code:'invalid_seller_quote',tradeAuthorized:false};
 const p=inspectGame3DMarketPrice({
  askAGP:quote.askAGP,isAuction:quote.isAuction,
  durationHours:quote.durationHours});
 if(!p.ok||p.askAGP!==quote.askAGP)
  return {ok:false,code:'changed_market_ask',tradeAuthorized:false};
 const binding={ownerId:quote.ownerId,characterId:quote.characterId,
  listingId:quote.listingId,askAGP:p.askAGP,
  isAuction:p.isAuction,durationHours:p.durationHours};
 const previewFingerprint=createHash('sha256')
  .update(stableJournalJSON(binding)).digest('hex');
 return {ok:true,previewFingerprint,
  authenticatedSellerPreviewOnly:true,tradeAuthorized:false,
  escrowAuthorized:false,paymentAuthorized:false};
}
