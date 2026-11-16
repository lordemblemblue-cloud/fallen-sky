import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const services = 'src/components/game3d/axe/services/';
const src = name => readFileSync(services + name, 'utf8');

test('Equipment owns the live My Companion roster and switches both right panels', () => {
  const workspace=src('AXECompanionWorkspace.jsx');
  const loadout=src('AXEGlassLoadoutPane.jsx');
  const insights=src('AXECompanionInsights.jsx');
  const preview=readFileSync('src/components/game3d/equipment/CompanionPreview3D.jsx','utf8');
  assert.match(workspace,/const TABS=\['Equipment','Mastery','Vanity','Imbuement'\]/);
  assert.match(workspace,/tab==='Mastery'/);
  assert.match(workspace,/tab==='Equipment'/);
  assert.doesNotMatch(workspace,/AXECompanionOverviewClone|label:'My Companion'/);
  assert.match(loadout,/className="axe-app-rail axe-glass-loadout-rail axe-comp-owned-roster"/);
  assert.match(loadout,/aria-label="My Companion - owned mounts"/);
  assert.match(loadout,/<strong>Companions<\/strong>/);
  assert.match(loadout,/className="axe-comp-roster-title"/);
  assert.match(loadout,/placeholder=\{rosterFocused\?'':'Search companion'\}/);
  assert.match(loadout,/onFocus=\{\(\)=>setRosterFocused\(true\)\}/);
  assert.match(loadout,/onBlur=\{\(\)=>setRosterFocused\(false\)\}/);
  assert.match(loadout,/mounts.activeMountId/);
  assert.match(loadout,/getAXEMountDefinition\(selectedMount.definitionId\)/);
  assert.match(loadout,/companionId=\{activeCompanion.id\}/);
  assert.match(loadout,/className="axe-comp-insights-toggle"/);
  assert.match(loadout,/setInsightsOpen\(value=>!value\)/);
  assert.match(loadout,/!isPlayer&&insightsOpen \? <CompanionAttributesPanel/);
  assert.match(loadout,/!isPlayer&&insightsOpen \? <CompanionGrowthPanel/);
  assert.match(loadout,/<CompanionAttributesPanel mount=\{selectedMount\} snapshot=\{mounts\}\/>/);
  assert.match(loadout,/<CompanionGrowthPanel mount=\{selectedMount\} snapshot=\{mounts\}\/>/);
  assert.match(insights,/applyCompanionRoleBonus/);
  assert.match(insights,/getCompanionGrowthView/);
  assert.match(insights,/getCompanionMasteryProgress/);
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

test('Companion left rail is owned mounts; player equipment remains unchanged', () => {
  const loadout = src('AXEGlassLoadoutPane.jsx');
  const css = src('AXEGlassLoadoutPane.css');
  assert.match(loadout, /isPlayer && \['left','right'\]\.map/);
  assert.match(loadout, /isPlayer \? <aside className="axe-app-rail/);
  assert.match(loadout, /axe-comp-owned-roster/);
  assert.match(loadout, /!isPlayer&&\['left','right'\]\.map/);
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
