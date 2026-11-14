import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transform } from 'esbuild';
import {
  getAXESetAscensionTier, scaleAXESetBonus, getAXEFullSetAuraRank,
  doesAXEStageIncreaseItemStats,
} from '../src/components/game3d/axe/equipment/AXESetAscensionRules.mjs';
import {
  evaluateAXESetBonuses, getAXESetCombatMultiplier,
} from '../src/components/game3d/axe/equipment/AXESetBonusSystem.js';

const pieces=(rank=0,count=2,rarity='rare',setId='AXE_Set_Wildhunt') =>
  ['helm','chest','gloves','legs','boots','cape'].slice(0,count).map((slot,i)=>({
    slot,instanceId:'owned_piece_'+i,rarity,setId,equipped:true,
    advancement:{stage:{rank}},
  }));

test('each stage scales the actual existing set bonus by 25% of its original value, not a fixed grant',()=>{
  for(const [rank,multiplier] of [[0,1],[1,1.25],[2,1.5],[3,1.75],[4,2]]){
    const tier=getAXESetAscensionTier(pieces(rank),2);
    assert.equal(tier.multiplier,multiplier);
    assert.equal(scaleAXESetBonus({maxChi:500,defense:80,skillPoints:3},tier).maxChi,500*multiplier);
    assert.equal(scaleAXESetBonus({maxChi:500,defense:80},tier).defense,80*multiplier);
    assert.equal(evaluateAXESetBonuses(pieces(rank)).conditional.mobDamagePct,15*multiplier);
  }
});

test('two matching pieces need to be ascended to improve a two-piece set threshold',()=>{
  const mixed=pieces(4);
  mixed[1].advancement.stage.rank=0;
  assert.equal(getAXESetAscensionTier(mixed,2).multiplier,1);
  assert.equal(evaluateAXESetBonuses(mixed).conditional.mobDamagePct,15);
  const extra=pieces(4,4);
  extra[3].advancement.stage.rank=0;
  assert.equal(getAXESetAscensionTier(extra,2).multiplier,2);
  assert.equal(getAXESetAscensionTier(extra,4).multiplier,1);
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

test('Rare set Stage upgrades preserve their individual item imprint; Elite and above focus on set bonuses',()=>{
  assert.equal(doesAXEStageIncreaseItemStats({setId:'AXE_Set_Wildhunt',rarity:'rare'}),true);
  assert.equal(doesAXEStageIncreaseItemStats({setId:'AXE_Set_Wildhunt',rarity:'elite'}),false);
  assert.equal(doesAXEStageIncreaseItemStats({setId:'AXE_Set_Wildhunt',rarity:'legendary'}),false);
  assert.equal(doesAXEStageIncreaseItemStats({setId:'AXE_Set_Chosen',rarity:'chosen'}),false);
  assert.equal(doesAXEStageIncreaseItemStats({rarity:'elite'}),true);
});

test('rare/elite conditional set effects grow in PvE while never applying to PvP or bosses',()=>{
  assert.equal(getAXESetCombatMultiplier(pieces(4),{pve:true,targetTier:'normal'}),1.3);
  assert.equal(getAXESetCombatMultiplier(pieces(4),{pve:true,targetTier:'boss'}),1);
  assert.equal(getAXESetCombatMultiplier(pieces(4),{pve:false,targetTier:'normal'}),1);
  assert.equal(getAXESetCombatMultiplier(pieces(4,2,'elite'),{pve:true,targetTier:'normal'}),1.3);
});

test('Chosen keeps its exclusive six-piece +100/+200% all-stat rules',()=>{
  const chosen=pieces(4,6,'chosen','AXE_Set_Chosen');
  const set=evaluateAXESetBonuses(chosen);
  assert.equal(set.chosen.bonusPct,200);
  assert.equal(set.activeSets[0].chosenBonusPct,200);
  chosen[5].advancement.stage.rank=3;
  assert.equal(evaluateAXESetBonuses(chosen).chosen.bonusPct,100);
});

test('enhancement percent caps are Common40, Unique45, Rare50, Elite80, Legendary120, Chosen200',async()=>{
  const src=fs.readFileSync('base44/shared/axeItemEnhancement.ts','utf8');
  const js=(await transform(src,{loader:'ts',format:'esm'})).code;
  const {getAXEReinforcementCap}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  for(const [rarity,cap] of Object.entries({
    common:40,uncommon:45,unique:45,rare:50,rare_elite:50,
    elite:80,elite_set:80,legendary:120,mythic:120,chosen:200,ascendant:200,
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
  assert.match(runtime,/doesAXEStageIncreaseItemStats\(item\)/);
  assert.match(advancement,/Math\.min\(savedReinforcementPercent, getAXEReinforcementCap\(item\)\)/);
  assert.match(visual,/subscribeAXEItemAdvancement/);
  assert.match(visual,/subscribeAXEEquipmentInventory/);
  assert.match(visual,/Spiritual_Ascended_Weapon_Aura/);
  assert.match(visual,/Spiritual_Ascended_Set_Aura/);
});
