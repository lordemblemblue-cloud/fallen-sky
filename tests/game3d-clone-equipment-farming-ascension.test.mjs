import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 AXE_FARMING_EQUIPMENT_TIERS,getAXEFarmingGearLevel,getAXEFarmingAscendedIdentity,
} from '../src/components/game3d/axe/loot/AXEFarmingGearTiers.mjs';
// Blacksmith v2 (owner-approved 2026-11-18; docs/game3d/BLACKSMITH_V2_20261118.md) replaced
// the multi-donor feeding (1/2/3/4 donors per rank, level skips) with one donor per attempt.
import {
 resolveAscensionRecord,validateAXEAscensionDonor,
} from '../base44/shared/axeItemAdvancement.ts';
import {AXE_FARMING_SET_BY_GRADE} from '../src/components/game3d/axe/equipment/AXEFarmingSetProfiles.mjs';
import {makeAXEFarmingItemPerks,getAXEWeaponSkillPerkBonus}
  from '../src/components/game3d/axe/equipment/AXEFarmingItemPerks.mjs';
import {getAXELevelRarityWeights} from '../src/components/game3d/axe/loot/AXELevelGearProgression.mjs';

const item=(id,rarity='rare',level=50,slot='weapon')=>({
 instanceId:id,id,rarity,itemLevel:level,slot,name:rarity+' Test Weapon',
 masteryWeaponId:slot==='weapon'?'sword':undefined,equipped:false,locked:false,
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
test('one donor per attempt raises exactly one rank: no saved feed progress and no multi-donor ranks',()=>{
 const t=item('target'),d=item('donor');
 for(let rank=0;rank<4;rank++){
   const result=resolveAscensionRecord({rank,feedProgress:3},t,d,{roll:0});
   assert.equal(result.ok,true);
   assert.equal(result.record.rank,rank+1);
   assert.equal(result.record.feedProgress,undefined);
   assert.equal(result.donorConsumed,true);
 }
});
test('a higher-level donor no longer skips ranks; it is refused (donor level must be equal or lower)',()=>{
 assert.equal(validateAXEAscensionDonor(item('r50'),item('r80','rare',80)).reason,'DONOR_LEVEL_TOO_HIGH');
 assert.equal(validateAXEAscensionDonor(item('e130','elite',130),item('e110','elite',110)).ok,true);
 const leap=resolveAscensionRecord({rank:0},item('e130','elite',130),item('e110','elite',110),{roll:0});
 assert.equal(leap.record.rank,1);
});
test('Legendary uses the same one-donor rule and the configured odds',()=>{
 const main=item('main','legendary',135),sac=item('sac','legendary',135);
 assert.equal(resolveAscensionRecord({rank:1},main,sac,{roll:0.79}).record.rank,2,'+2 succeeds at 80 %');
 assert.equal(resolveAscensionRecord({rank:1},main,sac,{roll:0.81}).record.rank,1,'a failure keeps +1');
 assert.equal(resolveAscensionRecord({rank:1},main,sac,{roll:0.81}).donorConsumed,false);
});
test('unowned mismatched, locked, equipped and self donors must be rejected',()=>{
 const t=item('main');
 for(const d of [item('main'),item('d','elite'),item('d','rare',50,'chest'),
   {...item('d'),equipped:true},{...item('d'),locked:true},
   {...item('d'),favorite:true}]){
   assert.equal(validateAXEAscensionDonor(t,d).ok,false);
 }
 assert.equal(resolveAscensionRecord({rank:4},t,item('d'),{roll:0}).reason,'MAX_STAGE');
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
test('rare weapon improves its skill families; Ascension +4 adds no virtual skill levels',()=>{
 const weapon={slot:'weapon',abilityPerks:makeAXEFarmingItemPerks({slot:'weapon',rarity:'rare'})};
 assert.equal(getAXEWeaponSkillPerkBonus(weapon,{family:'single'}),12);
 assert.equal(getAXEWeaponSkillPerkBonus(weapon,{family:'three_hit'}),12);
 assert.equal(getAXEWeaponSkillPerkBonus(weapon,{family:'other'}),0);
 assert.equal(getAXEWeaponSkillPerkBonus(weapon,{aerial:true}),12);
 assert.equal(weapon.abilityPerks.ascendedSkillLevels,undefined);
});
test('UI/transaction contracts demand owned donors and actual confirmation',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const gateway=read('../src/components/game3d/axe/services/AXEServiceTransactionGateway.js');
 const forge=read('../src/components/game3d/axe/services/AXEBlacksmithImageWorkspace.jsx');
 const runtime=read('../src/components/game3d/axe/combat/AXEStrikeRuntime.js');
 assert.match(gateway,/validateAXEAscensionDonor\(item, donor\)/);
 assert.match(gateway,/consumeAXEEquipmentItem\(donor\.instanceId\)/);
 assert.match(gateway,/setAXEAdvancementRecord\(item\.instanceId, 'stage', previous\)/);
 assert.match(forge,/aria-label="Select equipment to sacrifice for Ascension"/);
 assert.match(forge,/A successful Ascension uses up the donor/);
 assert.match(forge,/Press Forge again to confirm/);
 assert.match(runtime,/const weaponPerkMultiplier=pve/);
});
