import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allowsSpiritualPreviewMax } from '../src/components/game3d/progression/previewMaxRules.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const workspace = read('src/components/game3d/axe/services/AXESpiritualWorkspace.jsx');
const css = read('src/components/game3d/axe/services/AXESpiritualWorkspace.css');
const viewer = read('src/components/game3d/axe/services/AXESpiritualCharacterViewer.jsx');
const preview = read('src/components/game3d/progression/previewMaxMode.jsx');
const controls = read('src/components/game3d/progression/hub/DevSpiritualMaxControls.jsx');
const halo = read('src/components/game3d/progression/haloStore.jsx');
const wings = read('src/components/game3d/progression/wingsStore.jsx');
const kills = read('src/components/game3d/killCountStore.jsx');

test('spirituality displays the real character stage at left and a single larger details pane at right', () => {
  assert.match(workspace, /<CharacterViewer halo=\{halo\} wings=\{wings\}/);
  assert.match(workspace, /<section className="axe-spiritual-details">/);
  assert.match(workspace, /<nav className="axe-spiritual-choices" aria-label="Spiritual disciplines">/);
  assert.equal((workspace.match(/className="axe-spiritual-sidebar"/g) || []).length, 0);
  assert.match(css, /SPIRITUALITY TWO-PANE CHARACTER VIEWER/);
  assert.match(css, /grid-template-columns:minmax\(255px,42%\) minmax\(0,1fr\)/);
  assert.match(css, /grid-template-rows:minmax\(175px,34%\) minmax\(0,1fr\)/);
  assert.match(css, /height:50%/);
  assert.match(css, /background:linear-gradient\(180deg,transparent,rgba\(255,227,166,.7\) 50%,transparent\)/);
});
test('3D preview loads the same equipment-aware model and renders three-dimensional spiritual ornaments', () => {
  assert.match(viewer, /useGameAvatar\(\)/);
  assert.match(viewer, /createAvatarScene\(mount.current/);
  assert.match(viewer, /model\.add\(group\)/);
  assert.match(viewer, /THREE\.TorusGeometry/);
  assert.match(viewer, /THREE\.ConeGeometry/);
  assert.match(viewer, /selectedWing \|\| wings\?\.equippedWing/);
  assert.match(viewer, /stage\.current\?\.setAppearance\(config\)/);
});
test('typo corrected and live stats/other subpages remain wired', () => {
  assert.equal((workspace.match(/Ranked players killed/g) || []).length, 2);
  assert.doesNotMatch(workspace, /Banked player kills/);
  assert.match(workspace, /<HaloDetails halo=\{halo\} preview\/>/);
  assert.match(workspace, /<WingDetails wing=\{wing\} preview\/>/);
  assert.match(workspace, /<TitleSubTab \/>/);
  assert.match(workspace, /<AscensionSubTab \/>/);
  assert.match(workspace, /<DevSpiritualMaxControls \/>/);
});
test('preview-only max kills are ephemeral, non-spendable and never touch the canonical count', () => {
  assert.match(controls, /Max Kills \(Preview\)/);
  assert.match(controls, /setPreviewKills\(!active\.kills\)/);
  assert.match(preview, /export const SPIRITUAL_PREVIEW_MAX_KILLS = 999999/);
  assert.match(preview, /isSpiritualPreviewMode\(\) && maxed\.kills/);
  assert.match(preview, /maxed\.kills = false/);
  assert.match(halo, /getPreviewKillCount\(getKillCount\(\)\)/);
  assert.match(wings, /getPreviewKillCount\(getKillCount\(\)\)/);
  assert.match(halo, /isPreviewMaxActive\('halo'\) \|\| isPreviewKillsActive\(\)/);
  assert.match(wings, /isPreviewMaxActive\('wings'\) \|\| isPreviewKillsActive\(\)/);
  assert.match(workspace, /disabled=\{level >= cap \|\| kills < cost \|\| isPreviewKillsActive\(\)\}/);
  assert.doesNotMatch(preview, /incrementKillCount|resetKillCount|characterScopedStorage|localStorage|fetch\(/);
  assert.match(kills, /persist\(\)/); // Real canonical count still persists as before.
});
test('test-only preview requires explicit opt-in plus test server and exact host', () => {
  assert.equal(allowsSpiritualPreviewMax({hostname:'game.example.com',enabled:'true',serverEnv:'production',previewHost:'game.example.com'}),false);
  assert.equal(allowsSpiritualPreviewMax({hostname:'game.example.com',enabled:'true',serverEnv:'test',previewHost:'preview.example.com'}),false);
  assert.equal(allowsSpiritualPreviewMax({hostname:'preview.example.com',enabled:'true',serverEnv:'test',previewHost:'preview.example.com'}),true);
  assert.equal(allowsSpiritualPreviewMax({hostname:'localhost',enabled:'true',serverEnv:'test',dev:false}),false);
  assert.equal(allowsSpiritualPreviewMax({hostname:'localhost',enabled:'true',serverEnv:'test',dev:true}),true);
});
