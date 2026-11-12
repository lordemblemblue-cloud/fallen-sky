import test from 'node:test';import assert from 'node:assert/strict';
import {inventoryConstraintGaps} from '../inventorySchemaAudit.mjs';
const defs=[
 {table_name:'game3d_inventory_slot',kind:'f',definition:'FOREIGN KEY (owner_id, character_id) REFERENCES game3d_inventory_state(owner_id, character_id)'},
 {table_name:'game3d_inventory_slot',kind:'f',definition:'FOREIGN KEY (item_instance_id, owner_id, character_id) REFERENCES game3d_item_issuance(item_instance_id, owner_id, character_id)'},
 {table_name:'game3d_inventory_slot',kind:'u',definition:'UNIQUE (item_instance_id)'},
 {table_name:'game3d_inventory_slot',kind:'c',definition:'CHECK ((slot_index >= 0) AND (slot_index <= 199))'},
 {table_name:'game3d_inventory_state',kind:'c',definition:'CHECK (capacity = 200)'}
];
test('the precise inventory ownership and capacity constraints are audited',()=>{
 assert.deepEqual(inventoryConstraintGaps(defs),[]);
 assert.ok(inventoryConstraintGaps(defs.filter(x=>x.kind!=='f')).includes('inventory_slot_issuance_owner_fk'));
 assert.ok(inventoryConstraintGaps(defs.filter(x=>x.kind!=='u')).includes('inventory_slot_item_unique'));
});
