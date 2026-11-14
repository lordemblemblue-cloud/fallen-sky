import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getAXEEquipmentDisplayStats } from '../src/components/game3d/axe/equipment/AXEEquipmentDisplayStats.mjs';

const chest = Object.freeze({
  instanceId: 'crescent-moon-chest-1',
  baseStats: Object.freeze({ defense: 4, maxHP: 24 }),
  rolledStats: Object.freeze({ defense: 1, maxHP: 6 }),
});

test('Crescent Moon chestplate: raw 5 Defense / 30 HP advances by successful +5% reinforcement', () => {
  const baseline = getAXEEquipmentDisplayStats(chest, 1);
  assert.deepEqual(baseline.map(({stat,base,current}) => ({stat,base,current})), [
    {stat:'defense',base:5,current:5},
    {stat:'maxHP',base:30,current:30},
  ]);
  const upgraded = getAXEEquipmentDisplayStats(chest, 1.05);
  assert.equal(upgraded.find(row => row.stat === 'defense').current, 5.25);
  assert.equal(upgraded.find(row => row.stat === 'maxHP').current, 31.5);
  assert.deepEqual(chest.baseStats, {defense:4,maxHP:24}, 'never mutate the saved original stats');
});

test('flat stats scale with enchantments while crit rates remain unchanged', () => {
  const item = {
    baseStats:{attack:2,critChance:0.5},
    rolledStats:{attack:1,critChance:0.25},
  };
  const rows=getAXEEquipmentDisplayStats(item,1.06);
  assert.ok(Math.abs(rows.find(row=>row.stat==='attack').current-3.18)<1e-9);
  assert.equal(rows.find(row=>row.stat==='critChance').base,0.75);
  assert.equal(rows.find(row=>row.stat==='critChance').current,0.75);
  assert.equal(rows.find(row=>row.stat==='critChance').rate,true);
});

test('missing items, invalid values and companion stat previews are safe', () => {
  assert.deepEqual(getAXEEquipmentDisplayStats(null),[]);
  assert.deepEqual(getAXEEquipmentDisplayStats({stats:{defense:2},rolledStats:{attack:NaN}}),[
    {stat:'defense',base:2,current:2,difference:0,rate:false},
  ]);
  assert.deepEqual(getAXEEquipmentDisplayStats({baseStats:{damagePct:5}},2),[
    {stat:'damagePct',base:5,current:5,difference:0,rate:true},
  ]);
});

test('Appearance equipment listens to Blacksmith advancement and shows both upgraded and base values',()=>{
  const code=fs.readFileSync('src/components/game3d/axe/services/AXEGlassLoadoutPane.jsx','utf8');
  assert.match(code,/useLive\(subscribeEnchantments/);
  assert.match(code,/enhancements\?\.reinforcement\?\.\[selectedInstanceId\]/);
  assert.match(code,/getAXEEnhancementStatMultiplier/);
  assert.match(code,/getAXEEquipmentDisplayStats\(selected, enhancementMultiplier\)/);
  assert.match(code,/itemStats\.map/);
  assert.match(code,/Base \+\{fmt\(base\)\}/);
});
