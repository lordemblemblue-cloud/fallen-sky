import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transform } from 'esbuild';
// Blacksmith v2 (owner-approved 2026-11-18; docs/game3d/BLACKSMITH_V2_20261118.md): Ascension
// raises only the ascended item's own stats; set bonuses are never multiplied by it. The
// ascension ranks still drive the full-set aura (visual) and the Chosen set's own x2/x3 rule.
import {
  getAXEFullSetAuraRank, getAXESetAscensionRank,
} from '../src/components/game3d/axe/equipment/AXESetAscensionRules.mjs';
import {
  evaluateAXESetBonuses, getAXESetCombatMultiplier,
} from '../src/components/game3d/axe/equipment/AXESetBonusSystem.js';
import { computeAXEItemStatBreakdown } from '../src/components/game3d/axe/equipment/AXEItemStatBreakdown.mjs';

const pieces=(rank=0,count=2,rarity='rare',setId='AXE_Set_Wildhunt') =>
  ['helm','chest','gloves','legs','boots','cape'].slice(0,count).map((slot,i)=>({
    slot,instanceId:'owned_piece_'+i,rarity,setId,equipped:true,
    advancement:{stage:{rank}},
  }));

test('Ascension never scales a set bonus: every rank keeps the authored value',()=>{
  for(const rank of [0,1,2,3,4]){
    assert.equal(evaluateAXESetBonuses(pieces(rank)).conditional.mobDamagePct,15);
    assert.deepEqual(evaluateAXESetBonuses(pieces(rank,4)).stats,{defense:2});
    assert.equal(getAXESetAscensionRank(pieces(rank)[0]),rank);
  }
  const mixed=pieces(4,4);
  mixed[3].advancement.stage.rank=0;
  assert.deepEqual(evaluateAXESetBonuses(mixed).stats,evaluateAXESetBonuses(pieces(0,4)).stats);
  assert.deepEqual(evaluateAXESetBonuses(mixed).conditional,evaluateAXESetBonuses(pieces(0,4)).conditional);
  assert.equal(evaluateAXESetBonuses(mixed).activeSets[0].ascensionByThreshold,undefined);
});

test('set aura requires the whole unique authored set with at least one real Ascension on each piece',()=>{
  const slots=['helm','chest','gloves','legs','boots','cape'];
  assert.equal(getAXEFullSetAuraRank(pieces(1,5),slots),0);
  assert.equal(getAXEFullSetAuraRank(pieces(0,6),slots),0);
  assert.equal(getAXEFullSetAuraRank(pieces(2,6),slots),2);
  const mixed=pieces(4,6);
  mixed[5].advancement.stage.rank=1;
  assert.equal(getAXEFullSetAuraRank(mixed,slots),1);
  mixed[5].equipped=false;
  assert.equal(getAXEFullSetAuraRank(mixed,slots),0);
});

test('Rare, Elite, Legendary Ascension strengthens the individual item only; Chosen pieces gain no item stats',()=>{
  const item=(rarity,setId='AXE_Set_Wildhunt')=>({instanceId:'x',rarity,setId,baseStats:{defense:100}});
  const at4=(rarity,setId)=>computeAXEItemStatBreakdown(item(rarity,setId),{advancement:{stage:{rank:4}}}).rows[0].ascend;
  assert.equal(at4('rare'),15);
  assert.equal(at4('elite'),75);
  assert.equal(at4('legendary'),100);
  assert.equal(at4('chosen','AXE_Set_Chosen'),0);
  assert.equal(at4('common'),0);
});

test('rare/elite conditional set effects apply in PvE only, never to PvP or bosses, and never scale with Ascension',()=>{
  assert.equal(getAXESetCombatMultiplier(pieces(4),{pve:true,targetTier:'normal'}),1.15);
  assert.equal(getAXESetCombatMultiplier(pieces(0),{pve:true,targetTier:'normal'}),1.15);
  assert.equal(getAXESetCombatMultiplier(pieces(4),{pve:true,targetTier:'boss'}),1);
  assert.equal(getAXESetCombatMultiplier(pieces(4),{pve:false,targetTier:'normal'}),1);
  assert.equal(getAXESetCombatMultiplier(pieces(4,2,'elite'),{pve:true,targetTier:'normal'}),1.15);
});

test('Chosen keeps its exclusive six-piece +100/+200% all-stat rules',()=>{
  const chosen=pieces(4,6,'chosen','AXE_Set_Chosen');
  const set=evaluateAXESetBonuses(chosen);
  assert.equal(set.chosen.bonusPct,200);
  assert.equal(set.activeSets[0].chosenBonusPct,200);
  chosen[5].advancement.stage.rank=3;
  assert.equal(evaluateAXESetBonuses(chosen).chosen.bonusPct,100);
});

test('Enchant ceilings: every rarity reaches 200 %, Mythic keeps 120 % until the owner decides',async()=>{
  const src=fs.readFileSync('base44/shared/axeItemEnhancement.ts','utf8');
  const js=(await transform(src,{loader:'ts',format:'esm'})).code;
  const {getAXEReinforcementCap}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  for(const [rarity,cap] of Object.entries({
    common:200,uncommon:200,unique:200,rare:200,rare_elite:200,
    elite:200,elite_set:200,legendary:200,mythic:120,chosen:200,ascendant:200,
  })) assert.equal(getAXEReinforcementCap({rarity,setId:'AXE_Set_Wildhunt'}),cap,rarity);
});

test('world and combat wire the aura lifecycle and current advancement records',()=>{
  const world=fs.readFileSync('src/components/game3d/GameWorld3D.jsx','utf8');
  const combat=fs.readFileSync('src/components/game3d/axe/combat/AXEStrikeRuntime.js','utf8');
  const runtime=fs.readFileSync('src/components/game3d/axe/equipment/AXEEquipmentRuntimeStats.js','utf8');
  const visual=fs.readFileSync('src/components/game3d/axe/equipment/AXEAscendedGearVisualRuntime.js','utf8');
  const advancement=fs.readFileSync('src/components/game3d/axe/equipment/AXEItemAdvancementStore.js','utf8');
  assert.match(world,/createAXEAscendedGearVisualRuntime\(\{ model: fbx \}\)/);
  assert.match(world,/ascendedGearVisualRuntime\?\.update/);
  assert.match(world,/ascendedGearVisualRuntime\?\.lateUpdate/);
  assert.match(world,/ascendedGearVisualRuntime\?\.dispose/);
  assert.match(combat,/getEquippedAXEItems\(\)\.map\(item/);
  assert.match(runtime,/computeAXEItemStatBreakdown\(item, records\)/);
  assert.match(advancement,/resolveAscensionRecord\(current\.stage,item,options\.donor\|\|null/);
  assert.match(visual,/subscribeAXEItemAdvancement/);
  assert.match(visual,/subscribeAXEEquipmentInventory/);
  assert.match(visual,/Spiritual_Ascended_Weapon_Aura/);
  assert.match(visual,/Spiritual_Ascended_Set_Aura/);
});
