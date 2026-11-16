import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 AXE_FARMING_EQUIPMENT_TIERS,getAXEFarmingGearLevel,getAXEFarmingAscendedIdentity,
} from '../src/components/game3d/axe/loot/AXEFarmingGearTiers.mjs';
import {
 getAXEAscensionFeedRequirement,validateAXEAscensionFeed,previewAXEAscensionFeed,
} from '../src/components/game3d/axe/equipment/AXEAscensionFeedingRules.mjs';
import {AXE_FARMING_SET_BY_GRADE} from '../src/components/game3d/axe/equipment/AXEFarmingSetProfiles.mjs';
import {makeAXEFarmingItemPerks,getAXEWeaponSkillPerkBonus}
  from '../src/components/game3d/axe/equipment/AXEFarmingItemPerks.mjs';
import {getAXELevelRarityWeights} from '../src/components/game3d/axe/loot/AXELevelGearProgression.mjs';

const item=(id,rarity='rare',level=50,slot='weapon')=>({
 instanceId:id,id,rarity,itemLevel:level,slot,name:rarity+' Test Weapon',
 equipped:false,locked:false,
});
test('Rare 50/80/120, Elite 110/120/130/140, Legendary 135 unlocks only when farmable',()=>{
 assert.deepEqual(AXE_FARMING_EQUIPMENT_TIERS.rare,[50,80,120]);
 assert.deepEqual(AXE_FARMING_EQUIPMENT_TIERS.elite,[110,120,130,140]);
 assert.deepEqual(AXE_FARMING_EQUIPMENT_TIERS.legendary,[135]);
 assert.equal(getAXEFarmingGearLevel('rare',49),null);
 assert.equal(getAXEFarmingGearLevel('rare',119),80);
 assert.equal(getAXEFarmingGearLevel('rare',120),120);
 assert.equal(getAXEFarmingGearLevel('elite',109),null);
 assert.equal(getAXEFarmingGearLevel('elite',110),110);
 assert.equal(getAXEFarmingGearLevel('elite',140),140);
 assert.equal(getAXEFarmingGearLevel('legendary',134),null);
 assert.equal(getAXEFarmingGearLevel('legendary',135),135);
 for(const [level,grade] of [[49,'rare'],[109,'elite'],[134,'legendary']])
   assert.equal(getAXELevelRarityWeights(level)[grade],undefined);
 for(const [level,grade] of [[50,'rare'],[110,'elite'],[135,'legendary']])
   assert.ok(getAXELevelRarityWeights(level)[grade]>0);
});
test('same-tier donors need 1,2,3,4 sacrifices respectively, saving partial steps',()=>{
 const t=item('target'),d=item('donor');
 assert.deepEqual([0,1,2,3].map(getAXEAscensionFeedRequirement),[1,2,3,4]);
 assert.equal(previewAXEAscensionFeed(t,{rank:0},d).nextRank,1);
 const first=previewAXEAscensionFeed(t,{rank:1,feedProgress:0},d);
 assert.equal(first.nextRank,1);
 assert.equal(first.progressAfter,1);
 const second=previewAXEAscensionFeed(t,{rank:1,feedProgress:1},d);
 assert.equal(second.nextRank,2);
 assert.equal(second.progressAfter,0);
 assert.equal(previewAXEAscensionFeed(t,{rank:3,feedProgress:2},d).nextRank,3);
 assert.equal(previewAXEAscensionFeed(t,{rank:3,feedProgress:3},d).nextRank,4);
});
test('higher-level Rare and Elite donors may leap multiple ranks, capped at four',()=>{
 assert.equal(previewAXEAscensionFeed(item('r50'),{rank:0},item('r80','rare',80)).nextRank,4);
 assert.equal(previewAXEAscensionFeed(item('e110','elite',110),{rank:0},
   item('e130','elite',130)).nextRank,3);
 assert.equal(previewAXEAscensionFeed(item('e110','elite',110),{rank:3},
   item('e140','elite',140)).nextRank,4);
});
test('Legendary always consumes only one same-category legendary per rank',()=>{
 for(let rank=0;rank<4;rank++){
   const progress=previewAXEAscensionFeed(
     item('main','legendary',135),{rank,feedProgress:0},
     item('sac','legendary',145));
   assert.equal(progress.nextRank,rank+1);
   assert.equal(progress.required,1);
 }
});
test('unowned mismatched, locked, equipped and self donors must be rejected',()=>{
 const t=item('main');
 for(const d of [item('main'),item('d','elite'),item('d','rare',50,'chest'),
   {...item('d'),equipped:true},{...item('d'),locked:true},
   {...item('d'),favorite:true}]){
   assert.equal(validateAXEAscensionFeed(t,d).ok,false);
 }
 assert.equal(previewAXEAscensionFeed(t,{rank:4},item('d')).ok,false);
});
test('stage IV changes earned name, outline colors and cosmetic aura identifiers',()=>{
 const rare=getAXEFarmingAscendedIdentity(item('r'),4);
 const elite=getAXEFarmingAscendedIdentity(item('e','elite',110),4);
 const leg=getAXEFarmingAscendedIdentity(item('l','legendary',135),4);
 assert.match(rare.displayName,/^Rare Elite /);
 assert.match(elite.displayName,/^Elite Legendary /);
 assert.match(leg.displayName,/^Legendary Ascended /);
 assert.equal(getAXEFarmingAscendedIdentity(item('e','elite',110),3),null);
});
test('sets reflect rarity and named damage/defense/ranged roles',()=>{
 assert.equal(AXE_FARMING_SET_BY_GRADE.rare.length,3);
 assert.equal(AXE_FARMING_SET_BY_GRADE.elite.length,2);
 assert.equal(AXE_FARMING_SET_BY_GRADE.legendary.length,1);
 assert.equal(AXE_FARMING_SET_BY_GRADE.rare.find(s=>s.name==='Moon Ranger')
   .conditionalThresholds[4].rangedDamagePct,7);
 assert.equal(AXE_FARMING_SET_BY_GRADE.legendary[0].thresholds[4].critDamage,15);
});
test('rare weapon improves two combat skills; IV gives four virtual skill levels',()=>{
 const weapon={slot:'weapon',abilityPerks:makeAXEFarmingItemPerks({slot:'weapon',rarity:'rare'})};
 assert.equal(getAXEWeaponSkillPerkBonus(weapon,0,{family:'single'}),12);
 assert.equal(getAXEWeaponSkillPerkBonus(weapon,4,{family:'single'}),24);
 assert.equal(getAXEWeaponSkillPerkBonus(weapon,4,{family:'three_hit'}),24);
 assert.equal(getAXEWeaponSkillPerkBonus(weapon,4,{family:'other'}),0);
 assert.equal(getAXEWeaponSkillPerkBonus(weapon,4,{aerial:true}),24);
});
test('UI/transaction contracts demand owned donors and actual confirmation',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const gateway=read('../src/components/game3d/axe/services/AXEServiceTransactionGateway.js');
 const forge=read('../src/components/game3d/axe/services/AXEBlacksmithImageWorkspace.jsx');
 const runtime=read('../src/components/game3d/axe/combat/AXEStrikeRuntime.js');
 assert.match(gateway,/previewAXEAscensionFeed\(item,advancement.stage,donorCheck.item\)/);
 assert.match(gateway,/consumeAXEEquipmentItem\(donorCheck.item.instanceId\)/);
 assert.match(gateway,/setAXEAdvancementRecord\(item.instanceId,'stage',previous\)/);
 assert.match(forge,/aria-label="Select equipment to feed into Ascension"/);
 assert.match(forge,/Ascension permanently sacrifices the selected donor/);
 assert.match(runtime,/const weaponPerkMultiplier=pve/);
});
