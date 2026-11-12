// Inventory Foundation 15.9 — read-only 200-slot Inventory HUD contract.
// Never display browser-supplied placeholder counts as real server capacity.
export function projectGame3DInventoryHud(inventory){
 const fail=code=>({ok:false,code,canEquip:false,canTrade:false});
 if(inventory?.ok!==true||inventory.capacity!==200||
    !Array.isArray(inventory.slots)||inventory.slots.length>200||
    !Number.isSafeInteger(inventory.count)||inventory.count!==inventory.slots.length)
  return fail('invalid_inventory_snapshot');
 const ids=new Set(),indices=new Set();
 let equipped=0,reserved=0;
 for(const row of inventory.slots){
  if(!Number.isSafeInteger(row?.slot)||row.slot<0||row.slot>=200||
     indices.has(row.slot)||typeof row.itemInstanceId!=='string'||
     ids.has(row.itemInstanceId)||row.itemInstanceId.length<1)
   return fail('invalid_inventory_item');
  indices.add(row.slot);ids.add(row.itemInstanceId);
  if(row.equippedSlot!=null)equipped++;
  if(row.reservedForMarket===true)reserved++;
  if(row.equippedSlot!=null&&row.reservedForMarket===true)
   return fail('equipped_item_reserved');
 }
 return Object.freeze({
  ok:true,capacity:200,occupied:inventory.count,remaining:200-inventory.count,
  inventoryLabel:inventory.count+'/200',
  equippedCount:equipped,marketPreviewReservedCount:reserved,
  revision:String(inventory.revision),
  readOnly:true,canEquip:false,canTrade:false,
  genuineItemRewardsVerified:false,
 });
}
