// Marketplace Foundation 17.0 — read-only, item-bound seller preview identity.
// A public SHA-256 digest detects changes between private reviews; it is NOT
// a signed authorization, payment token, item reservation or listing capability.
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';
import {inspectGame3DMarketPrice} from './marketPricePolicy.mjs';

const key=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const uuid=x=>typeof x==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const denied=code=>({ok:false,code,previewOnly:true,
 listingAuthorized:false,tradeAuthorized:false,transferAuthorized:false,
 paymentAuthorized:false,escrowAuthorized:false});

export function fingerprintGame3DItemBoundSellerPreview(quote){
 if(quote?.ok!==true||quote.previewOnly!==true||
    !key(quote.ownerId)||!key(quote.characterId)||
    !uuid(quote.listingId)||!uuid(quote.itemInstanceId)||
    !digest(quote.sourceIntegrityDigest)||
    !Number.isSafeInteger(quote.inventorySlot)||
    quote.inventorySlot<0||quote.inventorySlot>=200||
    quote.provenanceConsistent!==true||
    quote.originalInventoryAssigned!==true||
    quote.originalItemUnequipped!==true||
    quote.listingAuthorized!==false||quote.paymentAuthorized!==false||
    quote.escrowAuthorized!==false||
    quote.marketplaceTradingEnabled!==false||
    quote.currencyDebited!==false)
  return denied('invalid_item_bound_seller_preview');
 const price=inspectGame3DMarketPrice({
  askAGP:quote.askAGP,isAuction:quote.isAuction,
  durationHours:quote.durationHours});
 if(!price.ok||price.askAGP!==quote.askAGP)
  return denied('invalid_seller_ask');
 // A new item, source receipt, slot, price or auction setting changes the hash.
 const snapshot={
  version:'17.0',ownerId:quote.ownerId,characterId:quote.characterId,
  listingId:quote.listingId,itemInstanceId:quote.itemInstanceId,
  sourceIntegrityDigest:quote.sourceIntegrityDigest,
  inventorySlot:quote.inventorySlot,
  askAGP:price.askAGP,isAuction:price.isAuction,
  durationHours:price.durationHours,
 };
 const snapshotFingerprint=createHash('sha256')
  .update(stableJournalJSON(snapshot)).digest('hex');
 return {ok:true,snapshotFingerprint,previewOnly:true,
  itemInstanceId:quote.itemInstanceId,inventorySlot:quote.inventorySlot,
  askAGP:price.askAGP,isAuction:price.isAuction,
  durationHours:price.durationHours,
  listingAuthorized:false,tradeAuthorized:false,transferAuthorized:false,
  paymentAuthorized:false,escrowAuthorized:false};
}

export function compareGame3DSellerPreviewSnapshot({
 quote,expectedFingerprint=null
}={}){
 const current=fingerprintGame3DItemBoundSellerPreview(quote);
 if(!current.ok)return current;
 if(expectedFingerprint!==null&&!digest(expectedFingerprint))
  return denied('invalid_expected_snapshot_fingerprint');
 const same=expectedFingerprint===null?null:
  expectedFingerprint===current.snapshotFingerprint;
 return {...current,
  matchesExpectedFingerprint:same,
  changedSinceLastPreview:same===null?null:!same,
  // Even a matching snapshot is stale immediately after the database read.
  // A future listing writer MUST independently recheck within its own TX.
  listingAuthorized:false,tradeAuthorized:false,paymentAuthorized:false};
}
