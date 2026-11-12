// Combat 9.8 — authenticated, consistent private-market preview audit.
// Not a listing, transfer, payment or escrow execution endpoint.
import {createGame3DAccountScopeGuard} from './accountScopeGuard.mjs';
import {reviewPrivateMarketPreview} from './marketListingPreview.mjs';
import {inspectMarketplaceItemSource} from './marketplaceSourceAudit.mjs';
import {isPrivateMarketCustodyConsistent} from './marketPreviewAudit.mjs';
const id=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const denied=code=>({ok:false,code,
 listingAuthorized:false,paymentAuthorized:false,
 transferAuthorized:false,escrowAuthorized:false});
export function createAuthenticatedMarketReview({pool,resolveAuthenticatedSubject}={}){
 if(!pool?.connect||!pool?.query||
    typeof resolveAuthenticatedSubject!=='function')
  throw Error('9.8 requires private PG and real server authentication');
 const accounts=createGame3DAccountScopeGuard({pool,resolveAuthenticatedSubject});
 const inspect=async({serverRequestContext,characterId,listingId}={})=>{
  if(!key(characterId)||!id(listingId))return denied('invalid_market_identity');
  const auth=await accounts.authorizeRead({serverRequestContext,characterId});
  if(!auth.ok)return denied('unauthorized_market_character');
  const ownerId=auth.accountId,c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const r=await c.query(
    'SELECT row_to_json(l) AS listing,row_to_json(i) AS issued,'+
    'row_to_json(e) AS event,row_to_json(s) AS completion,'+
    'row_to_json(sim) AS simulation,'+
    'eq.item_instance_id AS equipped_id,'+
    'inv.slot_index AS inventory_slot '+ 
    'FROM game3d_market_listing_candidate l '+
    'LEFT JOIN game3d_item_issuance i '+
    'ON i.item_instance_id=l.item_instance_id AND i.owner_id=l.owner_id '+
    'AND i.character_id=l.character_id '+
    'LEFT JOIN game3d_verified_gameplay_event e '+
    'ON e.event_id::text=i.source_event_id '+
    'LEFT JOIN game3d_server_completion_source s '+
    'ON s.completion_id=e.completion_id '+
    'LEFT JOIN game3d_simulation_completion_receipt sim '+
    'ON sim.completion_id=s.completion_id '+
    'LEFT JOIN game3d_character_equipment eq '+
    'ON eq.item_instance_id=l.item_instance_id '+
    'AND eq.owner_id=l.owner_id AND eq.character_id=l.character_id '+
    'LEFT JOIN game3d_inventory_slot inv '+
    'ON inv.item_instance_id=l.item_instance_id AND '+
    'inv.owner_id=l.owner_id AND inv.character_id=l.character_id '+
    'WHERE l.listing_id=$1 AND l.owner_id=$2 AND l.character_id=$3',
    [listingId,ownerId,characterId]);
   const row=r.rows[0],itemId=row?.listing?
    String(row.listing.item_instance_id):'';
   const listing=reviewPrivateMarketPreview({
    row:row?.listing,ownerId,characterId,itemInstanceId:itemId});
   const evidence=inspectMarketplaceItemSource({
    ownerId,characterId,itemInstanceId:itemId,
    evidence:{issued:row?.issued,event:row?.event,
     completion:row?.completion,simulation:row?.simulation}});
   await c.query('COMMIT');
   const custody=isPrivateMarketCustodyConsistent({
    inventorySlot:row?.inventory_slot,equippedId:row?.equipped_id});
   const consistent=r.rowCount===1&&listing.ok&&evidence.ok&&custody;
   return {ok:consistent,
    ...(consistent?{
     itemInstanceId:itemId,sourceIntegrityDigest:evidence.sourceIntegrityDigest,
     inventorySlot:Number(row.inventory_slot),
    }:{}),
    ownerId,characterId,listingId,
    provenanceConsistent:evidence.ok,
    itemCurrentlyUnequipped:row?.equipped_id==null,
    itemCurrentlyAllocatedToOwner:custody,
    // There is no trusted trade currency/conservation ledger yet.
    listingAuthorized:false,paymentAuthorized:false,
    transferAuthorized:false,escrowAuthorized:false,
    publicMarketplaceEnabled:false};
  }catch(error){try{await c.query('ROLLBACK')}catch{}throw error}
  finally{c.release()}
 };
 return Object.freeze({inspect});
}
