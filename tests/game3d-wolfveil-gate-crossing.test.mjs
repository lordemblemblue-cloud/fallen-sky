// Owner report 2026-11-19: "the portals that are supposed to allow you to the
// other side, they don't work" and "load the area ... as you're entering".
// The ground of a neighbouring area must be there before the player reaches a
// gate, a gate must carry the player through, and the old ground must go
// away again once the player has moved on.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';
import * as THREE from 'three';
import {wolfveilAreaGates} from '../src/components/game3d/wolfveil/streaming/WolfveilAreaVeils.mjs';
import {wolfveilAreaAtLocal} from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import {createWolfveilTerrainAreaStream} from '../src/components/game3d/wolfveil/WolfveilTerrainAreaStream.mjs';
import {createWolfveilAreaGates} from '../src/components/game3d/wolfveil/WolfveilAreaGates.js';
import {wolfveilHeight} from '../src/components/game3d/wolfveil/WolfveilLayout.js';

const source = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const gates = wolfveilAreaGates();
const Z = 70;

// The real heightfield on a coarser grid (same 1,100 m span, indexed like the game's).
function terrainSource(segments = 110) {
  const geometry = new THREE.PlaneGeometry(1100, 1100, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, wolfveilHeight(p.getX(i), p.getZ(i)));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(p.count * 3).fill(.5), 3));
  geometry.computeVertexNormals();
  return geometry;
}
function makeStream(options = {}) {
  const parent = new THREE.Group();
  parent.position.z = Z;
  const stream = createWolfveilTerrainAreaStream({source: terrainSource(), material: new THREE.MeshBasicMaterial(), parent, ...options});
  return {parent, stream};
}
const ray = new THREE.Raycaster();
function groundAt(parent, x, zLocal) {
  parent.updateMatrixWorld(true);
  ray.set(new THREE.Vector3(x, 2000, zLocal + Z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObjects(parent.children, true)[0];
  return hit ? hit.point.y : null;
}
const settle = (stream, local, area, frames = 6) => {
  for (let i = 0; i < frames; i++) stream.update({x: local.x, z: local.z + Z}, area);
};

test('far from every border only the current area has ground', () => {
  const {stream} = makeStream();
  settle(stream, {x: 0, z: -70}, 'town');
  assert.deepEqual(stream.loadedAreas, ['town']);
  stream.dispose();
});

test('at every gate, both sides have ground before the player arrives (no void past the border)', () => {
  for (const gate of gates) {
    const {parent, stream} = makeStream();
    for (const [from, area] of [[-1, gate.behind], [1, gate.ahead]]) {
      const standing = {x: gate.x + gate.facing[0] * from * 8, z: gate.z + gate.facing[1] * from * 8};
      settle(stream, standing, area);
      for (const side of [gate.behind, gate.ahead])
        assert.ok(stream.loadedAreas.includes(side), gate.id + ' from ' + area + ': ' + side + ' streamed in');
      assert.ok(stream.loadedAreas.length <= 3, 'only areas in reach (a gate near a corner sees three)');
      for (let s = -8; s <= 8; s += .5) {
        const x = gate.x + gate.facing[0] * s, z = gate.z + gate.facing[1] * s;
        assert.notEqual(groundAt(parent, x, z), null, gate.id + ': ground ' + s + ' m along the crossing');
      }
    }
    stream.dispose();
    assert.equal(parent.children.length, 0);
  }
});

test('walking on into the new area releases the old ground; preloading builds one section per frame', () => {
  const {parent, stream} = makeStream();
  const gate = gates.find((g) => g.id === 'town_west_training_forest');
  const before = {x: gate.x - gate.facing[0] * 8, z: gate.z - gate.facing[1] * 8};
  stream.update({x: before.x, z: before.z + Z}, 'town');
  assert.ok(stream.loadedAreas.length <= 2, 'at most one new section per frame');
  settle(stream, before, 'town');
  const disposed = [];
  for (const mesh of parent.children) mesh.geometry.addEventListener('dispose', () => disposed.push(mesh.name));
  const deep = {x: -330, z: 65}; // Western Cedar Forest, far from every border
  assert.equal(wolfveilAreaAtLocal(deep.x, deep.z), 'west');
  settle(stream, deep, 'west');
  assert.deepEqual(stream.loadedAreas, ['west']);
  assert.deepEqual(disposed, ['SWV_ActiveAreaFloor_town'], 'the town ground (and its BVH) was released');
  const stats = stream.stats();
  assert.equal(stats.releases, 1);
  assert.ok(stats.triangles.west > 1000);
  stream.dispose();
});

test('a teleport into an area that was not preloaded gets its ground in the same frame', () => {
  const {parent, stream} = makeStream();
  settle(stream, {x: 0, z: -70}, 'town');
  stream.update({x: 380, z: -40 + Z}, 'east'); // quarry
  assert.ok(stream.loadedAreas.includes('east'));
  assert.notEqual(groundAt(parent, 380, -40), null);
  stream.dispose();
});

// ---- the gate carry
function makeGates() {
  const scene = new THREE.Scene(), group = new THREE.Group();
  group.position.z = Z; scene.add(group); scene.updateMatrixWorld(true);
  return createWolfveilAreaGates({scene, group, meshes: []}, {labels: false, heightAt: wolfveilHeight});
}
// Walks straight at a gate at 5 m/s; the carry is applied like the game does
// (no other collision in this test). Returns how far past the plane it got.
function walkThrough(area, gate, {from = -1, lateral = 0, frames = 120, apply = true} = {}) {
  const t = [gate.facing[1], -gate.facing[0]];
  const pos = {
    x: gate.x - gate.facing[0] * from * -6 + t[0] * lateral,
    z: gate.z - gate.facing[1] * from * -6 + t[1] * lateral + Z,
  };
  const dir = [gate.facing[0] * -from, gate.facing[1] * -from];
  const carriesBefore = area.carries;
  for (let i = 0; i < frames; i++) {
    const depth = (pos.x - gate.x) * dir[0] + (pos.z - Z - gate.z) * dir[1];
    if (depth < 9) { pos.x += dir[0] * 5 / 30; pos.z += dir[1] * 5 / 30; }
    area.update(1 / 30, pos, null);
    const step = area.carryStep(1 / 30);
    if (step && apply) { pos.x += step.dx; pos.z += step.dz; }
  }
  return {past: (pos.x - gate.x) * dir[0] + (pos.z - Z - gate.z) * dir[1], carried: area.carries - carriesBefore};
}

test('stepping into any gate, either way, carries the player through to the far side', () => {
  const area = makeGates();
  for (const gate of gates) {
    for (const from of [-1, 1]) {
      const result = walkThrough(area, gate, {from});
      assert.equal(result.carried, 1, gate.id + ' from side ' + from + ': one carry');
      assert.ok(result.past >= 8.5, gate.id + ': ended on the far side');
      assert.equal(area.carry, null, 'the carry finished');
    }
  }
  area.dispose();
});

test('no carry next to a gate, when standing still, or when walking away from it', () => {
  const area = makeGates();
  const gate = gates.find((g) => g.id === 'town_south_south_fields_way');
  assert.equal(walkThrough(area, gate, {lateral: gate.halfWidth + 2}).carried, 0, 'outside the opening: the veil, not the portal');
  const still = {x: gate.x - gate.facing[0] * .8, z: gate.z - gate.facing[1] * .8 + Z};
  const before = area.carries;
  for (let i = 0; i < 30; i++) { area.update(1 / 30, still, null); area.carryStep(1 / 30); }
  assert.equal(area.carries, before, 'standing in front of the membrane does nothing');
  area.update(1 / 30, {x: gate.x - gate.facing[0] * 30, z: gate.z - gate.facing[1] * 30 + Z}, null); // fresh history
  const away = {x: gate.x - gate.facing[0] * .5, z: gate.z - gate.facing[1] * .5 + Z};
  area.update(1 / 30, {...away}, null);
  for (let i = 0; i < 20; i++) {
    away.x -= gate.facing[0] * .15; away.z -= gate.facing[1] * .15;
    area.update(1 / 30, away, null); area.carryStep(1 / 30);
  }
  assert.equal(area.carries, before, 'stepping back out is not a crossing');
  area.dispose();
});

test('a blocked carry gives up instead of pushing forever; a teleport cancels it', () => {
  const area = makeGates();
  const gate = gates[0];
  const result = walkThrough(area, gate, {apply: false, frames: 90});
  assert.equal(result.carried, 1);
  assert.equal(area.carry, null, 'stalled carry ended');
  walkThrough(area, gate, {from: 1, frames: 40}); // reset the cooldown and position history
  const pos = {x: gate.x - gate.facing[0] * 1.1, z: gate.z - gate.facing[1] * 1.1 + Z};
  area.update(1 / 30, {x: pos.x - gate.facing[0] * .2, z: pos.z - gate.facing[1] * .2}, null);
  area.update(1 / 30, pos, null);
  assert.ok(area.carry, 'carry started');
  area.update(1 / 30, {x: pos.x + 300, z: pos.z}, null);
  assert.equal(area.carry, null, 'teleported away: carry dropped');
  area.dispose();
});

test('GameWorld3D: neighbouring ground streams with the platform preload; the carry moves the player once per frame', () => {
  const world = source('src/components/game3d/GameWorld3D.jsx');
  assert.match(world, /wolfveilVillage\.setTerrainPreloadMeters\?\.\(areaPlatform\.profile\.preloadMeters\)/);
  assert.match(world, /wolfveilVillage\?\.setTerrainPreloadMeters\?\.\(profile\.preloadMeters\)/);
  assert.equal((world.match(/areaPortals\?\.carryStep\?\.\(delta\)/g) || []).length, 1);
  assert.match(world, /if\(gateCarry&&modelRef\.current\)moveWorldActor\(modelRef\.current,gateCarry\.dx,gateCarry\.dz,isMountedRef\.current\);/);
  assert.equal((world.match(/areaPortals\?\.update\(delta,/g) || []).length, 2, 'existing gate update calls unchanged');
  const terrain = source('src/components/game3d/wolfveil/WolfveilTerrainAreaStream.mjs');
  assert.doesNotMatch(terrain, /Loading /, 'no full-screen loading overlay at a border any more');
});
