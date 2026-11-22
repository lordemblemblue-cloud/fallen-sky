import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { valleyKitPiece } from '../src/components/game3d/threeroads/kits/valleyKitPieces.mjs';
import { THREE_ROADS_CAST } from '../src/components/game3d/threeroads/script/cast.mjs';
import {
  THREE_ROADS_PLACES, placeLayout, placeAnchorLocal, placeAnchorWorld,
} from '../src/components/game3d/threeroads/places/layouts/index.mjs';
import {
  PLACE_LOD, lodForDistance, placeInstances, instanceMatrix, solidFor, pushOutOfSolid,
  createSolidGrid, resolveAgainstGrid, groundUnder, pieceReach,
} from '../src/components/game3d/threeroads/places/placeMath.mjs';
import { drapePaintedGround, groundShapePolygons } from '../src/components/game3d/threeroads/places/paintedGround.mjs';
import { createPlacesSubsystem } from '../src/components/game3d/threeroads/places/placesSubsystem.mjs';
import { createThreeRoadsBus } from '../src/components/game3d/threeroads/ThreeRoadsWorld.mjs';
import { wolfveilHeight, wolfveilDistanceToRiver, wolfveilRouteClearance } from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import { wolfveilAreaAtLocal, wolfveilAreaRect } from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import { insideWolfveilImportedTown } from '../src/components/game3d/wolfveil/WolfveilImportedTownLayout.mjs';

// The anchors other sessions' code imports (the places brief).
const REQUIRED_ANCHORS = {
  P01: ['stone'],
  P02: ['board_akitsu', 'board_tameri', 'board_remoria'],
  P03: ['wall'],
  P04: ['wagon_akitsu', 'wagon_tameri', 'wagon_remoria', 'gate_arch', 'bell'],
  P06: ['cairn', 'standard_1', 'standard_2', 'standard_3'],
  P07: ['desk'],
  P08: ['centre', 'wagon_akitsu', 'wagon_tameri', 'wagon_remoria'],
  P09: ['barn_door', 'mill_door', 'well'],
  P10: ['plot_pyres', 'plot_stelae', 'plot_graves', 'hut_door'],
  P11: ['hives', 'house_1', 'house_2'],
  P12: ['door'],
};

const borderDistance = (area, x, z) => {
  const rect = wolfveilAreaRect(area, { clamp: true });
  return Math.min(x - rect.minX, rect.maxX - x, z - rect.minZ, rect.maxZ - z);
};

test('every piece of every place is a piece of the valley kit', () => {
  assert.ok(THREE_ROADS_PLACES.length > 0);
  for (const place of THREE_ROADS_PLACES)
    for (const entry of place.pieces)
      assert.ok(valleyKitPiece(entry.piece), `${place.id}: unknown piece ${entry.piece}`);
});

test('every place lies inside its circle, its area, and 30 m inside the area border', () => {
  const ids = new Set();
  for (const place of THREE_ROADS_PLACES) {
    assert.ok(!ids.has(place.id), `${place.id} twice`);
    ids.add(place.id);
    assert.equal(wolfveilAreaAtLocal(place.x, place.z), place.area, `${place.id} centre`);
    for (const inst of placeInstances(place)) {
      const d = Math.hypot(inst.x - place.x, inst.z - place.z);
      assert.ok(d <= place.radius, `${place.id} ${inst.piece} at ${d.toFixed(1)} m, radius ${place.radius}`);
      assert.equal(wolfveilAreaAtLocal(inst.x, inst.z), place.area, `${place.id} ${inst.piece} area`);
      const border = borderDistance(place.area, inst.x, inst.z) - pieceReach(inst);
      assert.ok(border >= 30, `${place.id} ${inst.piece} only ${border.toFixed(1)} m from the border`);
    }
  }
});

test('the anchors other subsystems use exist and stand inside their place', () => {
  for (const place of THREE_ROADS_PLACES) {
    for (const name of REQUIRED_ANCHORS[place.id] || []) {
      const local = placeAnchorLocal(place.id, name);
      assert.ok(local, `${place.id} has no anchor ${name}`);
      assert.ok(Math.hypot(local.x - place.x, local.z - place.z) <= place.radius, `${place.id}.${name} outside`);
      const world = placeAnchorWorld(place.id, name);
      assert.equal(world.z, local.z + 70);
    }
  }
  assert.equal(placeAnchorLocal('P04', 'nowhere'), null);
  assert.equal(placeAnchorLocal('P99', 'stone'), null);
});

test('nothing solid or painted stands in the river, and nothing solid on a road', () => {
  for (const place of THREE_ROADS_PLACES) {
    for (const inst of placeInstances(place)) {
      const kit = valleyKitPiece(inst.piece);
      assert.ok(wolfveilDistanceToRiver(inst.x, inst.z) > 25, `${place.id} ${inst.piece} by the river`);
      if (!kit.solid) continue;
      const clearance = wolfveilRouteClearance(inst.x, inst.z);
      assert.ok(clearance > pieceReach(inst) * 0.5, `${place.id} ${inst.piece} on a road (${clearance.toFixed(1)})`);
    }
    for (const shape of place.ground || [])
      for (const polygon of groundShapePolygons(shape, place.x, place.z))
        for (const [x, z] of polygon) {
          assert.ok(wolfveilDistanceToRiver(x, z) > 25, `${place.id} painted ground by the river`);
          assert.ok(!insideWolfveilImportedTown(x, z), `${place.id} painted ground on the town plaza`);
        }
  }
});

test('the people\'s spots are left clear of solid pieces', () => {
  const solids = THREE_ROADS_PLACES.flatMap(place => placeInstances(place).map(inst => solidFor(inst)).filter(Boolean));
  const grid = createSolidGrid(solids);
  for (const person of THREE_ROADS_CAST) {
    if (!person.home || !('x' in person.home)) continue;
    const point = { x: person.home.x, z: person.home.z };
    assert.equal(resolveAgainstGrid(grid, point, 0.6), false, `${person.id}'s spot is blocked`);
  }
});

test('instance matrices: translate, turn and scale in Three.js order', () => {
  const place = {
    id: 'T', area: 'south', x: 10, z: -300,
    pieces: [{ piece: 'wagon', x: 2, z: 3, yaw: Math.PI / 2, scale: 2, y: 0.5 }],
  };
  const [inst] = placeInstances(place);
  assert.equal(inst.x, 12); assert.equal(inst.z, -297);
  const e = instanceMatrix(inst, 4);
  const ours = new THREE.Matrix4().fromArray(e);
  const theirs = new THREE.Matrix4().compose(new THREE.Vector3(12, 4.5, -297),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0, 'YXZ')), new THREE.Vector3(2, 2, 2));
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(ours.elements[i] - theirs.elements[i]) < 1e-9, `element ${i}`);
  // Pitch and roll follow the YXZ order of the spinning pieces' Euler.
  const tilted = { ...inst, pitch: 0.3, roll: -0.7 };
  const a = new THREE.Matrix4().fromArray(instanceMatrix(tilted, 0));
  const b = new THREE.Matrix4().compose(new THREE.Vector3(12, 0.5, -297),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, Math.PI / 2, -0.7, 'YXZ')), new THREE.Vector3(2, 2, 2));
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(a.elements[i] - b.elements[i]) < 1e-9, `tilted element ${i}`);
  // The front (+z) of a piece turned by yaw looks along (sin yaw, cos yaw).
  const front = new THREE.Vector3(0, 0, 1).applyMatrix4(new THREE.Matrix4().fromArray(instanceMatrix({ ...inst, scale: 1, x: 0, z: 0, y: 0 }, 0)));
  assert.ok(Math.abs(front.x - 1) < 1e-9 && Math.abs(front.z) < 1e-9);
});

test('big pieces stand on the lowest ground under their footprint', () => {
  const [barn] = placeInstances({ id: 'T', area: 'south', x: 0, z: 0, pieces: [{ piece: 'barn', x: 0, z: 0 }] });
  const slope = (x, z) => x * 0.1 + z * 0.05;
  assert.ok(Math.abs(groundUnder(barn, slope) - (-0.6 - 0.2)) < 1e-9);
  const [sheaf] = placeInstances({ id: 'T', area: 'south', x: 0, z: 0, pieces: [{ piece: 'sheaf', x: 3, z: 0 }] });
  assert.ok(Math.abs(groundUnder(sheaf, slope) - 0.3) < 1e-9);
  assert.equal(groundUnder(barn, () => null), null);
});

test('collision: circles and turned boxes push the player out, and only them', () => {
  const [barn, well] = placeInstances({
    id: 'T', area: 'south', x: 0, z: 0,
    pieces: [{ piece: 'barn', x: 0, z: 0, yaw: Math.PI / 6 }, { piece: 'well', x: 20, z: 0 }],
  });
  const box = solidFor(barn, 0), circle = solidFor(well, 0);
  assert.equal(box.kind, 'box'); assert.equal(circle.kind, 'circle');
  const inside = { x: 1, z: 0.5 };
  assert.equal(pushOutOfSolid(box, inside, 0.6), true);
  // Back in the barn's frame the point now sits on the widened outline.
  const dx = inside.x, dz = inside.z, c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
  const a = c * dx - s * dz, b = s * dx + c * dz;
  assert.ok(Math.abs(Math.abs(a) - 6.6) < 1e-9 || Math.abs(Math.abs(b) - 4.6) < 1e-9);
  const nearWell = { x: 21, z: 0 };
  assert.equal(pushOutOfSolid(circle, nearWell, 0.5), true);
  assert.ok(Math.abs(Math.hypot(nearWell.x - 20, nearWell.z) - 1.5) < 1e-9);
  const free = { x: 30, z: 30 };
  assert.equal(pushOutOfSolid(box, free, 0.6), false);
  assert.equal(solidFor({ ...barn, piece: 'sheaf' }), null, 'sheaves are walked through');
  // Standing above a piece's top leaves the player alone.
  const grid = createSolidGrid([box, circle]);
  const onRoof = { x: 0, z: 0 };
  assert.equal(resolveAgainstGrid(grid, onRoof, 0.6, 100), false);
  assert.equal(resolveAgainstGrid(grid, onRoof, 0.6, 0), true);
});

test('level of detail: near, low-poly, gone, landmarks, and no blinking on the line', () => {
  assert.equal(lodForDistance(10), 0);
  assert.equal(lodForDistance(PLACE_LOD.near + 1), 1);
  assert.equal(lodForDistance(PLACE_LOD.far + 1), -1);
  assert.equal(lodForDistance(400, true), 1, 'a landmark is drawn from anywhere');
  assert.equal(lodForDistance(5, true), 0);
  // Hysteresis: a piece keeps its level until it is clearly past the line.
  assert.equal(lodForDistance(PLACE_LOD.near + 2, false, 0), 0);
  assert.equal(lodForDistance(PLACE_LOD.near + PLACE_LOD.hysteresis + 0.1, false, 0), 1);
  assert.equal(lodForDistance(PLACE_LOD.near - 2, false, 1), 1);
  assert.equal(lodForDistance(PLACE_LOD.near - PLACE_LOD.hysteresis - 0.1, false, 1), 0);
  assert.equal(lodForDistance(PLACE_LOD.far + 2, false, 1), 1);
  assert.equal(lodForDistance(PLACE_LOD.far - 2, false, -1), -1);
  assert.equal(lodForDistance(PLACE_LOD.far - PLACE_LOD.hysteresis - 0.1, false, -1), 1);
  assert.equal(lodForDistance(NaN), -1);
});

test('painted ground follows the terrain a few centimetres up', () => {
  const place = { id: 'T', x: 25, z: -390, ground: [{ surface: 'threshing', circle: [0, 0, 15] }] };
  const { positions, colors, triangles } = drapePaintedGround([place], wolfveilHeight);
  assert.ok(triangles > 24);
  assert.equal(positions.length, triangles * 9);
  assert.equal(colors.length, triangles * 9);
  let worst = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    assert.ok(Math.hypot(x - 25, z + 390) <= 15.001);
    worst = Math.max(worst, Math.abs(y - 0.06 - wolfveilHeight(x, z)));
  }
  assert.ok(worst < 0.25, `drape strays ${worst.toFixed(3)} m from the analytic ground`);
});

function fakeContext(area) {
  const group = new THREE.Group();
  group.position.z = 70;
  const events = [];
  const bus = createThreeRoadsBus();
  bus.on('places:ready', detail => events.push(detail));
  return {
    events,
    ctx: {
      region: 'wolfveil', worldArea: area, areaScenes: true, wolfveilWorld: { group }, bus,
      sampleGroundY: (x, z) => wolfveilHeight(x, z - 70),
    },
  };
}

test('the subsystem builds the area, stands it on the ground and says so', () => {
  assert.equal(createPlacesSubsystem({ region: 'wolfveil', worldArea: 'town' }), null, 'no world group, nothing to do');
  assert.equal(createPlacesSubsystem({ region: 'wolfveil-caves', worldArea: 'town', wolfveilWorld: { group: new THREE.Group() } }), null);
  const { ctx, events } = fakeContext('town');
  const places = createPlacesSubsystem(ctx);
  assert.ok(places);
  const root = ctx.wolfveilWorld.group.getObjectByName('TR_Places');
  assert.ok(root?.userData.wolfveilAreaShared);
  assert.deepEqual(events, [{ area: 'town' }], 'places:ready once the ground answered');
  const yard = placeAnchorWorld('P04', 'wagon_tameri');
  places.update(0.3, { x: yard.x, y: 5, z: yard.z });
  const status = places.status();
  assert.ok(status.places.includes('P04'));
  assert.ok(status.instances > 0 && status.drawCalls > 0 && status.triangles > 0);
  assert.equal(status.kit, 'boxes');
  // A wagon is solid; the anchor beside it is not.
  const wagon = placeInstances(placeLayout('P04')).find(inst => inst.piece === 'wagon');
  const inWagon = new THREE.Vector3(wagon.x + 0.3, 4, wagon.z + 70);
  assert.equal(places.resolveCollision(inWagon, null, 0.6), true);
  const atAnchor = new THREE.Vector3(yard.x, 4, yard.z);
  assert.equal(places.resolveCollision(atAnchor, null, 0.6), false);
  const anchor = places.anchor('P04', 'bell');
  assert.ok(Number.isFinite(anchor.y));
  assert.equal(anchor.z, anchor.localZ + 70);
  // Far away, nothing but landmarks is drawn.
  places.update(0.3, { x: 0, y: 5, z: 400 });
  for (const mesh of root.children.filter(child => child.isInstancedMesh))
    if (mesh.visible) assert.ok(mesh.count > 0);
  places.dispose();
  assert.equal(root.parent, null);
  places.dispose();
});

test('the whole valley in one scene builds every area\'s places', () => {
  const { ctx, events } = fakeContext('town');
  const places = createPlacesSubsystem({ ...ctx, areaScenes: false });
  const areas = new Set(THREE_ROADS_PLACES.map(place => place.area));
  assert.deepEqual(new Set(places.status().areas.filter(area => areas.has(area))), areas);
  assert.equal(events.length, areas.size);
  places.dispose();
});
