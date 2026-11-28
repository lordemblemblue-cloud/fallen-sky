import './fixtures/three-roads-sample/install.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  combatEnemyProfile, enemyHomeDistance, horizontalDistance, shouldEnemyEngage, enemyPursuitVector,
} from '../src/components/game3d/ai/EnemyCombatIntelligence.mjs';
import { createEnemiesSubsystem } from '../src/components/game3d/threeroads/enemies/enemiesSubsystem.mjs';
import {
  readGoal, goalPointsFor, GOAL_DEFAULT_RADIUS, SEEK_RANGE,
} from '../src/components/game3d/threeroads/enemies/enemyGoalMarch.mjs';
import { createThreeRoadsBus } from '../src/components/game3d/threeroads/ThreeRoadsWorld.mjs';

const flush = () => new Promise(resolve => globalThis.setTimeout(resolve, 0));

// The parts of GameWorld3D's enemy loop (GameWorld3D.jsx 4541-4707) that
// decide engagement and movement, with the game's own decision functions.
// No attacks: an engaged monster that reaches the player just stands there.
function gameLoopStep(enemy, player, dt, solids = []) {
  if (!enemy.alive || enemy.dying) return;
  const profile = combatEnemyProfile(enemy);
  const distToPlayer = horizontalDistance(enemy.group.position, player);
  const homeDistance = enemyHomeDistance(enemy);
  const engaged = shouldEnemyEngage({
    playerDistance: distToPlayer, homeDistance,
    alerted: enemy.hitCooldown > 0, engaged: !!enemy.aiEngaged, profile,
  });
  if (engaged) { enemy.aiEngaged = true; enemy.aiReturning = false; }
  else if (enemy.aiEngaged) { enemy.aiEngaged = false; enemy.aiReturning = true; }
  const returning = !!enemy.aiReturning;
  const destination = returning ? { x: enemy.home[0], z: enemy.home[2] } : player;
  const destinationDistance = horizontalDistance(enemy.group.position, destination);
  if (returning && destinationDistance <= 0.65) { enemy.aiReturning = false; enemy.state = 'idle'; }
  const moving = returning ? destinationDistance > 0.65
    : enemy.aiEngaged && distToPlayer > profile.range * 0.87;
  if (moving) {
    const p = enemy.group.position;
    const direction = enemyPursuitVector(p, destination);
    const step = Math.min(destinationDistance, profile.speed * dt);
    const nextX = p.x + direction.x * step, nextZ = p.z + direction.z * step;
    const fromHome = horizontalDistance({ x: nextX, z: nextZ }, { x: enemy.home[0], z: enemy.home[2] });
    // Solid boxes stand in for the game's building/fence collision: a step into one is undone.
    const blocked = solids.some(b => nextX > b.minX && nextX < b.maxX && nextZ > b.minZ && nextZ < b.maxZ);
    if (!blocked && (returning || fromHome <= profile.leashRange)) { p.x = nextX; p.z = nextZ; }
    // The walk action the loop would play while moving.
    enemy.playingWhileMoving = enemy.aiEngaged && !returning && enemy.runAction ? enemy.runAction : enemy.walkAction;
  }
  if (enemy.hitCooldown > 0) enemy.hitCooldown -= dt;
}

function makeWorld() {
  const scene = new THREE.Scene();
  const enemies = [];
  const bus = createThreeRoadsBus();
  const clips = {
    idle: new THREE.AnimationClip('idle', 1, []), run: new THREE.AnimationClip('run', 1, []),
    walk: new THREE.AnimationClip('walk', 1, []), attack: new THREE.AnimationClip('attack', 1, []),
    death: new THREE.AnimationClip('death', 1, []),
  };
  const sub = createEnemiesSubsystem({ scene, enemies, bus, sampleGroundY: () => 0 }, {
    playerLevel: { ready: Promise.resolve(), get: () => 5 },
    dispatchQuestEvent: () => {}, warn: () => {},
    createKindSource: () => ({
      ready: Promise.resolve(clips), dispose() {},
      spawn(onLoaded) { globalThis.setTimeout(() => onLoaded(new THREE.Group()), 0); },
    }),
  });
  const player = { x: 0, z: 0 };
  const solids = [];
  let time = 0;
  // One frame as GameWorld3D runs it: Three Roads update first, then the loop.
  const frame = (dt = 0.05) => {
    time += dt;
    sub.update(dt, player);
    for (const e of enemies) gameLoopStep(e, player, dt, solids);
  };
  const run = (seconds, until = () => false, dt = 0.05) => {
    for (let t = 0; t < seconds; t += dt) { frame(dt); if (until()) return Math.round(t * 100) / 100; }
    return null;
  };
  return { scene, enemies, bus, sub, player, solids, frame, run, clips, time: () => time };
}

const near = (e, x, z, r) => Math.hypot(e.group.position.x - x, e.group.position.z - z) <= r;

test('a goal is read from the request, with a 3 m default radius', () => {
  assert.equal(readGoal(undefined), null);
  assert.equal(readGoal({ x: 'a', z: 0 }), null);
  assert.deepEqual(readGoal({ x: 1, z: 2 }), { x: 1, z: 2, radius: GOAL_DEFAULT_RADIUS });
  assert.deepEqual(readGoal({ x: 1, z: 2, radius: 6 }), { x: 1, z: 2, radius: 6 });
  assert.deepEqual(readGoal({ x: 1, z: 2, radius: -1 }), { x: 1, z: 2, radius: 3 });
  const points = goalPointsFor([{ x: 10, z: 0 }, { x: 0, z: 0 }, { x: -10, z: 0 }], { x: 0, z: 0 }, { x: 50, z: 50, radius: 5 });
  for (const p of points) assert.ok(Math.hypot(p.x - 50, p.z - 50) <= 4.0001, 'the formation fits inside the goal');
});

test('a wave with a goal walks to it at the ordinary speed, running, and then holds there', async () => {
  const w = makeWorld();
  w.player.x = 400; w.player.z = 400; // far away: nobody to notice
  w.sub.spawnGroup({ groupId: 'v16_w1', kind: 'ink_shade', count: 3, x: 0, z: 0, radius: 4, goal: { x: 36, z: 0 } });
  await flush(); await flush();
  assert.equal(w.enemies.length, 3);
  const e = w.enemies[0];
  // Still where it spawned before the first frame.
  assert.ok(near(e, 0, 0, 4.5));
  w.frame();
  assert.equal(e.aiReturning, true, 'the game walks it toward its home, which is now the goal');
  assert.equal(e.walkAction, e.runAction, 'and plays the run clip while it does');
  const arrived = w.run(30, () => w.enemies.every(x => x.threeRoads.march.state === 'hold'));
  assert.ok(arrived !== null, 'they get there');
  // About 33 m at 2.2 m/s (the standard profile's speed): 15 s, give or take the formation.
  assert.ok(arrived > 12 && arrived < 20, 'arrived in ' + arrived + ' s');
  for (const x of w.enemies) {
    assert.ok(near(x, 36, 0, 3.01), 'within the goal radius');
    assert.notEqual(x.walkAction, x.runAction, 'walk clip back');
    assert.deepEqual(x.zoneCenter, [36, 0, 0], "it wanders at the goal, not where it spawned");
    assert.equal(x.aiEngaged, false);
  }
  const status = w.sub.status().groups[0].march;
  assert.equal(status.hold, 3);
  assert.ok(status.firstArrival > 0 && status.lastArrival <= arrived + 0.5);
  // Nobody within 25 m: it holds.
  const before = w.enemies.map(x => [x.group.position.x, x.group.position.z]);
  w.run(10);
  w.enemies.forEach((x, i) => assert.ok(Math.hypot(x.group.position.x - before[i][0], x.group.position.z - before[i][1]) < 0.01, 'holds'));
  w.sub.dispose();
});

test('a wave that meets the player on the way stops marching and fights', async () => {
  const w = makeWorld();
  w.player.x = 20; w.player.z = 0; // standing on its road
  w.sub.spawnGroup({ groupId: 't02_w1', kind: 'old_dead', count: 2, x: 0, z: 0, radius: 3, goal: { x: 36, z: 0, radius: 3 } });
  await flush(); await flush();
  const met = w.run(20, () => w.enemies.some(x => x.aiEngaged));
  assert.ok(met !== null, 'it engages the player');
  const fighter = w.enemies.find(x => x.aiEngaged);
  assert.equal(fighter.threeRoads.march.state, 'fight');
  assert.equal(fighter.aiReturning, false);
  // Its leash is now measured from where it met the player, not from the goal.
  assert.ok(Math.hypot(fighter.home[0] - 20, fighter.home[2]) <= 10.5);
  w.run(4);
  assert.ok(w.enemies.every(x => x.threeRoads.march.state === 'fight'), 'both end up fighting');
  assert.ok(w.enemies.every(x => near(x, 20, 0, 2.5)), 'at the player');
  w.sub.dispose();
});

test('a monster hit from afar on the way turns on the player', async () => {
  const w = makeWorld();
  w.player.x = 0; w.player.z = 20; // 20 m off the road: outside the 8 m aggro range
  w.sub.spawnGroup({ groupId: 'g', kind: 'echo', count: 1, x: 0, z: 0, goal: { x: 36, z: 0 } });
  await flush(); await flush();
  w.run(1);
  const e = w.enemies[0];
  assert.equal(e.threeRoads.march.state, 'march');
  e.hp -= 10; // an arrow
  const engaged = w.run(15, () => e.aiEngaged);
  assert.ok(engaged !== null, 'it comes for the player');
  w.sub.dispose();
});

test('at the goal it goes for a player within 25 m and comes back if they run off', async () => {
  const w = makeWorld();
  w.player.x = 400; w.player.z = 400;
  w.sub.spawnGroup({ groupId: 'g', kind: 'ink_shade', count: 1, x: 0, z: 0, goal: { x: 36, z: 0 } });
  await flush(); await flush();
  w.run(30, () => w.enemies[0].threeRoads.march.state === 'hold');
  const e = w.enemies[0];
  w.player.x = 36 + SEEK_RANGE - 3; w.player.z = 0; // 22 m from the goal
  w.frame();
  assert.equal(e.threeRoads.march.state, 'seek');
  const engaged = w.run(15, () => e.aiEngaged);
  assert.ok(engaged !== null, 'it reaches the player and fights');
  // The player runs far away: the loop drops the chase, the wave goes back.
  w.player.x = 300;
  w.run(60, () => e.threeRoads.march.state === 'hold');
  assert.equal(e.threeRoads.march.state, 'hold');
  assert.ok(near(e, 36, 0, 3.01), 'back at the goal');
  w.sub.dispose();
});

test('without a goal a group behaves exactly as before', async () => {
  const w = makeWorld();
  w.player.x = 30; w.player.z = 0; // 30 m away: outside aggro, inside the goal seek range
  w.sub.spawnGroup({ groupId: 'g', kind: 'ink_shade', count: 3, x: 0, z: 0, radius: 6 });
  await flush(); await flush();
  const snap = () => w.enemies.map(e => JSON.stringify({
    home: e.home, zoneCenter: e.zoneCenter, zoneRadius: e.zoneRadius, aiReturning: e.aiReturning,
    aiEngaged: e.aiEngaged, walk: e.walkAction === e.runAction, pos: [e.group.position.x, e.group.position.z],
  }));
  const before = snap();
  for (let i = 0; i < 200; i++) w.sub.update(0.05, w.player);
  assert.deepEqual(snap(), before, 'the subsystem changes nothing on them');
  assert.ok(w.enemies.every(e => e.threeRoads.march === undefined));
  assert.equal(w.sub.status().groups[0].march, null);
  w.sub.dispose();
});

test('a passive group ignores a goal', async () => {
  const w = makeWorld();
  w.sub.spawnGroup({ groupId: 'p', kind: 'ink_shade', count: 1, x: 5, z: 5, passive: true, goal: { x: 40, z: 0 } });
  await flush(); await flush();
  assert.equal(w.enemies.length, 0);
  w.run(5);
  const body = w.scene.children.find(o => o.name.startsWith('ThreeRoads_Enemy_p_'));
  assert.deepEqual([body.position.x, body.position.z], [5, 5]);
  assert.equal(w.sub.status().groups[0].march, null);
  w.sub.dispose();
});

test('a marcher stopped by something solid steps round it and still arrives', async () => {
  const w = makeWorld();
  w.player.x = 400; w.player.z = 400;
  // A 4 m wide wall straight across its road, as at (62, -131) in the town.
  w.solids.push({ minX: -2, maxX: 2, minZ: 17, maxZ: 18 });
  w.sub.spawnGroup({ groupId: 'g', kind: 'ink_shade', count: 1, x: 0, z: 0, goal: { x: 0, z: 36 } });
  await flush(); await flush();
  const e = w.enemies[0];
  assert.ok(Math.abs(e.group.position.x) < 0.01, 'starts on the wall\'s line');
  const arrived = w.run(40, () => e.threeRoads.march.state === 'hold');
  assert.ok(arrived !== null, 'gets there');
  assert.ok(near(e, 0, 36, 3.01));
  assert.ok(e.threeRoads.march.detours >= 1 && !e.threeRoads.march.gaveUp);
  assert.ok(arrived < 25, 'without wasting long: ' + arrived + ' s');
  w.sub.dispose();
});

test('a marcher walled off gives up and holds instead of spinning, and still fights', async () => {
  const w = makeWorld();
  w.player.x = 400; w.player.z = 400;
  w.solids.push({ minX: -200, maxX: 200, minZ: 17, maxZ: 18 });
  w.sub.spawnGroup({ groupId: 'g', kind: 'ink_shade', count: 1, x: 0, z: 0, goal: { x: 0, z: 36 } });
  await flush(); await flush();
  const e = w.enemies[0];
  const settled = w.run(120, () => e.threeRoads.march.state === 'hold');
  assert.ok(settled !== null, 'it stops trying');
  assert.equal(e.threeRoads.march.gaveUp, true);
  const at = [e.group.position.x, e.group.position.z];
  w.run(10);
  assert.ok(Math.hypot(e.group.position.x - at[0], e.group.position.z - at[1]) < 0.01, 'and stays put');
  assert.ok(e.group.position.z < 17, 'on its own side of the wall');
  // The player comes within 25 m on the same side: it goes for them.
  w.player.x = e.group.position.x + 15; w.player.z = e.group.position.z;
  const engaged = w.run(15, () => e.aiEngaged);
  assert.ok(engaged !== null);
  w.sub.dispose();
});

test('if the first side is blocked too, it tries the other', async () => {
  const w = makeWorld();
  w.player.x = 400; w.player.z = 400;
  w.solids.push({ minX: -10, maxX: 2, minZ: 17, maxZ: 18 });
  w.sub.spawnGroup({ groupId: 'g', kind: 'ink_shade', count: 1, x: 0, z: 0, goal: { x: 0, z: 36 } });
  await flush(); await flush();
  const e = w.enemies[0];
  const arrived = w.run(60, () => e.threeRoads.march.state === 'hold');
  assert.ok(arrived !== null && !e.threeRoads.march.gaveUp && near(e, 0, 36, 3.01), 'arrived in ' + arrived + ' s');
  w.sub.dispose();
});
