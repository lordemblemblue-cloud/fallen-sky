import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME3D_PLATFORM_DEFAULTS } from '../src/components/game3d/performance/Game3DPlatformGraphics.mjs';
import { nearWolfveilAreas } from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';

const world = readFileSync(new URL('../src/components/game3d/GameWorld3D.jsx', import.meta.url), 'utf8');

test('live world honors platform area preload and does not instantly dispose every unloaded area', () => {
  assert.match(world, /const areaStreamingOptions=\(\)=>\{/);
  assert.match(world, /mode:profile\.areaLoading,preloadMeters:profile\.preloadMeters/);
  assert.match(world, /releaseGpuMemory:profile\.releaseGpuMemory,releaseDelaySeconds:20/);
  assert.match(world, /\.\.\.areaStreamingOptions\(\)/);
  assert.match(world, /regionStream\?\.setOptions\(areaStreamingOptions\(\)\)/);
  assert.match(world, /batchesPerFrame:4,settleSeconds:0/);
  assert.doesNotMatch(world, /mode:'single',preloadMeters:0/);
  assert.doesNotMatch(world, /releaseGpuMemory:true,releaseDelaySeconds:0/);
});

test('desktop, browser and mobile get bounded forward loading with GPU memory tradeoffs', () => {
  const browser = GAME3D_PLATFORM_DEFAULTS.browser;
  const desktop = GAME3D_PLATFORM_DEFAULTS.desktop;
  const mobile = GAME3D_PLATFORM_DEFAULTS.mobile;
  assert.equal(browser.preloadMeters, 90);
  assert.equal(desktop.preloadMeters, 140);
  assert.equal(mobile.preloadMeters, 60);
  assert.equal(browser.releaseGpuMemory, false);
  assert.equal(desktop.releaseGpuMemory, false);
  assert.equal(mobile.releaseGpuMemory, true);

  // Approaching the eastern edge from town should prepare east before crossing.
  for (const profile of [browser, desktop, mobile]) {
    const nearby = nearWolfveilAreas({ x: 90, z: 70 }, 'town', {
      preloadMeters: profile.preloadMeters,
    });
    assert.ok(nearby.includes('town'));
    assert.ok(nearby.includes('east'));
  }
});
