// Inventory Foundation 15.8 — an atomic READ snapshot of inventory + equipment.
// Must be called only after trusted server-side account authorization.
import {parsePrivateInventoryRevision,projectGame3DInventorySlots} from './inventorySlotRead.mjs';
import {reviewCharacterEquipmentSnapshot} from './characterEquipmentSnapshot.mjs';
import {reconcileGame3DInventoryEquipment} from './inventoryEquipmentReconcile.mjs';
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const deny=code=>({ok:false,code,sourceSnapshotsAtomic:false,
 equipmentStatsAuthorized:false,tradingEnabled:false});
export function createGame3DAtomicLoadoutReviewer({pool}={}){
 if(!pool?.connect)throw Error('Atomic loadout review requires private PG');
 const inspect=async({ownerId,characterId}={})=>{
  if(!who(ownerId)||!who(characterId))return deny('invalid_owner_scope');
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const [invState,equipState]=await Promise.all([
    c.query('SELECT revision FROM game3d_inventory_state WHERE owner_id=$1 AND character_id=$2',
     [ownerId,characterId]),
    c.query('SELECT revision FROM game3d_character_equipment_revision WHERE owner_id=$1 AND character_id=$2',
     [ownerId,characterId])
   ]);
   if(invState.rowCount!==1||equipState.rowCount!==1)
    throw Error('Missing inventory or equipment revision');
   const invRevision=parsePrivateInventoryRevision(invState.rows[0].revision),
    equipRevision=parsePrivateInventoryRevision(equipState.rows[0].revision);
   if(invRevision===null||equipRevision===null)throw Error('Invalid loadout revision');
   const [invRows,equipRows]=await Promise.all([
    c.query('SELECT s.owner_id,s.character_id,s.slot_index,s.item_instance_id,'+
     'i.definition_id,e.equipment_slot,l.listing_id FROM game3d_inventory_slot s '+
     'JOIN game3d_item_issuance i ON i.item_instance_id=s.item_instance_id '+
     'AND i.owner_id=s.owner_id AND i.character_id=s.character_id '+
     'LEFT JOIN game3d_character_equipment e ON e.item_instance_id=s.item_instance_id '+
     'AND e.owner_id=s.owner_id AND e.character_id=s.character_id '+
     'LEFT JOIN game3d_market_listing_candidate l ON l.item_instance_id=s.item_instance_id '+
     'AND l.owner_id=s.owner_id AND l.character_id=s.character_id '+
     'WHERE s.owner_id=$1 AND s.character_id=$2 ORDER BY s.slot_index LIMIT 201',
     [ownerId,characterId]),
    c.query('SELECT r.revision,eq.equipment_slot,eq.item_instance_id AS equipped_item_id,'+
     'row_to_json(i) AS issued,row_to_json(e) AS event,'+
     'row_to_json(cs) AS completion,row_to_json(sr) AS simulation '+
     'FROM game3d_character_equipment_revision r '+
     'LEFT JOIN game3d_character_equipment eq ON eq.owner_id=r.owner_id '+
     'AND eq.character_id=r.character_id '+
     'LEFT JOIN game3d_item_issuance i ON i.item_instance_id=eq.item_instance_id '+
     'AND i.owner_id=r.owner_id AND i.character_id=r.character_id '+
     'LEFT JOIN game3d_verified_gameplay_event e ON e.event_id::text=i.source_event_id '+
     'LEFT JOIN game3d_server_completion_source cs ON cs.completion_id=e.completion_id '+
     'LEFT JOIN game3d_simulation_completion_receipt sr ON sr.completion_id=cs.completion_id '+
     'WHERE r.owner_id=$1 AND r.character_id=$2 '+
     'ORDER BY eq.equipment_slot NULLS FIRST LIMIT 25',[ownerId,characterId])
   ]);
   const inventory=projectGame3DInventorySlots({
    ownerId,characterId,rows:invRows.rows,revision:invRevision});
   const equipment=reviewCharacterEquipmentSnapshot({
    ownerId,characterId,expectedRevision:equipRevision,rows:equipRows.rows});
   const review=reconcileGame3DInventoryEquipment({inventory,equipment});
   await c.query('COMMIT');
   return {...review,sourceSnapshotsAtomic:true,readOnly:true,
    inventory,equipment,
    equipmentStatsAuthorized:false,marketplaceTradingEnabled:false};
  }catch(error){try{await c.query('ROLLBACK')}catch{}throw error}
  finally{c.release()}
 };
 return Object.freeze({inspect});
}
