import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const placement = readFileSync(new URL('../src/components/game3d/hud/Game3DHUDPlacement.css', import.meta.url), 'utf8');
const view = readFileSync(new URL('../src/pages/GameView.jsx', import.meta.url), 'utf8');

test('services, online count, quest and launchers no longer cover the left minimap', () => {
  assert.match(view, /Game3DHUDPlacement\.css/);
  assert.match(placement, /left: calc\(var\(--axe-map-left\) \+ var\(--axe-map-size\) \+ 22px\) !important/);
  assert.match(placement, /\.game3d-online-pill[\s\S]*--axe-connection-top/);
  assert.match(placement, /--axe-connection-left/);
  assert.match(placement, /transform-origin: left top/);
  assert.match(placement, /\.jade-quest-tracker[\s\S]*var\(--axe-map-bottom\) \+ var\(--axe-online-block\) \+ 12px \+ var\(--axe-target-notice-clearance, 0px\)/);
  assert.match(placement, /var\(--axe-hud-notice-floor, 0px\)/);
  assert.match(placement, /\.game3d-world-chat[\s\S]*bottom: calc\(var\(--axe-hud-xp-bottom, 36px\) \+ 8px\) !important/);
  assert.match(placement, /\.axe-echo-launch,\s*\.game3d-view \.axe-chronicle-vault-launch,\s*\.game3d-view \.axe-minigames-launch/);
  assert.match(placement, /bottom: calc\(var\(--axe-hud-xp-bottom, 36px\) \+ 8px\) !important/);
});
