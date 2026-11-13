import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The respawn screen offers every registered point, so two points a few metres
// apart are two identical choices. Sampled against the imported town's baked
// collision: each of these must stay open, reachable ground.
const source = readFileSync(new URL('../src/components/game3d/mapSpawnPoints.js', import.meta.url), 'utf8');
const points = [...source.matchAll(/\{ id: '([^']+)',\s*label: '([^']+)',\s*x: (-?[\d.]+),\s*z: (-?[\d.]+)/g)]
  .map(([, id, label, x, z]) => ({ id, label, x: Number(x), z: Number(z) }));

test('every spawn point is distinct and spread across the map', () => {
  assert.ok(points.length >= 4);
  assert.equal(new Set(points.map((p) => p.id)).size, points.length);
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const gap = Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z);
      assert.ok(gap >= 8, `${points[i].id} and ${points[j].id} are only ${gap.toFixed(1)}m apart`);
    }
  }
});

test('the forest landmark stands outside the block it used to sit inside', () => {
  const forest = points.find((p) => p.id === 'spawn_forest');
  assert.ok(forest);
  // (24, -13) was inside a building: solid, 6.4m above the ground plane.
  assert.ok(Math.hypot(forest.x - 24, forest.z + 13) > 5);
});