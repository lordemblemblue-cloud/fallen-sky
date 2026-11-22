import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCastSubsystem, CAST_MAX_PEOPLE } from '../src/components/game3d/threeroads/cast/castSubsystem.mjs';
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

function makeWorld({ area = 'town', ground = true, areaScenes = true } = {}) {
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
  });
  return { ctx, cast, scene, bus, questNPCs, archer, state, events, voices };
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

test('spawn brings a person with no home in; no more than eight in a scene', async () => {
  const w = makeWorld();
  await settle(w.cast);
  assert.equal(w.cast.status().count, 7);
  w.bus.emit('cast:spawn', { id: 'elder_maren', x: 0, z: -8 });
  await settle(w.cast);
  const maren = w.cast.status().people.find(p => p.id === 'elder_maren');
  assert.equal(maren.state, 'ready');
  assert.ok(Math.hypot(maren.at.x, maren.at.z) >= 6.55 + 0.5, 'beside the fountain, not in it');
  assert.equal(w.cast.status().count, CAST_MAX_PEOPLE);
  assert.equal(w.cast.spawn({ id: 'traveller_tome', x: 10, z: -10 }), false);
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
