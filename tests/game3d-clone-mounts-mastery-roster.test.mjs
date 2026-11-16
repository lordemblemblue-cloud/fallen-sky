import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOwnedMountRoster } from '../src/components/game3d/axe/services/MountCollectionModel.mjs';

test('Mounts collection contains only owned mounts and uses actual current stats', () => {
  const owned = [
    { instanceId: 'owned-bear', definitionId: 'axe_mount_faction_bear',
      definition: { name: 'Fantasy Bear', rarity: 'rare', specialty: 'defense' },
      growthPercent: 40, totalXp: 1650, speedMultiplier: 1.55,
      sourceStats: { ridingXp: 500, pveXp: 1000, pvpXp: 150 },
      spiritualProfile: { rank: 3, maxRank: 20 },
      bonuses: { hp: 280, damage: 18, defense: 60, attributionAttack: 4 },
    },
    { instanceId: 'owned-wolf', definitionId: 'axe_mount_faction_wolf',
      definition: { name: 'Armored Wolf', rarity: 'rare', specialty: 'balanced' },
      growthPercent: 15, totalXp: 450, speedMultiplier: 1.545,
      bonuses: { hp: 90, damage: 13 },
    },
  ];
  const snapshot = { mounts: owned, registeredMountId: 'owned-bear',
    activeMountId: 'owned-wolf', ridingMountId: null };
  const before = JSON.stringify(snapshot);
  const cards = buildOwnedMountRoster(snapshot);
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map(card => card.name), ['Fantasy Bear', 'Armored Wolf']);
  assert.equal(cards[0].registered, true);
  assert.equal(cards[0].active, false);
  assert.equal(cards[0].growthPercent, 40);
  assert.equal(cards[0].bonuses.hp, 280);
  assert.equal(cards[0].sourceStats.ridingXp, 500);
  assert.equal(cards[1].active, true);
  assert.equal(cards[1].speedMultiplier, 1.545);
  assert.equal(JSON.stringify(snapshot), before, 'the read-only panel must not mutate mount saves');
});

test('Mounts collection never invents an owned mount when save is empty', () => {
  assert.deepEqual(buildOwnedMountRoster({ mounts: [] }), []);
  assert.deepEqual(buildOwnedMountRoster(null), []);
  assert.deepEqual(buildOwnedMountRoster({ mounts: [{ definitionId: 'catalog-only' }] }), []);
});

test('Mastery replaces feed panel with three independent combat roles; Armory is a viewer toggle', () => {
  const root='src/components/game3d/axe/services/';
  const workspace=readFileSync(root+'AXECompanionWorkspace.jsx','utf8');
  const profile=readFileSync(root+'AXECompanionOverviewClone.jsx','utf8');
  const mastery=readFileSync(root+'AXECompanionMasteryPanel.jsx','utf8');
  const store=readFileSync('src/components/game3d/axe/progression/AXEMountStore.js','utf8');
  assert.match(workspace,/\{id:'profile',label:'My Companion'\}/);
  assert.match(workspace,/\{id:'companion',label:'Equipment'\}/);
  assert.match(workspace,/\{id:'mastery',label:'Mastery'\}/);
  assert.doesNotMatch(workspace,/Mount Armory|MountSubTab/);
  assert.match(profile,/rightView==='stats'\?'Growth & XP':'View Stats'/);
  assert.match(profile,/getCompanionGrowthView/);
  assert.match(profile,/subscribeAXEMounts/);
  assert.match(profile,/axe-comp-model-gear/);
  assert.match(mastery,/COMPANION_MASTERY_PATHS/);
  assert.match(mastery,/data-companion-page="role-mastery"/);
  assert.match(mastery,/getActiveWeaponPath/);
  assert.doesNotMatch(mastery,/feedAXEPet|overEnchantAXEPet/);
  assert.match(store,/awardCompanionRoleMasteryXP/);
  assert.match(store,/getRegisteredAXEMountBonuses/);
});
