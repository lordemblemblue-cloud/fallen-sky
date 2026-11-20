import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const panel = read('src/components/game3d/axe/services/AXEBlacksmithWorkflowPanel.jsx');
const panelCss = read('src/components/game3d/axe/services/AXEBlacksmithWorkflowPanel.css');
const workspace = read('src/components/game3d/axe/services/AXEBlacksmithImageWorkspace.jsx');
const workspaceCss = read('src/components/game3d/axe/services/AXEBlacksmithImageWorkspace.css');

test('left Inventory Forge box and duplicate operation subpages are removed from DOM and styles', () => {
  assert.doesNotMatch(panel, /axe-blacksmith-inventory-forge/);
  assert.doesNotMatch(panel, /Inventory Forge/);
  assert.doesNotMatch(panel, /axe-forge-mode-boxes/);
  assert.doesNotMatch(panelCss, /axe-blacksmith-inventory-forge/);
  assert.match(workspace, /BLACKSMITH_TABS\.map/);
});

test('inventory takes the left space; inputs sit to the right of the ring instead of above it', () => {
  const layout = workspaceCss.slice(workspaceCss.lastIndexOf('final correction: the left Inventory Forge'));
  assert.match(layout, /axe-blacksmith-inventory-shell[\s\S]*left:3\.4%!important;[\s\S]*width:34\.5%!important;/);
  assert.match(layout, /axe-blacksmith-forge-ring[\s\S]*left:39\.15%!important;/);
  assert.match(layout, /axe-blacksmith-workflow[\s\S]*left:56\.1%!important;[\s\S]*top:32\.5%!important;/);
  assert.doesNotMatch(layout, /axe-blacksmith-attempt-feed/);
});

test('two material slots and plus sign are above plain Auto and the main action', () => {
  const slots = panel.indexOf('className="axe-forge-flow"');
  const options = panel.indexOf('className="axe-forge-options"');
  const action = panel.indexOf('className="axe-forge-action-row"');
  assert.ok(slots >= 0 && slots < options && options < action);
  assert.match(panel, /axe-forge-ingredient-plus/);
  assert.match(panel, /Auto \{label\}/);
  assert.match(panel, /Start Auto \{label\}/);
  assert.match(panel, /className="axe-forge-primary-action"/);
});

test('right-side equipment and result information remains provided by the workspace', () => {
  assert.match(workspace, /className="axe-blacksmith-operation-panel"/);
  assert.match(workspace, /className="axe-blacksmith-center-preview"/);
  assert.match(workspace, /<h3>Forge Results<\/h3>/);
  assert.match(workspace, /className="axe-blacksmith-attempt-feed"/);
});
