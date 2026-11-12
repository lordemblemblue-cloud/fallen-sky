// Marketplace Foundation 16.8 — private seller's PREVIEW candidates board.
// Not the public Trading Post and not evidence of a funded or active listing.
import {createGame3DAccountScopeGuard} from './accountScopeGuard.mjs';
import {isPrivateMarketCustodyConsistent} from './marketPreviewAudit.mjs';
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const uuid=x=>typeof x==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function validatePrivateSellerPage({characterId,pageSize,afterListingId}={}){
 return who(characterId)&&Number.isSafeInteger(pageSize)&&
  pageSize>=1&&pageSize<=50&&(afterListingId===null||uuid(afterListingId));
}
export function createGame3DPrivateSellerBoard({pool,resolveAuthenticatedSubject}={}){
 if(!pool?.connect||!pool?.query||
    typeof resolveAuthenticatedSubject!=='function')
  throw Error('Seller preview requires private PG and trusted account identity');
 const guard=createGame3DAccountScopeGuard({pool,resolveAuthenticatedSubject});
 const list=async({serverRequestContext,characterId,pageSize=20,
  afterListingId=null}={})=>{
  if(!validatePrivateSellerPage({characterId,pageSize,afterListingId}))
   return {ok:false,code:'invalid_seller_page',listings:[]};
  const authorized=await guard.authorizeRead({serverRequestContext,characterId});
  if(!authorized.ok)return {ok:false,code:'unverified_seller_owner',listings:[]};
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const r=await c.query(
    'SELECT l.listing_id,l.item_instance_id,l.record_kind,'+
    'l.payment_enabled,l.transfer_enabled,i.definition_id,'+
    's.slot_index AS inventory_slot,e.item_instance_id AS equipped_id '+
    'FROM game3d_market_listing_candidate l '+
    'JOIN game3d_item_issuance i ON i.item_instance_id=l.item_instance_id '+
    'AND i.owner_id=l.owner_id AND i.character_id=l.character_id '+
    'LEFT JOIN game3d_inventory_slot s ON s.item_instance_id=l.item_instance_id '+
    'AND s.owner_id=l.owner_id AND s.character_id=l.character_id '+
    'LEFT JOIN game3d_character_equipment e ON e.item_instance_id=l.item_instance_id '+
    'AND e.owner_id=l.owner_id AND e.character_id=l.character_id '+
    'WHERE l.owner_id=$1 AND l.character_id=$2 AND '+
    '($3::uuid IS NULL OR l.listing_id>$3::uuid) '+
    'ORDER BY l.listing_id LIMIT $4',
    [authorized.accountId,characterId,afterListingId,pageSize+1]);
   await c.query('COMMIT');
   const listings=r.rows.slice(0,pageSize).map(row=>{
    const custody=isPrivateMarketCustodyConsistent({
     inventorySlot:row.inventory_slot,equippedId:row.equipped_id});
    const safe=row.record_kind==='private_preview'&&
     row.payment_enabled===false&&row.transfer_enabled===false;
    return {listingId:String(row.listing_id),itemInstanceId:String(row.item_instance_id),
     definitionId:row.definition_id,
     privatePreviewConsistent:custody&&safe,inventoryAllocated:custody,
     publiclyListed:false,provenanceIndependentlyVerified:false,
     buyEnabled:false,sellEnabled:false,escrowEnabled:false};
   });
   return {ok:true,characterId,listings,
    hasMore:r.rows.length>pageSize,
    nextCursor:r.rows.length>pageSize?listings.at(-1)?.listingId:null,
    privateOwnerOnly:true,previewOnly:true,
    publicMarketplaceEnabled:false,paymentAuthorized:false};
  }catch(e){try{await c.query('ROLLBACK')}catch{}throw e}
  finally{c.release()}
 };
 return Object.freeze({list});
}
