import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  COMPANION_GROWTH_TIER_BONUSES,getCompanionGrowthView,applyCompanionGrowthBonus,
} from '../src/components/game3d/axe/progression/AXECompanionGrowthView.mjs';
import {
  COMPANION_MASTERY_PATHS,normalizeCompanionRoleMastery,
  getCompanionMasteryProgress,awardCompanionRoleMasteryXP,applyCompanionRoleBonus,
} from '../src/components/game3d/axe/progression/AXECompanionRoleMastery.mjs';

const read=name=>readFileSync('src/components/game3d/'+name,'utf8');

test('20-level earned growth cycles award +10/15/20/25% only at actual milestones',()=>{
  assert.deepEqual(COMPANION_GROWTH_TIER_BONUSES,[0,10,15,20,25]);
  assert.deepEqual([0,4999,5000,10000,15000,20000].map(x=>getCompanionGrowthView(x).bonusPct),
    [0,0,10,15,20,25]);
  assert.equal(getCompanionGrowthView(0).level,1);
  assert.equal(getCompanionGrowthView(250).level,2);
  assert.equal(getCompanionGrowthView(4750).level,20);
  assert.equal(getCompanionGrowthView(5000).cycle,2);
  assert.equal(getCompanionGrowthView(20000).maxed,true);
  assert.equal(getCompanionGrowthView(20000).nextLevelXP,null);
  assert.deepEqual(applyCompanionGrowthBonus({hp:100,damage:50},10000),{hp:115,damage:57.5});
});

test('Damage Defense and Range mastery preserve independent path XP and never stack',()=>{
  assert.deepEqual(COMPANION_MASTERY_PATHS.map(x=>x.id),['damage','defense','range']);
  const original={instanceId:'mount-a',roleMastery:{damage:{xp:150}}};
  const trained=awardCompanionRoleMasteryXP(original,300,'ranged');
  assert.equal(getCompanionMasteryProgress(trained,'damage').rank,2);
  assert.equal(getCompanionMasteryProgress(trained,'range').rank,3);
  assert.equal(getCompanionMasteryProgress(trained,'defense').rank,0);
  assert.deepEqual(normalizeCompanionRoleMastery({damage:{xp:150}}).range,{xp:0});
  assert.deepEqual(applyCompanionRoleBonus({damage:100,defense:50},trained,'damage'),
    {damage:104,defense:50});
  assert.deepEqual(applyCompanionRoleBonus({damage:100,defense:50},trained,'defense'),
    {damage:100,defense:50});
  assert.equal(original.roleMastery.damage.xp,150);
});

test('unified equipment binds owned mount instead of the legacy pet and role XP remains combat earned',()=>{
  const loadout=read('axe/services/AXEGlassLoadoutPane.jsx');
  const insights=read('axe/services/AXECompanionInsights.jsx');
  const mastery=read('axe/services/AXECompanionMasteryPanel.jsx');
  const workspace=read('axe/services/AXECompanionWorkspace.jsx');
  const store=read('axe/progression/AXEMountStore.js');
  const legacy=read('companionData.jsx');
  assert.match(loadout,/subscribeAXEMounts/);
  assert.match(loadout,/mounts.activeMountId/);
  assert.match(loadout,/axe-comp-owned-roster/);
  assert.match(loadout,/axe-comp-insights-toggle/);
  assert.match(loadout,/companionId=\{activeCompanion.id\}/);
  assert.match(loadout,/AXE_MOUNT_GEAR_SLOTS/);
  assert.match(insights,/Growth &amp; Experience/);
  assert.match(insights,/getCompanionGrowthView/);
  assert.match(insights,/getAXEMountBonuses/);
  assert.match(insights,/applyCompanionRoleBonus/);
  assert.match(mastery,/COMPANION_MASTERY_PATHS/);
  assert.doesNotMatch(mastery,/feedAXEPet/);
  assert.match(store,/fightingAlongside/);
  assert.match(store,/source==='pve'\|\|source==='pvp'/);
  assert.match(store,/result.mount.totalXp>=5000/);
  assert.match(store,/applyCompanionGrowthBonus/);
  assert.match(store,/applyCompanionRoleBonus/);
  assert.doesNotMatch(workspace,/MountSubTab|Mount Armory|AXECompanionOverviewClone/);
  assert.match(workspace,/\{id:'companion',label:'Equipment'\}/);
  assert.match(legacy,/name: 'Legacy War Wolf'/);
  assert.match(legacy,/modelUrl: GAME3D_FACTION_MOUNTS.AXE_Faction_2.modelUrl/);
});
