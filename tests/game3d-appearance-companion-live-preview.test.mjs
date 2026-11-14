import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');

test('Appearance and Character previews consume the same live inventory-owned armor as Play', () => {
  const viewer = read('src/components/game3d/equipment/EquipmentPreview3D.jsx');
  const bridge = read('src/components/game3d/armor/armorEquipBridge.js');
  const world = read('src/components/game3d/GameWorld3D.jsx');
  assert.match(viewer, /const config = useGameAvatar\(\)/);
  assert.match(viewer, /<CreatorStage/);
  assert.match(viewer, /creatorBody\(config\)/);
  assert.match(viewer, /IntersectionObserver/);
  assert.match(viewer, /modelUrlOverride=\{config\.model_url\}/);
  assert.match(bridge, /subscribeAXEEquipmentInventory/);
  assert.match(bridge, /equippedAXEArmorPieces/);
  assert.match(bridge, /reconcileInventoryArmorOverrides\(equipped, inventoryWorn, PACK_SET_IDS\)/);
  assert.match(world, /applyPlayerAppearance\(modelRef\.current,avatarConfig\)/);
});
test('Companion preview responds to active companion and equipped gear snapshots', () => {
  const source = read('src/components/game3d/equipment/CompanionPreview3D.jsx');
  assert.match(source, /useState\(getCompanionState\)/);
  assert.match(source, /subscribeCompanion\(setLoadout\)/);
  assert.match(source, /companionId \|\| loadout\.activeCompanionId/);
  assert.match(source, /loadout\.gear\?\.\[companion\?\.id\]/);
  assert.match(source, /\[companion\?\.id, companion\?\.modelUrl\]/);
  assert.match(source, /data-companion-gear=/);
  assert.match(source, /if \(disposed\) return;/);
});

test('horizontal Appearance and Companion UI chrome matches gold-glass styling', () => {
  const appearance = read('src/components/game3d/axe/services/AXEAppearanceWorkspace.css');
  const companion = read('src/components/game3d/axe/services/AXECompanionWorkspace.css');
  assert.match(appearance, /\.axe-service-workspace--appearance \.axe-app-root \{ overflow-x:hidden; \}/);
  assert.match(appearance, /\.axe-app-root \.axe-app-inventory-filters::-webkit-scrollbar-thumb/);
  assert.match(companion, /\.axe-service-workspace--companion \.axe-comp-tabs::-webkit-scrollbar-thumb/);
});
