// Foundation 12.8 — private inventory slot projection, source-only.
import {GAME3D_INVENTORY_CAPACITY} from './issuedInventoryRead.mjs';
const uuid=x=>typeof x==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function parsePrivateInventoryRevision(value){
 if(typeof value==='number')return Number.isSafeInteger(value)&&value>=0?value:null;
 if(typeof value!=='string'||!/^(0|[1-9][0-9]*)$/.test(value))return null;
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>=0?n:null;
}
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
export function projectGame3DInventorySlots({ownerId,characterId,
 rows,revision}={}){
 const bad=code=>({ok:false,code,capacity:GAME3D_INVENTORY_CAPACITY});
 if(!who(ownerId)||!who(characterId)||
    parsePrivateInventoryRevision(revision)===null||
    !Array.isArray(rows)||rows.length>GAME3D_INVENTORY_CAPACITY)
  return bad('invalid_inventory_scope');
 const indices=new Set(),ids=new Set(),slots=[];
 for(const r of rows){
  const slot=Number(r.slot_index),id=String(r.item_instance_id);
  if(r.owner_id!==ownerId||r.character_id!==characterId||
     !Number.isSafeInteger(slot)||slot<0||slot>=200||
     indices.has(slot)||ids.has(id)||!uuid(id)||
     typeof r.definition_id!=='string'||!r.definition_id||
     (r.equipment_slot!=null&&
       (typeof r.equipment_slot!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(r.equipment_slot)))||
     (r.listing_id!=null&&!uuid(String(r.listing_id))))
   return bad('invalid_inventory_item_or_slot');
  indices.add(slot);ids.add(id);
  slots.push({slot,itemInstanceId:id,definitionId:r.definition_id,
   equippedSlot:r.equipment_slot??null,
   reservedForMarket:r.listing_id!=null});
 }
 slots.sort((a,b)=>a.slot-b.slot);
 return {ok:true,ownerId,characterId,
  revision:String(revision),count:slots.length,capacity:200,slots,
  tradeAuthorized:false,source:'private-inventory-slots'};
}
export function createGame3DInventorySlotReader({pool}={}){
 if(!pool?.connect)throw Error('Inventory slot reader requires private PostgreSQL');
 const inspect=async({ownerId,characterId}={})=>{
  if(!who(ownerId)||!who(characterId))throw Error('Invalid inventory account');
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const state=await c.query(
    'SELECT revision FROM game3d_inventory_state '+
    'WHERE owner_id=$1 AND character_id=$2',[ownerId,characterId]);
   if(state.rowCount!==1)throw Error('Inventory state not initialized');
   const r=await c.query(
    'SELECT s.owner_id,s.character_id,s.slot_index,s.item_instance_id,'+
    'i.definition_id,e.equipment_slot,l.listing_id '+
    'FROM game3d_inventory_slot s JOIN game3d_item_issuance i '+
    'ON i.item_instance_id=s.item_instance_id '+
    'AND i.owner_id=s.owner_id AND i.character_id=s.character_id '+
    'LEFT JOIN game3d_character_equipment e '+
    'ON e.item_instance_id=s.item_instance_id '+
    'AND e.owner_id=s.owner_id AND e.character_id=s.character_id '+
    'LEFT JOIN game3d_market_listing_candidate l '+
    'ON l.item_instance_id=s.item_instance_id '+
    'AND l.owner_id=s.owner_id AND l.character_id=s.character_id '+
    'WHERE s.owner_id=$1 AND s.character_id=$2 '+
    'ORDER BY s.slot_index LIMIT 201',[ownerId,characterId]);
   const result=projectGame3DInventorySlots({ownerId,characterId,
    rows:r.rows,revision:state.rows[0].revision});
   await c.query('COMMIT');return result;
  }catch(e){try{await c.query('ROLLBACK')}catch{}throw e}
  finally{c.release()}
 };
 return Object.freeze({inspect});
}
