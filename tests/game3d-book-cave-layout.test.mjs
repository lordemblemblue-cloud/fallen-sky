import test from 'node:test';
import assert from 'node:assert/strict';
import { wolfveilHeight } from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import { sampleWolfveilCaveSpace } from '../src/components/game3d/wolfveil/WolfveilCaveLayout.mjs';
import {
  CAVE_LAYOUT_VERSION,
  CAVE_WORLD_OFFSET_Z,
  CAVE_PILLARS,
  caveLayout,
  entrance,
  hallway,
  hub,
  farmSpots,
  treasureSpots,
  bossArenas,
  raidArea,
  dungeonBossChamber,
  getCaveAnchor,
  sampleBookCaveSpace,
  sampleBookCavePlayerFloorY,
  resolveBookCaveWallCollision,
} from '../src/components/game3d/cave/caveLayout.js';

const BODY = 0.62;

function walk(points, step = 0.8) {
  const samples = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      samples.push({
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        y: a.y + (b.y - a.y) * t,
      });
    }
  }
  return samples;
}

test('layout module publishes the shared entrance, hallway, hub and anchors', () => {
  assert.equal(CAVE_LAYOUT_VERSION, 1);
  assert.equal(caveLayout.version, 1);
  assert.equal(caveLayout.entrance, entrance);
  assert.equal(entrance.id, 'ashroot_entrance');
  assert.equal(entrance.worldZ, entrance.z + CAVE_WORLD_OFFSET_Z);
  assert.ok(entrance.openingWidth >= 5);
  assert.ok(entrance.openingHeight >= 4.2);
  assert.equal(hallway.waypoints[0][0], entrance.x);
  assert.equal(hallway.waypoints[0][2], entrance.z);
  assert.ok(hallway.totalLength > 40 && hallway.totalLength < 120);
  assert.equal(farmSpots.length, 4);
  assert.equal(treasureSpots.length, 4);
  assert.ok(bossArenas.length >= 2);
  assert.equal(raidArea.kind, 'raid');
  assert.equal(dungeonBossChamber.kind, 'dungeonBoss');
  assert.equal(dungeonBossChamber.soloable, true);
  assert.equal(dungeonBossChamber.party, true);
  const ids = new Set([
    entrance.id, hub.id,
    ...farmSpots.map((z) => z.id),
    ...treasureSpots.map((z) => z.id),
    ...bossArenas.map((z) => z.id),
    raidArea.id, dungeonBossChamber.id,
  ]);
  assert.equal(ids.size, 2 + farmSpots.length + treasureSpots.length + bossArenas.length + 2);
  assert.equal(getCaveAnchor('farm_moss_terrace')?.name, 'Moss Terrace');
  assert.equal(getCaveAnchor('missing'), null);
});

test('hallway grade is gentle and the floor does not jump', () => {
  let prev = hallway.waypoints[0];
  let maxGrade = 0;
  for (const point of hallway.waypoints.slice(1)) {
    const run = Math.hypot(point[0] - prev[0], point[2] - prev[2]);
    const grade = Math.abs(point[1] - prev[1]) / run;
    maxGrade = Math.max(maxGrade, grade);
    prev = point;
  }
  assert.ok(maxGrade <= 0.22, `hallway grade ${maxGrade}`);
  const samples = walk(hallway.waypoints.map(([x, y, z]) => ({ x, y, z })), 0.5);
  for (let i = 1; i < samples.length; i++) {
    const rise = Math.abs(samples[i].y - samples[i - 1].y);
    assert.ok(rise <= 0.2, `floor step ${rise}`);
  }
});

test('a body can walk from the mouth through the hub to every anchor', () => {
  const spine = walk(hallway.waypoints.map(([x, y, z]) => ({ x, y, z })));
  for (const sample of spine) {
    const space = sampleBookCaveSpace(sample.x, sample.z, BODY);
    assert.ok(space, `hallway hole at ${sample.x},${sample.z}`);
    assert.ok(Math.abs(space.floorY - sample.y) < 0.35, 'floor left the centerline');
    assert.ok(space.ceilingY - space.floorY >= 4.8);
  }
  const end = spine.at(-1);
  assert.equal(sampleBookCaveSpace(end.x, end.z, BODY)?.kind, 'hub');
  const targets = [...farmSpots, ...treasureSpots, ...bossArenas, raidArea, dungeonBossChamber];
  for (const zone of targets) {
    const route = walk([
      { x: hub.x, y: hub.floorY, z: hub.z },
      { x: zone.x, y: zone.floorY, z: zone.z },
    ]);
    for (const sample of route) {
      const space = sampleBookCaveSpace(sample.x, sample.z, BODY);
      assert.ok(space, `${zone.id} is cut off at ${sample.x.toFixed(1)},${sample.z.toFixed(1)}`);
      const pillar = CAVE_PILLARS.find((item) => Math.hypot(item.x - sample.x, item.z - sample.z) < item.radius + BODY);
      assert.equal(pillar, undefined, `${zone.id} route hits ${pillar?.id}`);
    }
    const rim = sampleBookCaveSpace(zone.x + zone.radius - BODY, zone.z, 0.2);
    assert.ok(rim, `${zone.id} radius is not walkable`);
    assert.equal(zone.floorY, hub.floorY);
    assert.equal(zone.worldZ, zone.z + CAVE_WORLD_OFFSET_Z);
  }
});

test('walls stop a sideways step and the mouth still lets you leave', () => {
  const start = hallway.waypoints[4];
  const next = hallway.waypoints[5];
  const dx = next[0] - start[0];
  const dz = next[2] - start[2];
  const len = Math.hypot(dx, dz);
  const sideX = -dz / len;
  const sideZ = dx / len;
  const inside = { x: start[0], y: start[1], z: start[2] };
  const pushed = { x: inside.x + sideX * 8, y: inside.y, z: inside.z + sideZ * 8 };
  assert.equal(resolveBookCaveWallCollision(pushed, inside, BODY), true);
  assert.ok(sampleBookCaveSpace(pushed.x, pushed.z, BODY * 0.35));
  const door = { x: entrance.x, y: entrance.y, z: entrance.z };
  const outside = {
    x: entrance.x - entrance.dir[0] * 3,
    y: entrance.y,
    z: entrance.z - entrance.dir[1] * 3,
  };
  const leaving = { ...outside };
  assert.equal(resolveBookCaveWallCollision(leaving, door, BODY), false);
  assert.equal(leaving.x, outside.x);
  assert.equal(leaving.z, outside.z);
});

test('the cave stays buried, clear of the older tunnels, and ignores the ridge above', () => {
  assert.equal(caveLayout.overlapsLegacyCave, false);
  const probes = [];
  for (let i = 0; i < hallway.waypoints.length; i++) {
    const [x, , z] = hallway.waypoints[i];
    probes.push([x, z]);
  }
  for (const zone of [...farmSpots, ...treasureSpots, ...bossArenas, raidArea, dungeonBossChamber]) {
    probes.push([zone.x, zone.z]);
    probes.push([zone.x + zone.radius, zone.z]);
    probes.push([zone.x, zone.z + zone.radius]);
  }
  for (const [x, z] of probes) {
    assert.equal(sampleWolfveilCaveSpace(x, z, 1.2), null, `legacy overlap ${x},${z}`);
    const space = sampleBookCaveSpace(x, z, 0);
    assert.ok(space);
    const along = (x - entrance.x) * entrance.dir[0] + (z - entrance.z) * entrance.dir[1];
    if (along > 24) {
      const roof = space.ceilingY;
      assert.ok(wolfveilHeight(x, z) >= roof + 3.2, `thin cover at ${x.toFixed(1)},${z.toFixed(1)} along ${along.toFixed(1)}`);
    }
  }
  const above = sampleBookCavePlayerFloorY(hub.worldX, hub.worldY + 40, hub.worldZ);
  assert.equal(above, null);
  const mid = hallway.waypoints[6];
  const ridge = sampleBookCavePlayerFloorY(mid[0], wolfveilHeight(mid[0], mid[2]), mid[2] + CAVE_WORLD_OFFSET_Z);
  assert.equal(ridge, null, 'the hillside above the tunnel is not the cave floor');
  const standing = sampleBookCavePlayerFloorY(hub.worldX, hub.floorY + 0.1, hub.worldZ);
  assert.equal(standing, hub.floorY);
  const jumped = sampleBookCavePlayerFloorY(entrance.worldX, entrance.floorY + 1.8, entrance.worldZ);
  assert.equal(jumped, entrance.floorY);
});
