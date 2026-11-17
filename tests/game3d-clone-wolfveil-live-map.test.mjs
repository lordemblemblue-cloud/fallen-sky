import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  clearWolfveilLiveMap, getWolfveilLiveMap, publishWolfveilLiveMap,
} from '../src/components/game3d/hud/WolfveilLiveMapStore.mjs';

test('the live map keeps real actor positions and drops anything dead or off the chart', () => {
  clearWolfveilLiveMap();
  const snap = publishWolfveilLiveMap({
    enemies: [
      { id: 'wolf-1', name: 'Ink Hare', x: 12, y: -3, z: 40, level: 6, tier: 'normal' },
      { id: 'gone', x: 1, z: 2, alive: false },
      { id: 'bad', x: 'nope', z: 2 },
    ],
    npcs: [{ id: 'sage', name: 'Lantern Keeper', x: -20, y: 4, z: 8 }],
  });
  assert.deepEqual(snap.enemies.map(e => e.id), ['wolf-1']);
  assert.equal(snap.npcs[0].name, 'Lantern Keeper');
  assert.equal(getWolfveilLiveMap(), snap);
  clearWolfveilLiveMap();
  assert.equal(getWolfveilLiveMap().enemies.length, 0);
});

test('the world map and the cave walls use the live feed, the path, and the mossy brick', () => {
  const world = readFileSync('src/components/game3d/GameWorld3D.jsx', 'utf8');
  const map = readFileSync('src/components/game3d/hud/AXEWorldMapOverlay.jsx', 'utf8');
  const under = readFileSync('src/components/game3d/hud/WolfveilUndergroundMapPanel.jsx', 'utf8');
  const cave = readFileSync('src/components/game3d/wolfveil/WolfveilCaveSystem.js', 'utf8');
  assert.match(world, /publishWolfveilLiveMap/);
  assert.match(map, /subscribeWolfveilLiveMap/);
  assert.match(under, /sampleWolfveilCaveSpace/);
  assert.match(cave, /Mission path in the middle/);
  assert.match(cave, /Ragged brick courses/);
  assert.doesNotMatch(world, /grantReward|grantLoot/);
});
