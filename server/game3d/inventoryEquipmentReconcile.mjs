// Foundation 14.7 — validate full server inventory/equipment consistency.
// A consistent snapshot cannot by itself enable PvP stat bonuses.
export function reconcileGame3DInventoryEquipment({inventory,equipment}={}){
 const fail=code=>({ok:false,code,combatBonusesEnabled:false,
  tradingEnabled:false});
 if(!inventory?.ok||!equipment?.ok||
    inventory.ownerId!==equipment.ownerId||
    inventory.characterId!==equipment.characterId||
    !Array.isArray(inventory.slots)||!Array.isArray(equipment.equipped))
  return fail('inventory_equipment_scope_mismatch');
 const index=x=>Number.isSafeInteger(x)&&x>=0&&x<200;
 const safeRevision=x=>(typeof x==='string'&&/^(0|[1-9][0-9]*)$/.test(x)||
  typeof x==='number'&&Number.isSafeInteger(x))&&
  Number.isSafeInteger(Number(x))&&Number(x)>=0;
 if(!safeRevision(inventory.revision)||!safeRevision(equipment.revision)||
    inventory.capacity!==200||inventory.count!==inventory.slots.length||
    inventory.slots.length>200||equipment.equipped.length>24)
  return fail('inventory_or_equipment_revision_invalid');
 const indices=new Set(),slots=new Set();
 for(const item of inventory.slots){
  if(!index(item?.slot)||indices.has(item.slot))
   return fail('duplicate_or_invalid_inventory_slot');
  indices.add(item.slot);
 }
 for(const equip of equipment.equipped){
  if(typeof equip?.slot!=='string'||
     !/^[A-Za-z0-9_-]{1,32}$/.test(equip.slot)||
     slots.has(equip.slot))
   return fail('duplicate_or_invalid_equipment_slot');
  slots.add(equip.slot);
 }
 const byId=new Map();
 for(const row of inventory.slots){
  if(byId.has(row.itemInstanceId))return fail('duplicate_inventory_item');
  byId.set(row.itemInstanceId,row);
 }
 for(const row of equipment.equipped){
  const item=byId.get(row.itemInstanceId);
  if(!item||item.equippedSlot!==row.slot||
     item.reservedForMarket===true)
   return fail('equipped_item_not_safely_in_inventory');
 }
 for(const item of inventory.slots){
  if(item.equippedSlot!=null&&!equipment.equipped.some(
     row=>row.itemInstanceId===item.itemInstanceId&&
     row.slot===item.equippedSlot))
   return fail('inventory_equipment_projection_disagrees');
 }
 return {ok:true,ownerId:inventory.ownerId,
  characterId:inventory.characterId,
  inventoryRevision:inventory.revision,
  equipmentRevision:equipment.revision,
  consistent:true,combatBonusesEnabled:false,
  tradingEnabled:false};
}
