import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('normal left-click sword/dagger attacks remain free-aim, without target selection', () => {
  const world = read('src/components/game3d/GameWorld3D.jsx');
  const mouse = world.split('const onMouseDown = (e) => {')[1];
  assert.ok(mouse);
  const left = mouse.split('if (e.button === 0) {')[1].split('} else if (e.button === 1) {')[0];
  const altSelect = left.split('if (altCursorHeld.current) {')[1].split('e.preventDefault();return;')[0];
  assert.match(altSelect, /handleMiddleClick\(/); // explicit cursor selection still works
  const normalAttack = left.split('e.preventDefault();return;')[1];
  assert.doesNotMatch(normalAttack, /handleMiddleClick\(/);
  assert.doesNotMatch(normalAttack, /lockOnTargetRef\.current\s*=/);
  assert.match(normalAttack, /attackPressed\.current=true/);
  assert.match(normalAttack, /heldBow\.active=true/);
});

test('middle-click is still a manual lock toggle and dead enemies release immediately', () => {
  const world = read('src/components/game3d/GameWorld3D.jsx');
  const mouse = world.split('const onMouseDown = (e) => {')[1];
  const middle = mouse.split('} else if (e.button === 1) {')[1].split('} else if (e.button === 2) {')[0];
  assert.match(middle, /handleMiddleClick\(/);
  assert.match(middle, /lockOnTargetRef\.current=toggledOff\?null:target/);
  assert.match(world, /shouldReleaseWorldTarget\(lockOnTargetRef\.current/);
  const settings = read('src/components/game3d/axe/player/AXEControlSettingsStore.js');
  assert.match(settings, /autoTargetNearby: false/); // opt-in proximity targeting remains off by default
});

test('Fallen Sky player cap is consistently level 155 across XP, realm and duel', () => {
  const budget = read('base44/shared/axePowerBudget.ts');
  const config = read('src/components/game3d/axe/progression/AXECharacterProgressionConfig.js');
  const worldConfig = read('src/components/game3d/gameWorldConfig.jsx');
  const hud = read('src/components/game3d/playerHUDStore.jsx');
  assert.match(budget, /export const AXE_LEVEL_CAP = 155\b/);
  assert.match(budget, /const MAX_HERO_STATS = getAXEParHero\(AXE_LEVEL_CAP\)/);
  assert.match(budget, /if \(L > last\[0\]\)/); // no level-100 flatline in enemy balance
  assert.match(budget, /level: AXE_LEVEL_CAP,/); // server-side duel stats
  assert.match(config, /normalLevelCap: AXE_LEVEL_CAP/);
  assert.match(worldConfig, /level >= AXE_LEVEL_CAP\s*\? Infinity/);
  assert.match(hud, /xpForNext: xpForLevel\(level\)/); // old capped level-100 saves recover
  assert.match(hud, /if \(level >= AXE_LEVEL_CAP\) \{/); // endgame XP does not accumulate
});
