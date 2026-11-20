import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const workflow = read('src/components/game3d/axe/services/AXEBlacksmithWorkflowPanel.jsx');
const workflowCss = read('src/components/game3d/axe/services/AXEBlacksmithWorkflowPanel.css');
const css = read('src/components/game3d/axe/services/AXEBlacksmithImageWorkspace.css');
const workspace = read('src/components/game3d/axe/services/AXEBlacksmithImageWorkspace.jsx');

test('no separate Inventory Forge card or duplicate operation subpage boxes', () => {
  assert.doesNotMatch(workflow, /Inventory Forge/);
  assert.doesNotMatch(workflow, /axe-forge-mode-boxes/);
  assert.doesNotMatch(workflow, /axe-forge-flow-result/);
  assert.match(workflowCss, /border:0;[\s\S]*?background:none;[\s\S]*?box-shadow:none;/);
});

test('all Blacksmith operations are in the shared navigation row', () => {
  assert.match(workspace, /BLACKSMITH_TABS\.map\(\(\{ id, label, Icon \}\)/);
  assert.match(workspace, /axe-blacksmith-tab-label/);
  assert.doesNotMatch(workspace, /BLACKSMITH_TABS\.filter\(entry => !\['over_enchant', 'combine'\]/);
});

test('two readable slots flank a plus before the existing item circle', () => {
  assert.match(workflow, /slot\('target', target, 'Equipment', onClearTarget\)/);
  assert.match(workflow, /axe-forge-ingredient-plus/);
  assert.match(workflow, /slot\('donor', donor, 'Donor', onClearDonor\)/);
  assert.match(workflow, /axe-forge-automation[\s\S]*axe-forge-action-row/);
  const layout = css.slice(css.lastIndexOf('owner-directed open Blacksmith layout'));
  assert.match(layout, /left:3\.4%;[\s\S]*?width:35\.4%/);
  assert.match(layout, /left:40\.1%;[\s\S]*?width:14\.9%/);
  assert.match(layout, /left:55\.6%;[\s\S]*?width:17\.1%/);
  assert.doesNotMatch(layout, /axe-blacksmith-attempt-feed/);
});

test('existing Forge Results feed and item circle contents remain unchanged', () => {
  assert.match(workspace, /className="axe-blacksmith-attempt-feed"/);
  assert.match(workspace, /<h3>Forge Results<\/h3>/);
  assert.match(workspace, /className="axe-blacksmith-circle-result"/);
  assert.match(workspace, /forgeHistory\.map\(attempt/);
});
