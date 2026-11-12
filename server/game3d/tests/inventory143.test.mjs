import test from 'node:test';import assert from 'node:assert/strict';
import {createPrivateInventoryReader} from '../privateInventoryReader.mjs';
test('private inventory reads allocated slots, not every historical issuance',async()=>{
 const seen=[];
 const pool={
  query:async()=>({rowCount:1,rows:[{owner_id:'owner1',character_id:'hero1',revision:0}]}),
  connect:async()=>({query:async(sql)=>{
   seen.push(sql);
   if(sql.includes('SELECT i.item_instance_id'))return {rows:[{item_instance_id:'11111111-1111-4111-8111-111111111111',definition_id:'sword',source_kind:'quest',slot_index:3,equipment_slot:null,listing_id:null}]};
   return {rows:[]};
  },release:()=>{}})
 };
 const reader=createPrivateInventoryReader({pool,
  resolveAuthenticatedSubject:async()=>({authenticated:true,
    identitySource:'trusted-server-session',accountId:'owner1'})});
 const response=await reader.list({characterId:'hero1',pageSize:25});
 assert.equal(response.items[0].inventorySlot,3);
 assert.ok(seen.some(sql=>sql.includes('FROM game3d_inventory_slot s')));
});
