import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const appearance = read('src/components/game3d/axe/services/AXEAppearanceWorkspace.jsx');
const equipment = read('src/components/game3d/axe/services/AXEGlassLoadoutPane.jsx');
const css = read('src/components/game3d/axe/services/AXEAppearanceWorkspace.css');
const equipmentCss = read('src/components/game3d/axe/services/AXEGlassLoadoutPane.css');

test('Appearance inventory filters are side-by-side with the item grid, not a scrolling horizontal strip', () => {
  assert.match(appearance, /axe-app-inventory-browser[\s\S]*?axe-app-inventory-filters[\s\S]*?axe-app-inventory-grid/);
  assert.match(equipment, /axe-app-inventory-browser[\s\S]*?axe-app-inventory-filters[\s\S]*?axe-app-inventory-grid/);
  assert.match(css, /\.axe-app-inventory-browser\s*\{[\s\S]*?grid-template-columns:minmax\(38px,10%\)/);
  assert.match(css, /\.axe-app-inventory-browser>\.axe-app-inventory-filters\s*\{[\s\S]*?flex-direction:column[\s\S]*?justify-content:safe center/);
  assert.match(css, /mask-image:linear-gradient\(to bottom,transparent,#000 9%,#000 91%,transparent\)/);
  assert.match(equipmentCss, /\.axe-glass-loadout \.axe-app-inventory-browser>\.axe-app-inventory-filters\s*\{[\s\S]*?overflow-x:hidden/);
  assert.doesNotMatch(equipmentCss, /\.axe-glass-loadout \.axe-app-inventory-filters\s*\{overflow-x:auto/);
});

test('Appearance tiles are about fifteen percent smaller without shrinking their readable names', () => {
  // Previous row heights 105px (desktop) and 102px (medium viewport).
  assert.equal(89, Math.round(105 * 0.85));
  assert.equal(87, Math.round(102 * 0.85));
  assert.match(css, /grid-auto-rows:89px/);
  assert.match(css, /grid-auto-rows:87px/);
  assert.match(css, /max-height:43px/); // originally 50px
  assert.match(css, /grid-template-columns:repeat\(auto-fill,minmax\(min\(100%,60px\),1fr\)\)/);
});

test('Double-click equips the clicked equipment item while detail button retains unequip action', () => {
  assert.match(equipment, /onClick=\{\(\)=>setSelectedId\(item\.instanceId \|\| item\.id\)\}/);
  assert.match(equipment, /onDoubleClick=\{\(\)=>\{setSelectedId\(item\.instanceId \|\| item\.id\);performItem\(item\);\}\}/);
  assert.match(equipment, /const worn = isPlayer \? !!item\.equipped/);
  assert.match(equipment, /onClick=\{\(\)=>performItem\(selected,true\)\}/);
  assert.match(equipment, /equipAXEInventoryItem\(item\.instanceId,\{level:getPlayerHUD\(\)\.level\}\)/);
});

test('Double-click equips the chosen owned Vanity or Costume and Aura retains its own equip action', () => {
  assert.match(appearance, /onDoubleClick=\{\(\) => equipFromInventory\(item\)\}/);
  assert.match(appearance, /equipAXEVanityPiece\(item\.id\)/);
  assert.match(appearance, /equipAXECostume\(item\.id\)/);
  assert.match(appearance, /onDoubleClick=\{\(\)=>\{const result=selectAppearanceAuraSource\(aura\.id\)/);
  assert.match(appearance, /setNotice\(result\.ok \?/);
});
