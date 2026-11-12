// Combat Foundation 8.5 — Marketplace / Trading Post source audit ONLY.
// An item with consistent provenance is still not market eligible until
// the world simulation, item lifecycle and economic ledger are trusted.
import {verifyItemProvenanceChain} from './itemProvenanceReview.mjs';
const blocked=code=>({ok:false,code,listingPermitted:false,
 tradePermitted:false,escrowAuthorized:false,rewardsIssued:false});
export function inspectMarketplaceItemSource({
  ownerId,characterId,itemInstanceId,evidence
}={}){
 const result=verifyItemProvenanceChain(evidence);
 if(!result.ok)return blocked('unverified_item_'+result.code);
 if(result.ownerId!==ownerId||result.characterId!==characterId||
    result.itemInstanceId!==itemInstanceId)
  return blocked('market_item_owner_or_instance_mismatch');
 return {
  ok:true,ownerId,characterId,itemInstanceId,
  sourceIntegrityDigest:result.sourceDigest,
  sourceConsistent:true,
  realGameplayEarned:false,
  listingPermitted:false,tradePermitted:false,
  escrowAuthorized:false,rewardsIssued:false,
 };
}
