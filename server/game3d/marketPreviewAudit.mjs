// Combat 8.7 — authenticated-backend-only, read-only listing review.
// No browser endpoint and no trade/escrow payment writer.
import {reviewPrivateMarketPreview} from './marketListingPreview.mjs';
import {inspectMarketplaceItemSource} from './marketplaceSourceAudit.mjs';
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
export function isPrivateMarketCustodyConsistent({inventorySlot,equippedId}={}){
 const slot=typeof inventorySlot==='number'?inventorySlot:
  typeof inventorySlot==='string'&&/^(0|[1-9][0-9]*)$/.test(inventorySlot)?
    Number(inventorySlot):null;
 return slot!==null&&Number.isSafeInteger(slot)&&slot>=0&&slot<200&&
  equippedId==null;
}
export function createMarketPreviewAudit({pool}={}){
 if(!pool?.connect)throw Error('8.7 requires private PG');
 const inspect=async({ownerId,characterId,listingId}={})=>{
  if(!who(ownerId)||!who(characterId)||!uuid(listingId))
   throw Error('Invalid private market listing scope');
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const r=await c.query(
    'SELECT row_to_json(l) AS listing,row_to_json(i) AS issued,'+
    'row_to_json(e) AS event,row_to_json(src) AS completion,'+
    'row_to_json(sim) AS simulation,'+
    'eq.item_instance_id AS equipped_id,inv.slot_index AS inventory_slot '+
    'FROM game3d_market_listing_candidate l '+
    'LEFT JOIN game3d_item_issuance i '+
    'ON i.item_instance_id=l.item_instance_id AND i.owner_id=l.owner_id '+
    'AND i.character_id=l.character_id '+
    'LEFT JOIN game3d_verified_gameplay_event e ON e.event_id::text=i.source_event_id '+
    'LEFT JOIN game3d_server_completion_source src ON src.completion_id=e.completion_id '+
    'LEFT JOIN game3d_simulation_completion_receipt sim ON sim.completion_id=src.completion_id '+
    'LEFT JOIN game3d_character_equipment eq ON eq.item_instance_id=l.item_instance_id '+
    'AND eq.owner_id=l.owner_id AND eq.character_id=l.character_id '+
    'LEFT JOIN game3d_inventory_slot inv ON inv.item_instance_id=l.item_instance_id '+
    'AND inv.owner_id=l.owner_id AND inv.character_id=l.character_id '+
    'WHERE l.listing_id=$1 AND l.owner_id=$2 AND l.character_id=$3',
    [listingId,ownerId,characterId]);
   const row=r.rows[0];
   const itemId=row?.listing?String(row.listing.item_instance_id):'';
   const listing=reviewPrivateMarketPreview({
    row:row?.listing,ownerId,characterId,itemInstanceId:itemId});
   const evidence=inspectMarketplaceItemSource({
    ownerId,characterId,itemInstanceId:itemId,
    evidence:{issued:row?.issued,event:row?.event,
     completion:row?.completion,simulation:row?.simulation},
   });
   await c.query('COMMIT');
   const custody=isPrivateMarketCustodyConsistent({
    inventorySlot:row?.inventory_slot,equippedId:row?.equipped_id});
   return {ok:listing.ok&&evidence.ok&&custody,listingId,ownerId,
    characterId,sourceConsistencyObserved:evidence.ok,
    inventoryAllocated:custody,gearCurrentlyEquipped:row?.equipped_id!=null,
    listingPermitted:false,tradingEnabled:false,
    escrowAuthorized:false,paymentAuthorized:false};
  }catch(e){try{await c.query('ROLLBACK')}catch{}throw e}
  finally{c.release()}
 };
 return Object.freeze({inspect});
}
