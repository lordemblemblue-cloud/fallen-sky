// Game 3D player and mount animation port (2026-11-19): the dodge variants and double-tap detector on top of the
// eight-way dodge framework, the mobility clip pack (forward sidestep, back roll, sprint) and its loader, the
// skill-cast / level-up gestures and effects, ridden mount flight (controller + flight clips) and the re-rigged
// Faction 3 mount. Real fused bodies and real pack files are decoded through GLTFLoader; GameWorld3D's wiring is
// checked in source like the sibling tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  GAME3D_DOUBLE_TAP_MS, DODGE_VARIANT_MOVES, dodgeMoveCandidates, pickDodgeMove, createDoubleTapDetector, screenForwardFacingYaw,
} from '../src/components/game3d/player/game3dDodgeProfiles.mjs';
import { getInputDodge, getPlanarBasisFromYaw } from '../src/components/game3d/player/characterDodgeVector.js';
import { getEightWayDodgeMove } from '../src/components/game3d/player/game3dEightWayDodge.mjs';
import { createEightWayDodgeClips } from '../src/components/game3d/player/playerEightWayDodgeClips.js';
import { mobilityClipPackEntries, clipBindsToActor, loadMobilityClipPack } from '../src/components/game3d/player/mobilityClipPack.mjs';
import { nativePlayerAnimationClips } from '../src/components/game3d/player/playerNativeAnimationClips.js';
import { createPlayerMovementFallbackClips } from '../src/components/game3d/player/playerMovementFallbackClips.js';
import { syncFusedLocomotion, LOCOMOTION_CADENCE } from '../src/components/game3d/player/fusedLocomotionSync.js';
import { createMountFlightController, MOUNT_FLIGHT } from '../src/components/game3d/character/mountFlight.mjs';
import { proceduralMountFlightClip, mountWingBones } from '../src/components/game3d/character/factionPetAnimationRigs.mjs';
import { withMountFlightClip, prepareMountAnimationClips, DOG_MOUNT_RIG_MAPS } from '../src/components/game3d/character/mountAnimations.mjs';
import { createFactionThreeMountRig } from '../src/components/game3d/character/factionThreeMountRig.mjs';
import { createPlayerMomentGestures, PLAYER_MOMENT_GESTURES } from '../src/components/game3d/player/playerMomentGestures.mjs';
import { GAME3D_FACTION_MOUNTS } from '../src/components/game3d/axe/factions/AXEFactionMountAssets.mjs';

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
  const asset = await parseGlb('public' + entry.url);
  const clip = asset.animations[0];
  clip.userData = { ...(asset.parser.json.animations[0].extras || {}) };
  return clip;
}

const built = buildSync({
  entryPoints: ['src/components/game3d/player/LunaDashboardPlayerController.jsx'],
  bundle: true, platform: 'node', format: 'cjs', write: false, outdir: 'unused', external: ['three'],
}).outputFiles;
function controllerFor(root, clips, clock = { seconds: 0 }) {
  const runtime = { exports: {} };
  new Function('module', 'exports', 'require', 'performance', built[0].text)(
    runtime, runtime.exports, createRequire(import.meta.url), { now: () => clock.seconds * 1000 });
  const mixer = new THREE.AnimationMixer(root);
  const controller = runtime.exports.createLunaDashboardPlayerController({ mixer });
  controller.bindClips(clips);
  return { controller, mixer, clock };
}

// ------------------------------------------------------------------------------------------------ dodge moves

test('double-tap W sidesteps, S back-flips, A/D flip; the roll setting and R roll on W/S', () => {
  const keys = (direction, options) => dodgeMoveCandidates(direction, options).map((m) => m.key);
  assert.deepEqual(keys('forward'), ['dodgeStepForward', 'dodgeRollForward']);
  assert.deepEqual(keys('forwardLeft'), ['dodgeStepForward', 'dodgeRollForwardLeft']);
  assert.deepEqual(keys('forward', { rollDodges: true }), ['dodgeRollForward']);
  assert.deepEqual(keys('backward'), ['dodgeRollBackward'], 'S plays the eight-way back slot (the back flip)');
  assert.deepEqual(keys('backward', { rollDodges: true }), ['dodgeBackRoll', 'dodgeRollBackward']);
  assert.deepEqual(keys('backwardRight', { rollDodges: true }), ['dodgeBackRoll', 'dodgeRollBackwardRight']);
  assert.deepEqual(keys('left'), ['dodgeStepLeft']);
  assert.deepEqual(keys('right', { rollDodges: true }), ['dodgeStepRight'], 'the roll setting leaves A / D alone');
  assert.deepEqual(keys('backward', { rollKey: true }), ['dodgeBackRoll', 'dodgeRollBackward'], 'R alone rolls backward');
  assert.deepEqual(keys('forward', { rollKey: true }), ['dodgeRollForward'], 'R + W is the front roll');
  assert.deepEqual(keys('left', { rollKey: true }), ['dodgeRollLeft'], 'R + A is the side roll');
  const forward = dodgeMoveCandidates('forwardRight')[0];
  assert.equal(forward.direction, 'forwardRight');
  for (const move of Object.values(DODGE_VARIANT_MOVES)) {
    const distance = move.speed * Math.min(0.68, move.duration);
    assert.ok(distance > 2.5 && distance < 3.6, `${move.key} travels ${distance}`);
    assert.ok(Object.isFrozen(move));
  }
  assert.equal(pickDodgeMove(dodgeMoveCandidates('forward'), (k) => k === 'dodgeRollForward').key, 'dodgeRollForward', 'no sidestep clip: the roll');
  assert.equal(pickDodgeMove(dodgeMoveCandidates('forward'), () => false), null);
  assert.ok(read('src/components/game3d/axe/player/AXEControlSettingsStore.js')
    .includes('autoTargetNearby: false, dodgeRollVariant: false })'), 'rolls are the optional variant, off by default');
  assert.equal(getEightWayDodgeMove('forward').key, 'dodgeRollForward', 'the eight-way table itself is unchanged');
});

test('a double tap is two presses of the same key inside the window with the key released in between', () => {
  const taps = createDoubleTapDetector();
  assert.equal(taps.keyDown('w', 1000), false);
  taps.keyUp('w');
  assert.equal(taps.keyDown('w', 1000 + GAME3D_DOUBLE_TAP_MS), true, 'inside the window');
  taps.keyUp('w');
  assert.equal(taps.pending(), null, 'a completed double tap is consumed');
  assert.equal(taps.keyDown('w', 5000), false);
  assert.equal(taps.keyDown('w', 5100, { repeat: true }), false, 'auto-repeat never counts');
  assert.equal(taps.keyDown('w', 5150), false, 'a press without a release in between is a held key');
  taps.keyUp('w');
  assert.equal(taps.keyDown('w', 5000 + GAME3D_DOUBLE_TAP_MS + 1), false, 'outside the window: a new first tap');
  taps.keyUp('w');
  assert.equal(taps.keyDown('a', 5400), false, 'another movement key cancels the pending tap');
  taps.keyUp('a');
  assert.equal(taps.keyDown('w', 5450), false);
  taps.keyUp('w');
  assert.equal(taps.keyDown('W', 5600), true, 'case-insensitive');
  taps.keyUp('w');
  assert.equal(taps.keyDown('shift', 1), false, 'only movement keys');
  taps.keyDown('s', 9000); taps.reset();
  assert.equal(taps.pending(), null);
  assert.equal(taps.keyDown('s', 9050), false, 'reset forgets the half tap and the held state');
});

test('squared up to the camera, every key picks its own eight-way slot and travels that way on screen', () => {
  // GameWorld3D squares the body up before a double-tap dodge (the first tap has already started turning it).
  const body = new THREE.Object3D();
  const keysFor = { w: { forward: true }, a: { left: true }, s: { backward: true }, d: { right: true },
    wd: { forward: true, right: true }, sa: { backward: true, left: true } };
  const expected = { w: 'forward', a: 'left', s: 'backward', d: 'right', wd: 'forwardRight', sa: 'backwardLeft' };
  for (const cameraYaw of [0, .7, Math.PI / 2, 2.4, Math.PI, -1.1, -2.9]) {
    for (const bodyYaw of [0, 1.9, -2.5]) { // wherever the body faced before
      body.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), bodyYaw);
      const before = getInputDodge(body, cameraYaw, keysFor.a).vector.clone();
      const basis = getPlanarBasisFromYaw(cameraYaw);
      body.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), screenForwardFacingYaw(basis.forward));
      for (const [combo, input] of Object.entries(keysFor)) {
        const dodge = getInputDodge(body, cameraYaw, input);
        assert.equal(dodge.direction, expected[combo], `${combo} at camera ${cameraYaw}, body ${bodyYaw}`);
      }
      assert.ok(getInputDodge(body, cameraYaw, keysFor.a).vector.distanceTo(before) < 1e-9, 'squaring up never changes where the dodge goes');
    }
  }
});

// ------------------------------------------------------------------------------------------ clip pack files

for (const [rigId, bodyName] of [['fused-male-v1', 'Male'], ['fused-female-v1', 'Female']]) {
  test(`${bodyName}: the mobility pack's sidestep, back roll and sprint bind to the real body with their extras`, async () => {
    const root = await body(bodyName);
    const names = mobilityClipPackEntries(manifest, rigId).map((e) => e.name);
    // ... plus the two swim loops of deep water (tests/game3d-swimming.test.mjs checks those)
    // (and the glider's hanging pose: tests/game3d-glide.test.mjs)
    // ... and the jump set and fall (tests/game3d-locomotion-jump-pack.test.mjs)
    assert.deepEqual(names.sort(), ['Back_Roll', 'Dodge_Forward', 'Fall_Loop', 'Glide_Hang', 'Jump_Land', 'Jump_Loop', 'Jump_Start', 'Sprint', 'Swim_Forward', 'Swim_Idle']);
    const pack = {};
    for (const name of names) {
      const clip = await packClip(rigId, name);
      assert.equal(clip.name, name);
      assert.ok(clipBindsToActor(clip, root), `${name} binds to ${bodyName}`);
      assert.equal(clip.userData.inPlace, true, `${name} is in place: the world moves the hero`);
      pack[name] = clip;
    }
    assert.equal(pack.Sprint.userData.loop, true);
    assert.ok(pack.Sprint.userData.speed > 1.2 && pack.Sprint.userData.speed < 2.6, 'sprint speed in body units: ' + pack.Sprint.userData.speed);
    assert.ok(Math.abs(pack.Back_Roll.duration - DODGE_VARIANT_MOVES.backRoll.duration) < 0.02);
    assert.ok(!clipBindsToActor(new THREE.AnimationClip('foreign', 1, [new THREE.QuaternionKeyframeTrack('NoSuchBone.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])]), root));
  });

  test(`${bodyName}: the back roll turns the body over close to the ground and ends standing`, async () => {
    const root = await body(bodyName);
    const clip = await packClip(rigId, 'Back_Roll');
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(clip).play();
    const hips = root.getObjectByName('mixamorigHips'), head = root.getObjectByName('mixamorigHead'), foot = root.getObjectByName('mixamorigLeftFoot');
    const sample = (t) => { mixer.setTime(t); root.updateMatrixWorld(true); return { hips: hips.getWorldPosition(new THREE.Vector3()), head: head.getWorldPosition(new THREE.Vector3()), foot: foot.getWorldPosition(new THREE.Vector3()) }; };
    const start = sample(0), mid = sample(0.47), end = sample(clip.duration - 1e-3);
    assert.ok(mid.head.y < mid.hips.y, 'upside down mid-roll');
    assert.ok(mid.hips.y < start.hips.y, 'rolling low, not jumping');
    assert.ok(Math.abs(end.foot.y - start.foot.y) < 0.02 && Math.abs(end.hips.y - start.hips.y) < 0.03, 'ends standing');
    mixer.stopAllAction(); mixer.uncacheRoot(root);
  });
}

test('the pack loader keeps only clips that bind to the actor and never throws', async () => {
  const root = await body('Male');
  const good = await packClip('fused-male-v1', 'Dodge_Forward');
  const foreign = new THREE.AnimationClip('Sprint', 1, [new THREE.QuaternionKeyframeTrack('Elsewhere.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])]);
  const fake = { version: 1, bodies: { 'fused-male-v1': { dir: '', clips: ['Dodge_Forward', 'Sprint', 'Missing'] } } };
  const target = new THREE.Group(); target.userData.rigId = 'fused-male-v1';
  root.children.slice().forEach((c) => target.add(c)); // the same skeleton under a fresh actor (the pack is cached per actor)
  const pack = await loadMobilityClipPack(target, {
    readManifest: async () => fake,
    loadClip: async (url) => url.endsWith('Dodge_Forward.glb') ? { clip: good, extras: good.userData } : url.endsWith('Sprint.glb') ? { clip: foreign, extras: {} } : Promise.reject(new Error('404')),
  });
  assert.deepEqual(Object.keys(pack), ['Dodge_Forward']);
  assert.equal(pack.Dodge_Forward.userData.mobilityPack, true);
  assert.deepEqual(await loadMobilityClipPack(new THREE.Group(), { readManifest: async () => fake }), {}, 'no rig id, no pack');
  assert.deepEqual(await loadMobilityClipPack(Object.assign(new THREE.Group(), { userData: { rigId: 'fused-female-v1' } }), { readManifest: async () => { throw new Error('offline'); } }), {});
  target.children.slice().forEach((c) => root.add(c));
  const library = read('src/components/game3d/player/playerAnimationLibrary.jsx');
  assert.match(library, /Dodge_Forward: 'dodgeStepForward',\s*Back_Roll: 'dodgeBackRoll',\s*Sprint: 'sprint',/);
  assert.match(library, /if\(chosen\.has\(key\)\|\|!mobility\[name\]\)continue;/, 'never over an admin upload');
  assert.ok(library.indexOf('loadMobilityClipPack(target)') > library.indexOf('loadDodgeClips(target)'), 'after the authored dodge pack');
});

// ------------------------------------------------------------------------------------------------ controller

test('the controller plays the sidestep, the back flip slot, the back roll and the sprint cycle from the pack', async () => {
  const root = await body('Male');
  const pack = {};
  for (const name of ['Dodge_Forward', 'Back_Roll', 'Sprint']) pack[name] = await packClip('fused-male-v1', name);
  const base = { ...createPlayerMovementFallbackClips(root), ...createEightWayDodgeClips(root), ...nativePlayerAnimationClips(root) };
  const clips = { ...base, dodgeStepForward: pack.Dodge_Forward, dodgeBackRoll: pack.Back_Roll, sprint: pack.Sprint };
  const { controller, mixer, clock } = controllerFor(root, clips);
  const run = (seconds, onStep) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      clock.seconds += 1 / 60; controller.updateAnimation(1 / 60); mixer.update(1 / 60);
      controller.updateMotion(root, 1 / 60, 0, (dx, dz) => { onStep?.(dx, dz); return 0; });
    }
  };
  const step = DODGE_VARIANT_MOVES.stepForward;
  assert.ok(controller.requestDodge(new THREE.Vector3(0, 0, 1), 'forward'));
  assert.equal(controller.getCurrent(), 'dodgeStepForward');
  assert.equal(controller.actions.dodgeStepForward.getClip(), pack.Dodge_Forward);
  let travel = 0;
  run(step.duration + 0.1, (dx, dz) => { travel += dz; });
  assert.ok(Math.abs(travel - step.speed * Math.min(0.68, step.duration)) <= step.speed / 60 + 1e-6, 'forward sidestep travel ' + travel);
  assert.equal(controller.isMovementOverridden(), false);
  assert.ok(controller.requestDodge(new THREE.Vector3(0, 0, -1), 'backward'));
  assert.equal(controller.getCurrent(), 'dodgeRollBackward', 'S keeps the eight-way back slot');
  run(1.0);
  assert.ok(controller.requestDodge(new THREE.Vector3(0, 0, -1), 'backward', { rollDodges: true }));
  assert.equal(controller.getCurrent(), 'dodgeBackRoll', 'the roll setting rolls backward');
  run(1.0);
  assert.ok(controller.requestDodge(new THREE.Vector3(0, 0, 1), 'forward', { rollDodges: true }));
  assert.equal(controller.getCurrent(), 'dodgeRollForward', 'the roll setting rolls forward');
  run(1.0);
  assert.ok(controller.requestRoll(new THREE.Vector3(0, 0, -1), 'backward'));
  assert.equal(controller.getCurrent(), 'dodgeBackRoll', 'R alone is the backward roll');
  run(1.0);
  assert.ok(controller.requestDodge(new THREE.Vector3(-1, 0, 0), 'left'));
  assert.equal(controller.getCurrent(), 'dodgeStepLeft');
  run(1.0);
  controller.HandleMovement({ moving: true, running: true, sprinting: true, direction: 'forward' });
  assert.equal(controller.getCurrent(), 'sprint');
  assert.equal(controller.actions.sprint.getClip(), pack.Sprint);
  root.scale.setScalar(1.7);
  assert.equal(syncFusedLocomotion({ getCurrent: () => 'sprint', actions: controller.actions }, root, 12.15), LOCOMOTION_CADENCE.max,
    'sprint is synced like walk / run, within a human cadence');
  root.scale.setScalar(1);
  controller.setMounted(true);
  assert.equal(controller.requestDodge(new THREE.Vector3(1, 0, 0), 'right'), false, 'no dodging in the saddle');
  controller.setMounted(false);
  // A body without the pack keeps the eight-way roll on W.
  const plain = controllerFor(root, base);
  assert.ok(plain.controller.requestDodge(new THREE.Vector3(0, 0, 1), 'forward'));
  assert.equal(plain.controller.getCurrent(), 'dodgeRollForward');
});

// ------------------------------------------------------------------------------------- gestures and effects

test('skill-cast and level-up gestures layer over the pose and restore every bone before the next frame', async () => {
  const root = await body('Male');
  let ms = 0;
  const gestures = createPlayerMomentGestures({ getActor: () => root, now: () => ms });
  const arm = root.getObjectByName('mixamorigRightArm'), head = root.getObjectByName('mixamorigHead');
  const before = { arm: arm.quaternion.clone(), head: head.quaternion.clone() };
  assert.equal(gestures.play('nothing'), false);
  assert.equal(gestures.play('levelUp'), true);
  ms = 600;
  assert.equal(gestures.update(), true);
  assert.ok(arm.quaternion.angleTo(before.arm) > 0.5, 'the arms go up');
  assert.ok(head.quaternion.angleTo(before.head) > 0.1, 'the head looks up');
  gestures.preUpdate();
  assert.ok(arm.quaternion.equals(before.arm) && head.quaternion.equals(before.head), 'restored exactly');
  ms = PLAYER_MOMENT_GESTURES.levelUp.seconds * 1000 + 1;
  assert.equal(gestures.update(), false, 'finished');
  gestures.play('skillCast', { seconds: 0.5 });
  ms += 200;
  assert.equal(gestures.update(), true);
  assert.ok(arm.quaternion.angleTo(before.arm) > 0.1);
  gestures.dispose();
  assert.ok(arm.quaternion.equals(before.arm));
});

test('skill burst and level-up celebration run through the activeEffects contract without a DOM', () => {
  const fxBuilt = buildSync({ entryPoints: ['src/components/game3d/vfx/playerMomentEffects.jsx'], bundle: true, platform: 'node', format: 'cjs', write: false, outdir: 'unused', external: ['three'] }).outputFiles[0].text;
  const fxRuntime = { exports: {} };
  new Function('module', 'exports', 'require', fxBuilt)(fxRuntime, fxRuntime.exports, createRequire(import.meta.url));
  const { createSkillUseBurst, createLevelUpCelebration, skillBurstColor } = fxRuntime.exports;
  assert.notEqual(skillBurstColor('sword'), skillBurstColor('bow'));
  const scene = new THREE.Scene();
  const player = new THREE.Group(); player.position.set(3, 0, -2);
  for (const make of [() => createSkillUseBurst({ scene, playerRef: { current: player }, duration: 0.6 }), () => createLevelUpCelebration({ scene, playerRef: { current: player }, duration: 1 })]) {
    const fx = make();
    const group = scene.children[scene.children.length - 1];
    fx.update(1 / 60);
    assert.ok(scene.children.includes(group) && fx.alive(), 'in the scene while it plays');
    assert.ok(Math.abs(group.position.x - 3) < 1e-9 && Math.abs(group.position.z + 2) < 1e-9, 'follows the hero');
    for (let i = 0; i < 100; i++) fx.update(1 / 60);
    assert.equal(fx.alive(), false);
    // GameWorld3D's activeEffects filter only drops a finished effect; the effect has already left the scene.
    assert.ok(!scene.children.includes(group), 'removes itself (and its light) when its time is up');
    assert.doesNotThrow(() => { fx.dispose(); fx.dispose(); }, 'dispose stays idempotent');
  }
});

// ------------------------------------------------------------------------------------------------- mount flight

test('a ridden mount takes off to a few metres above the ground, cruises, lands and drops flight on dismount', () => {
  const flight = createMountFlightController();
  assert.equal(flight.toggle(), 'takeoff');
  let state;
  for (let i = 0; i < 120; i++) state = flight.update(1 / 60, { mounted: true, moving: true });
  assert.equal(state.phase, 'air');
  assert.ok(state.altitude > 2 && state.altitude < 4, 'low over the ground: ' + state.altitude);
  assert.ok(state.airborne && state.pitch > 0.05, 'nose down while travelling');
  assert.equal(flight.speedMultiplier(), MOUNT_FLIGHT.speedMultiplier);
  assert.equal(flight.toggle(), 'landing');
  for (let i = 0; i < 180; i++) state = flight.update(1 / 60, { mounted: true });
  assert.equal(state.phase, 'ground');
  assert.equal(state.altitude, 0);
  flight.toggle();
  for (let i = 0; i < 30; i++) flight.update(1 / 60, { mounted: true });
  flight.update(1 / 60, { mounted: false });
  assert.equal(flight.getAltitude(), 0, 'dismounted: no altitude left');
});

function wingedRig() {
  const root = new THREE.Group();
  const bone = (name, parent, x, y, z) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); (parent || root).add(b); return b; };
  const pelvis = bone('pelvis', null, 0, 0.5, -0.3);
  const spine = bone('spine', pelvis, 0, 0.1, 0.25);
  bone('head', spine, 0, 0.1, 0.35);
  const wl = bone('wing_l_base', spine, 0.12, 0.08, 0), wlTip = bone('wing_l_tip', wl, 0.3, 0.05, 0);
  const wr = bone('wing_r_base', spine, -0.12, 0.08, 0), wrTip = bone('wing_r_tip', wr, -0.3, 0.05, 0);
  const legs = ['front_l', 'front_r', 'rear_l', 'rear_r'].map((p, i) => {
    const upper = bone(`${p}_upper`, i < 2 ? spine : pelvis, i % 2 ? -0.1 : 0.1, -0.1, 0);
    const lower = bone(`${p}_lower`, upper, 0, -0.2, 0); bone(`${p}_foot`, lower, 0, -0.2, 0); return upper;
  });
  bone('tail_00', pelvis, 0, 0, -0.2);
  root.updateMatrixWorld(true);
  return { root, wlTip, wrTip, legs };
}

test('the wing-beat flight clip beats both wings upward together, tucks the legs and loops seamlessly', () => {
  const rig = wingedRig();
  assert.equal(mountWingBones(rig.root).length, 2);
  const clip = proceduralMountFlightClip(rig.root, { profile: { limbs: ['front_l_upper', 'front_r_upper', 'rear_l_upper', 'rear_r_upper'] } });
  assert.ok(clip && clip.name === 'fly');
  for (const track of clip.tracks) {
    const n = track.getValueSize();
    for (let k = 0; k < n; k++) assert.ok(Math.abs(track.values[k] - track.values[track.values.length - n + k]) < 1e-6, track.name + ' loops');
  }
  const mixer = new THREE.AnimationMixer(rig.root);
  mixer.clipAction(clip).play();
  const tipY = () => { rig.root.updateMatrixWorld(true); return [rig.wlTip.getWorldPosition(new THREE.Vector3()).y, rig.wrTip.getWorldPosition(new THREE.Vector3()).y]; };
  const restY = tipY();
  const samples = [];
  for (let t = 0; t < clip.duration; t += clip.duration / 24) { mixer.setTime(t); samples.push(tipY()); }
  const high = samples.reduce((best, s) => (s[0] > best[0] ? s : best));
  const low = samples.reduce((best, s) => (s[0] < best[0] ? s : best));
  assert.ok(high[0] > restY[0] + 0.05 && high[1] > restY[1] + 0.05, 'both tips above rest at the top of the beat');
  assert.ok(high[0] - low[0] > 0.15, 'a visible beat amplitude');
  assert.ok(samples.every((s) => Math.abs(s[0] - s[1]) < 0.03), 'left and right wings beat in phase');
  mixer.setTime(0.2); rig.root.updateMatrixWorld(true);
  const paw = rig.legs[0].children[0].children[0].getWorldPosition(new THREE.Vector3());
  assert.ok(paw.z < 0.05, 'the front paw trails back under the body while flying: ' + paw.z);
  mixer.stopAllAction();
  const noWings = new THREE.Group(); const p = new THREE.Bone(); p.name = 'pelvis'; noWings.add(p);
  assert.equal(proceduralMountFlightClip(noWings), null, 'nothing to animate, no clip');
});

test('mount clip banks gain one fly clip; the bear tucks its legs; a mount with its own Fly keeps it', async () => {
  const rig = wingedRig();
  const bank = withMountFlightClip(rig.root, [new THREE.AnimationClip('idle', 1, []), new THREE.AnimationClip('run', 0.6, [])], { profileId: 'winged_faction_2_158' });
  assert.deepEqual(bank.map((c) => c.name), ['idle', 'run', 'fly']);
  assert.equal(withMountFlightClip(rig.root, bank), bank, 'added once');
  const own = [new THREE.AnimationClip('Idle', 1, []), new THREE.AnimationClip('Fly', 1, [])];
  assert.equal(await prepareMountAnimationClips(rig.root, own, { animationSource: 'native-clips', factionId: 'AXE_Faction_3' }), own,
    'a re-rigged mount plays its own clips as exported');
  // the baked bear: its Tripo leg chains from the dog map, no wings
  const bear = new THREE.Group();
  const spine0 = new THREE.Bone(); spine0.name = 'tripoSpine_0'; spine0.position.set(0, 0.5, 0); bear.add(spine0);
  for (const name of Object.keys(DOG_MOUNT_RIG_MAPS.faction_bear).filter((n) => /Limb_0$/.test(n))) {
    const upper = new THREE.Bone(); upper.name = THREE.PropertyBinding.sanitizeNodeName(name); upper.position.set(0.1, -0.1, 0); spine0.add(upper);
    const lower = new THREE.Bone(); lower.name = upper.name.replace('_0', '_1'); lower.position.set(0, -0.2, 0); upper.add(lower);
  }
  bear.updateMatrixWorld(true);
  const bearClips = await prepareMountAnimationClips(bear, [new THREE.AnimationClip('Idle', 1, [])], { id: 'faction_bear', factionId: 'AXE_Faction_1', animationSource: 'embedded' });
  const fly = bearClips.find((c) => c.name === 'fly');
  assert.ok(fly, 'the bear gets a flight clip');
  assert.equal(fly.userData.wings, 0);
  assert.equal(fly.userData.legs, 4);
});

test('the Faction 3 rig leaves the wings to the flight clip while airborne', () => {
  const root = new THREE.Group();
  const chest = new THREE.Bone(); chest.name = 'chest'; root.add(chest);
  const wing = new THREE.Bone(); wing.name = 'wing.L.base'; chest.add(wing);
  root.updateMatrixWorld(true);
  const rig = createFactionThreeMountRig(root, { animationRigProfile: 'winged_faction_3_160' });
  const beat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.9);
  wing.quaternion.copy(beat);
  rig.update(1 / 60, { flying: true });
  assert.ok(wing.quaternion.angleTo(beat) < 1e-6, 'the beat stays as the clip set it');
  wing.quaternion.copy(beat);
  rig.update(1 / 60);
  assert.ok(wing.quaternion.angleTo(new THREE.Quaternion()) < 0.35, 'on the ground the wing clamp still applies');
  rig.dispose();
});

test('the shipped re-rigged Faction 3 mount faces +Z with the profile bone names and Idle / Walk / Run / Fly', async () => {
  const def = GAME3D_FACTION_MOUNTS.AXE_Faction_3;
  assert.ok(existsSync('public' + def.modelUrl), def.modelUrl);
  const asset = await parseGlb('public' + def.modelUrl);
  const names = new Set(); asset.scene.traverse((n) => { if (n.isBone) names.add(n.name); });
  const { FACTION_PET_RIG_PROFILES } = await import('../src/components/game3d/character/factionPetAnimationRigs.mjs');
  for (const bone of FACTION_PET_RIG_PROFILES.winged_faction_3_160.nodes) assert.ok(names.has(THREE.PropertyBinding.sanitizeNodeName(bone)), bone);
  const clips = Object.fromEntries(asset.animations.map((c) => [c.name, c]));
  for (const name of ['Idle', 'Walk', 'Run', 'Fly']) assert.ok(clips[name] && clips[name].duration > 0.5, name);
  assert.ok(clips.Fly.tracks.some((t) => /wing/.test(t.name)), 'the fly clip beats the wings');
  const pelvis = asset.scene.getObjectByName('pelvis'), head = asset.scene.getObjectByName('head');
  asset.scene.updateMatrixWorld(true);
  const d = head.getWorldPosition(new THREE.Vector3()).sub(pelvis.getWorldPosition(new THREE.Vector3()));
  assert.ok(d.z > Math.abs(d.x) * 3, 'faces +Z: ' + d.toArray().map((v) => v.toFixed(2)));
  assert.equal(def.animationRigProfile, undefined, 'the runtime #160 rig passes are for the hosted fallback only');
  assert.equal(def.previousAnimationRigProfile, 'winged_faction_3_160');
});

// ---------------------------------------------------------------------------------------------- source wiring

test('GameWorld3D routes double taps, Space-while-riding, flight, skill casts and level-ups through the new modules', () => {
  const world = read('src/components/game3d/GameWorld3D.jsx');
  assert.match(world, /const dodgeTaps = createDoubleTapDetector\(\)/);
  assert.match(world, /if \(dodgeTaps\.keyDown\(k, performance\.now\(\), \{ repeat: e\.repeat \}\)\)/);
  // free camera only (the movement code's own turn condition), squared up before the slot is picked
  assert.match(world, /const turnedFacing = model && !getCombatAxes\(\) && !otsAim\.current\.aiming && !heldBow\.active/);
  assert.match(world, /if \(turnedFacing\) model\.quaternion\.setFromAxisAngle\(DODGE_FACING_AXIS,\s*screenForwardFacingYaw\(getPlanarBasisFromYaw\(orbit\.current\.yaw\)\.forward\)\);\s*const dodge = getDodgeVectorAndName\(k\);/);
  assert.match(world, /if \(!dodged && turnedFacing\) model\.quaternion\.copy\(turnedFacing\);/);
  assert.match(world, /if \(!combatAxes && !otsAim\.current\.aiming && !heldBow\.active\) \{\s*const angle = Math\.atan2\(move\.x, move\.z\);/);
  assert.match(world, /const rollDodges = isAXEDodgeRollVariantEnabled\(\)/);
  assert.match(world, /dodgeTaps\.keyUp\(k\)/);
  assert.match(world, /dodgeTaps\.reset\(\)/);
  assert.doesNotMatch(world, /lastDirectionTap|DOUBLE_TAP_MS = 280/);
  assert.match(world, /else if\(!e\.repeat && isMountedRef\.current\)\{/);
  assert.match(world, /mountFlight\.toggle\(\)==='takeoff'/);
  assert.match(world, /else if\(!e\.repeat && !isMountedRef\.current\)\{/, 'on foot Space stays the Air Jump chain');
  assert.match(world, /const flight = mountFlight\.update\(delta, \{ mounted: true, moving: mountMoved \}\)/);
  // (over water the flight counts from the water line: tests/game3d-swimming.test.mjs)
  assert.match(world, /compGroup\.position\.y = gy \+ waterLift \+ flight\.altitude;\s*model\.position\.y = gy \+ waterLift \+ flight\.altitude;/);
  assert.match(world, /playCompanionAnimation\(flight\.airborne \? 'fly' : mountMoved \? 'run' : 'idle'\)/);
  assert.match(world, /mountFlight\.speedMultiplier\(\)/);
  assert.match(world, /companionFlyActionRef\.current = fly;/);
  assert.match(world, /momentGestures\.preUpdate\(\)/);
  assert.match(world, /momentGestures\.update\(\)/);
  assert.match(world, /createSkillUseBurst\(\{/);
  assert.match(world, /createLevelUpCelebration\(\{/);
  assert.equal((world.match(/new CustomEvent\('playerLevelUp'/g) || []).length, 2, 'both XP paths announce a gained level');
  assert.match(world, /window\.removeEventListener\('playerLevelUp', handlePlayerLevelUp\)/);
  assert.match(read('src/pages/GameView.jsx'), /<LevelUpToastListener \/>/);
  const menu = read('src/components/game3d/PauseMenu.jsx');
  assert.match(menu, /Roll dodges/);
  assert.match(menu, /setAXEDodgeRollVariantEnabled/);
  const remote = read('src/components/game3d/RemoteCompanionManager.jsx');
  assert.match(remote, /flyAction/);
  assert.match(remote, /d\.flying === true \? 'fly'/);
  assert.match(read('src/components/game/MultiplayerSystem.jsx'), /flying: !!comp\.isMounted && window\.__localMountFlying === true/);
});
