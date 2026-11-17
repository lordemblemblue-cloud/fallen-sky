import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  WOLFVEIL_CAVE_FLOORS,
  caveFloorIsAwake,
  awakeCaveFloors,
} from '../src/components/game3d/wolfveil/WolfveilCaveNarrative.mjs';

const scene = readFileSync('src/components/game3d/wolfveil/WolfveilCaveSystem.js', 'utf8');

test('five sumi floors climb like a tower: harder beasts, then a harder boss', () => {
  assert.equal(WOLFVEIL_CAVE_FLOORS.length, 5);
  let previous = null;
  for (const floor of WOLFVEIL_CAVE_FLOORS) {
    assert.equal(floor.order, (previous?.order || 0) + 1);
    assert.ok(floor.boss.level > (floor.mobLevel || 0));
    if (previous) {
      assert.ok(floor.mobLevel > previous.mobLevel, floor.title);
      assert.ok(floor.mobLevel > previous.boss.level, 'next floor outgrows the last boss');
      assert.ok(floor.boss.level > previous.boss.level);
    }
    previous = floor;
  }
});

test('a floor stays an unfinished painting until the previous boss is beaten', () => {
  const [first, second, third, , sanctum] = WOLFVEIL_CAVE_FLOORS;
  assert.equal(caveFloorIsAwake(first, []), true);
  assert.equal(caveFloorIsAwake(second, []), false);
  assert.equal(caveFloorIsAwake(third, [first.boss.id]), false);
  const afterFirst = awakeCaveFloors([first.boss.id]).map(floor => floor.order);
  assert.deepEqual(afterFirst, [1, 2]);
  const all = [first, second, third, WOLFVEIL_CAVE_FLOORS[3]].map(floor => floor.boss.id);
  assert.equal(caveFloorIsAwake(sanctum, all), true);
  assert.equal(caveFloorIsAwake(sanctum, all.slice(0, 3)), false);
});

test('scrolls and torches are painted in the cave and never pay a reward', () => {
  assert.match(scene, /paintSumiCaveMural/);
  assert.match(scene, /SWV_Cave_SumiMural_/);
  assert.match(scene, /noteBossDefeated/);
  assert.match(scene, /Records the painting, never a reward/);
  assert.doesNotMatch(scene, /grantReward|grantLoot|grantExperience|awardSilver/);
});
