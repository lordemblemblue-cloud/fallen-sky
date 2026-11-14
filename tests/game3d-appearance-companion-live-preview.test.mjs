import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');

test('Appearance preview reads canonical character equipment even before world mount', () => {
  const source = read('src/components/game3d/equipment/EquipmentPreview3D.jsx');
  assert.match(source, /subscribeAXEEquipmentInventory/);
  assert.match(source, /equippedAXEArmorPieces\(items\)/);
  assert.match(source, /loadBuiltinLayers\('armor'\)/);
  assert.match(source, /withEquippedArmor\(worldAvatar, overrides, armorAssets, ARMOR_SLOTS\)/);
  assert.match(source, /equipped\[slot\] \|\| ''/);
  assert.match(source, /modelUrlOverride=\{config\.model_url\}/);
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
