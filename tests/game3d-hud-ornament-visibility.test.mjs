import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const view = read('src/pages/GameView.jsx');
const hud = read('src/components/game3d/hud/JadeSoulHUD.jsx');
const css = read('src/components/game3d/hud/JadeSoulHUD.css');

test('Game 3D has no preview Animations button in the playable world', () => {
  assert.doesNotMatch(view, /preview-animations-nav|isAnimationsPreviewHost/);
  assert.match(view, /<GameHUD\b/);
});

test('Clone HUD omits the decorative top-left circle but retains the Services layout anchor', () => {
  assert.doesNotMatch(hud, /className="jade-status-portrait"/);
  assert.match(hud, /<div className="jade-status" aria-label="Character status"\s*\/>/);
  assert.match(hud, /<AXEServicesNavigation/);
});
