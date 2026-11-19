// ZoneRuntime (natural-zone Phase B): a zone owns everything it creates and
// UNLOAD releases all of it. The last test proves, with a real garbage
// collection, that 30 load/unload round trips leave no zone object alive.
/* global setTimeout, EventTarget, Event */
import test from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import vm from 'node:vm';
import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {createZoneRuntime, zoneRuntimeDiagnostics} from '../src/components/game3d/wolfveil/zones/WolfveilZoneRuntime.mjs';
import {
  buildGrottoHall, buildGrottoChamber, clearGrottoPrefetchCache,
} from '../src/components/game3d/wolfveil/zones/WolfveilGrottoZoneBuilders.js';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');

function fakeClock() {
  let id = 0;
  const pending = new Map();
  return {
    pending,
    setTimeout(fn) { pending.set(++id, fn); return id; },
    clearTimeout(handle) { pending.delete(handle); },
    setInterval(fn) { pending.set(++id, fn); return id; },
    clearInterval(handle) { pending.delete(handle); },
    requestAnimationFrame(fn) { pending.set(++id, fn); return id; },
    cancelAnimationFrame(handle) { pending.delete(handle); },
  };
}
function watchDispose(resource, counter) {
  resource.addEventListener('dispose', () => { counter.count++; });
  return resource;
}

test('adopt registers geometry, BVH, materials and every texture slot; dispose releases them', () => {
  const parent = new THREE.Group();
  const zone = createZoneRuntime({id: 'test_zone', root: new THREE.Group(), parent});
  assert.equal(parent.children.length, 1, 'root is attached while loaded');
  const disposed = {count: 0};
  const geometry = watchDispose(new THREE.BoxGeometry(1, 1, 1), disposed);
  geometry.boundsTree = new MeshBVH(geometry);
  const map = watchDispose(new THREE.DataTexture(new Uint8Array(4), 1, 1), disposed);
  const normalMap = watchDispose(new THREE.DataTexture(new Uint8Array(4), 1, 1), disposed);
  const material = watchDispose(new THREE.MeshStandardMaterial({map, normalMap}), disposed);
  const uniformTexture = watchDispose(new THREE.DataTexture(new Uint8Array(4), 1, 1), disposed);
  const shader = watchDispose(new THREE.ShaderMaterial({uniforms: {uTex: {value: uniformTexture}}}), disposed);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, shader));
  zone.add(group);
  const stats = zone.stats();
  assert.equal(stats.geometry, 1, 'shared geometry counted once');
  assert.equal(stats.bvh, 1);
  assert.equal(stats.material, 2);
  assert.equal(stats.texture, 3, 'map, normalMap and the uniform texture');
  assert.equal(stats.objects, 4, 'root + group + 2 meshes');
  const report = zone.dispose();
  assert.equal(disposed.count, 6, 'geometry, 2 materials, 3 textures disposed');
  assert.equal(geometry.boundsTree, null, 'the BVH is dropped with its geometry');
  assert.equal(parent.children.length, 0, 'root detached');
  assert.equal(zone.root.children.length, 0, 'object graph broken');
  assert.equal(report.geometry, 1);
  assert.equal(report.material, 2);
  assert.equal(report.texture, 3);
  assert.deepEqual([...report.errors], []);
  assert.equal(zone.dispose(), report, 'idempotent');
  assert.throws(() => zone.add(new THREE.Group()), /already unloaded/);
});

test('timers, frame callbacks, listeners, updates, audio and cleanups end with the zone', () => {
  const clock = fakeClock();
  const zone = createZoneRuntime({id: 'timers', root: new THREE.Group(), clock});
  const fired = [];
  zone.setTimeout(() => fired.push('timeout'), 100);
  zone.setInterval(() => fired.push('interval'), 100);
  zone.requestFrame(() => fired.push('frame'));
  assert.equal(clock.pending.size, 3);
  const target = new EventTarget();
  let heard = 0;
  zone.listen(target, 'ping', () => { heard++; });
  target.dispatchEvent(new Event('ping'));
  let updates = 0;
  zone.onUpdate(() => { updates++; });
  zone.update(.016);
  const audio = {stopped: 0, disconnected: 0, stop() { this.stopped++; }, disconnect() { this.disconnected++; }};
  zone.own(audio, 'audio');
  const order = [];
  zone.onDispose(() => order.push('first'));
  zone.onDispose(() => order.push('second'));
  const report = zone.dispose();
  assert.equal(clock.pending.size, 0, 'every timer and frame callback cancelled');
  assert.equal(report.timers, 3);
  target.dispatchEvent(new Event('ping'));
  assert.equal(heard, 1, 'listener removed');
  zone.update(.016);
  assert.equal(updates, 1, 'no per-frame work after unload');
  assert.equal(audio.stopped, 1);
  assert.equal(audio.disconnected, 1);
  assert.deepEqual(order, ['second', 'first'], 'cleanups run last-in first-out');
  assert.deepEqual(fired, []);
});

test('shared cache resources are never disposed; co-owned resources go with the last owner', () => {
  const sharedCount = {count: 0}, coCount = {count: 0};
  const shared = watchDispose(new THREE.DataTexture(new Uint8Array(4), 1, 1), sharedCount);
  const co = watchDispose(new THREE.BoxGeometry(1, 1, 1), coCount);
  const a = createZoneRuntime({id: 'a', root: new THREE.Group()});
  const b = createZoneRuntime({id: 'b', root: new THREE.Group()});
  a.share(shared);
  a.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({map: shared})));
  a.own(co, 'geometry');
  b.own(co, 'geometry');
  a.dispose();
  assert.equal(sharedCount.count, 0, 'global cache texture kept');
  assert.equal(coCount.count, 0, 'still owned by zone b');
  b.dispose();
  assert.equal(coCount.count, 1, 'disposed by its last owner');
});

test('the grotto zones build without scene lights or valley fog and release every resource', () => {
  clearGrottoPrefetchCache();
  for (const [id, build] of [['grotto_hall', buildGrottoHall], ['grotto_chamber', buildGrottoChamber]]) {
    const zone = createZoneRuntime({id, root: new THREE.Group(), clock: fakeClock()});
    build(zone, {audio: null});
    const lights = [], materials = new Set(), geometries = new Set();
    zone.root.traverse(node => {
      if (node.isLight) lights.push(node);
      if (node.geometry) geometries.add(node.geometry);
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) if (m) materials.add(m);
    });
    assert.equal(lights.length, 0, id + ': no scene lights (they would recompile every program)');
    for (const m of materials) assert.equal(m.fog, false, id + ': ' + m.name + ' ignores valley fog');
    const stats = zone.stats();
    assert.equal(stats.geometry, geometries.size, id + ': every geometry owned');
    assert.equal(stats.material, materials.size, id + ': every material owned');
    assert.ok(stats.texture >= 1 && stats.bvh >= 2, id + ': rock texture and floor/wall BVHs owned');
    let released = 0;
    for (const resource of [...geometries, ...materials]) resource.addEventListener('dispose', () => { released++; });
    const report = zone.dispose();
    assert.equal(released, geometries.size + materials.size, id + ': all geometry and materials disposed');
    assert.equal(report.texture, stats.texture);
    assert.equal(zone.root.children.length, 0);
  }
});

// Synchronous on purpose: a suspended async frame can keep its last local
// (the final zone) alive, which would be the test's reference, not the zone's.
function runRoundTrips(refs, trips = 30) {
  const parent = new THREE.Group();
  let disposeEvents = 0, created = 0;
  for (let trip = 0; trip < trips; trip++) {
    for (const [id, build] of [['grotto_hall', buildGrottoHall], ['grotto_chamber', buildGrottoChamber]]) {
      const zone = createZoneRuntime({id, root: new THREE.Group(), parent, clock: fakeClock()});
      build(zone, {audio: null});
      zone.root.traverse(node => {
        if (node.geometry) refs.push(new WeakRef(node.geometry));
        if (node.material) refs.push(new WeakRef(node.material));
      });
      refs.push(zone.weakRoot());
      const stats = zone.stats();
      created += stats.geometry + stats.material + stats.texture;
      zone.root.traverse(node => {
        node.geometry?.addEventListener('dispose', () => { disposeEvents++; });
      });
      zone.dispose();
      assert.equal(parent.children.length, 0, 'trip ' + trip + ': nothing left under the zones parent');
    }
  }
  return {disposeEvents, created};
}

test('30 load/unload round trips leave no zone object reachable after garbage collection', async () => {
  const before = zoneRuntimeDiagnostics();
  const refs = [];
  const {disposeEvents, created} = runRoundTrips(refs, 30);
  const after = zoneRuntimeDiagnostics();
  assert.equal(after.created - before.created, 60);
  assert.equal(after.disposed - before.disposed, 60);
  assert.ok(disposeEvents > 0 && created > 0);
  for (let i = 0; i < 6; i++) {
    gc();
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const alive = refs.filter(ref => ref.deref() !== undefined).length;
  assert.equal(alive, 0, alive + ' of ' + refs.length + ' zone objects are still reachable');
});
