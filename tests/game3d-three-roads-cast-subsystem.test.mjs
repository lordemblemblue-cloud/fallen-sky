import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCastSubsystem, CAST_MAX_PEOPLE, CAST_MAX_DRAWN } from '../src/components/game3d/threeroads/cast/castSubsystem.mjs';
import { createThreeRoadsBus } from '../src/components/game3d/threeroads/ThreeRoadsWorld.mjs';
import { threeRoadsCastAtHome } from '../src/components/game3d/threeroads/script/cast.mjs';

// Every field GameWorld3D.jsx reads from a questNPCs entry, and where (checked by
// reading the file on 2026-11-21; line numbers at origin/claude/three-empire-war-20261121):
//   id            4373-4380 nearest giver, setNearbyQuestNPC({ id, name }); 5565 quest marker
//   name          4380 the "Speak with ..." prompt; 5501 map dot
//   group         1141 snapToGround(group); 2603 click target; 4367 visible; 4370-4371
//                 position.x/z for distance; 5501 map dot; 5573 position.x/y/z for the marker
//   mixer         4368 mixer.update(delta) every frame
//   ringMesh      4374 ringMesh.material.opacity pulsed every frame
//   _pendingMixer 2466-2470 if set, the player's idle is bound to it, then the field is deleted
//   idleAction    2469 written there (and set at 2413 for the game's own archers)
//   modelFormat, modelSource  2417-2418 set for the archers (diagnostics)
const GAMEWORLD_READS = ['id', 'name', 'group', 'mixer', 'idleAction', 'ringMesh', '_pendingMixer', 'modelFormat', 'modelSource'];

const tick = () => new Promise(resolve => globalThis.setTimeout(resolve, 0));

// A stand-in rig: a 170-unit-tall box with an idle clip, like the archer FBX's size.
function fakeSource() {
  const scene = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(40, 170, 30), new THREE.MeshStandardMaterial());
  body.name = 'Body';
  body.position.y = 85;
  scene.add(body);
  const track = new THREE.VectorKeyframeTrack('Body.position', [0, 1], [0, 85, 0, 0, 86, 0]);
  const idleClip = new THREE.AnimationClip('idle', 1, [track]);
  const walkClip = new THREE.AnimationClip('run', 1, [track.clone()]);
  return { scene, idleClip, walkClip, format: 'fbx', url: 'test://archer.fbx', walkClipSpeed: 3.6, tint: 'replace' };
}

// A stand-in for useQuestStore: story flags and subscribeQuests's call-at-once.
function fakeStore(storyFlags = {}) {
  const listeners = new Set();
  const store = {
    storyFlags,
    getState: () => ({ storyFlags: { ...store.storyFlags } }),
    subscribe(fn) { listeners.add(fn); fn(store.getState()); return () => listeners.delete(fn); },
    set(flag) { store.storyFlags = { ...store.storyFlags, [flag]: true }; for (const fn of listeners) fn(store.getState()); },
    listeners,
  };
  return store;
}

function makeWorld({ area = 'town', ground = true, areaScenes = true, store = fakeStore() } = {}) {
  const scene = new THREE.Scene();
  const bus = createThreeRoadsBus();
  const archer = { id: 'archer_lyra', name: 'Lyra the Seeker', group: new THREE.Group() };
  const questNPCs = [archer];
  const state = { ground };
  const events = [];
  for (const type of ['cast:ready', 'cast:arrived']) bus.on(type, d => events.push([type, d]));
  const voices = [];
  const ctx = {
    region: 'wolfveil', worldArea: area, areaScenes, scene, bus, questNPCs,
    sampleGroundY: () => (state.ground ? 22.7 : null),
    camera: new THREE.PerspectiveCamera(),
  };
  const cast = createCastSubsystem(ctx, {
    loadSource: async () => fakeSource(),
    probe: () => true,
    playVoice: (lineId) => { voices.push(lineId); return { stop() {} }; },
    warn: () => {},
    questStore: store,
  });
  return { ctx, cast, scene, bus, questNPCs, archer, state, events, voices, store };
}

async function settle(cast, player = { x: 100, y: 0, z: 100 }, seconds = 4) {
  await tick();
  for (let t = 0; t < seconds; t += 0.1) cast.update(0.1, player);
}

test('outside the valley the cast has nothing to do', () => {
  assert.equal(createCastSubsystem({ region: 'lunar-cave', scene: new THREE.Scene() }), null);
});

test('the town people wait for the ground, then stand on it and announce themselves', async () => {
  const w = makeWorld({ ground: false });
  await settle(w.cast);
  assert.equal(w.events.length, 0, 'nobody stands before there is ground');
  assert.ok(w.cast.status().people.every(p => p.state === 'waiting'));
  w.state.ground = true;
  await settle(w.cast);
  const people = w.cast.status().people;
  const homes = threeRoadsCastAtHome({ area: 'town' });
  assert.equal(people.length, homes.length);
  assert.ok(people.every(p => p.state === 'ready' && p.at.y === 22.7), JSON.stringify(people.map(p => p.state)));
  assert.equal(w.events.filter(([type]) => type === 'cast:ready').length, homes.length);
  w.cast.dispose();
});

test('a quest giver entry carries every field GameWorld3D reads, in the shape it uses', async () => {
  const w = makeWorld();
  await settle(w.cast);
  const givers = threeRoadsCastAtHome({ area: 'town' }).filter(p => p.giver);
  assert.equal(w.questNPCs.length, 1 + givers.length);
  for (const entry of w.questNPCs.slice(1)) {
    for (const field of GAMEWORLD_READS) assert.ok(field in entry, entry.id + ' has ' + field);
    assert.ok(givers.some(p => p.id === entry.id && p.name === entry.name));
    assert.ok(entry.group.isObject3D);
    for (const axis of ['x', 'y', 'z']) assert.ok(Number.isFinite(entry.group.position[axis]));
    assert.equal(typeof entry.group.visible, 'boolean');
    assert.equal(typeof entry.mixer.update, 'function');
    entry.mixer.update(0.016); // what GameWorld3D does every frame
    assert.ok(entry.ringMesh.material && 'opacity' in entry.ringMesh.material);
    entry.ringMesh.material.opacity = 0.5;
    assert.equal(entry._pendingMixer, null, 'it brings its own idle, so the game hands none over');
    assert.ok(entry.idleAction);
    assert.ok(entry.group.parent, 'it is in the scene');
  }
  w.cast.dispose();
});

test('dispose leaves the questNPCs array as it was and the scene empty', async () => {
  const w = makeWorld();
  const before = [...w.questNPCs];
  const childrenBefore = w.scene.children.length;
  await settle(w.cast);
  assert.ok(w.questNPCs.length > before.length);
  w.cast.dispose();
  assert.deepEqual(w.questNPCs, before);
  assert.equal(w.questNPCs[0], w.archer, 'the game\'s own archer is untouched');
  assert.equal(w.scene.children.length, childrenBefore - 1, 'the cast root is gone');
  assert.ok(!w.scene.getObjectByName('ThreeRoadsCast'));
  w.cast.dispose(); // twice is harmless
  w.bus.emit('cast:spawn', { id: 'elder_maren', x: 0, z: -8 });
  assert.deepEqual(w.questNPCs, before, 'no listener survives dispose');
});

test('a template that arrives after dispose is freed, not shown', async () => {
  let release;
  const scene = new THREE.Scene();
  const cast = createCastSubsystem({ region: 'wolfveil', worldArea: 'town', scene, questNPCs: [], sampleGroundY: () => 1 }, {
    loadSource: () => new Promise(resolve => { release = resolve; }), probe: () => true, warn: () => {},
  });
  await tick();
  cast.dispose();
  release(fakeSource());
  await tick();
  assert.equal(scene.children.length, 0);
});

test('spawn brings people in; twelve in a scene at most, the eight nearest drawn', async () => {
  const w = makeWorld();
  await settle(w.cast);
  assert.equal(w.cast.status().count, 7);
  w.bus.emit('cast:spawn', { id: 'elder_maren', x: 0, z: -8 });
  // the opening's travellers at their wagons in the yard (world z = local z + 70)
  w.bus.emit('cast:spawn', { id: 'traveller_tome', x: 61, z: -142, facing: 0 });
  w.bus.emit('cast:spawn', { id: 'traveller_henut', x: 70, z: -135, facing: 0 });
  w.bus.emit('cast:spawn', { id: 'traveller_livilla', x: 79, z: -142, facing: 0 });
  await settle(w.cast, { x: 0, y: 22.7, z: -12 }, 4);
  const maren = w.cast.status().people.find(p => p.id === 'elder_maren');
  assert.equal(maren.state, 'ready');
  assert.ok(Math.hypot(maren.at.x, maren.at.z) >= 6.55 + 0.5, 'beside the fountain, not in it');
  assert.equal(w.cast.status().count, 11, 'the parley: 7 at home, 3 travellers, Maren');
  const drawn = w.cast.status().people.filter(p => p.drawn);
  assert.equal(drawn.length, CAST_MAX_DRAWN);
  // the three furthest from the player at the plaza: Hesper (~270 m), Livilla, Tome
  for (const far of ['master_hesper', 'traveller_livilla', 'traveller_tome'])
    assert.equal(w.cast.status().people.find(p => p.id === far).drawn, false, far + ' is not drawn');
  assert.equal(w.cast.status().people.find(p => p.id === 'elder_maren').drawn, true);
  assert.equal(w.cast.spawn({ id: 'courier_dexter', x: 20, z: 20 }), true);
  assert.equal(w.cast.status().count, CAST_MAX_PEOPLE);
  assert.equal(w.cast.spawn({ id: 'ren_swordswoman', x: 10, z: -10 }), false, 'the thirteenth stays out');
  w.bus.emit('cast:despawn', { id: 'courier_dexter' });
  for (const id of ['traveller_tome', 'traveller_henut', 'traveller_livilla']) w.bus.emit('cast:despawn', { id });
  assert.equal(w.cast.spawn({ id: 'archer_lyra', x: 0, z: 0 }), false, 'the game places its archers');
  w.bus.emit('cast:despawn', { id: 'elder_maren' });
  assert.equal(w.cast.status().count, 7);
  w.cast.dispose();
});

test('moveTo walks round the tailor to the fountain rim and announces arrival', async () => {
  const w = makeWorld();
  await settle(w.cast);
  const start = w.cast.status().people.find(p => p.id === 'paneb_scribe').at;
  w.bus.emit('cast:moveTo', { id: 'paneb_scribe', x: 0, z: 0, speed: 1.4 });
  let moved = false;
  for (let t = 0; t < 40 && !w.events.some(([type]) => type === 'cast:arrived'); t += 0.1) {
    w.cast.update(0.1, { x: 100, z: 100 });
    if (w.cast.status().people.find(p => p.id === 'paneb_scribe').moving) moved = true;
  }
  const arrived = w.events.find(([type]) => type === 'cast:arrived');
  assert.ok(arrived, 'arrived');
  assert.ok(moved, 'the walk clip played');
  assert.equal(arrived[1].id, 'paneb_scribe');
  const rim = Math.hypot(arrived[1].x, arrived[1].z);
  assert.ok(rim > 6.55 && rim < 8, 'at the rim: ' + rim);
  assert.ok(Math.hypot(arrived[1].x - start.x, arrived[1].z - start.z) > 15);
  w.cast.dispose();
});

test('follow keeps the asked distance behind the player and stops on null', async () => {
  const w = makeWorld();
  await settle(w.cast);
  w.bus.emit('cast:follow', { id: 'aelia_sabina', target: 'player', distance: 3 });
  const player = { x: 0, y: 0, z: -40 };
  for (let t = 0; t < 15; t += 0.1) w.cast.update(0.1, player);
  let aelia = w.cast.status().people.find(p => p.id === 'aelia_sabina');
  const d = Math.hypot(aelia.at.x - player.x, aelia.at.z - player.z);
  assert.ok(Math.abs(d - 3) < 1, 'about 3 m away: ' + d);
  w.bus.emit('cast:follow', { id: 'aelia_sabina', target: null });
  player.z = -80;
  for (let t = 0; t < 3; t += 0.1) w.cast.update(0.1, player);
  aelia = w.cast.status().people.find(p => p.id === 'aelia_sabina');
  assert.equal(aelia.task, null);
  assert.ok(Math.hypot(aelia.at.x - player.x, aelia.at.z - player.z) > 30, 'stayed behind');
  w.cast.dispose();
});

test('say shows a caption for its seconds and asks for the voice once', async () => {
  const w = makeWorld();
  await settle(w.cast);
  assert.equal(w.cast.say({ id: 'sable_vey', lineId: 'test_line', text: 'The stone stands.', seconds: 2 }), true);
  await tick();
  assert.deepEqual(w.voices, ['test_line']);
  w.cast.update(0.5, { x: 7, z: 4 });
  assert.equal(w.cast.status().people.find(p => p.id === 'sable_vey').caption, true);
  for (let t = 0; t < 2; t += 0.1) w.cast.update(0.1, { x: 7, z: 4 });
  assert.equal(w.cast.status().people.find(p => p.id === 'sable_vey').caption, false);
  assert.equal(w.cast.say({ id: 'nobody', text: 'x' }), false);
  assert.equal(w.cast.say({ lineId: 'no_such_line' }), false, 'no speaker, no line');
  w.cast.dispose();
});

test('an idle person turns toward a player within 4 m and back afterwards', async () => {
  const w = makeWorld();
  await settle(w.cast);
  const bram = () => w.cast.status().people.find(p => p.id === 'bram_lamplighter');
  const home = bram();
  const rest = home.facing;
  const near = { x: home.at.x + 2, z: home.at.z };
  for (let t = 0; t < 2; t += 0.1) w.cast.update(0.1, near);
  assert.ok(Math.abs(bram().facing - Math.PI / 2) < 0.05, 'faces east, toward the player');
  for (let t = 0; t < 3; t += 0.1) w.cast.update(0.1, { x: 200, z: 200 });
  assert.ok(Math.abs(Math.abs(bram().facing) - Math.abs(rest)) < 0.05, 'back to rest');
  w.cast.dispose();
});

test('with the whole valley loaded the cap still holds', async () => {
  const w = makeWorld({ areaScenes: false });
  await settle(w.cast, undefined, 6);
  assert.equal(w.cast.status().count, CAST_MAX_PEOPLE);
  w.cast.dispose();
});

test('a rig with one skeleton copy per mesh is rebound to the bones the mixer drives', async () => {
  const { unifySkeletons } = await import('../src/components/game3d/threeroads/cast/castSubsystem.mjs');
  const model = new THREE.Group();
  const meshes = [];
  for (let k = 0; k < 3; k++) {
    const hips = new THREE.Bone(); hips.name = 'mixamorigHips';
    const spine = new THREE.Bone(); spine.name = 'mixamorigSpine'; hips.add(spine);
    model.add(hips);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const count = geometry.attributes.position.count;
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0), 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(count * 4).fill(0).map((_, i) => (i % 4 ? 0 : 1)), 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    model.add(mesh);
    model.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton([hips, spine]));
    meshes.push(mesh);
  }
  assert.notEqual(meshes[1].skeleton.bones[0], meshes[0].skeleton.bones[0]);
  assert.equal(unifySkeletons(THREE, model), 2);
  for (const mesh of meshes) assert.equal(mesh.skeleton.bones[0], meshes[0].skeleton.bones[0]);
  assert.equal(THREE.PropertyBinding.findNode(model, 'mixamorigHips'), meshes[0].skeleton.bones[0], 'the bone the mixer animates');
});

test('story flags move people without a remount: once the war is open the envoys leave the town', async () => {
  const town = makeWorld();
  await settle(town.cast);
  const ids = () => town.cast.status().people.map(p => p.id);
  assert.ok(['mizuhara_jun', 'paneb_scribe', 'aelia_sabina'].every(id => ids().includes(id)));
  const giversBefore = town.questNPCs.length;
  town.store.set('tr_war_open');
  await settle(town.cast);
  for (const id of ['mizuhara_jun', 'paneb_scribe', 'aelia_sabina']) assert.ok(!ids().includes(id), id + ' left');
  assert.equal(town.questNPCs.length, giversBefore - 3, 'their quest-giver entries went with them');
  assert.ok(ids().includes('sable_vey'), 'the others stay');
  town.cast.dispose();
  assert.equal(town.store.listeners.size, 0, 'the store subscription ends on dispose');

  const fields = makeWorld({ area: 'south', store: fakeStore({ tr_war_open: true }) });
  await settle(fields.cast, undefined, 6);
  const here = fields.cast.status().people;
  for (const id of ['edda_miller', 'dalla_gravedigger', 'tolliver_beekeeper', 'goro_sergeant', 'titus_oldvine', 'paneb_scribe'])
    assert.ok(here.some(p => p.id === id && p.state === 'ready'), id + ' stands in the Gate Fields');
  const paneb = here.find(p => p.id === 'paneb_scribe');
  assert.deepEqual([paneb.asked.x, paneb.asked.z], [57, -298], 'on the Threshing Floor');
  fields.cast.dispose();
});

test('a person brought in by a pledge is not taken out by a story flag', async () => {
  const w = makeWorld();
  await settle(w.cast);
  w.cast.spawn({ id: 'aelia_sabina', x: 0, z: -40 });
  await settle(w.cast);
  w.store.set('tr_war_open');
  await settle(w.cast);
  assert.ok(w.cast.status().people.some(p => p.id === 'aelia_sabina'), 'the pledge keeps her');
  w.cast.dispose();
});

test('a far speaker, an absent one and an archer of the game are shown as a subtitle', async () => {
  const w = makeWorld();
  await settle(w.cast);
  const player = { x: 0, y: 22.7, z: -30 };
  // Master Hesper stands about 290 m away
  assert.equal(w.cast.say({ id: 'master_hesper', text: 'From afar.', seconds: 5 }), true);
  w.cast.update(0.1, player);
  assert.equal(w.cast.status().subtitle, 'master_hesper');
  // the line's text and speaker come from the script when only a line id is given
  assert.equal(w.cast.say({ lineId: 'maren_m02_01' }), true, 'Elder Maren is not in the scene');
  w.cast.update(0.1, player);
  assert.equal(w.cast.status().subtitle, 'elder_maren', 'the newest far line takes the subtitle');
  assert.equal(w.cast.say({ id: 'archer_lyra', lineId: 'lyra_m01_04' }), true);
  w.archer.group.position.set(0, 22.7, -60); // 30 m from the player
  w.cast.update(0.1, player);
  assert.equal(w.cast.status().subtitle, 'archer_lyra');
  w.archer.group.position.set(0, 22.7, -34); // now 4 m away: over her head
  w.cast.update(0.1, player);
  assert.notEqual(w.cast.status().subtitle, 'archer_lyra');
  await tick();
  assert.ok(w.voices.includes('maren_m02_01') && w.voices.includes('lyra_m01_04'), JSON.stringify(w.voices));
  w.cast.dispose();
});

test('four people walk to the fountain at once and all arrive, apart', async () => {
  const w = makeWorld();
  await settle(w.cast);
  const ring = { mizuhara_jun: [-4.5, -11], paneb_scribe: [4.5, -11], aelia_sabina: [0, -14.5], sable_vey: [2.4, -7.6] };
  for (const [id, [x, z]] of Object.entries(ring)) w.bus.emit('cast:moveTo', { id, x, z, speed: 1.6 });
  for (let t = 0; t < 60 && w.events.filter(([type]) => type === 'cast:arrived').length < 4; t += 0.1) w.cast.update(0.1, { x: 0, z: -40 });
  const arrived = w.events.filter(([type]) => type === 'cast:arrived').map(([, d]) => d);
  assert.equal(arrived.length, 4, JSON.stringify(arrived));
  for (const a of arrived) {
    const [x, z] = ring[a.id];
    assert.ok(Math.hypot(a.x - x, a.z - z) < 0.5, a.id + ' at its ring point');
  }
  const people = w.cast.status().people;
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++)
    assert.ok(Math.hypot(people[i].at.x - people[j].at.x, people[i].at.z - people[j].at.z) > 0.6, people[i].id + ' / ' + people[j].id);
  w.cast.dispose();
});

test('three travellers follow the player 150 m up the main road and keep up', async () => {
  const w = makeWorld();
  await settle(w.cast);
  w.cast.spawn({ id: 'traveller_tome', x: 61, z: -142 });
  w.cast.spawn({ id: 'traveller_henut', x: 70, z: -135 });
  w.cast.spawn({ id: 'traveller_livilla', x: 79, z: -142 });
  const player = { x: 66, y: 22.7, z: -138 };
  await settle(w.cast, player, 3);
  const follow = { traveller_tome: 3, traveller_henut: 4.5, traveller_livilla: 6 };
  for (const [id, distance] of Object.entries(follow)) w.bus.emit('cast:follow', { id, target: 'player', distance });
  // the player walks (4 m/s) to the Oath Tree, round the east of the fountain
  const route = [[66, -138], [8, -40], [8, -10], [-6.6, -3.2]];
  for (let leg = 1; leg < route.length; leg++) {
    const [ax, az] = route[leg - 1], [bx, bz] = route[leg];
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4);
    for (let s = 1; s <= steps; s++) { player.x = ax + (bx - ax) * s / steps; player.z = az + (bz - az) * s / steps; w.cast.update(0.1, player); }
  }
  for (let t = 0; t < 6; t += 0.1) w.cast.update(0.1, player);
  for (const [id, distance] of Object.entries(follow)) {
    const p = w.cast.status().people.find(x => x.id === id);
    const d = Math.hypot(p.at.x - player.x, p.at.z - player.z);
    assert.ok(d < distance + 1.5, id + ' kept up: ' + d.toFixed(2));
  }
  w.cast.dispose();
});
