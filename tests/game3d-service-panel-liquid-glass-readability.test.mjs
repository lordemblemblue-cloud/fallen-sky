import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL('../src/components/game3d/axe/services/'+name,import.meta.url),'utf8');
const css=read('AXEServiceLiquidGlass.css');

test('the same scoped glass finish is mounted for all Game 3D service groups',()=>{
  const workspace=read('AXEServiceWorkspace.jsx');
  assert.match(workspace,/import '\.\/AXEServiceLiquidGlass\.css'/);
  for(const group of ['skills','quest-logbook','companion','character','appearance','spiritual','blacksmith'])
    assert.ok(css.includes('.axe-service-workspace--'+group),'missing '+group);
  assert.match(css,/--axe-reading-glass:/);
  assert.match(css,/--axe-reading-glass-strong:/);
  assert.match(css,/backdrop-filter:var\(--axe-reading-blur\)/);
  assert.match(css,/-webkit-backdrop-filter:var\(--axe-reading-blur\)/);
});

test('3D viewers and artwork are never selected for blur',()=>{
  // Only informational service surfaces are targeted. Avoid blur on the
  // canvases, world stage, shared model container or image-backed forge.
  for(const forbidden of [
    '.axe-app-model-stage {','.axe-app-model-center {',
    '.axe-app-model-host {','.axe-comp-imbue-model {',
    '.axe-mastery-portrait {','.axe-spiritual-vision {',
    '.axe-constellation-sky {','.axe-blacksmith-image-stage {',
    '.axe-service-progression {','.axe-blacksmith-center-preview {',
  ])assert.ok(!css.includes(forbidden),'3D/artwork selector must not be blurred: '+forbidden);
  assert.match(css,/not the central wardrobe or armor viewer/);
  assert.match(css,/NEVER the artwork/);
});

test('light dark overlay preserves selection and mobile/reduced transparency controls',()=>{
  assert.match(css,/rgba\(3,8,15,\.24\)/);
  assert.match(css,/\.axe-sk-skill:not\(\[aria-pressed="true"\]\)/);
  assert.match(css,/\.axe-quest-entry:not\(\[aria-pressed="true"\]\)/);
  assert.match(css,/@media \(max-width:720px\)/);
  assert.match(css,/@media \(prefers-reduced-transparency:reduce\)/);
  assert.match(css,/--axe-reading-blur:none/);
});
