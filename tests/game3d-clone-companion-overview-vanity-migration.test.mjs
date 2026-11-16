import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const services = 'src/components/game3d/axe/services/';
const src = name => readFileSync(services + name, 'utf8');

test('My Companion leads Equipment and renders the actual active owned mount', () => {
  const workspace=src('AXECompanionWorkspace.jsx');
  const profile=src('AXECompanionOverviewClone.jsx');
  const preview=readFileSync('src/components/game3d/equipment/CompanionPreview3D.jsx','utf8');
  assert.match(workspace,/const TABS=\['Equipment','Vanity','Imbuement'\]/);
  assert.match(workspace,/\{id:'profile',label:'My Companion'\}/);
  assert.match(workspace,/equipmentView==='profile'\?<AXECompanionOverviewClone/);
  assert.doesNotMatch(workspace,/MountSubTab|Mount Armory/);
  assert.match(profile,/subscribeAXEMounts/);
  assert.match(profile,/mounts.activeMountId/);
  assert.match(profile,/getAXEMountDefinition\(mount.definitionId\)/);
  assert.match(profile,/CompanionPreview3D key=\{modelId\} companionId=\{modelId\}/);
  assert.match(profile,/Growth & XP/);
  assert.match(profile,/axe-comp-model-gear/);
  assert.match(profile,/axe-char-stat-row/);
  assert.doesNotMatch(profile,/getAXEPetDefinition|summonAXEPet/);
  assert.match(preview,/companionId = null/);
});

test('Vanity collection shows actually owned pieces, costumes and rarity filters', () => {
  const style = src('AXECompanionStylePane.jsx');
  const css = src('AXECompanionStylePane.css');
  for (const expected of ['vanity.ownedPieceIds','costumes.owned', "kind:'vanity'",
    "kind:'costume'", 'Filter cosmetic type', 'Filter cosmetic rarity',
    'Search vanity and costumes', 'Vanity Collection','itemStats',
    'shown.length} shown · {owned.length} owned']) {
    assert(style.includes(expected), 'Missing combined Vanity implementation: ' + expected);
  }
  assert.doesNotMatch(style, /axe-app-inventory-filters/);
  assert.doesNotMatch(style, /\['left','right'\]\.map/);
  assert.match(css, /axe-comp-collection-controls/);
});

test('Companion gear uses one left-side rail and a header search; player view remains unchanged', () => {
  const loadout = src('AXEGlassLoadoutPane.jsx');
  const css = src('AXEGlassLoadoutPane.css');
  assert.match(loadout, /isPlayer && \['left','right'\]\.map/);
  assert.match(loadout, /isPlayer && inventoryToolbar/);
  assert.match(loadout, /!isPlayer && inventoryToolbar/);
  assert.match(loadout, /isPlayer \? focusedSlot===slot : filter===slot/);
  assert.match(loadout, /getAXEEquipmentDisplayStats/);
  assert.match(css, /data-equipment-actor="companion"/);
});

test('Merged catalog does not apply player cosmetics to companion gear', () => {
  const s = src('AXECompanionStylePane.jsx');
  assert.match(s,/Companion equip remains unavailable/);
  assert.match(s,/disabled>\s*<Shirt size=\{18\}\/>Equip to Companion/);
  assert.doesNotMatch(s,/equipAXECostume\(|equipAXEVanityPiece\(/);
});
