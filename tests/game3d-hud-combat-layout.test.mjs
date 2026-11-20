import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const hud = file('src/components/game3d/hud/JadeSoulHUD.jsx');
const hudCss = file('src/components/game3d/hud/JadeSoulHUD.css');
const noticeCss = file('src/components/game3d/notifications/Game3DLunarNotifications.css');
const world = file('src/components/game3d/GameWorld3D.jsx');
const store = file('src/components/game3d/abilityStore.jsx');
const fallbackToast = file('src/components/game3d/LevelUpToastListener.jsx');
const target = file('src/components/game3d/hud/TargetDisplay.jsx');

test('stamina popup consumes projected waist coordinates and live occlusion flag', () => {
  assert.match(hud, /staminaHudAnchor\(position\)/);
  assert.match(hud, /node\.dataset\.staminaOccluded/);
  assert.match(world, /staminaOccludedByEnemy = staminaOverlapsEnemy/);
  assert.match(world, /staminaOccludedByEnemy,/);
});
test('target bar is below map and takes priority over the level-up announcement', () => {
  assert.match(hud, /<Compass region=\{region\}/);
  assert.match(hudCss, /--axe-target-notice-clearance:66px/);
  assert.match(hudCss, /\.jade-compass-block \.axe-target-lock \{ margin-top:18px; \}/);
  assert.match(noticeCss, /\.axe-lunar-notifications--level \{[\s\S]*?var\(--axe-target-notice-clearance,0px\)/);
});
test('the stamina gauge dims heavily when the enemy occupies its screen area', () => {
  assert.match(hudCss, /data-stamina-occluded="true"/);
  assert.match(hudCss, /opacity:\.14/);
});
test('dead targets clear from both live lock and stored health immediately', () => {
  assert.match(world, /shouldReleaseWorldTarget\(lockOnTargetRef\.current/);
  assert.match(world, /closestEnemy\.dying = true;[\s\S]{0,420}?clearTarget\(\)/);
  assert.match(store, /Number\.isFinite\(hp\) && hp <= 0/);
  assert.match(target, /exit=\{\{opacity:0,y:-6,transition:\{duration:0\}\}\}/);
});
test('level-up uses its under-map lunar card without another top-center toast', () => {
  assert.match(fallbackToast, /document\.querySelector\('\.game3d-view \.jade-hud'\)/);
});
