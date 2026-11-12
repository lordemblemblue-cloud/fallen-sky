import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DInventoryReorder} from '../inventoryReorder.mjs';
test('reserved item blocks reorder before slot deletion',async()=>{
 const statements=[];
 const pool={
  query:async()=>({rowCount:1,rows:[{owner_id:'owner1',character_id:'hero1',revision:0}]}),
  connect:async()=>({query:async(sql)=>{
   statements.push(sql);
   if(sql.includes('SELECT revision FROM game3d_inventory_state'))
    return {rowCount:1,rows:[{revision:0}]};
   if(sql.includes('SELECT request_digest'))return {rowCount:0,rows:[]};
   if(sql.includes('SELECT slot_index,item_instance_id'))return {rowCount:1,rows:[{slot_index:0,item_instance_id:'11111111-1111-4111-8111-111111111111'}]};
   if(sql.includes('SELECT item_instance_id FROM game3d_market_listing_candidate'))
    return {rowCount:1,rows:[{item_instance_id:'11111111-1111-4111-8111-111111111111'}]};
   return {rowCount:0,rows:[]};
  },release:()=>{}})
 };
 const s=createGame3DInventoryReorder({pool,
  resolveAuthenticatedSubject:async()=>({authenticated:true,
   identitySource:'trusted-server-session',accountId:'owner1'})});
 await assert.rejects(()=>s.move({characterId:'hero1',operationId:'move1',
  expectedRevision:0,fromIndex:0,toIndex:1}),/Market-reserved/);
 assert.equal(statements.some(sql=>sql.includes('DELETE FROM game3d_inventory_slot')),false);
});
