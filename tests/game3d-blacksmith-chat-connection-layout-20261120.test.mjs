import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const prefix='src/components/game3d/axe/services/';
const panel=source(prefix+'AXEBlacksmithWorkflowPanel.jsx');
const css=source(prefix+'AXEBlacksmithWorkflowPanel.css');
const scene=source(prefix+'AXEBlacksmithImageWorkspace.jsx');
const stageCSS=source(prefix+'AXEBlacksmithImageWorkspace.css');
const hud=source('src/components/game3d/hud/Game3DHUDPlacement.css');
const manager=source('src/components/game3d/GameWorldServerManager.jsx');

test('only two empty plus slots and one between them; no left navigation/subpages',()=>{
  assert.match(panel,/data-blacksmith-two-slot="true"/);
  assert.match(panel,/ingredient\('target',target,'Equipment'/);
  assert.match(panel,/data-ingredient="materials"/);
  assert.match(panel,/className="axe-forge-empty-plus"/);
  assert.match(panel,/className="axe-forge-ingredient-plus"/);
  assert.doesNotMatch(panel,/axe-forge-mode-boxes|axe-forge-help-items|axe-forge-donor-picker/);
  assert.doesNotMatch(panel,/<nav\b|axe-forge-flow-result/);
});
test('unboxed controls sit above the existing result ring; inventory/results unchanged',()=>{
  assert.match(css,/\.axe-blacksmith-workflow \{[\s\S]*border:0;[\s\S]*background:transparent;[\s\S]*box-shadow:none/);
  assert.match(stageCSS,/corrective layout:[\s\S]*\.axe-blacksmith-workflow \{[\s\S]*top:19%/);
  assert.match(scene,/className="axe-blacksmith-inventory-shell"/);
  assert.match(scene,/className="axe-blacksmith-forge-ring"/);
  assert.match(scene,/className="axe-blacksmith-center-preview"/);
  assert.match(scene,/className="axe-blacksmith-attempt-feed"/);
});
test('enchant and auto enchant retain safe transaction controls',()=>{
  assert.match(panel,/className="axe-forge-primary-action" onClick=\{onForge\}/);
  assert.match(panel,/Auto \{label\}/);
  assert.match(panel,/aria-label="Automatic forge target"/);
  assert.match(panel,/onClick=\{onAuto\}/);
  assert.match(panel,/Confirm Auto-Forge/);
  assert.match(panel,/onClick=\{onCancelBatch\}/);
  assert.match(scene,/executeAXEServiceTransaction\(operation, payload\)/);
});
test('connection follows actual chat bottom, not minimap; chat and PvP are untouched',()=>{
  assert.match(manager,/document\.querySelector\('\.game3d-view \.game3d-world-chat'\)/);
  assert.match(manager,/new ResizeObserver\(update\)/);
  assert.match(manager,/bounds\.bottom/);
  assert.match(hud,/--axe-connection-top/);
  assert.match(hud,/--axe-connection-left/);
  assert.match(hud,/\.game3d-world-chat \{[\s\S]*bottom: calc\(var\(--axe-hud-xp-bottom, 36px\) \+ 8px\) !important/);
});
