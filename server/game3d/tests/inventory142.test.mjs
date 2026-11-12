import test from 'node:test';import assert from 'node:assert/strict';
import {projectGame3DInventorySlots} from '../inventorySlotRead.mjs';
const item={owner_id:'owner1',character_id:'hero1',slot_index:1,
 item_instance_id:'11111111-1111-4111-8111-111111111111',
 definition_id:'axe_sword',equipment_slot:null,listing_id:null};
test('inventory projection rejects forged IDs, equipment names and duplicates',()=>{
 const base={ownerId:'owner1',characterId:'hero1',revision:1,rows:[item]};
 assert.equal(projectGame3DInventorySlots(base).ok,true);
 assert.equal(projectGame3DInventorySlots({...base,rows:[{...item,item_instance_id:'not-a-uuid'}]}).ok,false);
 assert.equal(projectGame3DInventorySlots({...base,rows:[{...item,equipment_slot:'../../other'}]}).ok,false);
 assert.equal(projectGame3DInventorySlots({...base,rows:[item,item]}).ok,false);
});
