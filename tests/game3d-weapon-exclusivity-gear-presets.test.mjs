import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_AXE_GEAR_PRESETS, normalizeAXEEquippedWeapons, equipOnlyAXEWeapon,
  applyAXEEquipmentPresetRules,
} from '../src/components/game3d/axe/equipment/AXEWeaponLoadoutRules.mjs';
const weapon = (id, equipped = false) => ({ instanceId: id, slot: 'weapon', category: 'weapon', equipped });
const armor = (id, slot, equipped = false) => ({ instanceId: id, slot, category: slot, equipped });
const limits = { weapon: {maxEquipped:1}, chest: {maxEquipped:1}, ring: {maxEquipped:2} };

test('existing saves with two equipped weapons retain only the preferred weapon', () => {
  const normalized = normalizeAXEEquippedWeapons([weapon('starter_sword', true), weapon('training_bow', true)], 'training_bow');
  assert.equal(normalized.activeWeaponInstanceId, 'training_bow');
  assert.deepEqual(normalized.items.filter(item => item.equipped).map(item => item.instanceId), ['training_bow']);
});
test('switching bow replaces starter sword in place with no item lost', () => {
  const list=[weapon('starter_sword',true),weapon('training_bow'),armor('robe','chest',true)];
  const next=equipOnlyAXEWeapon(list,'training_bow');
  assert.equal(next.ok,true);
  assert.deepEqual(next.autoUnequippedIds,['starter_sword']);
  assert.equal(next.items.length,3);
  assert.deepEqual(next.items.filter(item=>item.equipped).map(item=>item.instanceId),['training_bow','robe']);
  const back=equipOnlyAXEWeapon(next.items,'starter_sword');
  assert.deepEqual(back.items.filter(item=>item.slot==='weapon'&&item.equipped).map(item=>item.instanceId),['starter_sword']);
});
test('bow is never automatically equipped just because it is owned',()=>{
  const normalized=normalizeAXEEquippedWeapons([weapon('starter_sword',true),weapon('training_bow')]);
  assert.equal(normalized.activeWeaponInstanceId,'starter_sword');
  assert.equal(normalized.items[1].equipped,false);
});
test('empty weapon slot stays empty when loading a save',()=>{
  const normalized=normalizeAXEEquippedWeapons([weapon('starter_sword'),weapon('training_bow')]);
  assert.equal(normalized.activeWeaponInstanceId,null);
  assert.deepEqual(normalized.items.map(x=>x.equipped),[false,false]);
});
test('saved preset equips whole owned set, returns prior gear to inventory',()=>{
  const before=[weapon('sword',true),weapon('bow'),armor('cloth','chest',true),armor('plate','chest'),armor('ring','ring',true)];
  const next=applyAXEEquipmentPresetRules(before,['bow','plate','ring'],limits);
  assert.equal(next.ok,true);
  assert.equal(next.activeWeaponInstanceId,'bow');
  assert.deepEqual(next.items.filter(item=>item.equipped).map(item=>item.instanceId),['bow','plate','ring']);
  assert.equal(next.items.length,before.length);
});
test('missing or conflicting gear aborts a preset without changing live items',()=>{
  const before=[weapon('sword',true),weapon('bow'),armor('cloth','chest',true),armor('plate','chest')];
  assert.equal(applyAXEEquipmentPresetRules(before,['bow','missing'],limits).reason,'PRESET_ITEM_MISSING');
  assert.equal(applyAXEEquipmentPresetRules(before,['bow','sword'],limits).reason,'PRESET_SLOT_CONFLICT');
  assert.equal(applyAXEEquipmentPresetRules(before,['cloth','plate'],limits).reason,'PRESET_SLOT_CONFLICT');
  assert.equal(applyAXEEquipmentPresetRules(before,['bow','bow'],limits).reason,'INVALID_PRESET');
  assert.deepEqual(before.filter(item=>item.equipped).map(item=>item.instanceId),['sword','cloth']);
});
test('gear preset capacity is three independent preferences',()=>assert.equal(MAX_AXE_GEAR_PRESETS,3));
