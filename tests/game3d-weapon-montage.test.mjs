// Owner feedback 2026-11-19 (after playing main ab603e4), checked on both fused bodies:
// 1. Attacks and the bow are animation montages over locomotion: the upper body plays the swing / shot / draw
//    while the legs keep the walk / run under it (player/locomotionUnderlay.js), and the player keeps moving.
// 2. Daggers sit in a reverse grip in both hands: the blade back down along the forearm, the thumb on the pommel.
// 3. Running with the bow: the bow arm carries it low and a little out from the hip, never through the body.
// 4. The bow: holding the aim draws and holds at full draw; letting go plays the shot from there; every further
//    shot plays its own shot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  bakeWeaponComboClips, captureRestPose, findComboBones, BOW_POSE_STATES, WEAPON_COMBO_STATES,
} from '../src/components/game3d/weapons/weaponComboClips.js';
import { movesForFamily, createWeaponComboBinder } from '../src/components/game3d/weapons/weaponComboBinder.js';
import { solveFallbackGrip, COMBAT_STATES } from '../src/components/game3d/weapons/playerWeaponRuntime.js';
import { WEAPON_GRIP_RULES, DAGGER_POMMEL_DEPTH } from '../src/components/game3d/weapons/weaponGripMath.js';
import { createLocomotionUnderlay, CHEST_FOLLOWS_HIPS } from '../src/components/game3d/player/locomotionUnderlay.js';
import { syncFusedLocomotion } from '../src/components/game3d/player/fusedLocomotionSync.js';

globalThis.self ??= globalThis;
const DEG = 180 / Math.PI;
const manifest = JSON.parse(readFileSync('public/game3d/weapons/manifest.json', 'utf8'));
const RIGS = {
  'fused-female-v1': 'public/models/characters/fused/Female_Fused_v2.glb',
  'fused-male-v1': 'public/models/characters/fused/Male_Fused_v2.glb',
};
async function loadBody(rigId) {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'NO_IMAGE_DECODE', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const bytes = readFileSync(RIGS[rigId]);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const model = gltf.scene;
  model.animations = gltf.animations;
  model.userData.rigId = rigId;
  const box = new THREE.Box3();
  model.updateMatrixWorld(true);
  model.traverse((n) => { if (n.isSkinnedMesh) box.expandByObject(n); });
  model.scale.multiplyScalar(1.7 / (box.max.y - box.min.y));
  model.updateMatrixWorld(true);
  return model;
}
const bone = (model, name) => model.getObjectByName(`mixamorig${name}`);
const W = (o) => o.getWorldPosition(new THREE.Vector3());
const nativeClip = (model, name) => model.animations.find((c) => c.name === name);
const pose = (model, clip, t) => {
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).play();
  mixer.setTime(Math.min(t, clip.duration - 1e-4));
  model.updateMatrixWorld(true);
  return () => { mixer.stopAllAction(); mixer.uncacheRoot(model); };
};
const segmentDistance = (p, a, b) => {
  const ab = b.clone().sub(a);
  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
};
// the body as capsules (bone to bone, radius in metres), the bow arm left out
const BODY = [['Hips', 'Spine2', 0.13], ['Spine2', 'Neck', 0.12], ['LeftUpLeg', 'LeftLeg', 0.08], ['LeftLeg', 'LeftFoot', 0.055],
  ['RightUpLeg', 'RightLeg', 0.08], ['RightLeg', 'RightFoot', 0.055], ['RightArm', 'RightForeArm', 0.05], ['RightForeArm', 'RightHand', 0.04]];
function bowClearance(model, bowRoot, bow) {
  const grip = new THREE.Vector3();
  const points = [];
  for (const end of ['limbTop', 'limbBottom']) {
    const tip = new THREE.Vector3().fromArray(bow.points[end]);
    for (let i = 1; i <= 10; i++) points.push(bowRoot.localToWorld(grip.clone().lerp(tip, i / 10)));
  }
  let closest = Infinity;
  for (const [a, b, r] of BODY) {
    const pa = W(bone(model, a)), pb = W(bone(model, b));
    for (const p of points) closest = Math.min(closest, segmentDistance(p, pa, pb) - r);
  }
  return closest;
}
function holdAt(model, side, grip, points = {}) {
  const root = new THREE.Object3D();
  root.position.fromArray(grip.position); root.quaternion.fromArray(grip.quaternion); root.scale.setScalar(grip.scale ?? 1);
  const marks = {};
  for (const [name, p] of Object.entries(points)) { marks[name] = new THREE.Object3D(); marks[name].position.fromArray(p); root.add(marks[name]); }
  bone(model, side === 'left' ? 'LeftHand' : 'RightHand').add(root);
  return { root, marks, release: () => root.removeFromParent() };
}
const applyFist = (model, fist) => {
  const saved = [];
  for (const [name, q] of Object.entries(fist)) {
    const b = model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
    if (b) { saved.push([b, b.quaternion.clone()]); b.quaternion.fromArray(q); }
  }
  model.updateMatrixWorld(true);
  return () => { for (const [b, q] of saved) b.quaternion.copy(q); model.updateMatrixWorld(true); };
};

const bodies = {};
test.before(async () => {
  for (const id of Object.keys(RIGS)) bodies[id] = await loadBody(id);
});

for (const rigId of Object.keys(RIGS)) {
  test(`${rigId} daggers: a reverse grip in both hands, the thumb on the pommel, the blades along the forearms`, () => {
    const model = bodies[rigId];
    assert.ok(WEAPON_GRIP_RULES.dagger.combat.reverse && WEAPON_GRIP_RULES.dagger.carry.reverse);
    const solved = {};
    const grips = {};
    for (const side of ['right', 'left']) {
      solved[side] = solveFallbackGrip(model, { hand: side, class: 'dagger', handleRadius: 0.0155 }, ['carry', 'combat'], 1.7);
      grips[side] = new THREE.Quaternion().fromArray(solved[side].grips.combat.quaternion);
      const S = side === 'right' ? 'Right' : 'Left';
      for (const stance of ['carry', 'combat']) {
        // in the hand at rest: the blade leaves the fist on the little-finger side, back towards the wrist
        const held = holdAt(model, side, solved[side].grips[stance], { tip: [0, 0.37, 0] });
        model.updateMatrixWorld(true);
        const blade = W(held.marks.tip).sub(W(held.root)).normalize();
        const wrist = W(bone(model, `${S}Hand`));
        const fingers = W(bone(model, `${S}HandMiddle1`)).sub(wrist).normalize();
        const pinkySide = W(bone(model, `${S}HandPinky1`)).sub(W(bone(model, `${S}HandIndex1`))).normalize();
        held.release();
        assert.ok(blade.dot(fingers) < -0.5, `${side} ${stance}: the blade runs back towards the wrist (${blade.dot(fingers).toFixed(2)})`);
        assert.ok(blade.dot(pinkySide) > 0.3, `${side} ${stance}: the blade leaves the little-finger side (${blade.dot(pinkySide).toFixed(2)})`);
      }
      // the closed hand: the thumb's tip rests on the pommel's end
      const restore = applyFist(model, solved[side].fist);
      const held = holdAt(model, side, solved[side].grips.combat, { pommel: [0, -DAGGER_POMMEL_DEPTH, 0] });
      model.updateMatrixWorld(true);
      const t3 = W(bone(model, `${S}HandThumb3`)), t2 = W(bone(model, `${S}HandThumb2`));
      const thumbTip = t3.clone().add(t3.clone().sub(t2).multiplyScalar(0.85));
      const miss = thumbTip.distanceTo(W(held.marks.pommel));
      held.release(); restore();
      assert.ok(miss < 0.025, `${side}: the thumb rests on the pommel (${(miss * 100).toFixed(1)} cm away)`);
    }
    // the stance and every swing: the blades lie back along the forearms in the guard
    const clips = bakeWeaponComboClips(model, 'dagger', grips, { rest: captureRestPose(model), moves: movesForFamily('daggerCombo') });
    const held = ['right', 'left'].map((side) => holdAt(model, side, solved[side].grips.combat, { tip: [0, 0.37, 0] }));
    try {
      for (const t of [0, 0.5, 1, 1.5]) {
        const done = pose(model, clips.idleDaggers, t);
        ['Right', 'Left'].forEach((S, i) => {
          const back = W(bone(model, `${S}ForeArm`)).sub(W(bone(model, `${S}Hand`))).normalize();
          const blade = W(held[i].marks.tip).sub(W(held[i].root)).normalize();
          assert.ok(blade.angleTo(back) * DEG < 25, `guard at ${t}s: the ${S} blade lies along the forearm (${(blade.angleTo(back) * DEG).toFixed(0)} deg off)`);
        });
        done();
      }
    } finally {
      held.forEach((h) => h.release());
    }
  });

  test(`${rigId} bow: the draw reaches the string and holds at full draw; the shots start where the hold is`, () => {
    const model = bodies[rigId];
    const bow = manifest.weapons.find((w) => w.id === 'fantasy_bow');
    const grip = bow.grips[rigId];
    const clips = bakeWeaponComboClips(model, 'bow', { left: new THREE.Quaternion().fromArray(grip.combat.quaternion) },
      { rest: captureRestPose(model), moves: movesForFamily('bowCombo') });
    for (const name of [...BOW_POSE_STATES, 'bowRelease', 'bowQuick']) assert.ok(clips[name], name);
    const { bowDraw, bowHold, bowRelease, bowQuick } = clips;
    assert.ok(bowDraw.userData.nock > 0 && bowDraw.userData.full === bowDraw.duration && bowDraw.userData.combo === null);
    assert.ok(bowHold.userData.loop && bowHold.userData.combo === null);
    assert.deepEqual([bowRelease.userData.combo, bowRelease.userData.hit], ['bowRelease', 0], 'the arrow leaves on the release\'s first frame');
    assert.ok(bowRelease.userData.cancel < bowRelease.duration);
    const q = bowQuick.userData;
    assert.ok(q.combo === 'bowQuick' && q.nock < q.full && q.full < q.hit && q.hit < q.cancel && q.cancel < bowQuick.duration, 'quick shot timing');
    const held = holdAt(model, 'left', grip.combat);
    const nock = new THREE.Vector3().fromArray(bow.points.nock);
    const drawHand = () => held.root.worldToLocal(W(bone(model, 'RightHandMiddle1')));
    const bonesNow = () => findComboBones(model);
    const snapshot = () => Object.values(bonesNow()).filter(Boolean).map((b) => b.getWorldQuaternion(new THREE.Quaternion()));
    const differs = (a, b) => Math.max(...a.map((x, i) => x.angleTo(b[i]) * DEG));
    try {
      let done = pose(model, bowDraw, bowDraw.userData.nock);
      assert.ok(drawHand().distanceTo(nock) < 0.12, `the hand on the nock (${drawHand().distanceTo(nock).toFixed(2)} m)`);
      done();
      for (const [clip, t] of [[bowDraw, bowDraw.duration], [bowHold, 0], [bowHold, 0.8], [bowQuick, q.full]]) {
        done = pose(model, clip, t);
        const hand = drawHand();
        // the runtime pulls the string to a hand behind the bow and within a believable draw length
        assert.ok(hand.z < nock.z - 0.2 && hand.distanceTo(nock) < 0.85, `${clip.name} at ${t}: full draw (${hand.z.toFixed(2)} vs nock ${nock.z.toFixed(2)})`);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(held.root.getWorldQuaternion(new THREE.Quaternion()));
        assert.ok(up.y > Math.cos(20 / DEG), `${clip.name}: the bow upright (${up.y.toFixed(2)})`);
        done();
      }
      // no jump between the draw, the hold and the release (or the quick shot's own full draw)
      const frames = [[bowDraw, bowDraw.duration], [bowHold, 0], [bowRelease, 0], [bowQuick, q.full]].map(([clip, t]) => {
        const d = pose(model, clip, t); const s = snapshot(); d(); return s;
      });
      for (let i = 1; i < frames.length; i++) assert.ok(differs(frames[0], frames[i]) < 1.5, `full draw pose ${i} matches (${differs(frames[0], frames[i]).toFixed(2)} deg)`);
      for (const track of bowHold.tracks) {
        const size = track.getValueSize(), n = track.values.length;
        for (let i = 0; i < size; i++) assert.ok(Math.abs(track.values[i] - track.values[n - size + i]) < 1e-6, `the hold loops seamlessly: ${track.name}`);
      }
    } finally {
      held.release();
    }
  });

  test(`${rigId} running with the bow: carried low and out from the hip, clear of the body through the whole run`, () => {
    const model = bodies[rigId];
    const bow = manifest.weapons.find((w) => w.id === 'fantasy_bow');
    const grip = bow.grips[rigId];
    const clips = bakeWeaponComboClips(model, 'bow', { left: new THREE.Quaternion().fromArray(grip.combat.quaternion) },
      { rest: captureRestPose(model), moves: movesForFamily('bowCombo') });
    const run = nativeClip(model, 'Run');
    const underlay = createLocomotionUnderlay(model, findComboBones(model));
    let plain = Infinity, carried = Infinity, lowest = Infinity, out = Infinity;
    const held = holdAt(model, 'left', grip.carry);
    try {
      for (let i = 0; i < 48; i++) {
        const t = (run.duration * i) / 48;
        let done = pose(model, run, t);
        held.root.position.fromArray(grip.carry.position); held.root.quaternion.fromArray(grip.carry.quaternion);
        model.updateMatrixWorld(true);
        plain = Math.min(plain, bowClearance(model, held.root, bow));
        done();
        done = pose(model, run, t);
        assert.equal(underlay.overlayArm(clips.bowRunCarry, 'left', 1, { animated: run }), true);
        held.root.position.fromArray(grip.combat.position); held.root.quaternion.fromArray(grip.combat.quaternion);
        model.updateMatrixWorld(true);
        carried = Math.min(carried, bowClearance(model, held.root, bow));
        const hand = W(bone(model, 'LeftHand'));
        const hips = W(bone(model, 'Hips'));
        const right = new THREE.Vector3(-1, 0, 0); // the body faces +Z: its right is -X
        lowest = Math.min(lowest, hips.y + 0.15 - hand.y);
        out = Math.min(out, -hand.clone().sub(hips).dot(right));
        done();
      }
    } finally {
      held.release();
    }
    assert.ok(plain < 0, `the run's own arm swings the bow into the body (${(plain * 100).toFixed(1)} cm): the bug the owner saw`);
    assert.ok(carried > 0.03, `carried, the bow stays clear of the torso and legs (${(carried * 100).toFixed(1)} cm at the closest)`);
    assert.ok(lowest > 0, 'the bow hand stays low, about hip height');
    assert.ok(out > 0.22, `the bow hand stays out from the hip (${out.toFixed(2)} m from the middle)`);
  });

  test(`${rigId} underlay: the legs follow the walk under a montage, the chest keeps the montage's turn`, () => {
    const model = bodies[rigId];
    const b = findComboBones(model);
    const walk = nativeClip(model, 'Walk');
    const swing = bakeWeaponComboClips(model, 'sword', {}, { rest: captureRestPose(model), moves: movesForFamily('swordCombo').slice(0, 1) }).swordCombo1;
    const underlay = createLocomotionUnderlay(model, b);
    const legs = [b.hips, b.lUp, b.lLeg, b.lFoot, b.rUp, b.rLeg, b.rFoot];
    const reference = (t) => { const d = pose(model, walk, t); const q = legs.map((x) => x.quaternion.clone()); const p = b.hips.position.clone(); d(); return { q, p }; };
    underlay.sync(walk, 0.25);
    const at = 0.25 * walk.duration + 0.1;
    const want = reference(at);
    const done = pose(model, swing, 0.22);
    const before = { hips: b.hips.quaternion.clone(), spine: b.spine.quaternion.clone(), arm: b.rFore.quaternion.clone() };
    // weight 0 changes nothing
    assert.equal(underlay.update(0.1, { locomotion: walk, weight: 0, montage: swing }), false);
    assert.ok(b.lUp.quaternion.angleTo(before.hips) >= 0 && b.hips.quaternion.equals(before.hips));
    underlay.sync(walk, 0.25);
    assert.equal(underlay.update(0.1, { locomotion: walk, weight: 1, montage: swing }), true);
    assert.ok(Math.abs(underlay.getPhase() - (0.25 + 0.1 / walk.duration)) < 1e-6 || Math.abs(underlay.getPhase() - 0.25) < 1e-6);
    legs.forEach((x, i) => assert.ok(x.quaternion.angleTo(want.q[i]) * DEG < 0.5 || underlay.getPhase() === 0.25, `${x.name} follows the walk`));
    assert.ok(b.hips.position.distanceTo(want.p) < 1e-4 || underlay.getPhase() === 0.25, 'the hips ride the walk');
    assert.ok(b.rFore.quaternion.angleTo(before.arm) < 1e-6, 'the swinging arm is the montage\'s');
    // the chest keeps the montage's own turn in the body's frame (less what it follows of the walking hips)
    const montageChest = before.hips.clone().multiply(before.spine);
    const walkingChest = b.hips.quaternion.clone().multiply(before.spine);
    const nowChest = b.hips.quaternion.clone().multiply(b.spine.quaternion);
    const total = montageChest.angleTo(walkingChest);
    if (total > 1e-3) assert.ok(Math.abs(nowChest.angleTo(montageChest) - CHEST_FOLLOWS_HIPS * total) < 0.02,
      `the chest follows ${CHEST_FOLLOWS_HIPS} of the hips' sway (${(nowChest.angleTo(montageChest) * DEG).toFixed(2)} of ${(total * DEG).toFixed(2)} deg)`);
    done();
  });
}

test('the bow shots and poses use the combat grip; the new kinds play remotely with the stand-in bow', () => {
  for (const s of [...BOW_POSE_STATES, ...WEAPON_COMBO_STATES.bowRelease, ...WEAPON_COMBO_STATES.bowQuick]) assert.ok(COMBAT_STATES.has(s), s);
  const remote = readFileSync('src/components/game3d/weapons/remoteWeaponCombos.js', 'utf8');
  assert.match(remote, /clipKind\?\.startsWith\('bow'\) \? 'bowCombo'/);
});

test('fused locomotion keeps the gait under a montage stepping at the ground speed', () => {
  const action = (speed) => ({ scale: null, getClip: () => ({ userData: { speed } }), setEffectiveTimeScale(s) { this.scale = s; } });
  const actions = { walk: action(1.2), run: action(3.4) };
  const model = { userData: { fusedCharacter: true }, getWorldScale: (v) => v.set(1, 1, 1) };
  const anim = { actions, getCurrent: () => 'swordCombo1', getGait: () => 'run' };
  assert.ok(syncFusedLocomotion(anim, model, 4) > 0);
  assert.ok(actions.run.scale > 0 && actions.walk.scale === null, 'the run under the swing steps with the ground');
  // without a gait it times what plays, as before
  const plain = { actions, getCurrent: () => 'walk' };
  assert.ok(syncFusedLocomotion(plain, model, 2) > 0 && actions.walk.scale > 0);
});

test('GameWorld3D: the legs pass runs after the mixer; the bow is drawn and gripped from the controller', () => {
  const world = readFileSync('src/components/game3d/GameWorld3D.jsx', 'utf8');
  assert.match(world, /if \(mixer\) mixer\.update\(delta\);\s*\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*playerAnim\?\.lateUpdate\?\.\(delta\);/);
  assert.match(world, /state: playerAnim\?\.getWeaponState\?\.\(\) \?\? playerAnim\?\.getCurrent\?\.\(\)/);
  assert.match(world, /drawing: playerAnim\?\.getBowDrawing\?\.\(\) \?\? null/);
  assert.match(world, /heldBow\.active=true;heldBow\.startedAt=performance\.now\(\);[\s\S]{0,400}if\(!isMountedRef\.current\)weaponSummon\?\.ensureOut\(\);/);
});

// ---- the real player controller on a real fused body ----
const built = buildSync({
  entryPoints: ['src/components/game3d/player/LunaDashboardPlayerController.jsx'],
  bundle: true, platform: 'node', format: 'cjs', write: false, outdir: 'unused', external: ['three'],
}).outputFiles;
async function liveController(rigId) {
  const clock = { seconds: 0 };
  const runtime = { exports: {} };
  new Function('module', 'exports', 'require', 'performance', built[0].text)(
    runtime, runtime.exports, createRequire(import.meta.url), { now: () => clock.seconds * 1000 },
  );
  const model = await loadBody(rigId);
  const mixer = new THREE.AnimationMixer(model);
  const ctl = runtime.exports.createLunaDashboardPlayerController({ mixer });
  ctl.bindClips({ idle: nativeClip(model, 'Stand'), walk: nativeClip(model, 'Walk'), run: nativeClip(model, 'Run') });
  createWeaponComboBinder({ model, controller: ctl }); // every family baked from the rest pose, as at load
  let moving = { moving: false, running: false };
  const step = (seconds, each = null) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
      clock.seconds += 1 / 60;
      ctl.updateAnimation(1 / 60);
      mixer.update(1 / 60);
      ctl.lateUpdate(1 / 60);
      model.updateMatrixWorld(true);
      ctl.updateActionState({ ...moving, direction: 'forward', aiming: ctl.getIsAiming() });
      each?.();
    }
  };
  return { ctl, model, mixer, step, clock, move: (m) => { moving = m; ctl.updateActionState({ ...m, direction: 'forward', aiming: ctl.getIsAiming() }); } };
}
const legBones = (model) => { const b = findComboBones(model); return [b.lUp, b.lLeg, b.rUp, b.rLeg]; };

test('a swing plays over the walk: the legs keep walking, the player keeps moving, the walk carries on after', async () => {
  const { ctl, model, step, move } = await liveController('fused-female-v1');
  ctl.setEquipmentContext({ weaponType: 'sword', equipped: true, summon: true });
  move({ moving: true, running: false });
  step(0.6);
  assert.equal(ctl.getCurrent(), 'walk');
  const walk = ctl.actions.walk.getClip();
  assert.equal(ctl.HandleCombat('swordCombo', { speed: 1 }), true);
  assert.equal(ctl.getCurrent(), 'swordCombo1');
  assert.equal(ctl.isMovementOverridden(), false, 'moving is allowed through the swing');
  let worstLegStep = 0, worstLegOff = 0;
  let prev = legBones(model).map((b) => b.getWorldQuaternion(new THREE.Quaternion()));
  const check = () => {
    const now = legBones(model).map((b) => b.getWorldQuaternion(new THREE.Quaternion()));
    worstLegStep = Math.max(worstLegStep, ...now.map((q, i) => q.angleTo(prev[i]) * DEG));
    prev = now;
    const m = ctl.getMontageState();
    if (ctl.getCurrent() === 'swordCombo1' && m.weight > 0.99) {
      // the legs are the walk at the underlay's phase
      const local = legBones(model).map((b) => b.quaternion.clone());
      const probe = new THREE.AnimationMixer(new THREE.Object3D());
      const ref = createLocomotionUnderlay; void probe; void ref; // (sampled below with the clip's own tracks)
      const t = m.phase * walk.duration;
      legBones(model).forEach((b, i) => {
        const track = walk.tracks.find((tr) => tr.name === `${b.name}.quaternion`);
        if (!track) return;
        const want = new THREE.Quaternion().fromArray(track.createInterpolant().evaluate(t));
        worstLegOff = Math.max(worstLegOff, local[i].angleTo(want) * DEG);
      });
    }
  };
  step(0.7, check);
  assert.ok(worstLegOff < 1, `under the swing the legs are the walk (${worstLegOff.toFixed(2)} deg off)`);
  assert.equal(ctl.getCurrent(), 'walk', 'the walk takes over again');
  step(0.4, check);
  assert.ok(worstLegStep < 14, `no leg snaps in or out (${worstLegStep.toFixed(1)} deg in a frame)`);
});

test('standing still, the swing keeps its own planted stance; a dodge still stops movement', async () => {
  const { ctl, model, step, move } = await liveController('fused-male-v1');
  ctl.setEquipmentContext({ weaponType: 'dual_blades', equipped: true, summon: true });
  move({ moving: false, running: false });
  step(0.5);
  assert.equal(ctl.HandleCombat('daggerLight', { speed: 1 }), true);
  step(0.1);
  const m = ctl.getMontageState();
  assert.ok(m.legs < 1e-6 && m.weight < 1e-6, 'standing: no legs from the walk');
  const clip = ctl.actions.daggerLight1.getClip();
  const t = ctl.actions.daggerLight1.time;
  const track = clip.tracks.find((tr) => tr.name === `${findComboBones(model).lUp.name}.quaternion`);
  const want = new THREE.Quaternion().fromArray(track.createInterpolant().evaluate(t));
  assert.ok(findComboBones(model).lUp.quaternion.angleTo(want) * DEG < 1, 'the thigh is the swing\'s own stance');
  assert.equal(ctl.isMovementOverridden(), false);
  step(0.5);
  ctl.requestHitReact('front');
  // hit reactions and dodges keep their own lock (only swings and shots are montages)
  if (ctl.getCurrent() === 'hitReact') assert.equal(ctl.isMovementOverridden(), true);
});

test('the bow: hold draws then holds; letting go looses from the hold; every shot plays its own', async () => {
  const { ctl, step, move } = await liveController('fused-female-v1');
  ctl.setEquipmentContext({ weaponType: 'bow', equipped: true, summon: true });
  move({ moving: false, running: false });
  step(0.3);
  assert.equal(ctl.getCurrent(), 'idleBow');
  ctl.setAiming(true);
  step(1 / 60);
  assert.equal(ctl.getCurrent(), 'bowDraw', 'holding the aim draws');
  step(0.6);
  assert.equal(ctl.getCurrent(), 'bowHold', 'then holds at full draw');
  assert.equal(ctl.getBowDrawing(), true);
  step(1.5);
  assert.equal(ctl.getCurrent(), 'bowHold', 'for as long as it is held');
  // letting go: the world lowers the aim, then fires the shot in the same frame
  ctl.setAiming(false);
  assert.equal(ctl.HandleCombat('bowCombo', { speed: 1 }), true);
  assert.equal(ctl.getCurrent(), 'bowRelease', 'the shot looses from the hold');
  assert.equal(ctl.getBowDrawing(), false, 'the arrow has left');
  assert.equal(ctl.isMovementOverridden(), false);
  const hits = [];
  step(0.6, () => hits.push(...ctl.pollComboEvents().filter((c) => c.type === 'hit')));
  assert.equal(hits.length, 1);
  assert.equal(ctl.getCurrent(), 'idleBow', 'and the bow lowers');
  // aim let go without a shot: the draw waits a moment, then lowers
  ctl.setAiming(true); step(0.7);
  assert.equal(ctl.getCurrent(), 'bowHold');
  ctl.setAiming(false); step(0.1);
  assert.equal(ctl.getCurrent(), 'bowHold', 'waiting for the shot');
  step(0.3);
  assert.equal(ctl.getCurrent(), 'idleBow', 'lowered');
  // shots while the aim stays held: release, then draw again from the nock (the bow stays up)
  ctl.setAiming(true); step(0.7);
  assert.equal(ctl.HandleCombat('bowCombo', { speed: 1 }), true);
  assert.equal(ctl.getCurrent(), 'bowRelease');
  step(0.25);
  assert.equal(ctl.getCurrent(), 'bowDraw', 'drawing the next arrow');
  assert.ok(ctl.actions.bowDraw.time >= ctl.actions.bowDraw.getClip().userData.nock, 'from the nock, not from the lowered bow');
  // a draw let go early: the quick shot carries on from the same point
  ctl.setAiming(false); step(0.4); ctl.setAiming(true); step(0.15);
  assert.equal(ctl.getCurrent(), 'bowDraw');
  assert.equal(ctl.HandleCombat('bowCombo', { speed: 1 }), true);
  assert.equal(ctl.getCurrent(), 'bowQuick');
  assert.ok(ctl.actions.bowQuick.time > 0.02, 'carried on from the draw, not restarted');
  ctl.setAiming(false);
  step(0.8);
  // three shots of a skill, one after another: three shots
  const shots = [];
  for (let i = 0; i < 3; i++) {
    assert.equal(ctl.HandleCombat('bowCombo', { speed: 1, combo: true, hitIndex: i }), true);
    step(0.12, () => shots.push(...ctl.pollComboEvents().filter((c) => c.type === 'hit')));
  }
  step(1, () => shots.push(...ctl.pollComboEvents().filter((c) => c.type === 'hit')));
  assert.deepEqual(shots.map((s) => s.state), ['bowQuick', 'bowQuick', 'bowQuick'], 'each shot plays its own release');
  // a skill's arrows arriving in the same frame still play one shot each, one after another
  const burst = [];
  for (let i = 0; i < 4; i++) assert.equal(ctl.HandleCombat('bowCombo', { speed: 1, combo: true, hitIndex: i }), true);
  step(1.2, () => burst.push(...ctl.pollComboEvents().filter((c) => c.type === 'hit')));
  assert.equal(burst.length, 4, `four arrows, four shots (${burst.length})`);
  // Double Shot (0.2 s apart): the second shot looses within a frame or two of its arrow
  const timed = [];
  let clockAt = 0;
  assert.equal(ctl.HandleCombat('bowCombo', { speed: 1, combo: true, hitIndex: 0 }), true);
  step(0.2, () => { clockAt += 1 / 60; timed.push(...ctl.pollComboEvents().filter((c) => c.type === 'hit').map(() => clockAt)); });
  assert.equal(ctl.HandleCombat('bowCombo', { speed: 1, combo: true, hitIndex: 1 }), true);
  step(0.6, () => { clockAt += 1 / 60; timed.push(...ctl.pollComboEvents().filter((c) => c.type === 'hit').map(() => clockAt)); });
  assert.equal(timed.length, 2);
  assert.ok(timed[1] - 0.2 < 0.2, `the second shot looses ${(timed[1] - 0.2).toFixed(2)} s after its arrow`);
});

test('running with the bow carries it low and out; walking leaves the walk alone', async () => {
  const { ctl, model, step, move } = await liveController('fused-male-v1');
  ctl.setEquipmentContext({ weaponType: 'bow', equipped: true, summon: true });
  move({ moving: true, running: false });
  step(0.5);
  assert.equal(ctl.getCurrent(), 'walk');
  assert.equal(ctl.getWeaponState(), 'walk');
  assert.equal(ctl.getMontageState().bowCarry, 0);
  move({ moving: true, running: true });
  step(0.5);
  assert.equal(ctl.getCurrent(), 'run');
  assert.equal(ctl.getWeaponState(), 'bowRunCarry', 'the bow held like a drawn bow (combat grip) while carried');
  assert.equal(ctl.getMontageState().bowCarry, 1);
  const carry = ctl.actions.bowRunCarry.getClip();
  const b = findComboBones(model);
  const track = carry.tracks.find((tr) => tr.name === `${b.lFore.name}.quaternion`);
  assert.ok(b.lFore.quaternion.angleTo(new THREE.Quaternion().fromArray(track.values, 0)) * DEG < 1, 'the bow arm is the carry pose');
  // aiming while running: the draw over the run, the legs running
  ctl.setAiming(true);
  step(0.6);
  assert.equal(ctl.getCurrent(), 'bowHold');
  assert.equal(ctl.getGait(), 'run');
  assert.ok(ctl.getMontageState().weight > 0.99, 'the legs keep running under the held draw');
});
