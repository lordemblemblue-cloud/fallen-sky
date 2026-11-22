import test from 'node:test';
import assert from 'node:assert/strict';
import { planWalk, segmentClear } from '../src/components/game3d/threeroads/cast/castPath.mjs';
import { townObstacles, makeBlockedTest, clearDestination } from '../src/components/game3d/threeroads/cast/castPlacement.mjs';

const obstacles = townObstacles();
const blocked = makeBlockedTest(obstacles);

const pathClear = (from, path) => {
  let a = from;
  for (const b of path) {
    if (!segmentClear(a.x, a.z, b.x, b.z, blocked)) return false;
    a = b;
  }
  return true;
};

test('an open walk is one straight leg', () => {
  const path = planWalk({ x: 0, z: -30 }, { x: 0, z: -12 }, obstacles, blocked);
  assert.deepEqual(path, [{ x: 0, z: -12 }]);
});

test('Paneb\'s walk from his lodge to the fountain rim goes round the tailor', () => {
  const from = { x: 24, z: -22 };
  const to = clearDestination(0.01, -0.01, obstacles);
  assert.equal(segmentClear(from.x, from.z, to.x, to.z, blocked), false, 'straight through the shop');
  const path = planWalk(from, to, obstacles, blocked);
  assert.ok(path && path.length >= 2);
  assert.deepEqual(path.at(-1), { x: to.x, z: to.z });
  assert.ok(pathClear(from, path));
});

test('a walk with no way round returns null', () => {
  const wall = (x) => Math.abs(x) < 1; // an endless wall across the way
  assert.equal(planWalk({ x: -5, z: 0 }, { x: 5, z: 0 }, [], wall), null);
});
