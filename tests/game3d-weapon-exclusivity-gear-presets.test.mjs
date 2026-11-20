import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_AXE_GEAR_PRESETS, MAX_AXE_EQUIPPED_WEAPONS,
  normalizeAXEEquippedWeapons, equipOnlyAXEWeapon, applyAXEEquipmentPresetRules,
} from '../src/components/game3d/axe/equipment/AXEWeaponLoadoutRules.mjs';

const weapon=(id,equipped=false)=>({instanceId:id,slot:'weapon',category:'weapon',equipped});
const armor=(id,slot,equipped=false)=>({instanceId:id,slot,category:slot,equipped});
const limits={weapon:{maxEquipped:3},chest:{maxEquipped:1},ring:{maxEquipped:2}};

test('migration preserves three genuinely equipped weapons and one active weapon',()=>{
  const items=[weapon('sword',true),weapon('shield',true),weapon('bow',true),weapon('fourth',true)];
  const normalized=normalizeAXEEquippedWeapons(items,'bow');
  assert.equal(normalized.activeWeaponInstanceId,'bow');
  assert.equal(normalized.items.filter(x=>x.slot==='weapon'&&x.equipped).length,3);
  assert.ok(normalized.items.find(x=>x.instanceId==='bow').equipped);
  assert.equal(normalized.items.length,4,'owned weapons must not be deleted');
  assert.equal(MAX_AXE_EQUIPPED_WEAPONS,3);
});
test('equipping a second or third weapon keeps the others equipped',()=>{
  const items=[weapon('sword',true),weapon('shield'),weapon('bow'),armor('robe','chest',true)];
  const second=equipOnlyAXEWeapon(items,'shield',{activeInstanceId:'sword',activate:false});
  assert.equal(second.ok,true);
  assert.equal(second.activeWeaponInstanceId,'sword');
  const third=equipOnlyAXEWeapon(second.items,'bow',{activeInstanceId:'sword',activate:false});
  assert.equal(third.ok,true);
  assert.deepEqual(third.items.filter(x=>x.slot==='weapon'&&x.equipped).map(x=>x.instanceId),['sword','shield','bow']);
  assert.deepEqual(third.autoUnequippedIds,[]);
});
test('fourth weapon requires choosing a specific slot, never silently drops gear',()=>{
  const before=[weapon('sword',true),weapon('shield',true),weapon('bow',true),weapon('new')];
  assert.equal(equipOnlyAXEWeapon(before,'new').reason,'WEAPON_SLOTS_FULL');
  const result=equipOnlyAXEWeapon(before,'new',{
    replaceInstanceId:'shield',activeInstanceId:'sword',activate:false,
  });
  assert.equal(result.ok,true);
  assert.deepEqual(result.autoUnequippedIds,['shield']);
  assert.deepEqual(result.items.filter(x=>x.equipped).map(x=>x.instanceId),['sword','bow','new']);
  assert.equal(result.activeWeaponInstanceId,'sword');
});
test('owned but unselected bow is not equipped automatically',()=>{
  const normalized=normalizeAXEEquippedWeapons([weapon('sword',true),weapon('bow')]);
  assert.equal(normalized.activeWeaponInstanceId,'sword');
  assert.equal(normalized.items[1].equipped,false);
});
test('empty weapon loadout remains empty',()=>{
  const normalized=normalizeAXEEquippedWeapons([weapon('sword'),weapon('bow')]);
  assert.equal(normalized.activeWeaponInstanceId,null);
  assert.deepEqual(normalized.items.map(x=>x.equipped),[false,false]);
});
test('equipment presets restore three weapons and preserve armor limits',()=>{
  const before=[weapon('sword',true),weapon('bow'),weapon('shield'),armor('cloth','chest',true),
    armor('plate','chest'),armor('ring','ring',true)];
  const next=applyAXEEquipmentPresetRules(before,['sword','bow','shield','plate','ring'],limits);
  assert.equal(next.ok,true);
  assert.deepEqual(next.items.filter(x=>x.equipped).map(x=>x.instanceId),['sword','bow','shield','plate','ring']);
  assert.equal(next.activeWeaponInstanceId,'sword');
  assert.equal(applyAXEEquipmentPresetRules(before,['bow','sword','shield','missing'],limits).reason,'PRESET_ITEM_MISSING');
  assert.equal(applyAXEEquipmentPresetRules(before,['plate','cloth'],limits).reason,'PRESET_SLOT_CONFLICT');
  assert.equal(applyAXEEquipmentPresetRules(before,['bow','bow'],limits).reason,'INVALID_PRESET');
});
test('three independent gear preset preferences remain',()=>assert.equal(MAX_AXE_GEAR_PRESETS,3));
