import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileGame3DInventoryEquipment} from '../inventoryEquipmentReconcile.mjs';
const inventory={ok:true,ownerId:'o',characterId:'c',revision:'1',
 capacity:200,count:1,slots:[{slot:0,itemInstanceId:'item1',equippedSlot:'main_hand',reservedForMarket:false}]};
const equipment={ok:true,ownerId:'o',characterId:'c',revision:0,
 equipped:[{slot:'main_hand',itemInstanceId:'item1'}]};
test('matching inventories pass, duplicate physical slot and stale count fail',()=>{
 assert.equal(reconcileGame3DInventoryEquipment({inventory,equipment}).ok,true);
 assert.equal(reconcileGame3DInventoryEquipment({inventory:{...inventory,count:2},equipment}).ok,false);
 assert.equal(reconcileGame3DInventoryEquipment({inventory:{...inventory,count:2,slots:[...inventory.slots,{...inventory.slots[0],itemInstanceId:'item2'}]},equipment}).ok,false);
 assert.equal(reconcileGame3DInventoryEquipment({inventory,equipment:{...equipment,equipped:[equipment.equipped[0],equipment.equipped[0]]}}).ok,false);
});
