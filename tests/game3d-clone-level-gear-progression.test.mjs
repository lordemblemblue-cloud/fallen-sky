import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AXE_GEAR_RARITY_SCALE,AXE_PROCEDURAL_SET_FAMILIES,
  getAXELevelGearBand,getAXELevelRarityWeights,rollAXELevelRarity,
  rollAXEEvolutionPath,rollAXELevelAffixes,getAXEChosenUnlockStatus,
} from '../src/components/game3d/axe/loot/AXELevelGearProgression.mjs';
import {
  evaluateAXESetBonuses,getAXESetCombatMultiplier,
} from '../src/components/game3d/axe/equipment/AXESetBonusSystem.js';
import {
  rollAXEArmorDrop,getAXEArmorDropOdds,
} from '../src/components/game3d/axe/loot/AXEArmorLootSystem.js';

const seq=(...values)=>()=>values.length?values.shift():0;
const worn=(count,setId='AXE_Set_Wildhunt',rarity='rare') =>
  Array.from({length:count},(_,i)=>({
    setId,rarity,equipped:true,instanceId:'test_'+i,
    slot:['helm','chest','gloves','legs','boots'][i],
  }));

test('progression boundaries never release a tier early',()=>{
  assert.deepEqual(Object.keys(getAXELevelRarityWeights(1)),['common']);
  assert.deepEqual(Object.keys(getAXELevelRarityWeights(10)),['common']);
  assert.ok(getAXELevelRarityWeights(11).uncommon>0);
  assert.equal(getAXELevelRarityWeights(20).rare,undefined);
  assert.equal(getAXELevelRarityWeights(49).rare,undefined);
  assert.ok(getAXELevelRarityWeights(50).rare>0);
  assert.equal(getAXELevelRarityWeights(109).elite,undefined);
  assert.ok(getAXELevelRarityWeights(110).elite>0);
  assert.ok(getAXELevelRarityWeights(120).elite>0);
  assert.equal(getAXELevelRarityWeights(134).legendary,undefined);
  assert.ok(getAXELevelRarityWeights(135).legendary>0);
  assert.ok(getAXELevelRarityWeights(150).legendary>0);
  assert.ok(!getAXELevelRarityWeights(179).mythic);
  assert.ok(!getAXELevelRarityWeights(180).mythic);
  assert.ok(getAXELevelRarityWeights(180,{isBoss:true}).mythic>0);
  assert.ok(!getAXELevelRarityWeights(1000).chosen);
  assert.deepEqual([getAXELevelGearBand(51).min,getAXELevelGearBand(119).max,
    getAXELevelGearBand(120).min,getAXELevelGearBand(150).min],[50,119,120,150]);
});

test('high monster threat improves only already-unlocked rarities',()=>{
  const before=Object.keys(getAXELevelRarityWeights(10,{isBoss:true}));
  assert.deepEqual(before,['common']);
  const later=getAXELevelRarityWeights(150,{isBoss:true});
  assert.ok(later.legendary>getAXELevelRarityWeights(150).legendary);
  assert.equal(rollAXELevelRarity(1,{rng:()=>0.999}), 'common');
  assert.equal(rollAXELevelRarity(120,{rng:()=>0.999}), 'elite');
});

test('Rare Elite, Elite Legendary and Legendary Mythic are future paths, not free rarity promotion',()=>{
  assert.equal(rollAXEEvolutionPath('rare',49,()=>0),null);
  assert.equal(rollAXEEvolutionPath('rare',50,()=>0),'rare_elite');
  assert.equal(rollAXEEvolutionPath('elite',120,()=>0),'elite_legendary');
  assert.equal(rollAXEEvolutionPath('elite',150,()=>0.01),'elite_mythic');
  assert.equal(rollAXEEvolutionPath('legendary',150,()=>0),'legendary_mythic');
  assert.equal(rollAXEEvolutionPath('mythic',180,()=>0),'mythic_chosen');
  assert.equal(rollAXEEvolutionPath('common',150,()=>0),null);
});

test('stat affixes are randomized but bounded; legend rolls three, not two',()=>{
  assert.deepEqual(rollAXELevelAffixes({slot:'chest',rarity:'common',level:1,rng:()=>0}),{});
  const rare=rollAXELevelAffixes({slot:'chest',rarity:'rare',level:51,rng:()=>0});
  assert.equal(Object.keys(rare).length,1);
  const elite=rollAXELevelAffixes({slot:'chest',rarity:'elite',level:120,rng:()=>0});
  assert.equal(Object.keys(elite).length,2);
  const legendary=rollAXELevelAffixes({slot:'chest',rarity:'legendary',level:150,rng:()=>0});
  assert.equal(Object.keys(legendary).length,3);
  const rate=rollAXELevelAffixes({slot:'ring',rarity:'legendary',level:1000,rng:()=>0.9});
  assert.ok(!rate.critChance||rate.critChance<=1.5);
});

test('low-tier rare set triggers only for two matching equipped pieces; PvP and bosses remain unaffected',()=>{
  assert.equal(AXE_PROCEDURAL_SET_FAMILIES.length,3);
  assert.equal(getAXESetCombatMultiplier(worn(1),{pve:true,targetTier:'normal'}),1);
  assert.equal(getAXESetCombatMultiplier(worn(2),{pve:true,targetTier:'normal'}),1.15);
  assert.equal(getAXESetCombatMultiplier(worn(2),{pve:true,targetTier:'boss'}),1);
  assert.equal(getAXESetCombatMultiplier(worn(2),{pve:false,targetTier:'normal'}),1);
  assert.equal(getAXESetCombatMultiplier(worn(2,'AXE_Set_Skyrend'),
    {pve:true,targetTier:'normal',isAerialAttack:true}),1.2);
  assert.equal(getAXESetCombatMultiplier(worn(2,'AXE_Set_Arcanist'),
    {pve:true,targetTier:'normal',isSkill:true}),1.09);
  assert.equal(evaluateAXESetBonuses(worn(4)).stats.defense,2);
  assert.equal(evaluateAXESetBonuses(worn(2)).activeSets[0].conditionalBonuses.mobDamagePct,15);
  const mixed=[{...worn(1)[0],rarity:'rare'},{...worn(2)[1],rarity:'elite'}];
  assert.equal(evaluateAXESetBonuses(mixed).conditional.mobDamagePct,undefined);
});

test('named armor pack drops use the same level gate and never include Crescent Moon dev armor',()=>{
  assert.equal(rollAXEArmorDrop('boss',true,{rng:seq(0),enemyLevel:1}),null);
  const rare=rollAXEArmorDrop('boss',true,{rng:seq(0,0,0,0),enemyLevel:50});
  assert.equal(rare?.rarity,'rare');
  assert.equal(rare?.equipmentItem.setId,'AXE_Set_Armor_nightscale');
  assert.equal(Object.keys(rare?.equipmentItem.rolledStats||{}).length,1);
  const legendary=rollAXEArmorDrop('boss',true,{rng:seq(0,0.99,0,0),enemyLevel:150});
  assert.equal(legendary?.rarity,'legendary');
  assert.equal(legendary?.equipmentItem.setId,'AXE_Set_Armor_silver_seraph');
  assert.equal(Object.keys(legendary?.equipmentItem.rolledStats||{}).length,3);
  assert.ok(Object.keys(getAXEArmorDropOdds('boss',true,50).odds).every(k=>!k.includes('seraph')));
  assert.ok(Object.keys(getAXEArmorDropOdds('boss',true,150).odds).every(k=>!k.includes('crescent_moon')));
});

test('ordinary drop adapter uses the canonical equipment pickup schema with no manufactured model',()=>{
  const path='src/components/game3d/axe/loot/AXEEquipmentLootSystem.js';
  const src=fs.readFileSync(path,'utf8')
    .replace(/import[\s\S]*?from\s*'[^']+';\n/g,'')
    .replace(/^export /gm,'');
  // The pure roll adapter can be evaluated without loading React/JSX inventory.
  const roll=new Function('INVENTORY','isAXERateStat','AXE_GEAR_RARITY_SCALE',
    'AXE_PROCEDURAL_SET_FAMILIES','getAXELevelGearBand','rollAXELevelAffixes',
    'rollAXELevelRarity','rollAXEEvolutionPath',
    src+'\nreturn rollAXEEquipmentDrop;',
  )({chest:[{id:'ch_plain',name:'Plain Chest',slot:'chest',baseStats:{defense:3,maxHP:20}}]},
    key=>['critChance','critDefense','critDamage','attackPct','damagePct'].includes(key),
    AXE_GEAR_RARITY_SCALE,AXE_PROCEDURAL_SET_FAMILIES,
    getAXELevelGearBand,rollAXELevelAffixes,rollAXELevelRarity,rollAXEEvolutionPath);
  const common=roll('normal',false,{rng:seq(0,0,0.999,0),enemyLevel:1});
  assert.equal(common.rarity,'common');
  const rare=roll('normal',false,{rng:seq(0,0,0.999,0),enemyLevel:50});
  assert.equal(rare.rarity,'rare');
  assert.equal(rare.equipmentItem.itemLevel,50);
  assert.equal(rare.category,'equipment');
  assert.equal(rare.equipmentItem.category,'chest');
  assert.equal(rare.equipmentItem.visualPending,true);
  assert.equal(rare.equipmentItem.appearance,null);
  assert.equal(rare.equipmentItem.modelUrl,null);
  assert.ok(Object.keys(rare.equipmentItem.rolledStats).length===1);
  const legendary=roll('boss',true,{rng:seq(0,0,0.999,0),enemyLevel:150});
  assert.equal(legendary.rarity,'legendary');
  assert.equal(Object.keys(legendary.equipmentItem.rolledStats).length,3);
});

test('Chosen is never loot RNG: max Halo, full mythical set and explicit trials required',()=>{
  assert.equal(getAXEChosenUnlockStatus({level:200,haloLevel:200,mythicalSetPieces:5}).eligible,false);
  const status=getAXEChosenUnlockStatus({
    level:200,haloLevel:200,mythicalSetPieces:5,finalTrialComplete:true,additionalCriteriaComplete:true,
  });
  assert.equal(status.eligible,true);
  assert.equal(status.autoGrant,false);
});

test('world drop integration and actual PvE strike hook remain wired',()=>{
  const world=fs.readFileSync('src/components/game3d/GameWorldLootLayer.jsx','utf8');
  const combat=fs.readFileSync('src/components/game3d/axe/combat/AXEStrikeRuntime.js','utf8');
  const killing=fs.readFileSync('src/components/game3d/enemyRespawnManager.jsx','utf8');
  const scene=fs.readFileSync('src/components/game3d/GameWorld3D.jsx','utf8');
  assert.match(world,/enemyLevel: dropLevel/);
  assert.match(world,/lastRolledKillRef/);
  assert.match(world,/queueMicrotask/);
  assert.match(killing,/enemy_level: lootCtx\?\.enemyLevel/);
  assert.match(scene,/enemyLevel: closestEnemy\.derived\?\.level/);
  assert.match(world,/rollAXEEquipmentDrop/);
  assert.match(world,/rollAXEArmorDrop/);
  assert.match(combat,/getAXESetCombatMultiplier\(getEquippedAXEItems\(\)/);
  assert.match(combat,/bonusMultiplier: Math\.min\(AXE_TEMPORARY_BONUS_CAP, temp\.multiplier \* situational \* setMultiplier\)/);
});
