// Phase B prototype: the Jade Lantern Grotto as two natural zones behind
// authored doorways, flag OFF by default, five-area loader kept as rollback.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';
import * as THREE from 'three';
import {
  GROTTO_PLAN, grottoFramePoint, grottoDoorFrame, sampleGrottoSpace, resolveGrottoMovement,
  resolveGrottoFacadeCollision, planGrottoDoorways, grottoFootprintSamples,
} from '../src/components/game3d/wolfveil/zones/WolfveilGrottoZonePlan.mjs';
import {
  WOLFVEIL_PROTOTYPE_ZONE_GRAPH, WOLFVEIL_NATURAL_ZONE_PROPOSAL, validateZoneGraph,
} from '../src/components/game3d/wolfveil/zones/WolfveilZoneGraph.mjs';
import {wolfveilNaturalZonesEnabled} from '../src/components/game3d/wolfveil/zones/WolfveilNaturalZoneFlag.mjs';
import {createWolfveilNaturalZones} from '../src/components/game3d/wolfveil/zones/WolfveilNaturalZones.js';
import {wolfveilHeight} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {createWolfveilTerrainSurfaceSampler} from '../src/components/game3d/wolfveil/WolfveilTerrainSurfaceSampler.mjs';
import {wolfveilAreaGates} from '../src/components/game3d/wolfveil/streaming/WolfveilAreaVeils.mjs';

const source = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const D = GROTTO_PLAN.door;
const door = s => grottoFramePoint(D.a + D.normal.a * s, D.l + D.normal.l * s);
const BOTH = ['grotto_hall', 'grotto_chamber'];

test('every cave surface stays under at least 2.5 m of uncut hillside', () => {
  const mesh = createWolfveilTerrainSurfaceSampler({span: 1100, segments: 310});
  const samples = grottoFootprintSamples(1);
  assert.ok(samples.length > 300);
  let worst = Infinity;
  for (const s of samples) worst = Math.min(worst, Math.min(wolfveilHeight(s.x, s.z), mesh(s.x, s.z)) - s.ceilingY);
  assert.ok(worst >= 2.5, 'thinnest rock cover ' + worst.toFixed(2) + ' m');
});

test('the hall is walkable to the inner door; the door blocks until open; the chamber needs its zone', () => {
  const route = [GROTTO_PLAN.anchors.hallLanding, ...GROTTO_PLAN.hall.nodes.slice(1), door(0), door(4), GROTTO_PLAN.chamber.centre];
  let blockedClosed = false;
  for (let i = 0; i < route.length - 1; i++)
    for (let t = 0; t <= 1; t += .02) {
      const x = route[i].x + (route[i + 1].x - route[i].x) * t, z = route[i].z + (route[i + 1].z - route[i].z) * t;
      assert.ok(sampleGrottoSpace(x, z, {zones: BOTH, margin: .62, doorOpen: true}), 'gap on the route at leg ' + i);
      if (!sampleGrottoSpace(x, z, {zones: BOTH, margin: .62, doorOpen: false})) blockedClosed = true;
    }
  assert.ok(blockedClosed, 'a closed inner door blocks the route');
  const c = GROTTO_PLAN.chamber.centre;
  assert.equal(sampleGrottoSpace(c.x, c.z, {zones: ['grotto_hall'], doorOpen: true}), null, 'no chamber floor while it is unloaded');
  assert.ok(sampleGrottoSpace(c.x, c.z, {zones: ['grotto_chamber']}));
  const landing = GROTTO_PLAN.anchors.hallLanding;
  assert.equal(sampleGrottoSpace(landing.x, landing.z, {zones: ['grotto_hall'], margin: .62}).floorY, 6.2);
});

test('the Z-turn hides the inner door from the exit door (no straight walkable sightline)', () => {
  const clearAlong = (a, b) => {
    for (let t = 0; t <= 1; t += .01)
      if (!sampleGrottoSpace(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, {zones: ['grotto_hall'], doorOpen: true})) return false;
    return true;
  };
  for (const a of [4.3, 5.5, 7, 9]) for (const l of [-1.5, 0, 1.5])
    assert.equal(clearAlong(grottoFramePoint(a, l), door(-.2)), false, 'sightline from a=' + a + ' l=' + l);
});

test('hall walls and the closed door stop a walker; sliding keeps the free axis', () => {
  const p = grottoFramePoint(8, 0), wall = grottoFramePoint(8, 3.5);
  const pos = {x: wall.x, z: wall.z};
  assert.equal(resolveGrottoMovement(pos, {x: p.x, z: p.z}, {zones: ['grotto_hall']}), true);
  assert.ok(sampleGrottoSpace(pos.x, pos.z, {zones: ['grotto_hall'], margin: .62}), 'kept inside');
  const before = door(-1.2), through = door(1.5);
  const step = {x: through.x, z: through.z};
  assert.equal(resolveGrottoMovement(step, {x: before.x, z: before.z}, {zones: BOTH, doorOpen: false}), true);
  assert.ok(grottoDoorFrame(step.x, step.z).signed < 0, 'a closed door holds the walker on the hall side');
  const open = {x: through.x, z: through.z};
  assert.equal(resolveGrottoMovement(open, {x: before.x, z: before.z}, {zones: BOTH, doorOpen: true}), false, 'an open door lets them through');
});

test('doorway volumes: pockets are reachable, arrivals never land in the opposite pocket', () => {
  const [mouthIn, mouthOut, innerIn, innerOut] = planGrottoDoorways();
  const surface = (a, l = 0) => { const p = grottoFramePoint(a, l); return {...p, y: wolfveilHeight(p.x, p.z)}; };
  assert.ok(mouthIn.approach(surface(-10)));
  assert.ok(mouthIn.pocket(surface(1)));
  assert.ok(!mouthIn.pocket(surface(-4.5)), 'the outside anchor is not in the pocket (no ping-pong)');
  assert.ok(!mouthIn.pocket({...surface(1), y: wolfveilHeight(surface(1).x, surface(1).z) + 8}), 'a glider overhead is not in the pocket');
  const landing = GROTTO_PLAN.anchors.hallLanding;
  assert.ok(!mouthOut.pocket(landing), 'the hall landing is not in the exit pocket');
  assert.ok(mouthOut.pocket({...grottoFramePoint(4.8, 0), y: 6.2}));
  assert.ok(innerIn.pocket({...door(-1), y: D.floorY}) && innerIn.passed({...door(3), y: D.floorY}));
  assert.ok(innerOut.pocket({...door(1), y: D.floorY}) && innerOut.passed({...door(-3), y: D.floorY}));
  // The arch rocks are solid, the throat is open.
  const rock = GROTTO_PLAN.facade.rocks[0], inRock = grottoFramePoint(rock[0], rock[1]);
  const pushed = {x: inRock.x, z: inRock.z};
  assert.equal(resolveGrottoFacadeCollision(pushed), true);
  const throat = grottoFramePoint(1, 0), free = {x: throat.x, z: throat.z};
  assert.equal(resolveGrottoFacadeCollision(free), false);
});

test('zone graphs are valid; the proposal names real gates and keeps the bridges and caves', () => {
  assert.deepEqual(validateZoneGraph({zones: WOLFVEIL_PROTOTYPE_ZONE_GRAPH.zones, doorways: planGrottoDoorways(),
    initialZone: WOLFVEIL_PROTOTYPE_ZONE_GRAPH.initialZone}), []);
  const zoneIds = new Set(WOLFVEIL_NATURAL_ZONE_PROPOSAL.zones.map(z => z.id));
  const gateIds = new Set(wolfveilAreaGates().map(g => g.id));
  const replaced = new Set();
  for (const d of WOLFVEIL_NATURAL_ZONE_PROPOSAL.doorways) {
    for (const z of d.between) assert.ok(zoneIds.has(z), d.id + ' joins unknown zone ' + z);
    for (const r of d.replaces) {
      const id = r.split(' ')[0];
      if (gateIds.has(id)) replaced.add(id);
    }
    assert.ok(['B', 'C', 'D', 'E'].includes(d.phase), d.id);
    assert.ok(d.occluder.length > 10, d.id + ' names its occluder');
  }
  assert.equal(replaced.size, gateIds.size, 'every current rectangle gate has a proposed natural replacement');
  assert.equal(WOLFVEIL_NATURAL_ZONE_PROPOSAL.status, 'proposal');
});

test('the natural-zone flag is OFF unless asked for', () => {
  const store = value => ({getItem: () => value});
  assert.equal(wolfveilNaturalZonesEnabled({search: '', storage: store(null)}), false);
  assert.equal(wolfveilNaturalZonesEnabled({search: '?naturalZones=1', storage: store(null)}), true);
  assert.equal(wolfveilNaturalZonesEnabled({search: '', storage: store('1')}), true);
  assert.equal(wolfveilNaturalZonesEnabled({search: '?naturalZones=0', storage: store('1')}), false);
  assert.equal(wolfveilNaturalZonesEnabled({search: '', storage: {getItem() { throw new Error('blocked'); }}}), false);
});

test('controller: doorways, cave ground, collision, eviction and checkpoints in a real scene graph', () => {
  const scene = new THREE.Scene();
  const ground = [];
  let added = 0, removed = 0;
  const notices = [];
  const nz = createWolfveilNaturalZones({scene, audio: false, onNotice: text => notices.push(text),
    addGroundMeshes: list => { added += list.length; ground.push(...list); },
    removeGroundMeshes: list => { removed += list.length; for (const m of list) ground.splice(ground.indexOf(m), 1); }});
  const player = new THREE.Object3D();
  scene.add(player);
  const at = (p, y) => player.position.set(p.x, y, p.z + 70);
  const tick = (n = 30, extra = {}) => { for (let i = 0; i < n; i++) nz.update(1 / 30, {player, ...extra}); };
  const zoneRoots = () => nz.root.children.filter(c => c.userData.zoneRuntimeOwned && !String(c.userData.wolfveilZone).startsWith('facade'));
  assert.equal(zoneRoots().length, 0, 'nothing of the cave exists on the surface');
  for (let trip = 0; trip < 10; trip++) {
    const outside = grottoFramePoint(-4.5, 0), throat = grottoFramePoint(1, 0);
    at(outside, wolfveilHeight(outside.x, outside.z)); tick(3);
    assert.equal(nz.playerGroundY(player.position), null, 'surface ground stays the valley');
    at(throat, wolfveilHeight(throat.x, throat.z)); tick(20);
    assert.equal(nz.activeZone, 'grotto_hall');
    assert.ok(Math.abs(player.position.y - 6.22) < .01, 'moved once onto the hall floor');
    assert.equal(nz.playerGroundY(player.position), 6.2);
    assert.ok(nz.safeCheckpoint().y > 14, 'a save inside points back outside the mouth');
    at(door(-1), D.floorY); tick(40);
    at(door(3.2), D.floorY); tick(40);
    assert.equal(nz.activeZone, 'grotto_chamber');
    assert.equal(zoneRoots().length, 1, 'only the chamber is resident');
    at(door(1), D.floorY); tick(40);
    at(door(-3.2), D.floorY); tick(40);
    const exit = grottoFramePoint(4.8, 0);
    at(exit, 6.2); tick(20);
    assert.equal(nz.activeZone, 'surface', 'trip ' + trip + ' back outside');
    assert.equal(zoneRoots().length, 0, 'trip ' + trip + ': no cave left in the scene');
    assert.equal(ground.length, 0, 'cave floors removed from the ground rays');
  }
  assert.equal(added, removed);
  assert.ok(notices.some(text => /Entry Hall/.test(text)) && notices.some(text => /Lantern Chamber/.test(text)));
  // Respawn far away while inside: evicted to the valley, cave released.
  const throat = grottoFramePoint(1, 0);
  at(throat, wolfveilHeight(throat.x, throat.z)); tick(20);
  assert.equal(nz.activeZone, 'grotto_hall');
  player.position.set(0, 20, 0); tick(3);
  assert.equal(nz.activeZone, 'surface');
  assert.equal(zoneRoots().length, 0);
  // Mounted at the arch: held with a notice.
  const before = notices.length;
  at(throat, wolfveilHeight(throat.x, throat.z)); tick(20, {mounted: true});
  assert.equal(nz.activeZone, 'surface');
  assert.ok(notices.slice(before).some(text => /Dismount/.test(text)));
  nz.dispose();
  assert.ok(!scene.children.includes(nz.root), 'dispose removes the whole natural-zone root');
});

test('GameWorld3D: everything is behind the flag and the five-area loader stays the rollback', () => {
  const world = source('src/components/game3d/GameWorld3D.jsx');
  assert.match(world, /if\(wolfveilVillage&&!dedicatedMode&&wolfveilNaturalZonesEnabled\(\)\)\{/);
  assert.equal((world.match(/createWolfveilNaturalZones\(/g) || []).length, 1);
  assert.match(world, /const regionStream=wolfveilVillage\?createWolfveilAreaLoader\(\{/, 'five-area loader still built');
  assert.match(world, /areaPortals=wolfveilVillage\?createWolfveilAreaGates\(wolfveilVillage\.world\):null/, 'veils and torii still built');
  assert.equal((world.match(/areaPortals\?\.update\(delta,/g) || []).length, 2);
  assert.match(world, /exclude:naturalZones\?\['jade_lantern_grotto'\]:\[\]/);
  assert.match(world, /naturalZones\?\.dispose\(\)/);
  assert.match(world, /naturalZones\?\.playerGroundY\(model\.position\)\?\?palaceY/);
  assert.match(source('src/components/game3d/wolfveil/WolfveilDungeonPortals.js'), /filter\(cave=>!exclude\.includes\(cave\.id\)\)/);
});
