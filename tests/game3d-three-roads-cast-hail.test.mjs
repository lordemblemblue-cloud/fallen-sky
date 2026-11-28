import './fixtures/three-roads-sample/install.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  chooseHail, createHailMemory, idlePhaseOf, idleRateOf, HAIL_RADIUS, HAIL_REARM, HAIL_COOLDOWN,
} from '../src/components/game3d/threeroads/cast/castHail.mjs';
import { createCastSubsystem } from '../src/components/game3d/threeroads/cast/castSubsystem.mjs';
import { createThreeRoadsBus } from '../src/components/game3d/threeroads/ThreeRoadsWorld.mjs';
import { threeRoadsPerson } from '../src/components/game3d/threeroads/script/cast.mjs';
import { threeRoadsLine } from '../src/components/game3d/threeroads/script/index.mjs';
import { localToWorld } from '../src/components/game3d/threeroads/coords.mjs';

// ─── the rules on their own ───
const sentry = (id, x, z, extra = {}) => ({ id, x, z, atHome: true, still: true, drawn: true, cued: false, ...extra });

test('a sentry hails a player within 7 m, once per approach', () => {
  const memory = createHailMemory();
  const s = [sentry('a', 0, 0)];
  assert.equal(chooseHail({ now: 0, player: { x: HAIL_RADIUS + 1, z: 0 }, candidates: s, busy: false, memory }), null, 'too far');
  assert.equal(chooseHail({ now: 1, player: { x: 5, z: 0 }, candidates: s, busy: false, memory }), 'a');
  assert.equal(chooseHail({ now: 2, player: { x: 4, z: 0 }, candidates: s, busy: false, memory }), null, 'once per approach');
  assert.equal(chooseHail({ now: 60, player: { x: 12, z: 0 }, candidates: s, busy: false, memory }), null, 'left, but not beyond 20 m');
  assert.equal(chooseHail({ now: 61, player: { x: 5, z: 0 }, candidates: s, busy: false, memory }), null, 'not re-armed');
  assert.equal(chooseHail({ now: 62, player: { x: HAIL_REARM + 1, z: 0 }, candidates: s, busy: false, memory }), null);
  assert.equal(chooseHail({ now: 63, player: { x: 5, z: 0 }, candidates: s, busy: false, memory }), 'a', 'back after going 20 m away');
});

test('never twice within 45 seconds, even after going away and back', () => {
  const memory = createHailMemory();
  const s = [sentry('a', 0, 0)];
  assert.equal(chooseHail({ now: 0, player: { x: 3, z: 0 }, candidates: s, busy: false, memory }), 'a');
  chooseHail({ now: 5, player: { x: 30, z: 0 }, candidates: s, busy: false, memory });
  assert.equal(chooseHail({ now: 10, player: { x: 3, z: 0 }, candidates: s, busy: false, memory }), null, 'cooling down');
  assert.equal(chooseHail({ now: HAIL_COOLDOWN + 0.5, player: { x: 3, z: 0 }, candidates: s, busy: false, memory }), 'a');
});

test('no hail over a line on screen, or from someone away, moving, undrawn or cued', () => {
  const memory = createHailMemory();
  const near = { x: 3, z: 0 };
  assert.equal(chooseHail({ now: 0, player: near, candidates: [sentry('a', 0, 0)], busy: true, memory }), null, 'a line is up');
  for (const [why, extra] of [['away from home', { atHome: false }], ['moving', { still: false }], ['not drawn', { drawn: false }], ['moved by a pledge', { cued: true }]])
    assert.equal(chooseHail({ now: 0, player: near, candidates: [sentry('b', 0, 0, extra)], busy: false, memory }), null, why);
  assert.equal(chooseHail({ now: 0, player: near, candidates: [sentry('a', 0, 0)], busy: false, memory }), 'a', 'still armed after waiting');
});

test('of two side by side the nearer speaks; the other after, if the player is still near', () => {
  const memory = createHailMemory();
  const pair = [sentry('left', 0, 0), sentry('right', 2.4, 0)];
  assert.equal(chooseHail({ now: 0, player: { x: -1, z: 3 }, candidates: pair, busy: false, memory }), 'left');
  assert.equal(chooseHail({ now: 1, player: { x: -1, z: 3 }, candidates: pair, busy: true, memory }), null, 'waits while the line is up');
  assert.equal(chooseHail({ now: 9, player: { x: -1, z: 3 }, candidates: pair, busy: false, memory }), 'right');
  const memory2 = createHailMemory();
  chooseHail({ now: 0, player: { x: -1, z: 3 }, candidates: pair, busy: false, memory: memory2 });
  assert.equal(chooseHail({ now: 9, player: { x: 30, z: 3 }, candidates: pair, busy: false, memory: memory2 }), null, 'gone by then');
});

test('each person\'s idle starts at a place of their own, the same every visit', () => {
  const town = ['sable_vey', 'master_hesper', 'bram_lamplighter', 'watch_warden_south', 'mizuhara_jun', 'paneb_scribe', 'aelia_sabina', 'elder_maren'];
  const phases = town.map(idlePhaseOf);
  for (const p of phases) assert.ok(p >= 0 && p < 1);
  assert.deepEqual(town.map(idlePhaseOf), phases, 'fixed by the id');
  assert.equal(new Set(phases.map(p => p.toFixed(2))).size, town.length, 'all different');
  // two whose starting points fall close together play at different rates, so they drift apart
  const rates = town.map(idleRateOf);
  for (const r of rates) assert.ok(r >= 0.94 && r <= 1.06);
  for (let i = 0; i < town.length; i++) for (let j = i + 1; j < town.length; j++) {
    if (Math.abs(phases[i] - phases[j]) < 0.05) assert.ok(Math.abs(rates[i] - rates[j]) > 0.005, town[i] + ' / ' + town[j]);
  }
});

// ─── in the subsystem, with the camps' sentries ───
const tick = () => new Promise(resolve => globalThis.setTimeout(resolve, 0));
function fakeSource() {
  const scene = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(40, 170, 30), new THREE.MeshStandardMaterial());
  body.name = 'Body';
  body.position.y = 85;
  scene.add(body);
  const track = new THREE.VectorKeyframeTrack('Body.position', [0, 1], [0, 85, 0, 0, 86, 0]);
  return { scene, idleClip: new THREE.AnimationClip('idle', 1, [track]), walkClip: new THREE.AnimationClip('run', 1, [track.clone()]),
    format: 'fbx', url: 'test://archer.fbx', walkClipSpeed: 3.6, tint: 'replace' };
}
function camp(area) {
  const scene = new THREE.Scene();
  const bus = createThreeRoadsBus();
  const events = [];
  const emit = bus.emit;
  bus.emit = (type, detail) => { events.push(type); emit(type, detail); };
  const voices = [];
  const flagsSet = [];
  const store = {
    getState: () => ({ storyFlags: {} }),
    subscribe(fn) { fn(store.getState()); return () => {}; },
    set(flag) { flagsSet.push(flag); },
  };
  const ctx = { region: 'wolfveil', worldArea: area, areaScenes: true, preview: true, scene, bus, questNPCs: [],
    sampleGroundY: () => 10, camera: new THREE.PerspectiveCamera() };
  const cast = createCastSubsystem(ctx, {
    loadSource: async () => fakeSource(), probe: () => true, warn: () => {}, questStore: store,
    playVoice: lineId => { voices.push(lineId); return { stop() {} }; },
  });
  return { cast, bus, events, voices, flagsSet };
}
const homeOf = id => { const h = threeRoadsPerson(id).home; return localToWorld(h.x, h.z); };
const at = (p, dx, dz) => ({ x: p.x + dx, y: 10, z: p.z + dz });
async function run(cast, player, seconds) {
  await tick();
  for (let t = 0; t < seconds; t += 0.1) cast.update(0.1, player);
}
const person = (cast, id) => cast.status().people.find(p => p.id === id);

test('the west picket hails a traveller who comes near, with its scripted line, once', async () => {
  const w = camp('west');
  const home = homeOf('akitsu_picket_town');
  await run(w.cast, at(home, 40, 0), 4);
  assert.equal(person(w.cast, 'akitsu_picket_town').state, 'ready');
  assert.deepEqual(w.voices, [], 'nobody near');
  await run(w.cast, at(home, 5, 0), 1);
  assert.deepEqual(w.voices, ['hail_akitsu_picket_town']);
  assert.equal(person(w.cast, 'akitsu_picket_town').caption, true);
  assert.equal(threeRoadsLine('hail_akitsu_picket_town').speaker, 'akitsu_picket_town');
  // the picket turns to face the player while speaking (player due east: heading +pi/2)
  assert.ok(Math.abs(person(w.cast, 'akitsu_picket_town').facing - Math.PI / 2) < 0.1);
  await run(w.cast, at(home, 5, 0), 30);
  assert.deepEqual(w.voices, ['hail_akitsu_picket_town'], 'once per approach');
  // presentation only: no flag, no pledge event
  assert.deepEqual(w.flagsSet, []);
  assert.ok(w.events.every(type => type.startsWith('cast:')), w.events.join(','));
  w.cast.dispose();
});

test('a picket a pledge is moving, or that stands away from home, says nothing', async () => {
  const w = camp('west');
  const home = homeOf('akitsu_picket_town');
  await run(w.cast, at(home, 40, 0), 4);
  w.cast.moveTo({ id: 'akitsu_picket_town', x: home.x + 3, z: home.z });
  await run(w.cast, at(home, 5, 0), 6);
  assert.deepEqual(w.voices, [], 'moved by a pledge, then away from home');
  w.cast.dispose();
});

test('no hail while a pledge line is on screen; it comes once the line is gone', async () => {
  const w = camp('west');
  const home = homeOf('akitsu_picket_town');
  await run(w.cast, at(home, 40, 0), 4);
  w.cast.say({ id: 'hayasaka_colonel', text: 'A pledge line that is still up.', seconds: 4 });
  await run(w.cast, at(home, 5, 0), 3);
  assert.ok(!w.voices.includes('hail_akitsu_picket_town'), 'waited');
  await run(w.cast, at(home, 5, 0), 2);
  assert.ok(w.voices.includes('hail_akitsu_picket_town'), 'then hailed');
  w.cast.dispose();
});

test('the pair at the fort\'s south gate: the nearer speaks, the other after', async () => {
  const w = camp('north');
  const left = homeOf('remoria_gate_south_left');
  await run(w.cast, at(left, 40, 0), 6);
  assert.equal(person(w.cast, 'remoria_gate_south_right').state, 'ready');
  const player = at(left, -2, -3); // nearer the left sentry
  await run(w.cast, player, 1);
  assert.deepEqual(w.voices, ['hail_remoria_gate_south_left']);
  const captionsUp = () => w.cast.status().people.filter(p => p.caption).map(p => p.id);
  for (let t = 0; t < 30; t += 0.1) {
    w.cast.update(0.1, player);
    assert.ok(captionsUp().length <= 1, 'never two at once: ' + captionsUp());
  }
  await tick();
  assert.deepEqual(w.voices, ['hail_remoria_gate_south_left', 'hail_remoria_gate_south_right']);
  w.cast.dispose();
});
