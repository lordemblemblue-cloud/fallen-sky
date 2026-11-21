/* global URL */
// Deep water (2026-11-21): the swim state (player/playerSwimState.mjs), the water surface read from the real river
// mesh (axe/world/game3dWaterSurface.mjs), the owner's swim loops on both fused bodies (the mobility pack), the
// controller's swim states and what it refuses in the water, the remote archer's retarget (remoteSwimClips.mjs, run
// here onto a fused body as the stand-in skeleton), the camera's water line and the world wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SWIM, SWIM_STATES, createPlayerSwimState, createSwimNotice, swimDepth, isSwimState } from '../src/components/game3d/player/playerSwimState.mjs';
import { createWaterSurfaceIndex, keepEyeAboveWater, WATER_CAMERA_CLEARANCE } from '../src/components/game3d/axe/world/game3dWaterSurface.mjs';
import { mobilityClipPackEntries, clipBindsToActor } from '../src/components/game3d/player/mobilityClipPack.mjs';
import { locomotionTimeScale, LOCOMOTION_CADENCE } from '../src/components/game3d/player/fusedLocomotionSync.js';
import { createPlayerMovementFallbackClips } from '../src/components/game3d/player/playerMovementFallbackClips.js';
import { nativePlayerAnimationClips } from '../src/components/game3d/player/playerNativeAnimationClips.js';
import { retargetClipOnto, REMOTE_SWIM_STATES, REMOTE_SWIM_SOURCES } from '../src/components/game3d/remoteSwimClips.mjs';
import { addWolfveilWater } from '../src/components/game3d/wolfveil/WolfveilGeometry.js';
import { WOLFVEIL_RIVER } from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import { OWNER_PACK_CLIPS, OWNER_PACK_FILE } from '../tools/avatar-motion/mobility-clips.mjs';

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
async function packAsset(rigId, name) {
  const entry = mobilityClipPackEntries(manifest, rigId).find((e) => e.name === name);
  assert.ok(entry, `${name} is listed for ${rigId}`);
  const asset = await parseGlb('public' + entry.url);
  const clip = asset.animations[0];
  clip.userData = { ...(asset.parser.json.animations[0].extras || {}) };
  return { clip, scene: asset.scene };
}

// ------------------------------------------------------------------------------------------------ swim state

// A walk down a bank into deep water: the bed sinks 2 cm a frame under a still surface at 10 m.
function walkInto(swim, { surface = 10, from = 9.6, frames = 220, step = 0.02 } = {}) {
  const trace = [];
  for (let i = 0; i < frames; i++) {
    const bed = from - i * step;
    const s = swim.update({ dt: 1 / 60, surfaceY: surface, bedY: bed, currentY: bed });
    trace.push({ bed, depth: surface - bed, y: s.rootY ?? bed, ...s });
  }
  return trace;
}

test('water up to a standing hero\'s neck floats the hero at the surface, blending from where it stood', () => {
  const trace = walkInto(createPlayerSwimState());
  const entry = trace.findIndex((f) => f.entered);
  assert.ok(entry > 0, 'starts swimming on the way down');
  assert.ok(trace[entry].depth >= SWIM.enterDepth && trace[entry].depth < SWIM.enterDepth + 0.03, `at neck depth (${trace[entry].depth})`);
  assert.ok(trace.slice(0, entry).every((f) => !f.swimming && f.rootY === null), 'wading before that: the ground code keeps the feet on the bed');
  const last = trace.at(-1);
  assert.ok(last.swimming && last.weight === 1);
  assert.ok(Math.abs(last.y - (10 - SWIM.waterline)) < 1e-9, 'floats with the neck at the water line, whatever the bed');
  for (let i = 1; i < trace.length; i++) {
    assert.ok(Math.abs(trace[i].y - trace[i - 1].y) < 0.1, `no jump at frame ${i} (${trace[i - 1].y} -> ${trace[i].y})`);
  }
  const blendFrames = trace.slice(entry).findIndex((f) => f.weight >= 1);
  assert.ok(Math.abs(blendFrames / 60 - SWIM.blendSeconds) < 0.05, 'the body takes the clips\' blend time to float up');
});

test('out where the bed comes back up to chest depth, with a band so the edge never flickers', () => {
  const swim = createPlayerSwimState();
  walkInto(swim); // floating in 3.8 m of water
  // drifting over a bed between exit and entry depth keeps swimming
  for (const depth of [1.4, 1.3, 1.25, 1.35, 1.21]) {
    assert.equal(swim.update({ dt: 1 / 60, surfaceY: 10, bedY: 10 - depth, currentY: 10 - depth }).swimming, true, `still swimming over ${depth} m`);
  }
  const out = swim.update({ dt: 1 / 60, surfaceY: 10, bedY: 10 - 1.1, currentY: 10 - 1.1 });
  assert.equal(out.swimming, false);
  assert.ok(out.left);
  assert.ok(out.rootY > 10 - 1.1 && out.rootY < 10, 'stands up through the blend, from the float height to the bed');
  let s = out;
  for (let i = 0; i < 40; i++) s = swim.update({ dt: 1 / 60, surfaceY: 10, bedY: 10 - 1.1, currentY: 10 - 1.1 });
  assert.equal(s.weight, 0);
  assert.equal(s.rootY, null, 'back on the bed: the ground code owns the feet again');
  // leaving the water mesh altogether (the bank above the water line) also ends the swim
  walkInto(swim);
  assert.equal(swim.update({ dt: 1 / 60, surfaceY: null, bedY: 10.2, currentY: 10.2 }).swimming, false);
});

test('a bridge deck over the river or the top of a jump is dry; a teleport blends from where the hero is', () => {
  const swim = createPlayerSwimState();
  // deep water under a deck the hero stands on: the glue put the feet on the deck, above the water line
  let s = swim.update({ dt: 1 / 60, surfaceY: 10, bedY: 6, currentY: 11.6 });
  assert.equal(s.swimming, false, 'above the surface: not in the water');
  // a jump that comes down into deep water starts the swim from the height it fell from
  s = swim.update({ dt: 1 / 60, surfaceY: 10, bedY: 6, currentY: 9.4 });
  assert.ok(s.entered);
  assert.ok(s.rootY > 10 - SWIM.waterline && s.rootY <= 11.6, 'eases down from the last height, never through the bed');
  // a respawn far away straight into water starts where the hero is now
  const fresh = createPlayerSwimState();
  fresh.update({ dt: 1 / 60, surfaceY: null, bedY: 50, currentY: 50 });
  s = fresh.update({ dt: 1 / 60, surfaceY: 10, bedY: 6, currentY: 6 });
  assert.ok(s.entered && s.rootY < 7, 'not from 40 m up');
});

test('riding, dead or a boss fall: the hero is out of the water at once', () => {
  const swim = createPlayerSwimState();
  walkInto(swim);
  const s = swim.update({ dt: 1 / 60, surfaceY: 10, bedY: 6, currentY: 6, allowed: false });
  assert.deepEqual([s.swimming, s.weight, s.rootY, s.left], [false, 0, null, true]);
  assert.equal(swim.isSwimming(), false);
  swim.reset();
  assert.equal(swim.getState().swimming, false);
});

test('depth, swim states and the throttled "can\'t do that while swimming" notice', () => {
  assert.equal(swimDepth(10, 8.5), 1.5);
  assert.equal(swimDepth(null, 8.5), -Infinity);
  assert.ok(isSwimState(SWIM_STATES.idle) && isSwimState(SWIM_STATES.forward) && !isSwimState('walk'));
  let t = 0; const shown = [];
  const notice = createSwimNotice((text) => shown.push(text), { now: () => t });
  notice('a'); t = 500; notice('a'); notice('b'); t = SWIM.noticeSeconds * 1000 + 1; notice('a'); notice('b');
  assert.deepEqual(shown, ['a', 'b', 'a'], 'each message on its own clock: a refused mount still says so after a refused strike');
  assert.ok(SWIM.enterDepth > SWIM.exitDepth && SWIM.exitDepth > 1, 'stand up chest-deep, swim from neck-deep');
});

// ------------------------------------------------------------------------------------------------ water surface

test('the water surface comes from the water mesh: up-facing triangles in world space, by grid cell', () => {
  const index = createWaterSurfaceIndex({ cellSize: 4 });
  const holder = new THREE.Group();
  holder.position.set(100, 2, -50);
  holder.rotation.y = Math.PI / 2;
  // a 20 x 10 m strip sloping 1 m along its length, plus a waterfall wall that must be ignored
  const strip = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 20, 1, 0, 20, 1, 10, 0, 0, 0, 20, 1, 10, 0, 0, 10,
    0, 0, 0, 0, 6, 0, 0, 6, 10,
  ], 3)));
  holder.add(strip);
  assert.equal(index.addMesh(holder), 2, 'the vertical face is not water to stand in');
  assert.equal(index.addMesh(holder), 0, 'adding the same water twice adds nothing');
  // local (10, y, 5) -> world: rotated a quarter turn about Y, then moved
  const p = new THREE.Vector3(10, 0, 5).applyMatrix4(holder.matrixWorld);
  assert.ok(Math.abs(index.surfaceAt(p.x, p.z) - 2.5) < 1e-6, 'half way up the slope, in world space');
  assert.equal(index.surfaceAt(p.x + 30, p.z), null, 'no water off the strip');
  // two surfaces over one spot: nearY picks the one the hero is at
  const upper = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2).translate(p.x, 30, p.z));
  index.addMesh(upper);
  assert.equal(index.surfaceAt(p.x, p.z), 30, 'the highest without a hint');
  assert.ok(Math.abs(index.surfaceAt(p.x, p.z, 3) - 2.5) < 1e-6, 'the nearest with one');
});

test('on the real Wolfveil river mesh the swim line is the drawn water at every waypoint', () => {
  const group = new THREE.Group();
  group.position.z = 70; // the valley's origin offset in Game 3D (GameWorld3D: originZ 70)
  const world = { group, ownedMaterials: [], mesh(o) { group.add(o); return o; } };
  const river = addWolfveilWater(world, WOLFVEIL_RIVER, { silverWater: true });
  const index = createWaterSurfaceIndex();
  assert.ok(index.addMesh(river.water) > 100);
  for (const [x, z, height] of WOLFVEIL_RIVER.points.slice(1, -1)) {
    const y = index.surfaceAt(x, z + 70);
    if (y === null) continue; // a waypoint under the waterfall's mouth may sit outside the strip
    assert.ok(Math.abs(y - height) < 0.6, `water at (${x}, ${z + 70}) is ${y}, the river's own height ${height}`);
  }
  // the town reach by the torii bridge: 19 m wide water, nothing a few metres past the bank
  assert.ok(Number.isFinite(index.surfaceAt(119, 34 + 70)));
  assert.equal(index.surfaceAt(119 + WOLFVEIL_RIVER.width, 34 + 70), null);
});

// ------------------------------------------------------------------------------------------------ swim clips

test('both fused bodies have the owner\'s swim loops, holding the neck at the origin, bound to their own bones', async () => {
  assert.deepEqual(OWNER_PACK_CLIPS.map((c) => [c.name, c.clip]), [['Swim_Idle', 'swim_idle_loop_fit'], ['Swim_Forward', 'swim_fwd_loop_fit']]);
  const source = await parseGlb(OWNER_PACK_FILE);
  for (const c of OWNER_PACK_CLIPS) assert.ok(source.animations.some((a) => a.name === c.clip), `${c.clip} is in the owner's pack`);
  for (const [name, rigId] of [['Male', 'fused-male-v1'], ['Female', 'fused-female-v1']]) {
    const root = await body(name);
    for (const clipName of ['Swim_Idle', 'Swim_Forward']) {
      const { clip } = await packAsset(rigId, clipName);
      const x = clip.userData;
      assert.equal(x.loop, true, `${name} ${clipName} loops`);
      assert.equal(x.kind, 'swim');
      assert.ok(Math.abs(x.waterline) < 0.1, `${name} ${clipName}: the neck at the origin (${x.waterline})`);
      assert.ok(x.bodyLow < -0.1, 'the body hangs below the water line');
      assert.ok(clipBindsToActor(clip, root), `${name} ${clipName} binds to the body's bones`);
    }
    const forward = (await packAsset(rigId, 'Swim_Forward')).clip.userData;
    assert.ok(forward.speed > 1.1 && forward.speed < 1.6, `${name} stroke speed ${forward.speed}`);
    const scale = locomotionTimeScale(forward.speed, 1, SWIM.speed);
    assert.ok(scale > 1 && scale <= LOCOMOTION_CADENCE.max, 'the strokes speed up to the swimming pace, within a human cadence');
    assert.ok(SWIM.speed / forward.speed <= LOCOMOTION_CADENCE.max + 0.01, 'and the pace needs no glide past the cap');
  }
  assert.match(read('src/components/game3d/player/playerAnimationLibrary.jsx'), /Swim_Idle: 'swimIdle',\s*Swim_Forward: 'swimForward',/);
  assert.match(read('src/components/game3d/player/fusedLocomotionSync.js'), /new Set\(\['walk', 'run', 'sprint', 'swimForward'\]\)/);
});

// ------------------------------------------------------------------------------------------------ controller

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

test('swimming, the controller treads water and swims forward, and refuses jumps, dodges and strikes', async () => {
  const root = await body('Male');
  const base = { ...createPlayerMovementFallbackClips(root), ...nativePlayerAnimationClips(root) };
  const clips = { ...base, swimIdle: (await packAsset('fused-male-v1', 'Swim_Idle')).clip, swimForward: (await packAsset('fused-male-v1', 'Swim_Forward')).clip };
  const { controller, mixer, clock } = controllerFor(root, clips);
  const tick = (seconds) => { for (let t = 0; t < seconds; t += 1 / 60) { clock.seconds += 1 / 60; controller.updateAnimation(1 / 60); mixer.update(1 / 60); } };
  controller.handleMovement?.({ moving: false });
  controller.updateActionState({ moving: false });
  tick(0.3);
  assert.equal(controller.getIsSwimming(), false);
  assert.equal(controller.setSwimming(true), true);
  assert.equal(controller.getCurrent(), SWIM_STATES.idle, 'treading water standing still');
  tick(SWIM.blendSeconds + 0.05);
  assert.ok(controller.actions[SWIM_STATES.idle].getEffectiveWeight() > 0.95, 'blended in over the blend time');
  controller.updateActionState({ moving: true, running: true, sprinting: true });
  assert.equal(controller.getCurrent(), SWIM_STATES.forward, 'swims forward whatever the run / sprint flags say');
  const v = new THREE.Vector3(0, 0, 1);
  assert.equal(controller.requestJump(), false, 'no jump');
  assert.equal(controller.requestDodge(v, 'forward'), false, 'no dodge');
  assert.equal(controller.requestRoll(v, 'backward'), false, 'no roll');
  assert.equal(controller.requestAttack('kick', 1), false, 'no strike');
  assert.equal(controller.requestHitReact('front'), false, 'no hit reaction pulling the body upright');
  assert.equal(controller.requestAirWalkAction({ haloPercent: 100, directionVector: v }).ok, false, 'no glide or Skywalk');
  controller.setSwimming(false);
  controller.updateActionState({ moving: true, running: false });
  assert.ok(!SWIM_STATES.idle.includes(controller.getCurrent()) && !isSwimState(controller.getCurrent()), 'walks out');
  // riding never swims
  controller.setMounted(true);
  assert.equal(controller.setSwimming(true), false);
  controller.setMounted(false);
  // a body without the clips keeps its walk / idle in the water
  const plain = controllerFor(root, base);
  plain.controller.setSwimming(true);
  plain.controller.updateActionState({ moving: false });
  assert.ok(!isSwimState(plain.controller.getCurrent()));
});

// ------------------------------------------------------------------------------------------------ remote players

test('the remote avatar gets the same swim loops retargeted onto its own skeleton, neck at the water line', async () => {
  assert.deepEqual(REMOTE_SWIM_STATES, ['swimIdle', 'swimForward']);
  assert.ok(Object.values(REMOTE_SWIM_SOURCES).every((url) => url.startsWith('/models/animations/mocap/Swim_')));
  // The game's remote avatar is the hosted Mixamo archer FBX; here the female fused body (also mixamorig bones, a
  // different build and rest pose) stands in for it, with the male clip as the source.
  const single = (await body('Female')).clone(true);
  // The hosted archer carries its skeleton four times (one per mesh part): the copies must not scramble the solve.
  const quad = new THREE.Group();
  quad.add((await body('Female')).clone(true));
  for (let i = 0; i < 3; i++) quad.add((await body('Female')).clone(true));
  const meanHeights = (target, clip) => {
    const mixer = new THREE.AnimationMixer(target);
    mixer.clipAction(clip).play();
    const find = (suffix) => { let b = null; target.traverse((o) => { if (!b && new RegExp(suffix + '$').test(o.name)) b = o; }); return b; };
    const sum = { Neck: 0, Hips: 0, LeftFoot: 0 };
    for (let f = 0; f < 8; f++) {
      mixer.setTime((f / 8) * clip.duration);
      target.updateMatrixWorld(true);
      for (const k of Object.keys(sum)) sum[k] += (find(k).getWorldPosition(new THREE.Vector3()).y - target.position.y) / 8;
    }
    mixer.stopAllAction(); mixer.uncacheRoot(target);
    return sum;
  };
  for (const state of REMOTE_SWIM_STATES) {
    const { clip, scene } = await packAsset('fused-male-v1', state === 'swimIdle' ? 'Swim_Idle' : 'Swim_Forward');
    const source = meanHeights((await body('Male')).clone(true), clip);
    for (const [label, target] of [['one skeleton', single], ['four copies', quad]]) {
      const out = retargetClipOnto(scene, clip, target, { name: state });
      assert.equal(out.name, state);
      assert.ok(out.userData.mapped >= 20, `${state}: the body chain maps (${out.userData.mapped})`);
      assert.ok(clipBindsToActor(out, target), `${state} binds to the target's bones`);
      const h = meanHeights(target, out);
      assert.ok(Math.abs(h.Neck) < 0.2, `${state} on ${label}: the neck stays near the origin, the water line (${h.Neck.toFixed(3)})`);
      assert.ok(h.LeftFoot < h.Hips + 0.05, `${state} on ${label}: the feet stay down with the source (${h.LeftFoot.toFixed(2)} vs hips ${h.Hips.toFixed(2)})`);
      assert.ok(Math.abs(h.LeftFoot - source.LeftFoot) < 0.12, `${state} on ${label}: the legs follow the source (${h.LeftFoot.toFixed(2)} / ${source.LeftFoot.toFixed(2)})`);
    }
  }
  const remote = read('src/components/game3d/RemotePlayersManager.jsx');
  assert.match(remote, /loadRemoteSwimClips\(loaded\.model\)/);
  assert.match(remote, /REMOTE_SWIM_STATES\.includes\(anim\) \? swimTarget\(r, anim\)/);
  assert.match(remote, /anim === 'swimForward' \? 'run' : 'idle'/, 'without the clips a swimmer shows the run / idle');
});

// ------------------------------------------------------------------------------------------------ camera and world

test('the camera keeps above the water line and the world wires the swim around the ground code', () => {
  const water = (x) => (x < 10 ? 5 : null);
  assert.deepEqual(keepEyeAboveWater({ x: 0, y: 5.1, z: 0 }, water), { x: 0, y: 5 + WATER_CAMERA_CLEARANCE, z: 0 });
  assert.deepEqual(keepEyeAboveWater({ x: 0, y: 8, z: 0 }, water), { x: 0, y: 8, z: 0 });
  assert.deepEqual(keepEyeAboveWater({ x: 20, y: 1, z: 0 }, water), { x: 20, y: 1, z: 0 }, 'no water under the eye');
  assert.deepEqual(keepEyeAboveWater({ x: 0, y: 1, z: 0 }, null), { x: 0, y: 1, z: 0 });
  const camera = read('src/components/game3d/player/PlayerCameraSystem.jsx');
  assert.match(camera, /const dry=keepEyeAboveWater\(safe\.eye,this\.waterSurfaceAt\);/, 'lock-on framing too');
  assert.match(camera, /eye=keepEyeAboveWater\(eye,this\.waterSurfaceAt\);\s*this\.camera\.position\.set\(eye\.x,eye\.y,eye\.z\);/);

  const world = read('src/components/game3d/GameWorld3D.jsx');
  assert.match(world, /if \(wolfveilVillage\?\.river\?\.water\) waterSurface\.addMesh\(wolfveilVillage\.river\.water\);/);
  assert.match(world, /if \(vortexLake\?\.water\) waterSurface\.addMesh\(vortexLake\.water\);/);
  assert.match(world, /playerCameraSystem\.waterSurfaceAt = \(x, z, nearY\) => waterSurface\.surfaceAt\(x, z, nearY\);/);
  // the swim runs after the feet were glued (the glue itself is not touched) and before the physics bookkeeping
  const glue = world.indexOf('// Glue player feet to terrain');
  const swimBlock = world.indexOf('const swim = playerSwim.update({');
  const physics = world.indexOf('// The world physics remains the single source of truth for grounded');
  assert.ok(glue > 0 && glue < swimBlock && swimBlock < physics, 'after the glue, before the airborne state');
  assert.match(world, /if \(swim\.entered \|\| swim\.left\) playerAnim\?\.setSwimming\?\.\(swim\.swimming\);\s*if \(swim\.rootY !== null\) model\.position\.y = swim\.rootY;/);
  assert.match(world, /allowed: !mounted && !bossFallActive && !dedicatedMode && getPlayerHUD\(\)\.hp > 0,/);
  // one pace: no run or sprint, the swim speed
  assert.match(world, /const isSprinting = !!keys\.current\['control'\] && isMoving && !swimmingNow;/);
  assert.match(world, /const baseMoveSpeed=swimmingNow\?SWIM\.speed:airTravel/);
  // refused in the water: mounting (F), the jump chain (Space), strikes and skills; a mount stops at deep water
  assert.match(world, /if \(!isMountedRef\.current && playerSwim\.isSwimming\(\)\) \{ if \(!e\.repeat\) swimNotice\("You can't mount while swimming"\); \}/);
  assert.match(world, /else if\(!e\.repeat && !isMountedRef\.current && playerSwim\.isSwimming\(\)\)\{ \/\* treading water \*\/ \}/);
  assert.match(world, /if \(playerSwim\.isSwimming\(\) && \(attackPressed\.current \|\| abilityKeyPressed\.current !== -1\)\) \{/);
  assert.ok(world.indexOf('if (playerSwim.isSwimming() && (attackPressed.current') < world.indexOf('if (abilityKeyPressed.current !== -1 && model) {'),
    'the skill key is dropped before the skills fire');
  assert.match(world, /if\(depth>=SWIM\.enterDepth && depth>waterDepthAt\(fromX,fromZ,model\.position\.y\)\+\.01\)\{/);
  // the area gate goes first (WolfveilGateTravel); once a crossing has started the water does not hold the mount back
  assert.match(world, /pushAreaGate\(model,fromX,fromZ,move\.x\*speed\*delta,move\.z\*speed\*delta\);\s*(\/\/[^\n]*\n\s*)*if\(mounted && !mountFlight\.isAirborne\(\) && !areaTravelStarted\)\{/);
  assert.match(world, /else if\(mountFlight\.isAirborne\(\)&&waterDepthAt\(model\.position\.x,model\.position\.z,model\.position\.y\)>=SWIM\.enterDepth\)/);
  // a flying mount keeps its height over the water line, not the bed, and the depth comes in as it climbs
  assert.match(world, /const waterLift = waterY !== null && waterY > gy\s*\? \(waterY - gy\) \* Math\.min\(1, flight\.altitude \/ MOUNT_FLIGHT\.cruiseAltitude\) : 0;/);
  assert.match(world, /if\(window\.__gw3dWater===waterSurface\)window\.__gw3dWater=null;/);
});
