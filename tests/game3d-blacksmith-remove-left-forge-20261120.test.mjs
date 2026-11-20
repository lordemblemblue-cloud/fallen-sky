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
  assert.doesNotMatch(panel, /<span>Inventory Forge<\/span>/);
  assert.doesNotMatch(panel, /axe-forge-mode-boxes/);
  assert.doesNotMatch(panelCss, /axe-blacksmith-inventory-forge/);
  assert.match(workspace, /BLACKSMITH_TABS\.map/);
});

test('inventory is 10% narrower; boxes sit between inventory and circle with aligned tops', () => {
  const layout = workspaceCss.slice(workspaceCss.lastIndexOf('final correction: the left Inventory Forge'));
  const area = selector => {
    const start = layout.indexOf(selector);
    assert.ok(start >= 0, 'missing ' + selector);
    const brace = layout.indexOf('{', start);
    return layout.slice(brace + 1, layout.indexOf('}', brace));
  };
  const inventory = area(') .axe-blacksmith-inventory-shell');
  const flow = area(') .axe-blacksmith-workflow');
  const ring = area(') .axe-blacksmith-forge-ring');
  const circle = area(') .axe-blacksmith-center-preview');
  assert.match(inventory, /left:3\.4%!important/);
  assert.match(inventory, /width:31\.05%!important/);
  assert.equal(31.05, 34.5 * 0.9);
  assert.match(flow, /left:36%!important/);
  assert.match(flow, /width:17\.3%!important/);
  assert.match(flow, /top:37%!important/);
  assert.match(ring, /left:55\.1%!important/);
  assert.match(ring, /top:37%!important/);
  assert.match(circle, /left:55\.1%!important/);
  assert.match(circle, /top:37%!important/);
  assert.ok(3.4 + 31.05 < 36, 'inventory and equipment slots must not touch');
  assert.ok(36 + 17.3 < 55.1, 'equipment slots and circle must not touch');
  assert.ok(55.1 + 16.125 < 73, 'circle must not cover the right information panel');
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
  assert.match(panel, /axe-forge-enchant-choices/); // Keep the two subpages under the boxes.
});

test('right-side equipment and result information remains provided by the workspace', () => {
  assert.match(workspace, /className="axe-blacksmith-operation-panel"/);
  assert.match(workspace, /className="axe-blacksmith-center-preview"/);
  assert.match(workspace, /<h3>Forge Results<\/h3>/);
  assert.match(workspace, /className="axe-blacksmith-attempt-feed"/);
});
