import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const workflow = read('src/components/game3d/axe/services/AXEBlacksmithWorkflowPanel.jsx');
const css = read('src/components/game3d/axe/services/AXEBlacksmithImageWorkspace.css');
const workspace = read('src/components/game3d/axe/services/AXEBlacksmithImageWorkspace.jsx');

test('inventory workstation retains its original distinct boxes', () => {
  assert.match(workflow, /Inventory Forge/);
  assert.match(workflow, /axe-forge-mode-boxes/);
  assert.match(workflow, /axe-forge-flow-result/);
  assert.match(workflow, /axe-forge-selected/);
});
test('inventory returns to old left-column geometry without hiding results', () => {
  const restore = css.slice(css.lastIndexOf('Restore the pre-redesign workstation'));
  assert.match(restore, /left:2\.1%;[\s\S]*?width:14\.7%/);
  assert.match(restore, /left:18\.5%;[\s\S]*?width:28\.8%/);
  assert.doesNotMatch(restore, /axe-blacksmith-attempt-feed/);
});
test('existing forge results feed and center result remain intact', () => {
  assert.match(workspace, /className="axe-blacksmith-attempt-feed"/);
  assert.match(workspace, /<h3>Forge Results<\/h3>/);
  assert.match(workspace, /className="axe-blacksmith-circle-result"/);
  assert.match(workspace, /forgeHistory\.map\(attempt/);
});
