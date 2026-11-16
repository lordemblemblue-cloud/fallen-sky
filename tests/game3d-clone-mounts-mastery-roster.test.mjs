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

test('Mounts is no longer the fusion UI; armory still keeps old progression controls', () => {
  const root = 'src/components/game3d/axe/services/';
  const mounts = readFileSync(root + 'AXEOwnedMountsPanel.jsx', 'utf8');
  const workspace = readFileSync(root + 'AXECompanionWorkspace.jsx', 'utf8');
  const globalMenu = readFileSync(root + 'AXEGlobalServicesMenu.jsx', 'utf8');
  const mastery = readFileSync(root + 'AXECompanionMasteryPanel.jsx', 'utf8');
  assert.match(mounts, /data-companion-page="owned-mounts"/);
  assert.match(mounts, /buildOwnedMountRoster/);
  assert.doesNotMatch(mounts, /MountSoulFusionPanel|absorbAXEMount|refineAXEMountGear|releaseAXEMount/);
  assert.match(workspace, /tab === 'Mounts' \? <AXEOwnedMountsPanel/);
  assert.match(workspace, /onOpenArmory/);
  assert.match(workspace, /equipmentView === 'mount'/);
  assert.match(workspace, /<MountSubTab \/>/);
  assert.match(workspace, /tab === 'Mastery' \? <AXECompanionMasteryPanel/);
  assert.match(mastery, /data-companion-page="mastery"/);
  assert.match(globalMenu, /mount: AXECompanionWorkspace/);
});
