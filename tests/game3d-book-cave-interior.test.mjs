import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBookCaveInterior } from '../src/components/game3d/cave/caveInterior.js';
import {
  entrance, hub, farmSpots, treasureSpots, bossArenas, raidArea, dungeonBossChamber,
  sampleBookCavePlayerFloorY,
} from '../src/components/game3d/cave/caveLayout.js';

function fakeWorld() {
  const group = new THREE.Group();
  return {
    group,
    ownedMaterials: [],
    walkableSurfaces: [],
    mesh(object) { group.add(object); },
  };
}

test('the interior builds a floor, a shell, and pooled lights from the layout', () => {
  const world = fakeWorld();
  const cave = createBookCaveInterior(world, { offsetZ: 70 });
  const names = [];
  world.group.traverse((object) => { if (object.name) names.push(object.name); });
  assert.ok(names.includes('BookCave_Floor'));
  assert.ok(names.includes('BookCave_RockShell'));
  assert.ok(names.includes('BookCave_BrickShell'));
  assert.ok(names.includes('BookCave_EntranceSill'));
  assert.ok(names.includes('BookCave_MouthArch'));
  assert.ok(cave.lightAnchorCount >= 12);
  assert.ok(cave.torchCount >= 8);
  assert.equal(world.walkableSurfaces.length, 1);
  assert.equal(world.walkableSurfaces[0].userData.walkable, true);

  const feet = cave.playerGroundY({
    x: hub.worldX, y: hub.floorY + 0.2, z: hub.worldZ,
  });
  assert.equal(feet, hub.floorY);
  const outside = { x: entrance.worldX - entrance.dir[0] * 4, y: entrance.y, z: entrance.worldZ - entrance.dir[1] * 4 };
  const onSill = sampleBookCavePlayerFloorY(outside.x, outside.y, outside.z);
  assert.ok(onSill === null || Math.abs(onSill - outside.y) < 1.4);

  const blocked = {
    x: hub.worldX + 80,
    y: hub.floorY,
    z: hub.worldZ,
  };
  const from = { x: hub.worldX, y: hub.floorY, z: hub.worldZ };
  assert.equal(cave.resolveCollision(blocked, from, 0.62), true);
  assert.ok(Math.hypot(blocked.x - hub.worldX, blocked.z - hub.worldZ) < 80);

  cave.update(0.016, { x: hub.worldX, y: hub.floorY, z: hub.worldZ });
  cave.dispose();
  for (const zone of [...farmSpots, ...treasureSpots, ...bossArenas, raidArea, dungeonBossChamber]) {
    assert.ok(zone.radius >= 3.5, zone.id);
  }
});
