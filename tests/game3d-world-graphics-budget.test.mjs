import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game3dWorldGraphicsBudget } from '../src/components/game3d/performance/Game3DWorldGraphicsBudget.mjs';

const root = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('lower quality presets reduce shadow, fog and weather work inside the world', () => {
  const low = game3dWorldGraphicsBudget({ quality: 'low', shadows: true });
  const high = game3dWorldGraphicsBudget({ quality: 'high', shadows: true });
  assert.equal(low.shadowSize, 256);
  assert.equal(high.shadowSize, 1024);
  assert.ok(low.fogScale < high.fogScale);
  assert.ok(low.particleScale < high.particleScale);
  assert.equal(low.shadows, true);
  const off = game3dWorldGraphicsBudget({ quality: 'ultra', shadows: false });
  assert.equal(off.shadows, false);
  assert.equal(off.shadowSize, 2048);
  assert.equal(game3dWorldGraphicsBudget({ quality: 'nope' }).quality, 'high');
});

test('the live world applies the pause-menu graphics budget without reloading', () => {
  const world = root('src/components/game3d/GameWorld3D.jsx');
  const env = root('src/components/game3d/WorldEnvironmentSystem.js');
  const menu = root('src/components/game3d/PauseMenu.jsx');
  assert.match(world, /applyWorldGraphicsBudget\(\)/);
  assert.match(world, /window\.__gw3dGraphicsBudget = budget/);
  assert.match(world, /renderer\.shadowMap\.enabled = budget\.shadows/);
  assert.match(world, /worldSun\.castShadow = budget\.shadows/);
  assert.match(world, /graphicsSettingsChanged/);
  assert.match(env, /readGraphicsFogScale\(\)/);
  assert.match(env, /scaledParticleCount\(RAIN_COUNT\)/);
  assert.match(env, /scaledParticleCount\(SNOW_COUNT\)/);
  assert.match(menu, /graphicsSettingsChanged/);
  assert.match(menu, /Dynamic Shadows/);
  assert.match(menu, /Quality preset/);
});
