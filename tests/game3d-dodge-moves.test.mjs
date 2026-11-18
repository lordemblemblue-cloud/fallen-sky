// Dodges on the Luna dashboard controls (owner, 2026-11): the keys point on screen like WASD movement, the eight-way
// move comes from where that points relative to the body, and the eight-way slots play the authored side flips,
// back flip and forward roll (tools/avatar-motion/author-dodges.py -> dodges.glb), retargeted onto every body.
// Compared on Eve and Artemis before porting: the generated placeholder rolls pushed a hand 17-22 cm through the
// floor on the fused bodies; the authored moves stay above it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { readGlb } from '../tools/avatar-motion/glb-io.mjs';
import {
  DODGE_CLIPS, DODGE_TRAVEL, EIGHT_WAY_DODGE_PACK_SLOTS, canonicalBone, dodgeTravelShare, dodgeTravelStep,
} from '../src/components/game3d/player/dodgeMoves.js';
import { EIGHT_WAY_DODGE_MOVES, SIDE_ROLL_VARIANTS } from '../src/components/game3d/player/game3dEightWayDodge.mjs';
import { getInputDodge } from '../src/components/game3d/player/characterDodgeVector.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const PACK = 'public/models/animations/dodges/dodges.glb';

test('the dodge pack ships the four authored moves, each short enough to feel snappy', () => {
  const glb = readGlb(PACK);
  const names = (glb.json.animations || []).map((a) => a.name).sort();
  assert.deepEqual(names, ['Back_Flip', 'Flip_Left', 'Flip_Right', 'Front_Roll']);
  for (const name of Object.values(DODGE_CLIPS)) assert.ok(names.includes(name), name);
  for (const anim of glb.json.animations) {
    const times = glb.json.accessors[anim.samplers[0].input];
    assert.ok(times.max[0] > 0.5 && times.max[0] < 0.85, `${anim.name} lasts ${times.max[0]} s`);
    assert.ok(DODGE_TRAVEL[anim.name]?.distance > 2, `${anim.name} has a travel distance`);
  }
});

test('the pack rig rests exactly like the fused female body, so its clips line up joint for joint', () => {
  const pack = readGlb(PACK).json, body = readGlb('public/models/characters/fused/Female_Fused_v2.glb').json;
  const restOf = (J) => new Map(J.nodes.filter((n) => /^mixamorig:/.test(n.name || '')).map((n) => [n.name, n.rotation || [0, 0, 0, 1]]));
  const a = restOf(pack), b = restOf(body);
  assert.ok(a.size >= 50, 'pack has the full Mixamo skeleton');
  for (const [name, q] of a) {
    assert.ok(b.has(name), `${name} missing on the body`);
    const r = b.get(name), dot = Math.abs(q[0] * r[0] + q[1] * r[1] + q[2] * r[2] + q[3] * r[3]);
    assert.ok(dot > 0.9999, `${name} rest rotation differs`);
  }
});

test('v5 Unreal-style bones map onto the Mixamo names the pack uses', () => {
  assert.equal(canonicalBone('mixamorig:LeftUpLeg'), 'LeftUpLeg');
  assert.equal(canonicalBone('mixamorigHips'), 'Hips');
  assert.equal(canonicalBone('pelvis'), 'Hips');
  assert.equal(canonicalBone('thigh_r'), 'RightUpLeg');
  assert.equal(canonicalBone('spine_02'), 'Spine2');
});

test('travel happens only while airborne / rolling, and covers exactly the dash distance', () => {
  const travel = DODGE_TRAVEL.Flip_Left;
  assert.equal(dodgeTravelShare(travel, 0), 0);
  assert.equal(dodgeTravelShare(travel, travel.start * 0.9), 0, 'no travel in the crouch before take-off');
  assert.equal(dodgeTravelShare(travel, 1), 1);
  const move = { dir: new THREE.Vector3(1, 0, 0), travel, duration: 0.44, elapsed: 0, distance: 2.77 };
  let x = 0, z = 0, crouch = 0;
  for (let t = 0; t < 0.6; t += 1 / 60) {
    const [dx, dz] = dodgeTravelStep(move, 1 / 60);
    x += dx; z += dz;
    if (t < travel.start * 0.44 * 0.9) crouch += Math.abs(dx);
  }
  assert.ok(Math.abs(x - 2.77) < 1e-9 && Math.abs(z) < 1e-12, `travelled ${x}`);
  assert.equal(crouch, 0, 'nothing moves before take-off');
  assert.equal(move.elapsed, 0.44);
});

test('every eight-way slot (and the R side rolls) plays an authored move', () => {
  const slots = [...EIGHT_WAY_DODGE_MOVES, ...SIDE_ROLL_VARIANTS].map((m) => m.key).sort();
  assert.deepEqual(Object.keys(EIGHT_WAY_DODGE_PACK_SLOTS).sort(), slots);
  for (const source of Object.values(EIGHT_WAY_DODGE_PACK_SLOTS)) assert.ok(DODGE_CLIPS[source], source);
  assert.equal(EIGHT_WAY_DODGE_PACK_SLOTS.dodgeStepLeft, 'dodgeLeft', 'the quick side dodge is a side flip');
  assert.equal(EIGHT_WAY_DODGE_PACK_SLOTS.dodgeRollBackward, 'dodgeBackward', 'R alone is the back flip');
});

test('a dodge goes where the keys point on screen; the eight-way move follows the body', () => {
  const facing = (x, z) => { const o = new THREE.Object3D(); o.rotation.y = Math.atan2(x, z); o.updateMatrixWorld(true); return o; };
  const near = (v, x, z) => Math.abs(v.x - x) < 1e-9 && Math.abs(v.z - z) < 1e-9;
  // Orbit yaw 0: the camera looks down -Z, screen-right is +X.
  const towardCamera = facing(0, 1), awayFromCamera = facing(0, -1), runningLeft = facing(-1, 0);
  let d = getInputDodge(awayFromCamera, 0, { left: true });
  assert.ok(near(d.vector, -1, 0) && d.direction === 'left', 'camera behind: A flips to screen-left');
  d = getInputDodge(towardCamera, 0, { left: true });
  assert.ok(near(d.vector, -1, 0), 'facing the camera, A still goes screen-left');
  assert.equal(d.direction, 'right', '... which is the body\'s right side');
  d = getInputDodge(runningLeft, 0, { left: true });
  assert.equal(d.direction, 'forward', 'running left and tapping A again rolls on along the run');
  d = getInputDodge(awayFromCamera, 0, { forward: true, right: true });
  assert.equal(d.direction, 'forwardRight');
  assert.ok(near(d.vector, Math.SQRT1_2, -Math.SQRT1_2), 'diagonals are unit length');
  d = getInputDodge(awayFromCamera, 0, {}, { fallback: 'backward' });
  assert.ok(near(d.vector, 0, 1) && d.direction === 'backward', 'R alone rolls backward from the body');
  const basis = { forward: new THREE.Vector3(1, 0, 0), right: new THREE.Vector3(0, 0, 1) };
  d = getInputDodge(facing(1, 0), 0, { forward: true }, { basis });
  assert.ok(near(d.vector, 1, 0) && d.direction === 'forward', 'locked on, W dodges toward the target');
});

test('Game 3D wires the screen-relative dodge, the authored slots, their travel and the dashboard mouse look', () => {
  const world = read('src/components/game3d/GameWorld3D.jsx');
  assert.match(world, /getInputDodge\(model, orbit\.current\.yaw, \{/);
  assert.match(world, /const getAirJumpVector = \(\) => \(model \? getCharacterDodge\(model, \{/, 'the Air Jump keeps its body-relative aim');
  assert.match(world, /const vector=getAirJumpVector\(\);/);
  assert.match(world, /const roll=getDodgeVectorAndName\('r'\);/);
  assert.doesNotMatch(world, /if \(!captured && !drag\.current\.active\) return;/, 'no lock-or-drag-only mouse gate');
  assert.match(world, /e\.target === renderer\.domElement && !isAXEClickToMoveEnabled\(\)/, 'hover free-look over the world canvas');
  assert.match(world, /model\.quaternion\.slerp\(targetQ, Math\.min\(1, delta \* 12\)\)/, 'dashboard turn rate');
  const lib = read('src/components/game3d/player/playerAnimationLibrary.jsx');
  const natives = lib.indexOf('Object.assign(clipsByKey,withUprightStanding(target, nativePlayerAnimationClips(target)));');
  const pack = lib.indexOf('await loadDodgeClips(target)'), montage = lib.indexOf('Object.assign(clipsByKey,await montagePromise);');
  assert.ok(natives > 0 && pack > natives && montage > pack, 'pack after the native side-hops, before the owner montage');
  assert.match(lib, /if\(chosen\.has\(slot\)\|\|!pack\[source\]\)continue;/, 'never over an admin upload');
  const ctrl = read('src/components/game3d/player/LunaDashboardPlayerController.jsx');
  assert.match(ctrl, /distance: speed \* Math\.min\(\.68,timing\.duration\) \};/, 'the same distance as the constant-speed dash');
  assert.match(ctrl, /const \[dx, dz\] = dodgeTravelStep\(travelMove, dt\);/);
});
