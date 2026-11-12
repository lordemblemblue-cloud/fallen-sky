// Foundation 12.4 — account-scoped 200-item inventory overview.
// Issuance is append-only, NOT proof of game-server-earned or tradeable gear.
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
export const GAME3D_INVENTORY_CAPACITY=200;
export function projectIssuedInventory({ownerId,characterId,rows}={}){
 if(!who(ownerId)||!who(characterId)||!Array.isArray(rows)||
    rows.length>GAME3D_INVENTORY_CAPACITY)
  return {ok:false,code:'inventory_scope_or_capacity_invalid',readOnly:true};
 const seen=new Set(),items=[];
 for(const row of rows){
  if(!row||row.owner_id!==ownerId||row.character_id!==characterId||
     typeof row.item_instance_id!=='string'||
     seen.has(row.item_instance_id)||
     typeof row.definition_id!=='string')
   return {ok:false,code:'corrupt_owned_inventory_rows',readOnly:true};
  seen.add(row.item_instance_id);
  items.push({itemInstanceId:row.item_instance_id,
   definitionId:row.definition_id,
   equippedSlot:row.equipment_slot??null,
   marketPreviewReserved:row.listing_id!=null,
   tradeAuthorized:false,competitiveStatsVerified:false});
 }
 return {ok:true,ownerId,characterId,count:items.length,
  capacity:GAME3D_INVENTORY_CAPACITY,items,
  source:'private-issuance-view',readOnly:true,
  ownershipProvenanceIndependentlyVerified:false,
  itemTransferAllowed:false};
}
export function createGame3DIssuedInventoryRead({pool}={}){
 if(!pool?.connect)throw Error('Inventory read requires private PG');
 const inspect=async({ownerId,characterId}={})=>{
  if(!who(ownerId)||!who(characterId))throw Error('Invalid inventory owner');
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const r=await c.query(
    'SELECT i.item_instance_id::text AS item_instance_id,i.owner_id,'+
    'i.character_id,i.definition_id,e.equipment_slot,'+
    'l.listing_id FROM game3d_item_issuance i '+
    'LEFT JOIN game3d_character_equipment e '+
    'ON e.item_instance_id=i.item_instance_id '+
    'LEFT JOIN game3d_market_listing_candidate l '+
    'ON l.item_instance_id=i.item_instance_id '+
    'WHERE i.owner_id=$1 AND i.character_id=$2 '+
    'ORDER BY i.created_at,i.item_instance_id LIMIT 201',
    [ownerId,characterId]);
   const out=projectIssuedInventory({ownerId,characterId,rows:r.rows});
   await c.query('COMMIT');return out;
  }catch(e){try{await c.query('ROLLBACK')}catch{}throw e}
  finally{c.release()}
 };
 return Object.freeze({inspect});
}
