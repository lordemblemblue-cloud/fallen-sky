import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTownQuality, townLODState, townLODDisabledFromSearch } from '../src/components/game3d/wolfveil/WolfveilTownPerformancePolicy.mjs';
import { readFileSync } from 'node:fs';

test('default town is low poly on desktop and ultra low on touch/mobile', () => {
  assert.equal(resolveTownQuality('auto', false), 'low');
  assert.equal(resolveTownQuality('auto', true), 'ultra-low');
  assert.equal(resolveTownQuality('low', true), 'low');
  assert.equal(resolveTownQuality('high', true), 'high');
});

test('a player beside any storefront always sees enterable detailed shop geometry', () => {
  for (const quality of ['low', 'ultra-low', 'balanced', 'high']) {
    assert.equal(townLODState(4, 'shop', 'proxy', quality), 'detail');
    assert.equal(townLODState(6, 'home', 'proxy', quality), 'detail');
  }
});

test('the circular plaza uses tiny distant silhouettes rather than all twelve high poly rooms', () => {
  for (const quality of ['low', 'ultra-low']) {
    assert.equal(townLODState(22, 'shop', 'proxy', quality), 'proxy');
    assert.equal(townLODState(42.5, 'home', 'proxy', quality), 'proxy');
    assert.equal(townLODState(105, 'home', 'proxy', quality), 'hidden');
  }
});

test('hysteresis reduces rapid LOD switching when player moves near the doorway', () => {
  assert.equal(townLODState(22, 'shop', 'detail', 'low'), 'detail');
  assert.equal(townLODState(22, 'shop', 'proxy', 'low'), 'proxy');
  assert.equal(townLODState(17, 'shop', 'proxy', 'low'), 'detail');
  assert.equal(townLODState(25, 'shop', 'detail', 'low'), 'proxy');
});

test('bad distance reports never hide real rooms', () => {
  assert.equal(townLODState(NaN, 'shop', 'proxy', 'low'), 'detail');
  assert.equal(townLODState(-1, 'home', 'proxy', 'ultra-low'), 'detail');
});

test('town visual LOD bypass is opt-in, round-trip safe and isolated to original buildings', () => {
  assert.equal(townLODDisabledFromSearch(''), false);
  assert.equal(townLODDisabledFromSearch('?renderer=webgpu'), false);
  assert.equal(townLODDisabledFromSearch('?renderer=webgpu&townLod=off'), true);
  assert.equal(townLODDisabledFromSearch('?townLod=on'), false);
  assert.equal(townLODDisabledFromSearch('?townLod=off&renderer=webgl'), true);
  assert.equal(townLODState(50, 'home', 'detail', 'low'), 'proxy',
    'default LOD thresholds must remain unchanged');
});

test('opt-in bypass shows detailed rooms without proxies, leaving floor and indoor cutaway untouched', () => {
  const src = readFileSync(new URL('../src/components/game3d/wolfveil/AXETownPlaza.js', import.meta.url), 'utf8');
  assert.match(src, /if \(!townLODDisabled\) \{[\s\S]*?makeDistantProxy/);
  assert.match(src, /if \(townLODDisabled\) \{[\s\S]*?room\.group\.visible = true/);
  assert.match(src, /room\.group\.userData\.axeLODState = 'detail'/);
  assert.match(src, /setIndoorCutaway\(roomId\)/);
  assert.match(src, /townGroup\.userData\.townLODDisabled = townLODDisabled/);
});
