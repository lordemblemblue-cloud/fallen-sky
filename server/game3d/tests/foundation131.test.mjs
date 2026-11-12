import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileGame3DInventoryEquipment} from '../inventoryEquipmentReconcile.mjs';
test('equipped item absent from server inventory fails closed',()=>{const result=reconcileGame3DInventoryEquipment({inventory:{ok:true,ownerId:'o',characterId:'c',revision:'1',slots:[]},equipment:{ok:true,ownerId:'o',characterId:'c',revision:1,equipped:[{slot:'main_hand',itemInstanceId:'item'}]}});assert.equal(result.ok,false);assert.equal(result.combatBonusesEnabled,false)});
