/* global URL */
// Gliding on foot (2026-11-22): the flight (player/playerGlide.mjs), the glider prop (player/gliderProp.mjs), the
// authored Glide_Hang pose on both fused bodies, the real controller in the air, the remote avatar and the world wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLIDE, GLIDE_REACH, createPlayerGlide, glideLandingY } from '../src/components/game3d/player/playerGlide.mjs';
import { createGliderMesh, createGliderProp, gliderTriangleCount } from '../src/components/game3d/player/gliderProp.mjs';
import { mobilityClipPackEntries, clipBindsToActor } from '../src/components/game3d/player/mobilityClipPack.mjs';
import { createPlayerMovementFallbackClips } from '../src/components/game3d/player/playerMovementFallbackClips.js';
import { nativePlayerAnimationClips } from '../src/components/game3d/player/playerNativeAnimationClips.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const manifest = JSON.parse(read('public/models/animations/mocap/manifest.json'));
globalThis.self = globalThis;
const loader = new GLTFLoader();
loader.register(() => ({ name: 'NO_IMAGE_DECODE', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
async function parseGlb(path) {
  const bytes = readFileSync(path);
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
const bodies = {};
async function body(name) {
  if (!bodies[name]) {
    const asset = await parseGlb(`public/models/characters/fused/${name}_Fused_v2.glb`);
    asset.scene.animations = asset.animations;
    asset.scene.userData.rigId = asset.parser.json.extras.rigId;
    asset.scene.userData.fusedCharacter = true;
    bodies[name] = asset.scene;
  }
  return bodies[name];
}
async function packClip(rigId, name) {
  const entry = mobilityClipPackEntries(manifest, rigId).find((e) => e.name === name);
  assert.ok(entry, `${name} is listed for ${rigId}`);
  const asset = await parseGlb('public' + entry.url);
  const clip = asset.animations[0];
  clip.userData = { ...(asset.parser.json.animations[0].extras || {}) };
  return clip;
}

// ------------------------------------------------------------------------------------------------ the flight

// One simulated hero: x/z advance with the glider's velocity (the world's movement block does that), the module
// owns the height in the air; flat ground at `ground` unless a function of x is given.
// probe: hand the glide the ground ahead (GameWorld3D's glideGroundAt), as the world does
function fly(glide, { frames, dt = 1 / 60, ground = 0, surface = null, steer = null, dive = () => false, at = { x: 0, z: 0, y: 0 }, probe = false }) {
  const g = typeof ground === 'function' ? ground : () => ground;
  const trace = [];
  for (let i = 0; i < frames; i++) {
    const v = glide.velocity();
    at.x += v.x * dt; at.z += v.z * dt;
    const groundY = g(at.x, at.z);
    const s = glide.update({ dt, x: at.x, z: at.z, groundY, heroY: glide.isAirborne() ? at.y : groundY,
      surfaceY: typeof surface === 'function' ? surface(at.x) : surface, steer: steer?.(i), dive: dive(i),
      groundAt: probe ? (x, z) => g(x, z) : null });
    if (s.x !== null) { at.x = s.x; at.z = s.z; } // a move into a wall, taken back (as GameWorld3D does)
    at.y = s.y ?? g(at.x, at.z);
    trace.push({ i, ...s, x: at.x, z: at.z, h: at.y });
    if (s.landed) break;
  }
  return trace;
}

test('the reach: about 4 m forward per metre of height at trim, a steady sink, no cost but height', () => {
  assert.ok(Math.abs(GLIDE_REACH - GLIDE.trimSpeed / GLIDE.trimSink) < 1e-9);
  assert.ok(GLIDE_REACH > 3.8 && GLIDE_REACH < 4.6, `reach ${GLIDE_REACH}`);
  const glide = createPlayerGlide();
  const at = { x: 0, z: 0, y: 40 };
  glide.update({ dt: 1 / 60, x: 0, z: 0, groundY: 40, heroY: 40 }); // standing on a 40 m cliff top
  // the ground ends: next frame the glue finds the valley floor 40 m down
  glide.update({ dt: 1 / 60, x: 0.07, z: 0, groundY: 0, heroY: 0 });
  assert.equal(glide.mode(), 'fall', 'running off the edge falls instead of snapping down');
  const opened = glide.toggle({ heroY: 39.9, groundY: 0, bodyHeading: 0 });
  assert.deepEqual(opened, { ok: true, action: 'opened' });
  const trace = fly(glide, { frames: 60 * 40, at: { ...at, y: 39.9 } });
  const end = trace.at(-1);
  assert.ok(end.landed, 'lands');
  const settled = trace.filter((f) => f.i > 120 && !f.landed);
  for (const f of settled.slice(0, 50)) assert.ok(Math.abs(f.speed - GLIDE.trimSpeed) < 1e-6);
  const distance = Math.hypot(end.x, end.z);
  assert.ok(distance / 39.9 > GLIDE_REACH * 0.9 && distance / 39.9 < GLIDE_REACH * 1.02, `${distance.toFixed(1)} m from 39.9 m`);
});

test('a ledge is a steep drop, not a slope or stairs; a jump off a hillside falls on from its arc', () => {
  const steps = (drops, run = 0.12) => {
    const glide = createPlayerGlide();
    let y = 10, x = 0;
    glide.update({ dt: 1 / 60, x, z: 0, groundY: y, heroY: y });
    for (const d of drops) { x += run; y -= d; glide.update({ dt: 1 / 60, x, z: 0, groundY: y, heroY: y }); if (glide.isAirborne()) break; }
    return glide.mode();
  };
  assert.equal(steps([0.25, 0.25, 0.25, 0.25]), 'ground', 'stairs');
  assert.equal(steps([0.15, 0.15, 0.15, 0.15], 0.12), 'ground', 'a steep slope');
  assert.equal(steps([0.85], 0.12), 'ground', 'a step down under a metre');
  assert.equal(steps([3.5], 0.12), 'fall', 'a ledge');
  assert.equal(steps([1.4], 2.0), 'ground', 'a long low-framerate step down a slope');
  // a jump whose arc crosses the edge: the fall keeps the jump's upward speed
  const glide = createPlayerGlide();
  glide.update({ dt: 1 / 60, x: 0, z: 0, groundY: 20, heroY: 20.4, jumping: true });
  glide.update({ dt: 1 / 60, x: 0.1, z: 0, groundY: 20, heroY: 20.47, jumping: true });
  const s = glide.update({ dt: 1 / 60, x: 0.2, z: 0, groundY: 5, heroY: 5.5, jumping: true });
  assert.equal(s.mode, 'fall');
  assert.ok(s.y > 20.4, 'still rising from the jump, not snapped down');
});

test('steering turns the heading at a limited rate and banks; no keys fly straight on', () => {
  const glide = createPlayerGlide();
  glide.update({ dt: 1 / 60, x: 0, z: 0, groundY: 0, heroY: 60 });
  glide.update({ dt: 1 / 60, x: 0.07, z: 0, groundY: -60, heroY: -60 });
  glide.toggle({ heroY: 60, groundY: -60, bodyHeading: 0 });
  const right = { x: 1, z: 0 }; // heading +X is +PI/2
  const at = { x: 0, z: 0, y: 60 }; // one flight on: the position carries over (a jump across reads as a teleport)
  const trace = fly(glide, { frames: 30, ground: -60, steer: () => right, at });
  const turned = trace.at(-1).heading;
  assert.ok(turned > 0 && turned <= GLIDE.turnRate * 0.5 + 1e-6, `half a second turns at most ${GLIDE.turnRate * 0.5} rad (${turned})`);
  assert.ok(trace.at(-1).bank < 0, 'banks into the turn');
  const straight = fly(glide, { frames: 30, ground: -60, at });
  assert.ok(Math.abs(straight.at(-1).heading - straight[0].heading) < 1e-9, 'holds the heading');
  assert.ok(Math.abs(straight.at(-1).bank) < Math.abs(trace.at(-1).bank), 'levels out');
});

test('diving trades height for speed, and the speed buys a little height back', () => {
  const glide = createPlayerGlide();
  glide.update({ dt: 1 / 60, x: 0, z: 0, groundY: 0, heroY: 200 });
  glide.update({ dt: 1 / 60, x: 0.07, z: 0, groundY: -200, heroY: -200 });
  glide.toggle({ heroY: 200, groundY: -200, bodyHeading: 0 });
  const at = { x: 0, z: 0, y: 200 };
  fly(glide, { frames: 180, ground: -200, at }); // settle at trim
  const dive = fly(glide, { frames: 120, ground: -200, dive: () => true, at });
  assert.ok(dive.at(-1).speed > GLIDE.trimSpeed + 3, 'faster');
  const sinkDiving = (dive.at(-60).h - dive.at(-1).h) / 1; // over the last second
  assert.ok(sinkDiving > GLIDE.trimSink * 2, `steeper: ${sinkDiving.toFixed(2)} m/s`);
  const after = fly(glide, { frames: 60, ground: -200, at });
  const sinkAfter = (after[0].h - after.at(-1).h) / 1;
  assert.ok(sinkAfter < GLIDE.trimSink, `pulling out sinks less than trim (${sinkAfter.toFixed(2)} m/s)`);
});

test('touchdown hands the feet back; deep water is landed on (the swim takes over), shallow water is waded into', () => {
  assert.equal(glideLandingY(0, 2), 2, 'deep water');
  assert.equal(glideLandingY(0, 1), 0, 'shallow water: the bed');
  assert.equal(glideLandingY(5, null), 5);
  const glide = createPlayerGlide();
  glide.update({ dt: 1 / 60, x: 0, z: 0, groundY: 12, heroY: 12 });
  glide.update({ dt: 1 / 60, x: 0.07, z: 0, groundY: 0, heroY: 0 });
  glide.toggle({ heroY: 12, groundY: 0, bodyHeading: 0, surfaceY: 3 });
  const trace = fly(glide, { frames: 60 * 20, ground: 0, surface: 3, at: { x: 0, z: 0, y: 12 } });
  const end = trace.at(-1);
  assert.ok(end.landed && end.mode === 'ground' && end.changed);
  assert.equal(end.y, 3, 'on the surface of 3 m of water');
  assert.equal(glide.isAirborne(), false);
  // (in the game the swim takes over this frame; with the surface still under it the module stays on the ground)
  assert.equal(glide.update({ dt: 1 / 60, x: end.x, z: end.z, groundY: 0, heroY: 0, surfaceY: 3 }).y, null, 'the ground code owns the feet again');
  // riding, swimming, dead...: out of the air at once
  glide.update({ dt: 1 / 60, x: 0, z: 0, groundY: 30, heroY: 30 });
  glide.update({ dt: 1 / 60, x: 0.07, z: 0, groundY: 0, heroY: 0 });
  assert.equal(glide.mode(), 'fall');
  const off = glide.update({ dt: 1 / 60, x: 0.1, z: 0, groundY: 0, heroY: 0, allowed: false });
  assert.deepEqual([off.mode, off.y, off.changed], ['ground', null, true]);
  // a teleport (a respawn, a recall) mid-glide ends it where the hero now stands; one onto lower ground is no ledge
  glide.update({ dt: 1 / 60, x: 0, z: 0, groundY: 40, heroY: 40 });
  glide.update({ dt: 1 / 60, x: 0.07, z: 0, groundY: 0, heroY: 0 });
  glide.toggle({ heroY: 40, groundY: 0, bodyHeading: 0 });
  fly(glide, { frames: 30, ground: 0, at: { x: 0.07, z: 0, y: 40 } });
  assert.equal(glide.isGliding(), true);
  const moved = glide.update({ dt: 1 / 60, x: 60, z: -20, groundY: 9, heroY: 9 });
  assert.deepEqual([moved.mode, moved.y, moved.changed], ['ground', null, true]);
  const lower = glide.update({ dt: 1 / 60, x: 66, z: -20, groundY: 1, heroY: 1 });
  assert.deepEqual([lower.mode, lower.y], ['ground', null]);
  assert.ok(glide.update({ dt: 1 / 60, x: 66.07, z: -20, groundY: 1, heroY: 1 }).mode === 'ground');
});

test('ground more than 2 m above the glider is a wall: held head-on, sliding at a glancing angle, never lifted onto it', () => {
  // off a ledge y high at (x, z), the glider open along the heading
  const launch = (glide, { x = 0, z = 0, y, heading = 0, ground = 0 }) => {
    glide.update({ dt: 1 / 60, x, z, groundY: y, heroY: y });
    glide.update({ dt: 1 / 60, x, z: z + 0.07, groundY: ground, heroY: ground });
    assert.equal(glide.toggle({ heroY: y, groundY: ground, bodyHeading: heading }).action, 'opened');
    return { x, z: z + 0.07, y };
  };
  // a cliff: the valley floor at 0, a face rising 30 m between z 20 and 22 (one terrain cell), its top beyond
  const cliff = (x, z) => (z < 20 ? 0 : z < 22 ? (z - 20) * 15 : 30);
  const highest = (trace, from) => Math.max(from, ...trace.map((f) => f.h));

  // head-on: held off the face, sinking all the while, down to the valley floor at its foot
  let glide = createPlayerGlide();
  let at = launch(glide, { y: 12, heading: 0 });
  let trace = fly(glide, { frames: 60 * 20, ground: cliff, at, probe: true });
  let end = trace.at(-1);
  assert.ok(end.landed, 'lands');
  assert.equal(end.y, 0, 'on the valley floor');
  assert.ok(end.z < 20, 'at the foot of the face, not on it: z ' + end.z.toFixed(2));
  assert.ok(highest(trace, 0) <= 12 + 1e-9, 'never lifted');
  const held = trace.filter((f) => f.wall === 'held');
  assert.ok(held.length > 60, 'held at the face for a while (' + held.length + ' frames)');
  assert.ok(Math.abs(held.at(-1).z - held[0].z) < 0.05 && held.at(-1).h < held[0].h - 2, 'held in place, sinking');

  // at a glancing angle (30 degrees to the face): slides along it, then lands below it
  glide = createPlayerGlide();
  at = launch(glide, { y: 16, heading: Math.PI / 3 });
  trace = fly(glide, { frames: 60 * 20, ground: cliff, at, probe: true });
  end = trace.at(-1);
  assert.ok(end.landed && end.y === 0 && end.z < 20, 'lands at the foot of the face');
  assert.ok(highest(trace, 0) <= 16 + 1e-9, 'never lifted');
  const slid = trace.filter((f) => f.wall === 'slide');
  assert.ok(slid.length > 60, 'slides along the face (' + slid.length + ' frames)');
  assert.ok(slid.at(-1).x - slid[0].x > 10 && Math.abs(slid.at(-1).z - slid[0].z) < 0.2, 'along the face, not into it');
  const along = Math.hypot(slid[5].velocity.x, slid[5].velocity.z);
  assert.ok(Math.abs(along - slid[5].speed * Math.cos(Math.PI / 6)) < 0.3, 'the travel along the face: ' + along.toFixed(2));

  // a low ledge (about 1 m above the glider as it gets there) is landed on; one 2.5 m above is a wall
  const ledge = (top) => (x, z) => (z < 20 ? 0 : top);
  glide = createPlayerGlide();
  trace = fly(glide, { frames: 60 * 10, ground: ledge(3.8), at: launch(glide, { z: 12, y: 3.7 }), probe: true });
  end = trace.at(-1);
  assert.ok(end.landed && end.y === 3.8 && end.z >= 20, 'up onto the low ledge: y ' + end.y + ' z ' + end.z.toFixed(2));
  assert.ok(3.8 - trace.at(-2).h < GLIDE.wallHeight, 'from less than 2 m below');
  glide = createPlayerGlide();
  trace = fly(glide, { frames: 60 * 10, ground: ledge(5.2), at: launch(glide, { z: 12, y: 3.7 }), probe: true });
  end = trace.at(-1);
  assert.ok(end.landed && end.y === 0 && end.z < 20, 'held at the higher ledge, landed below it');

  // a slope rising toward the glider is landed on where it meets it
  glide = createPlayerGlide();
  const slope = (x, z) => Math.max(0, (z - 10) * 0.4);
  trace = fly(glide, { frames: 60 * 10, ground: slope, at: launch(glide, { y: 8 }), probe: true });
  end = trace.at(-1);
  assert.ok(end.landed && end.z > 10 && Math.abs(end.y - slope(end.x, end.z)) < 1e-9, 'on the slope');
  assert.ok(end.y - trace.at(-2).h < 0.1, 'met, not lifted');
  assert.ok(trace.every((f) => f.wall === 'clear'), 'never a wall');

  // a move that still ends in the face (a long frame) is taken back, gliding or falling; never lifted onto it
  const step = (x, z) => (z < 20 ? 0 : 30);
  glide = createPlayerGlide();
  at = launch(glide, { z: 18, y: 10 });
  fly(glide, { frames: 10, ground: step, at });
  const into = glide.update({ dt: 0.1, x: at.x, z: 21, groundY: 30, heroY: 30 });
  assert.deepEqual([into.mode, into.x, into.z, into.wall], ['glide', at.x, at.z, 'held']);
  assert.ok(into.y < 10, 'still in the air, below the top: ' + into.y.toFixed(2));
  // a long frame (1.3 s, about 10 m at trim: past the teleport distance) into the face: taken back too, not ended as a
  // teleport and set down on top
  const longer = createPlayerGlide();
  const from = launch(longer, { z: 12, y: 10 });
  fly(longer, { frames: 10, ground: step, at: from });
  const hitch = longer.update({ dt: 1.3, x: from.x, z: from.z + 9.75, groundY: 30, heroY: 30 });
  assert.deepEqual([hitch.mode, hitch.x, hitch.z, hitch.wall], ['glide', from.x, from.z, 'held']);
  assert.ok(hitch.y < 10);
  glide.toggle(); // closed: falling, steered at the cliff
  const fall = glide.update({ dt: 1 / 60, x: at.x, z: 20.5, groundY: 30, heroY: 30 });
  assert.deepEqual([fall.mode, fall.x, fall.z], ['fall', at.x, at.z]);
  assert.ok(fall.y < 10);
});

test('any frame rate glides the same: a slow frame sinks and falls as far as the fast frames it stands for', () => {
  // off a 40 m cliff top, the glider open straight away, flown to the valley floor at 60, 4 and 2 frames a second
  const glideAt = (dt, ground = 0, probe = false) => {
    const glide = createPlayerGlide();
    glide.update({ dt: 1 / 60, x: 0, z: 0, groundY: 40, heroY: 40 });
    glide.update({ dt: 1 / 60, x: 0, z: 0.07, groundY: 0, heroY: 0 });
    glide.toggle({ heroY: 40, groundY: 0, bodyHeading: 0 });
    const trace = fly(glide, { frames: Math.ceil(60 / dt), dt, ground, probe, at: { x: 0, z: 0.07, y: 40 } });
    return { trace, end: trace.at(-1), seconds: trace.length * dt };
  };
  const fast = glideAt(1 / 60);
  for (const dt of [0.25, 0.5]) {
    const slow = glideAt(dt);
    assert.ok(slow.end.landed, 'lands at ' + dt + ' s a frame');
    const ratio = Math.hypot(slow.end.x, slow.end.z) / Math.hypot(fast.end.x, fast.end.z);
    assert.ok(Math.abs(ratio - 1) < 0.03, `the same reach at ${dt} s a frame (${(ratio * 100).toFixed(1)}%)`);
    assert.ok(Math.abs(slow.seconds - fast.seconds) <= dt + 0.05, `the same time aloft (${slow.seconds} s, ${fast.seconds.toFixed(2)} s)`);
  }
  // a fall: the same 40 m in the same time
  const fallAt = (dt) => {
    const glide = createPlayerGlide();
    glide.update({ dt: 1 / 60, x: 0, z: 0, groundY: 40, heroY: 40 });
    let t = 0, s = glide.update({ dt: 1 / 60, x: 0, z: 0.07, groundY: 0, heroY: 0 });
    while (!s.landed && t < 10) { t += dt; s = glide.update({ dt, x: 0, z: 0.07, groundY: 0, heroY: 0 }); }
    return t;
  };
  assert.ok(Math.abs(fallAt(0.25) - fallAt(1 / 60)) <= 0.25 + 1e-9, 'a fall takes as long at 4 frames a second');
  // the cliff at 4 frames a second: still held off the face, never lifted onto it
  const cliff = (x, z) => (z < 60 ? 0 : z < 62 ? (z - 60) * 15 : 30);
  const slowWall = glideAt(0.25, cliff, true);
  assert.ok(slowWall.end.landed && slowWall.end.y === 0 && slowWall.end.z < 60, 'lands at the foot: z ' + slowWall.end.z.toFixed(2));
  assert.ok(Math.max(...slowWall.trace.map((f) => f.h)) <= 40 + 1e-9, 'never lifted');
});

test('the glider opens only high enough above the landing, and Space again closes it', () => {
  const glide = createPlayerGlide();
  assert.equal(glide.toggle({ heroY: 0.5, groundY: 0 }).reason, 'on_ground');
  assert.equal(glide.toggle({ heroY: 0.8, groundY: 0, jumping: true }).reason, 'too_low', 'a hop on flat ground');
  assert.equal(glide.toggle({ heroY: 3, groundY: 0, jumping: true }).action, 'opened', 'a jump off a bank');
  assert.equal(glide.toggle().action, 'closed');
  assert.equal(glide.mode(), 'fall');
  assert.equal(glide.toggle({ heroY: 2.5, groundY: 0, surfaceY: 1.5 }).reason, 'too_low', 'over deep water the landing is the surface');
});

// ------------------------------------------------------------------------------------------------ pose, prop, controller

test('both fused bodies hang from the bar: hands above the head, a loop that never touches the ground', async () => {
  for (const [name, rigId] of [['Male', 'fused-male-v1'], ['Female', 'fused-female-v1']]) {
    const root = (await body(name)).clone(true);
    const clip = await packClip(rigId, 'Glide_Hang');
    assert.equal(clip.userData.loop, true);
    assert.equal(clip.userData.airborne, true);
    assert.ok(clipBindsToActor(clip, root), `${name} Glide_Hang binds`);
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(clip).play();
    const find = (s) => { let b = null; root.traverse((o) => { if (!b && new RegExp(s + '$').test(o.name)) b = o; }); return b; };
    for (const t of [0, 0.4, 0.8, 1.2]) {
      mixer.setTime(t); root.updateMatrixWorld(true);
      const y = (s) => find(s).getWorldPosition(new THREE.Vector3()).y;
      assert.ok(y('LeftHand') > y('Head') && y('RightHand') > y('Head'), `${name} at ${t}s: hands up on the bar`);
    }
    mixer.stopAllAction(); mixer.uncacheRoot(root);
  }
  assert.match(read('src/components/game3d/player/playerAnimationLibrary.jsx'), /Glide_Hang: 'glideHang'/);
});

test('the glider prop is low-poly, sits between the hands, banks, and folds away', async () => {
  const mesh = createGliderMesh();
  assert.ok(gliderTriangleCount(mesh) <= 60, `${gliderTriangleCount(mesh)} triangles`);
  const scene = new THREE.Scene();
  const root = (await body('Female')).clone(true);
  scene.add(root);
  const prop = createGliderProp(scene);
  prop.update({ open: true, model: root, bank: -0.4, dt: 1 });
  assert.equal(prop.root.visible, true);
  root.updateMatrixWorld(true);
  const hands = ['LeftHand', 'RightHand'].map((s) => { let b = null; root.traverse((o) => { if (!b && new RegExp(s + '$').test(o.name)) b = o; }); return b.getWorldPosition(new THREE.Vector3()); });
  assert.ok(prop.root.position.distanceTo(hands[0].clone().add(hands[1]).multiplyScalar(0.5)) < 1e-6, 'the bar in the hands');
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(prop.root.quaternion);
  assert.ok(Math.abs(right.y) > 0.2, 'banked');
  for (let i = 0; i < 30; i++) prop.update({ open: false, model: root, dt: 1 / 60 });
  assert.equal(prop.root.visible, false, 'folded away');
  prop.dispose();
  assert.ok(!scene.children.includes(prop.root));
});

const built = buildSync({
  entryPoints: ['src/components/game3d/player/LunaDashboardPlayerController.jsx'],
  bundle: true, platform: 'node', format: 'cjs', write: false, outdir: 'unused', external: ['three'],
}).outputFiles;
function controllerFor(root, clips, clock = { seconds: 0 }) {
  const runtime = { exports: {} };
  new Function('module', 'exports', 'require', 'performance', built[0].text)(
    runtime, runtime.exports, createRequire(import.meta.url), { now: () => clock.seconds * 1000 });
  const mixer = new THREE.AnimationMixer(root);
  const controller = runtime.exports.createLunaDashboardPlayerController({ mixer, getAirWalkStamina: () => 100 });
  controller.bindClips(clips);
  return { controller, mixer, clock };
}

test('in the air the controller hangs or falls, refuses jumps, dodges and strikes, and lands into the run', async () => {
  const root = await body('Male');
  const base = { ...createPlayerMovementFallbackClips(root), ...nativePlayerAnimationClips(root) };
  const { controller } = controllerFor(root, { ...base, glideHang: await packClip('fused-male-v1', 'Glide_Hang') });
  controller.updateActionState({ moving: true, running: true });
  assert.equal(controller.setGliding('glide'), 'glide');
  assert.equal(controller.getIsGliding(), true);
  assert.equal(controller.getCurrent(), 'glideHang');
  const v = new THREE.Vector3(0, 0, 1);
  assert.equal(controller.requestJump(), false);
  assert.equal(controller.requestDodge(v, 'forward'), false);
  assert.equal(controller.requestRoll(v, 'backward'), false);
  assert.equal(controller.requestAttack('kick', 1), false);
  assert.equal(controller.requestHitReact('front'), false);
  assert.equal(controller.getJumpOffset(), 0, 'the world owns the height');
  // Halo Wings: none at 0% (the glider stays), the wings' glide at 50%
  assert.equal(controller.requestWingsFromGlide({ worldY: 30, floorY: 0, haloPercent: 0 }).ok, false);
  const wings = controller.requestWingsFromGlide({ worldY: 30, floorY: 0, haloPercent: 50 });
  assert.equal(wings.ok, true);
  assert.equal(controller.getAirWalkState().mode, 'glide');
  assert.equal(controller.getIsGliding(), false);
  // a fall, then touchdown carries on running
  const fresh = controllerFor(root, base).controller;
  fresh.updateActionState({ moving: true, running: true });
  fresh.setGliding('fall');
  assert.equal(fresh.getIsFalling(), true);
  assert.equal(fresh.requestJump(), false, 'no jump from mid-air');
  fresh.setGliding('ground');
  assert.equal(fresh.getIsFalling(), false);
  assert.ok(['run', 'walk', 'sprint'].includes(fresh.getCurrent()) || /run/i.test(fresh.getCurrent()), `lands running (${fresh.getCurrent()})`);
  // riding never glides
  fresh.setMounted(true);
  assert.equal(fresh.setGliding('glide'), 'ground');
});

// ------------------------------------------------------------------------------------------------ world and remote

test('the world opens the glider in the air with Space and keeps the glide beside the ground code', () => {
  const world = read('src/components/game3d/GameWorld3D.jsx');
  // Space: the glider first, then the existing dismiss / jump / Halo chain
  assert.match(world, /if\(!e\.repeat && glideSpace\(\)\)\{ \/\* the glider took it \*\/ \}\s*else if\(!e\.repeat && spaceOnGround && resolveSpaceAction/);
  assert.match(world, /if \(wingsAllowed && playerAnim\?\.requestWingsFromGlide\?\.\(/, 'Halo Wings from an open glider');
  assert.match(world, /swimNotice\('Too low to open the glider'\);/);
  // the air block after the glue, before the swim, both on the same ground
  const glue = world.indexOf('// Glue player feet to terrain');
  const air = world.indexOf('const air = playerGlide.update({');
  const swim = world.indexOf('const swim = playerSwim.update({');
  assert.ok(glue > 0 && glue < air && air < swim, 'glue, then the air, then the water');
  assert.match(world, /const feetGroundY = model\.position\.y - \(playerAnim\?\.getJumpOffset\?\.\(\) \|\| 0\);/);
  assert.match(world, /bedY: feetGroundY,/);
  assert.match(world, /if \(air\.changed\) playerAnim\?\.setGliding\?\.\(air\.mode\);\s*if \(air\.y !== null\) model\.position\.y = air\.y;/);
  // the glider carries the hero through the ordinary collision-checked move, at its own speed, no run or sprint
  assert.match(world, /glideSteer\.copy\(move\);\s*const glidingNow = playerGlide\.isGliding\(\) && !mounted;\s*if \(glidingNow\) \{ const v = playerGlide\.velocity\(\); move\.set\(v\.x, 0, v\.z\); \}/);
  assert.match(world, /const speed = glidingNow \? playerGlide\.travelSpeed\(\) : \(baseMoveSpeed/);
  // ground more than 2 m above the glider is a wall: the ground ahead from the glue's own floors, a move into it taken back
  assert.match(world, /const glideGroundAt = \(x, z, y\) => \{[\s\S]{0,260}\?\? sampleGroundY\(x, z, y\);/);
  assert.match(world, /jumping: glideJumping\(\), groundAt: glideGroundAt,/);
  assert.match(world, /if \(air\.x !== null\) \{ model\.position\.x = air\.x; model\.position\.z = air\.z; \}/);
  assert.match(world, /const isSprinting = !!keys\.current\['control'\] && isMoving && !swimmingNow && !glidingNow;/);
  // no strikes, skills or mounting in the air; the prop after the pose; teardown
  assert.match(world, /if \(\(playerSwim\.isSwimming\(\) \|\| playerGlide\.isGliding\(\)\) && \(attackPressed\.current/);
  assert.match(world, /else if \(!isMountedRef\.current && playerGlide\.isAirborne\(\)\) \{ if \(!e\.repeat\) swimNotice\("You can't mount in the air"\); \}/);
  assert.match(world, /momentGestures\.update\(\);\s*gliderProp\.update\(\{ open: playerGlide\.isGliding\(\), model, bank: playerGlide\.bank\(\), dt: delta \}\);/);
  assert.match(world, /gliderProp\.dispose\(\);/);
  // remote players: the hang pose retargeted like the swim, and a glider in their hands
  const remote = read('src/components/game3d/RemotePlayersManager.jsx');
  assert.match(remote, /glideHang: '\/models\/animations\/mocap\/Glide_Hang\.glb'/);
  assert.match(remote, /r\.glider\?\.update\(\{ open: r\.lastAnim === 'glideHang', model: r\.group, dt: delta \}\);/);
});
