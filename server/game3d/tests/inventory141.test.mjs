import test from 'node:test';import assert from 'node:assert/strict';
import {validatePrivateInventoryPage} from '../privateInventoryReader.mjs';
test('invalid inventory page and non-UUID cursor fail before a query',()=>{
 const good={characterId:'hero1',pageSize:25,afterItemId:null};
 assert.equal(validatePrivateInventoryPage(good).ok,true);
 for(const bad of [{...good,pageSize:200},{...good,pageSize:1.5},
   {...good,pageSize:0},{...good,characterId:'__anon__'},
   {...good,afterItemId:'x'.repeat(36)}])
  assert.equal(validatePrivateInventoryPage(bad).ok,false);
});
