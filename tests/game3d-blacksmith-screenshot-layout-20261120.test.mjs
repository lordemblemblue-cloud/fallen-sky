import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const dir='src/components/game3d/axe/services/';
const panel=read(dir+'AXEBlacksmithWorkflowPanel.jsx');
const scene=read(dir+'AXEBlacksmithImageWorkspace.jsx');
const css=read(dir+'AXEBlacksmithImageWorkspace.css');
test('top navigation has all seven operations, with left inventory and forge panels',()=>{
  assert.match(scene,/BLACKSMITH_TABS\.map\(/);
  assert.doesNotMatch(scene,/BLACKSMITH_TABS\.filter\(/);
  assert.match(panel,/className="axe-blacksmith-inventory-forge"/);
  assert.match(panel,/className="axe-forge-mode-boxes"/);
  assert.match(panel,/className="axe-forge-selected"/);
  assert.match(panel,/className="axe-forge-help-items"/);
  assert.match(css,/left:18\.5%!important;top:15%;width:28\.8%!important/);
  assert.match(css,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
});
test('two plus slots are above a ritual circle reduced by exactly 25%',()=>{
  assert.match(panel,/data-blacksmith-two-slot="true"/);
  assert.match(panel,/ingredient\('target',target,'Equipment'/);
  assert.match(panel,/className="axe-forge-ingredient-plus"/);
  assert.match(panel,/className="axe-forge-empty-plus"/);
  assert.match(css,/top:27\.5%!important;width:16\.8%!important/);
  assert.match(css,/21\.5% -> 16\.125%/);
  assert.match(css,/width:16\.125%!important;aspect-ratio:1/);
  assert.match(css,/top:37%!important/);
});
test('selected weapon art and labels stay inside circle; success moves below it',()=>{
  assert.match(scene,/className="axe-blacksmith-item-rarity"/);
  assert.match(scene,/axe-forge-ascended-name/);
  assert.match(scene,/className="axe-blacksmith-item-level"/);
  assert.match(scene,/axe-blacksmith-center-art/);
  assert.match(scene,/className="axe-blacksmith-center-success"/);
  assert.match(scene,/!workflowMode && <div className="axe-blacksmith-success"/);
});
test('right information and lower progression are restored, scroll-free',()=>{
  assert.match(scene,/<section className="axe-blacksmith-operation-panel"/);
  assert.match(scene,/className="axe-blacksmith-progression-panel"/);
  assert.match(css,/\.axe-blacksmith-operation-panel \{[\s\S]*overflow:hidden!important/);
  assert.match(css,/\.axe-blacksmith-attempt-feed \{display:none!important/);
});
test('current forge transactions and auto protections survive the layout revert',()=>{
  assert.match(scene,/executeAXEServiceTransaction\(operation, payload\)/);
  assert.match(panel,/aria-label="Automatic forge target"/);
  assert.match(panel,/aria-label="Minimum success rate"/);
  assert.match(panel,/Confirm Auto-Forge/);
});
