import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DBlacksmithSelection} from '../blacksmithSelection.mjs';
test('Blacksmith denies an issued item without its full source chain',async()=>{
 const pool={
  query:async()=>({rowCount:1,rows:[{owner_id:'owner1',character_id:'hero1',revision:0}]}),
  connect:async()=>({query:async(sql)=>{
   if(sql.includes('FROM game3d_inventory_slot'))return {rowCount:1,rows:[{
     item_instance_id:'11111111-1111-4111-8111-111111111111',
     definition_id:'sword',slot_index:0,equipment_slot:null,listing_id:null,
     issued:null,event:null,completion:null,simulation:null}]};
   return {rowCount:0,rows:[]};
  },release:()=>{}})
 };
 const x=createGame3DBlacksmithSelection({pool,
  resolveAuthenticatedSubject:async()=>({authenticated:true,identitySource:'trusted-server-session',accountId:'owner1'})});
 const r=await x.inspect({characterId:'hero1',itemInstanceId:'11111111-1111-4111-8111-111111111111'});
 assert.equal(r.ok,false);
 assert.equal(r.code,'source_provenance_inconsistent');
});
