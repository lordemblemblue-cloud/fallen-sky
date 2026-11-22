import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEnemyGroupWatcher } from '../src/components/game3d/threeroads/enemies/enemyGroupWatcher.mjs';
import {
  createEnemiesSubsystem, MAX_THREE_ROADS_ENEMIES,
} from '../src/components/game3d/threeroads/enemies/enemiesSubsystem.mjs';
import { createThreeRoadsBus } from '../src/components/game3d/threeroads/ThreeRoadsWorld.mjs';
import { getAXEEnemyStats } from '../src/components/game3d/axe/balance/AXEPowerBudget.js';

const flush = () => new Promise(resolve => globalThis.setTimeout(resolve, 0));

// ── the watcher alone, with fake entries ──────────────────────────────────
function watched() {
  const events = [];
  const quest = [];
  const watcher = createEnemyGroupWatcher({
    emit: (type, detail) => events.push([type, detail]),
    dispatchQuestEvent: detail => quest.push(detail),
  });
  return { watcher, events, quest };
}

test('the watcher announces each death once, then the cleared group once', () => {
  const { watcher, events, quest } = watched();
  const a = { id: 'a', alive: true }, b = { id: 'b', alive: true }, c = { id: 'c', alive: true };
  const enemies = [a, b, c];
  watcher.openGroup({ groupId: 'yard', kind: 'ink_shade', tier: 'normal', placeId: 'wagon_yard' }, 3);
  for (const e of enemies) watcher.addEntry('yard', e);
  watcher.scan(enemies);
  assert.equal(events.length, 0);
  assert.equal(watcher.aliveCount(), 3);

  a.dying = true;                 // the main hit path
  watcher.scan(enemies);
  watcher.scan(enemies);          // seen twice, counted once
  b.alive = false;                // switched off
  enemies.splice(enemies.indexOf(c), 1); // taken out of the list by someone
  watcher.scan(enemies);
  assert.deepEqual(events.map(e => e[0]), [
    'enemies:defeated', 'enemies:defeated', 'enemies:defeated', 'enemies:groupCleared',
  ]);
  assert.deepEqual(events[0][1], { groupId: 'yard', kind: 'ink_shade', id: 'a', tier: 'normal' });
  assert.deepEqual(events[3][1], { groupId: 'yard', kind: 'ink_shade' });
  assert.equal(quest.length, 3);
  assert.deepEqual(quest[0], {
    type: 'enemy_killed', targetId: 'yard', placeId: 'wagon_yard', kind: 'ink_shade', tier: 'normal', count: 1,
  });
  watcher.scan(enemies);
  assert.equal(events.length, 4, 'nothing more after the group is cleared');
  assert.equal(watcher.isLive('yard'), false);
});

test('the group is not cleared while monsters are still on their way', () => {
  const { watcher, events } = watched();
  const a = { id: 'a', alive: true };
  watcher.openGroup({ groupId: 'g', kind: 'echo' }, 2);
  watcher.addEntry('g', a);
  a.dying = true;
  watcher.scan([a]);
  assert.deepEqual(events.map(e => e[0]), ['enemies:defeated']);
  watcher.dropPlanned('g'); // the second model failed to load
  assert.deepEqual(events.map(e => e[0]), ['enemies:defeated', 'enemies:groupCleared']);
});

test('a closed group announces nothing', () => {
  const { watcher, events, quest } = watched();
  const a = { id: 'a', alive: true };
  watcher.openGroup({ groupId: 'g', kind: 'echo' }, 1);
  watcher.addEntry('g', a);
  watcher.closeGroup('g');
  a.dying = true;
  watcher.scan([]);
  assert.equal(events.length + quest.length, 0);
  assert.equal(watcher.aliveCount(), 0);
});

test('a listener that throws does not stop the others', () => {
  const quest = [];
  const watcher = createEnemyGroupWatcher({
    emit: () => { throw new Error('bad listener'); },
    dispatchQuestEvent: d => quest.push(d),
  });
  const a = { id: 'a', dying: true };
  watcher.openGroup({ groupId: 'g', kind: 'echo' }, 1);
  watcher.addEntry('g', a);
  const warn = globalThis.console.warn;
  globalThis.console.warn = () => {};
  try { watcher.scan([a]); } finally { globalThis.console.warn = warn; }
  assert.equal(quest.length, 1);
});

// ── the subsystem with a fake model source ────────────────────────────────
function makeWorld({ level = 7, ground = () => 4, foreign = [] } = {}) {
  const scene = new THREE.Scene();
  const enemies = [...foreign];
  const bus = createThreeRoadsBus();
  const quest = [];
  const events = [];
  for (const type of ['enemies:defeated', 'enemies:groupCleared']) bus.on(type, d => events.push([type, d]));
  const held = [];
  let hold = false;
  const sourcesMade = [];
  const clips = {
    idle: new THREE.AnimationClip('idle', 1, []), run: new THREE.AnimationClip('run', 1, []),
    attack: new THREE.AnimationClip('attack', 1, []), dying: new THREE.AnimationClip('dying', 2, []),
    death: new THREE.AnimationClip('death', 1, []), walk: null,
  };
  const ctx = { scene, enemies, bus, sampleGroundY: ground };
  const sub = createEnemiesSubsystem(ctx, {
    playerLevel: { ready: Promise.resolve(), get: () => level },
    dispatchQuestEvent: d => quest.push(d),
    warn: () => {},
    createKindSource: kind => {
      const source = {
        kind: kind.id, disposed: false, ready: Promise.resolve(clips),
        spawn(onLoaded) {
          const make = () => {
            const model = new THREE.Group();
            model.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.6, 0.3), new THREE.MeshStandardMaterial()));
            onLoaded(model);
          };
          if (hold) held.push(make); else globalThis.setTimeout(make, 0);
        },
        dispose() { source.disposed = true; },
      };
      sourcesMade.push(source);
      return source;
    },
  });
  return {
    scene, enemies, bus, quest, events, sub, sourcesMade, clips,
    holdModels(v) { hold = v; }, release() { held.splice(0).forEach(fn => fn()); },
  };
}

const mineIn = enemies => enemies.filter(e => e.threeRoads);

test('a group stands on the ground, shaped like the game\'s own entries, and earns nothing', async () => {
  const w = makeWorld();
  w.bus.emit('enemies:spawnGroup', {
    groupId: 'm01_yard', kind: 'ink_shade', count: 6, x: 70, z: -140, radius: 9, level: 'player', placeId: 'wagon_yard',
  });
  await flush(); await flush();
  const mine = mineIn(w.enemies);
  assert.equal(mine.length, 6);
  const stats = getAXEEnemyStats(7, 'normal');
  for (const e of mine) {
    assert.ok(Math.hypot(e.group.position.x - 70, e.group.position.z + 140) <= 9);
    assert.equal(e.group.position.y, 4);
    assert.deepEqual(e.home, [e.group.position.x, 4, e.group.position.z]);
    assert.equal(e.group.parent, w.scene);
    assert.equal(e.level, 7, "level 'player' is the player's level");
    assert.deepEqual(e.derived, stats);
    assert.equal(e.hp, stats.maxHP);
    assert.equal(e.maxHp, stats.maxHP);
    assert.equal(e.alive, true);
    assert.equal(e.respawnAt, null);
    // The reward locks.
    assert.equal(e.xpReward, 0);
    assert.equal(e.wolfveilVisualSpawn, true);
    assert.equal(e.dungeonTrainingSpawn, true);
    assert.equal(e.authoritativeServerSpawnVerified, false);
    assert.equal(e.isQuestSpawn, undefined);
    assert.equal(e.wolfveilZombieCampSpawn, undefined);
    // Its own clips, bound the way the game binds them.
    assert.equal(e.attackClip, w.clips.attack);
    assert.equal(e.deathClip, w.clips.death, 'ink_shade has one death clip');
    assert.ok(e.idleAction && e.runAction && e.walkAction);
    assert.equal(e.aiProfile, 'standard');
    // Wet ink: one standard material, no texture, and it is what fades.
    const meshes = [];
    e.group.traverse(n => { if (n.isMesh && n.name !== 'ThreeRoads_Enemy_Ring') meshes.push(n); });
    assert.equal(meshes.length, 1);
    assert.ok(meshes[0].material.isMeshStandardMaterial);
    assert.equal(meshes[0].material.map, null);
    assert.deepEqual(e.tintMaterials, [meshes[0].material]);
    assert.ok(Math.abs(e.group.scale.x - 1.95 / 3.6) < 1e-6, 'stands 1.95 m');
  }
  assert.equal(new Set(mine.map(e => e.id)).size, 6);
  const again = w.sub.spawnGroup({ groupId: 'm01_yard', kind: 'ink_shade', count: 6, x: 70, z: -140 });
  assert.equal(again.ok, false, 'asking again with a live group id does nothing');
  assert.equal(mineIn(w.enemies).length, 6);
  w.sub.dispose();
});

test('deaths are watched without any hook in the kill path; bodies never come back', async () => {
  const w = makeWorld();
  w.sub.spawnGroup({ groupId: 'g', kind: 'old_dead', count: 2, x: 0, z: 0, radius: 6, level: 3, placeId: 'p' });
  await flush(); await flush();
  const [a, b] = mineIn(w.enemies);
  assert.equal(a.level, 3);
  assert.equal(a.deathClip, w.clips.dying, 'old_dead falls with Dying first');
  assert.equal(a.aiProfile, 'aggressive');
  // What the main kill path does to an entry.
  a.dying = true; a.deathTimer = 0; a.hp = 0; a.respawnAt = 999999;
  w.sub.update(0.016);
  assert.equal(a.respawnAt, null, 'no respawn');
  assert.equal(a.deathAction.getClip(), w.clips.dying, 'its own death clip plays');
  a.deathTimer = 1.4;
  w.sub.update(0.016);
  assert.equal(a.deathAction.getClip(), w.clips.death, 'then Death follows Dying');
  assert.deepEqual(w.events.map(e => e[0]), ['enemies:defeated']);
  assert.deepEqual(w.quest, [{ type: 'enemy_killed', targetId: 'g', placeId: 'p', kind: 'old_dead', tier: 'normal', count: 1 }]);
  // The fade ends: the body is removed and disposed.
  a.deathFinalized = true;
  w.sub.update(0.016);
  assert.equal(w.enemies.includes(a), false);
  assert.equal(a.group.parent, null);
  // What the legacy spell / companion paths do: no deathAction of ours.
  b.dying = true; b.deathTimer = 0;
  w.sub.update(0.016);
  assert.equal(b.deathAction.getClip(), w.clips.dying);
  assert.deepEqual(w.events.map(e => e[0]), ['enemies:defeated', 'enemies:defeated', 'enemies:groupCleared']);
  assert.equal(w.quest.length, 2);
  b.deathFinalized = true;
  w.sub.update(0.016);
  assert.equal(mineIn(w.enemies).length, 0);
  assert.equal(w.sub.status().groups.length, 0, 'a cleared group is forgotten once its bodies are gone');
  assert.equal(w.sub.spawnGroup({ groupId: 'g', kind: 'echo', count: 1, x: 0, z: 0 }).ok, true, 'its id can be used again');
  w.sub.dispose();
});

test('never more than twelve monsters of ours, counting those still loading', async () => {
  const w = makeWorld();
  assert.equal(MAX_THREE_ROADS_ENEMIES, 12);
  w.holdModels(true);
  assert.equal(w.sub.spawnGroup({ groupId: 'a', kind: 'echo', count: 10, x: 0, z: 0, radius: 20 }).placed, 10);
  const second = w.sub.spawnGroup({ groupId: 'b', kind: 'echo', count: 5, x: 60, z: 0, radius: 20 });
  assert.equal(second.placed, 2, 'only the room left');
  assert.equal(w.sub.spawnGroup({ groupId: 'c', kind: 'echo', count: 1, x: 90, z: 0 }).reason, 'limit');
  assert.equal(w.sub.spawnGroup({ groupId: 'd', kind: 'ink_shade', count: 99, x: 0, z: 0 }).reason, 'limit');
  await flush(); await flush();
  w.release();
  assert.equal(mineIn(w.enemies).length, 12);
  const one = mineIn(w.enemies)[0];
  one.dying = true;
  w.sub.update(0.016);
  assert.equal(w.sub.spawnGroup({ groupId: 'e', kind: 'echo', count: 3, x: 0, z: 90 }).placed, 1, 'a death frees one place');
  w.sub.dispose();
});

test('bad requests are refused', () => {
  const w = makeWorld({ ground: () => null });
  assert.equal(w.sub.spawnGroup({ kind: 'echo', count: 1, x: 0, z: 0 }).ok, false);
  assert.equal(w.sub.spawnGroup({ groupId: 'g', kind: 'wolf', count: 1, x: 0, z: 0 }).ok, false);
  assert.equal(w.sub.spawnGroup({ groupId: 'g', kind: 'echo', count: 1, x: 'here', z: 0 }).ok, false);
  assert.equal(w.sub.spawnGroup({ groupId: 'g', kind: 'echo', count: 1, x: 0, z: 0 }).reason, 'no standable ground');
  assert.equal(w.sub.status().groups.length, 0);
  w.sub.dispose();
});

test('despawn removes a group without announcing deaths', async () => {
  const w = makeWorld();
  w.sub.spawnGroup({ groupId: 'g', kind: 'echo', count: 3, x: 0, z: 0 });
  await flush(); await flush();
  w.bus.emit('enemies:despawnGroup', { groupId: 'g' });
  w.sub.update(0.016);
  assert.equal(mineIn(w.enemies).length, 0);
  assert.equal(w.events.length + w.quest.length, 0);
  assert.equal(w.scene.children.length, 0);
});

test('nothing of ours is left after dispose, even what was still loading', async () => {
  const foreign = { id: 'wolfveil_zombie_x', alive: true };
  const w = makeWorld({ foreign: [foreign] });
  w.sub.spawnGroup({ groupId: 'a', kind: 'ink_shade', count: 4, x: 0, z: 0 });
  await flush(); await flush();
  w.holdModels(true);
  w.sub.spawnGroup({ groupId: 'b', kind: 'old_dead', count: 3, x: 40, z: 0 });
  await flush();
  const entries = mineIn(w.enemies);
  const disposedMaterials = [];
  for (const e of entries) for (const m of e.tintMaterials) m.addEventListener('dispose', () => disposedMaterials.push(m));
  w.sub.dispose();
  w.release(); // models that arrive after dispose are dropped
  await flush();
  assert.deepEqual(w.enemies, [foreign]);
  assert.equal(w.scene.children.length, 0);
  assert.equal(disposedMaterials.length, 4, 'each monster\'s own ink material');
  assert.ok(w.sourcesMade.every(s => s.disposed));
  w.bus.emit('enemies:spawnGroup', { groupId: 'c', kind: 'echo', count: 1, x: 0, z: 0 });
  await flush(); await flush();
  assert.deepEqual(w.enemies, [foreign], 'no longer listening');
  assert.equal(w.sub.spawnGroup({ groupId: 'c', kind: 'echo', count: 1, x: 0, z: 0 }).ok, false);
});

test('no scene or no enemy list means nothing to do', () => {
  assert.equal(createEnemiesSubsystem({}), null);
  assert.equal(createEnemiesSubsystem({ scene: new THREE.Scene() }), null);
  assert.equal(createEnemiesSubsystem(undefined), null);
});
