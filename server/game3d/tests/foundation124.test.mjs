import test from 'node:test';import assert from 'node:assert/strict';
import {projectIssuedInventory} from '../issuedInventoryRead.mjs';
test('inventory shows exact 200 cap and denies mixed character items',()=>{const x=projectIssuedInventory({ownerId:'o',characterId:'c',rows:[]});assert.equal(x.capacity,200);assert.equal(x.ok,true);assert.equal(projectIssuedInventory({ownerId:'o',characterId:'c',rows:[{owner_id:'stranger',character_id:'c',item_instance_id:'id',definition_id:'blade'}]}).ok,false)});
