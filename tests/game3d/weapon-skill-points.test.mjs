import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEAPON_SKILL_PATH_COST, WEAPON_SKILL_TIERS, weaponSkillPointsAtLevel,
  weaponSkillPointsEarned, blankWeaponSkillPoints, weaponSkillState,
  weaponSkillPointsSpent, investWeaponSkillPoints, checkWeaponSkillPoints,
  weaponTierUnlocked, weaponSkillTierForId, chargedWeaponSkillBonusPct,
  chargedWeaponSkillPassivePct,
} from '../../base44/shared/weaponSkillPoints.mjs';

const spend = (save, level, path, tier, amount) => {
  const result = investWeaponSkillPoints(save, level, path, tier, amount);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.save;
};

test('level rewards grow to support two and a half 200-point weapons', () => {
  assert.equal(WEAPON_SKILL_PATH_COST, 200);
  assert.deepEqual(WEAPON_SKILL_TIERS, [20, 30, 40, 50, 60]);
  assert.equal(weaponSkillPointsAtLevel(1), 0);
  assert.equal(weaponSkillPointsAtLevel(2), 3);
  assert.equal(weaponSkillPointsAtLevel(20), 4);
  assert.equal(weaponSkillPointsAtLevel(40), 5);
  assert.equal(weaponSkillPointsAtLevel(60), 6);
  assert.equal(weaponSkillPointsAtLevel(80), 7);
  assert.equal(weaponSkillPointsAtLevel(100), 8);
  assert.equal(weaponSkillPointsEarned(20), 58);
  assert.equal(weaponSkillPointsEarned(40), 139);
  assert.equal(weaponSkillPointsEarned(60), 240);
  assert.equal(weaponSkillPointsEarned(80), 361);
  assert.equal(weaponSkillPointsEarned(100), 502);
  // past 100 the same rule carries on to the level cap, 155 (owner, 2026-11-19)
  assert.equal(weaponSkillPointsAtLevel(101), 8);
  assert.equal(weaponSkillPointsAtLevel(120), 9);
  assert.equal(weaponSkillPointsAtLevel(140), 10);
  assert.equal(weaponSkillPointsAtLevel(155), 10);
  assert.equal(weaponSkillPointsAtLevel(156), 0);
  assert.equal(weaponSkillPointsEarned(101), 510);
  assert.equal(weaponSkillPointsEarned(155), 994);
  assert.equal(weaponSkillPointsEarned(156), 994);
  for (let level = 2; level <= 155; level++) {
    assert.equal(weaponSkillPointsEarned(level) - weaponSkillPointsEarned(level-1),
      weaponSkillPointsAtLevel(level));
  }
});

test('spending two full trees leaves exactly 102 points for the third', () => {
  let save = blankWeaponSkillPoints();
  for (const path of ['damage','range']) {
    for (let tier=0; tier<5; tier++) save = spend(save, 100, path, tier, WEAPON_SKILL_TIERS[tier]);
  }
  save = spend(save, 100, 'defense', 0, 20);
  save = spend(save, 100, 'defense', 1, 30);
  save = spend(save, 100, 'defense', 2, 40);
  save = spend(save, 100, 'defense', 3, 12);
  assert.equal(weaponSkillPointsSpent(save), 502);
  assert.deepEqual(weaponSkillState(save, 100), {
    earned: 502, spent: 502, available: 0, nextLevelReward: 8, // level 101 pays 8 since the cap is 155
  });
  assert.equal(weaponSkillState(save, 155).nextLevelReward, 0);
  assert.equal(checkWeaponSkillPoints(save, 100).length, 0);
  assert.equal(investWeaponSkillPoints(save, 100, 'defense', 3, 1).reason, 'NOT_ENOUGH_SKILL_POINTS');
});

test('stage prerequisites and 100% charged damage investment use 1% per 1%', () => {
  let save = blankWeaponSkillPoints();
  const id='axe_offensive_skill_1';
  assert.deepEqual(weaponSkillTierForId(id), { pathId:'damage', tierIndex:0 });
  assert.equal(weaponSkillTierForId('unknown'), null);
  assert.equal(weaponTierUnlocked(save,'damage',0),true);
  assert.equal(weaponTierUnlocked(save,'damage',1),false);
  assert.equal(chargedWeaponSkillBonusPct(save,id),0);
  assert.equal(chargedWeaponSkillPassivePct(save,id),1);
  assert.equal(investWeaponSkillPoints(save,100,'damage',1,1).reason,'PREVIOUS_TIER_LOCKED');
  save = spend(save,100,'damage',0,5);
  assert.equal(chargedWeaponSkillBonusPct(save,id),25);
  save = spend(save,100,'damage',0,15);
  assert.equal(chargedWeaponSkillBonusPct(save,id),100);
  assert.equal(weaponTierUnlocked(save,'damage',1),true);
  assert.equal(chargedWeaponSkillPassivePct(save,id),2);
  assert.equal(investWeaponSkillPoints(save,100,'damage',0,1).reason,'TIER_CAPPED');
});

test('server save validation rejects forged, malformed or reversed character tiers', () => {
  const blank = blankWeaponSkillPoints();
  assert.deepEqual(checkWeaponSkillPoints(blank,1),[]);
  let forged = structuredClone(blank);
  forged.nodes.damage[0]=20;
  assert.ok(checkWeaponSkillPoints(forged,2).some(x=>x.includes('exceed')));
  forged = structuredClone(blank);
  forged.nodes.range[1]=1;
  assert.ok(checkWeaponSkillPoints(forged,100).some(x=>x.includes('requires previous')));
  forged = structuredClone(blank);
  forged.nodes.damage[0]=21;
  assert.ok(checkWeaponSkillPoints(forged,100).some(x=>x.includes('outside')));
  forged = structuredClone(blank);
  forged.nodes.illegal=[0,0,0,0,0];
  assert.ok(checkWeaponSkillPoints(forged,100).some(x=>x.includes('unknown')));
  forged = structuredClone(blank);
  forged.nodes.damage[0]=1;
  assert.ok(checkWeaponSkillPoints(blank,100,forged).some(x=>x.includes('cannot lose')));
});

test('investments never mutate a prior save, and invalid quantities are rejected', () => {
  const blank = blankWeaponSkillPoints();
  const result = investWeaponSkillPoints(blank, 100, 'damage', 0, 1);
  assert.equal(result.ok, true);
  assert.equal(blank.nodes.damage[0], 0);
  assert.equal(result.save.nodes.damage[0], 1);
  assert.equal(investWeaponSkillPoints(blank, 100, 'damage', 0, -1).ok, false);
  assert.equal(investWeaponSkillPoints(blank, 100, 'damage', 0, 0).ok, false);
  assert.equal(investWeaponSkillPoints(blank, 100, 'damage', 9, 1).ok, false);
});

// R156: preserve the old entitlement curve and verify the new boundary.
test('all old-level entitlements stay unchanged and all paths fund at 113', () => {
  let expected=0;
  for(let level=1;level<=100;level++) {
    if(level>1) expected+=3+Math.floor(level/20);
    assert.equal(weaponSkillPointsEarned(level),expected);
  }
  const full=blankWeaponSkillPoints();
  for(const path of ['damage','range','defense']) full.nodes[path]=[...WEAPON_SKILL_TIERS];
  assert.ok(checkWeaponSkillPoints(full,112).some(x=>x.includes('exceed')));
  assert.deepEqual(checkWeaponSkillPoints(full,113),[]);
  assert.equal(weaponSkillState(full,155).available,394);
});
