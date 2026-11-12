import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DInventoryAllocation} from '../inventoryAllocation.mjs';
test('missing committed provenance prevents inventory assignment',async()=>{
 const calls=[];
 const pool={connect:async()=>({query:async(sql)=>{
  calls.push(sql);
  if(sql.includes('SELECT revision FROM game3d_inventory_state'))
   return {rowCount:1,rows:[{revision:'0'}]};
  if(sql.includes('SELECT row_to_json(i) AS issued'))
   return {rowCount:1,rows:[{issued:null,event:null,completion:null,simulation:null}]};
  return {rowCount:0,rows:[]};
 },release(){}})};
 const s=createGame3DInventoryAllocation({pool,verifyIssuedItem:async()=>true});
 await assert.rejects(()=>s.allocate({ownerId:'o1',characterId:'c1',
  itemInstanceId:'11111111-1111-4111-8111-111111111111'}),/chain inconsistent/);
 assert.equal(calls.some(sql=>sql.includes('INSERT INTO game3d_inventory_slot')),false);
});
