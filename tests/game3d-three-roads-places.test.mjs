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
  createSolidGrid, resolveAgainstGrid, groundUnder, groundBuried, pieceReach, kitPieceOf,
} from '../src/components/game3d/threeroads/places/placeMath.mjs';
import { drapePaintedGround, groundShapePolygons } from '../src/components/game3d/threeroads/places/paintedGround.mjs';
import { createPlacesSubsystem } from '../src/components/game3d/threeroads/places/placesSubsystem.mjs';
import { createThreeRoadsBus } from '../src/components/game3d/threeroads/ThreeRoadsWorld.mjs';
import { wolfveilHeight, wolfveilDistanceToRiver, wolfveilRouteClearance } from '../src/components/game3d/wolfveil/WolfveilLayout.js';
// The game loads the cave access plan, which installs the cave-approach benches
// into the height chain (the High Road's crest stands on one): so do the tests.
import '../src/components/game3d/wolfveil/WolfveilCaveAccessPlan.mjs';
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
  // The borders between areas, where the veils and the clipping run (the
  // outer edge of the valley is not one: the High Road's arch stands near it).
  const rect = wolfveilAreaRect(area);
  return Math.min(x - rect.minX, rect.maxX - x, z - rect.minZ, rect.maxZ - z);
};

test('every piece of every place is a piece of the valley kit', () => {
  assert.ok(THREE_ROADS_PLACES.length > 0);
  for (const place of THREE_ROADS_PLACES)
    for (const entry of place.pieces)
      assert.ok(kitPieceOf(entry.kit, entry.piece), `${place.id}: unknown piece ${entry.piece}`);
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
  // Band 2's camps sit across roads and on the gorge on purpose: their own test is below.
  for (const place of THREE_ROADS_PLACES.filter(entry => !entry.preview)) {
    for (const inst of placeInstances(place)) {
      const kit = kitPieceOf(inst.kit, inst.piece);
      assert.ok(wolfveilDistanceToRiver(inst.x, inst.z) > 25, `${place.id} ${inst.piece} by the river`);
      // The old analytic routes cross under the plaza's paving, where no road is drawn.
      if (!kit.solid || insideWolfveilImportedTown(inst.x, inst.z)) continue;
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
  const places = createPlacesSubsystem({ ...ctx, areaScenes: false }, { preview: false });
  const areas = new Set(THREE_ROADS_PLACES.filter(place => !place.preview).map(place => place.area));
  assert.deepEqual(new Set(places.status().areas.filter(area => areas.has(area))), areas);
  assert.equal(events.length, areas.size);
  places.dispose();
});

test('in the Gate Fields: inside the barn is pushed out, the threshing circle is free', () => {
  const solids = THREE_ROADS_PLACES.flatMap(place => placeInstances(place).map(inst => solidFor(inst)).filter(Boolean));
  const grid = createSolidGrid(solids);
  const barn = placeInstances(placeLayout('P09')).find(inst => inst.piece === 'barn');
  const inBarn = { x: barn.x + 0.5, z: barn.z - 0.3 };
  assert.equal(resolveAgainstGrid(grid, inBarn, 0.6), true);
  const barnSolid = solidFor(barn);
  const check = { ...inBarn };
  assert.equal(pushOutOfSolid(barnSolid, check, 0.59), false, 'the barn let go of the point');
  const floor = placeLayout('P08');
  for (let r = 0; r <= 15; r += 1.5) for (let a = 0; a < 12; a++) {
    const point = { x: floor.x + Math.cos(a / 12 * Math.PI * 2) * r, z: floor.z + Math.sin(a / 12 * Math.PI * 2) * r };
    assert.equal(resolveAgainstGrid(grid, point, 0.6), false, `threshing circle blocked at r ${r}`);
  }
  // Nothing taller than a sheaf within 30 m of the floor's centre.
  for (const inst of placeInstances(floor)) {
    if (Math.hypot(inst.x - floor.x, inst.z - floor.z) >= 30) continue;
    assert.ok(valleyKitPiece(inst.piece).size[2] * inst.scale <= valleyKitPiece('sheaf').size[2], inst.piece);
  }
  // The barrow's door can be reached: its anchor is clear of the mound.
  const door = placeAnchorLocal('P12', 'door');
  assert.equal(resolveAgainstGrid(grid, { x: door.x, z: door.z }, 0.6), false);
});

test('the Gate Fields hold all five places, one windmill landmark and one pair of fire baskets', () => {
  const south = THREE_ROADS_PLACES.filter(place => place.area === 'south').map(place => place.id);
  for (const id of ['P08', 'P09', 'P10', 'P11', 'P12']) assert.ok(south.includes(id), id);
  const all = THREE_ROADS_PLACES.flatMap(place => placeInstances(place));
  assert.equal(all.filter(inst => inst.piece === 'fire_basket').length, 2);
  const landmarks = all.filter(inst => inst.landmark && inst.area === 'south').map(inst => inst.piece).sort();
  assert.deepEqual(landmarks, ['windmill_body', 'windmill_sails']);
  const sheaves = placeInstances(placeLayout('P08')).filter(inst => inst.piece === 'sheaf').length;
  assert.ok(sheaves >= 55 && sheaves <= 65, `${sheaves} sheaves`);
  assert.equal(all.filter(inst => inst.piece === 'beehive').length, 12);
  assert.equal(all.filter(inst => inst.piece === 'scarecrow').length, 4);
});

test('every anchor is a spot a person can stand on (no solid piece there)', () => {
  const solids = THREE_ROADS_PLACES.flatMap(place => placeInstances(place).map(inst => solidFor(inst)).filter(Boolean));
  const grid = createSolidGrid(solids);
  for (const place of THREE_ROADS_PLACES)
    for (const name of Object.keys(place.anchors || {})) {
      const at = placeAnchorLocal(place.id, name);
      assert.equal(resolveAgainstGrid(grid, { x: at.x, z: at.z }, 0.5), false, `${place.id}.${name} is inside a solid piece`);
    }
});

test('the script\'s named points and every person\'s spots keep 1.5 m clear of solid pieces', async () => {
  const { BAND1_POINTS } = await import('../src/components/game3d/threeroads/script/band1.mjs');
  const solids = THREE_ROADS_PLACES.flatMap(place => placeInstances(place).map(inst => solidFor(inst)).filter(Boolean));
  const grid = createSolidGrid(solids);
  const spots = Object.entries(BAND1_POINTS).map(([name, at]) => [name, at]);
  for (const person of THREE_ROADS_CAST) {
    for (const home of [person.home, person.homeAfter?.home, ...(person.alsoAt || [])]) {
      if (home && 'x' in home && ['town', 'south'].includes(home.area)) spots.push([person.id, home]);
    }
  }
  for (const [name, at] of spots) {
    if (wolfveilAreaAtLocal(at.x, at.z) !== 'town' && wolfveilAreaAtLocal(at.x, at.z) !== 'south') continue;
    if (name === 'oath_tree' || name === 'truce_stone') continue; // the tree and the stone stand there
    assert.equal(resolveAgainstGrid(grid, { x: at.x, z: at.z }, 1.5), false, `${name} at (${at.x}, ${at.z}) is within 1.5 m of a solid piece`);
  }
});

test('the layouts stand on the script\'s points where the script names them', async () => {
  const { BAND1_POINTS: P } = await import('../src/components/game3d/threeroads/script/band1.mjs');
  const same = (placeId, anchor, point) => {
    const at = placeAnchorLocal(placeId, anchor);
    assert.ok(Math.hypot(at.x - P[point].x, at.z - P[point].z) < 0.01, `${placeId}.${anchor} is not ${point}`);
  };
  same('P04', 'wagon_akitsu', 'yard_wagon_akitsu');
  same('P04', 'wagon_tameri', 'yard_wagon_tameri');
  same('P04', 'wagon_remoria', 'yard_wagon_remoria');
  same('P04', 'gate_arch', 'gate_arch');
  same('P08', 'wagon_akitsu', 'floor_wagon_akitsu');
  same('P08', 'wagon_tameri', 'floor_wagon_tameri');
  same('P08', 'wagon_remoria', 'floor_wagon_remoria');
  same('P08', 'centre', 'floor_centre');
  same('P03', 'wall', 'lantern_wall');
  same('P04', 'bell', 'gate_bell');
  // Each object a point names stands within its use radius (3 m) of it.
  const near = (piece, point, reach = 3) => assert.ok(THREE_ROADS_PLACES.some(place => placeInstances(place)
    .some(inst => inst.piece === piece && Math.hypot(inst.x - P[point].x, inst.z - P[point].z) <= reach)), `no ${piece} by ${point}`);
  near('crate_stack', 'woodpile');
  near('crate_stack', 'salt_store');
  near('lantern_wall', 'lantern_wall');
  near('gate_bell', 'gate_bell');
  near('wagon', 'floor_wagon_akitsu');
  near('wagon', 'yard_wagon_remoria');
});

// ---- Band 2: the three army camps (preview) --------------------------------

test('the camps are built only with the preview switch; the town and fields are the same either way', async () => {
  const { threeRoadsPreviewEnabled } = await import('../src/components/game3d/threeroads/threeRoadsFlag.mjs');
  const win = search => ({ location: { search }, localStorage: { getItem: () => null } });
  assert.equal(threeRoadsPreviewEnabled(win('?threeRoads=1')), false);
  assert.equal(threeRoadsPreviewEnabled(win('?threeRoads=1&threeRoadsPreview=1')), true);
  assert.equal(threeRoadsPreviewEnabled(win('?threeRoadsPreview=1')), false, 'the preview needs the main switch');
  for (const area of ['west', 'east', 'north']) {
    const { ctx, events } = fakeContext(area);
    assert.equal(createPlacesSubsystem(ctx, { preview: false }), null, area + ' builds nothing without the preview');
    assert.deepEqual(events, []);
    const shown = createPlacesSubsystem(ctx, { preview: true });
    assert.ok(shown, area + ' builds with the preview');
    assert.deepEqual(events, [{ area }]);
    assert.ok(shown.status().places.every(id => placeLayout(id).preview));
    shown.dispose();
  }
  for (const area of ['town', 'south']) {
    const off = createPlacesSubsystem(fakeContext(area).ctx, { preview: false });
    const on = createPlacesSubsystem(fakeContext(area).ctx, { preview: true });
    assert.deepEqual(on.status().places, off.status().places);
    assert.equal(on.status().instancesTotal, off.status().instancesTotal);
    off.dispose(); on.dispose();
  }
  // With no window (node) the preview is off.
  assert.equal(createPlacesSubsystem(fakeContext('north').ctx), null);
});

test('the camp layouts are the lead\'s plans, piece for piece', async () => {
  const { CAMP_PLANS } = await import('../src/components/game3d/threeroads/land/campPlans.mjs');
  const { CAMP_GROUND_MOVES } = await import('../src/components/game3d/threeroads/places/layouts/camps.mjs');
  for (const plan of CAMP_PLANS) {
    const built = THREE_ROADS_PLACES.filter(place => place.camp === plan.id).flatMap(placeInstances);
    assert.equal(built.length, plan.items.length, plan.id);
    for (const planned of plan.items) {
      // A recorded ground move: the same piece, that many metres along its facing.
      const ahead = CAMP_GROUND_MOVES[planned.piece] || 0;
      const item = { ...planned, x: planned.x + Math.sin(planned.yaw) * ahead, z: planned.z + Math.cos(planned.yaw) * ahead };
      const match = built.find(inst => inst.kit === item.kit && inst.piece === item.piece &&
        Math.abs(inst.x - item.x) < 0.01 && Math.abs(inst.z - item.z) < 0.01 && Math.abs(inst.yaw - item.yaw) < 1e-6);
      assert.ok(match, `${plan.id}: ${item.piece} at (${item.x}, ${item.z}) is missing`);
      assert.equal(match.y, item.y || 0);
      assert.equal(match.afloat, Boolean(item.afloat));
      assert.equal(match.area, plan.area);
    }
    assert.ok(built.some(inst => inst.piece === plan.tallMark && inst.landmark), plan.id + ' tall mark is a landmark');
  }
});

test('the camps stand on dry ground above the gorge, and what floats floats on the river', async () => {
  const { wolfveilRiverHeightAtZ } = await import('../src/components/game3d/wolfveil/WolfveilLayout.js');
  for (const place of THREE_ROADS_PLACES.filter(entry => entry.preview)) {
    for (const inst of placeInstances(place)) {
      const water = wolfveilRiverHeightAtZ(inst.z);
      if (inst.afloat) {
        assert.ok(wolfveilDistanceToRiver(inst.x, inst.z) < 12, `${inst.piece} afloat off the river`);
        assert.ok(wolfveilHeight(inst.x, inst.z) < water, `${inst.piece} afloat over dry ground`);
        continue;
      }
      // Near the river (the Landing), nothing that is not afloat stands down in the gorge.
      if (wolfveilDistanceToRiver(inst.x, inst.z) > 60) continue;
      const y = groundUnder(inst, wolfveilHeight);
      assert.ok(y > water + 10, `${place.id} ${inst.piece} at (${inst.x}, ${inst.z}) stands at ${y.toFixed(1)}, near the water (${water.toFixed(1)})`);
    }
  }
});

function campGrid() {
  return createSolidGrid(THREE_ROADS_PLACES.flatMap(place => placeInstances(place).map(inst => solidFor(inst, groundUnder(inst, wolfveilHeight) ?? 0)).filter(Boolean)));
}
// Walks a line in half-metre steps and returns the first blocked point.
function blockedOn(grid, from, to, radius) {
  const n = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.5);
  for (let i = 0; i <= n; i++) {
    const p = { x: from.x + (to.x - from.x) * i / n, z: from.z + (to.z - from.z) * i / n };
    if (resolveAgainstGrid(grid, { ...p }, radius)) return p;
  }
  return null;
}

test('the roads stay open: the ridge path through the fort, the west trail through both pickets', async () => {
  const { campPlan } = await import('../src/components/game3d/threeroads/land/campPlans.mjs');
  const grid = campGrid();
  const fort = campPlan('castra_lupa');
  const fortRoad = s => ({ x: fort.centre.x + s * fort.along.x, z: fort.centre.z + s * fort.along.z });
  // On foot (0.62 m) and mounted (0.85 m), from 12 m outside the south gate to the crossroads.
  for (const radius of [0.62, 0.85]) {
    assert.equal(blockedOn(grid, fortRoad(-40), fortRoad(46), radius), null, 'ridge path through the fort, radius ' + radius);
  }
  const west = campPlan('western_road_camp');
  const trail = s => ({ x: -263 + s * west.along.x, z: -93 + s * west.along.z });
  for (const radius of [0.62, 0.85]) {
    assert.equal(blockedOn(grid, trail(20), trail(100), radius), null, 'west trail through both pickets, radius ' + radius);
  }
  // The High Road passes under its arch.
  const arch = placeAnchorLocal('P43', 'road_arch');
  const ux = Math.sin(arch.facing), uz = Math.cos(arch.facing);
  assert.equal(blockedOn(grid, { x: arch.x - ux * 8, z: arch.z - uz * 8 }, { x: arch.x + ux * 8, z: arch.z + uz * 8 }, 0.85), null);
});

test('the Landing\'s rim rail closes the yard and leaves no pocket between rail and drop', async () => {
  const { wolfveilRiverHeightAtZ } = await import('../src/components/game3d/wolfveil/WolfveilLayout.js');
  const grid = campGrid();
  const landing = placeLayout('P24');
  const rails = placeInstances(landing).filter(inst => inst.piece === 'shield_wall' && Math.abs(inst.yaw + Math.PI / 2) < 0.01);
  assert.ok(rails.length >= 10);
  for (const rail of rails) {
    // Between the rail and the lip (2 m west of it) the ground must already be
    // falling away, or be wide enough to walk out along: no ledge a player can
    // drop into and not leave. Check that a point 1.2 m west of the rail is
    // either over the gorge (well below the rail) or reachable along the rim.
    const behind = { x: rail.x - 1.2, z: rail.z };
    const drop = wolfveilHeight(rail.x + 1, rail.z) - wolfveilHeight(behind.x, behind.z);
    const water = wolfveilRiverHeightAtZ(rail.z);
    assert.ok(wolfveilHeight(behind.x, behind.z) > water, 'rail over the water');
    if (drop < 1.5) {
      // A shelf: it must not be closed at both ends by rails or the stage.
      const north = resolveAgainstGrid(grid, { x: behind.x, z: behind.z + 2.5 }, 0.62);
      const south = resolveAgainstGrid(grid, { x: behind.x, z: behind.z - 2.5 }, 0.62);
      assert.ok(!(north && south), `a pocket behind the rail at z ${rail.z}`);
    }
  }
});

test('every camp piece stands on ground its skirt can cover (the game\'s ground, cave benches included)', () => {
  for (const place of THREE_ROADS_PLACES.filter(entry => entry.preview)) {
    for (const inst of placeInstances(place)) {
      if (inst.afloat || inst.groundMode === 'high') continue;
      const buried = groundBuried(inst, wolfveilHeight);
      assert.ok(buried < 1, `${place.id} ${inst.piece} at (${inst.x}, ${inst.z}) is buried ${buried.toFixed(2)} m on its uphill side`);
    }
  }
});

test('a camp draws as a few merged meshes: its landmarks instanced, the rest one mesh per kit and material', () => {
  for (const [area, id] of [['west', 'P13'], ['east', 'P24'], ['north', 'P35']]) {
    const { ctx } = fakeContext(area);
    const places = createPlacesSubsystem(ctx, { preview: true });
    const camp = placeLayout(id);
    places.update(0.3, { x: camp.x, y: 50, z: camp.z + 70 });
    const near = places.status();
    // Every piece of the camp is drawn near it (the north's arch is 230 m off).
    assert.ok(near.instances >= placeInstances(camp).length, area);
    assert.ok(near.drawCalls <= 7, `${area}: ${near.drawCalls} draw calls near the camp`);
    // Far away: only the landmarks (and their area's other far places) remain.
    places.update(0.3, { x: camp.x + 400, y: 50, z: camp.z + 70 + 400 });
    const far = places.status();
    assert.ok(far.instances < near.instances && far.instances > 0, `${area}: landmarks stay on the skyline`);
    const root = ctx.wolfveilWorld.group.getObjectByName('TR_Places');
    const merged = root.children.filter(child => /_merged_LOD/.test(child.name));
    assert.ok(merged.length >= 2, area);
    for (const mesh of merged) assert.ok(mesh.geometry.attributes.color, 'merged meshes carry their tints as vertex colours');
    places.dispose();
    assert.equal(root.parent, null);
  }
});
