// Winged faction pets (#158 / #160): the owner saw the Fantasy Tiger's animation "bugged out".
// Causes fixed here: (1) the uploaded idle clips' rotation keys are zero/overflowing quaternions (the
// tail balls up, a wing spikes and the head folds at each loop), (2) the borrowed baby-wolf stride was
// retargeted without facing alignment, so it splayed sideways, (3) #158 faces sideways inside its root
// while pets move, are ridden and are retargeted along +Z. In the clone, #160 (Faction 3) is turned by
// its own outer facing frame (factionThreeMountFacing.mjs), so the loader turns every other pet only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  FACTION_PET_RIG_PROFILES, isUsableAnimationTrack, sanitizePetClip, faceFactionPetForward,
  factionPetLifeTracks, withFactionPetLife, combineNativeFactionPetClips,
} from '../src/components/game3d/character/factionPetAnimationRigs.mjs';
import { retargetDogMountClips } from '../src/components/game3d/character/mountAnimations.mjs';

const q = (name, values, times = [0, 1]) => new THREE.QuaternionKeyframeTrack(name, times, values);

test('corrupt rotation keys (zero or overflowing quaternions, as in #160) are dropped', () => {
  assert.ok(isUsableAnimationTrack(q('tail01.quaternion', [0, 0, 0, 1, 0, 0.12, 0, 0.99277389])));
  assert.equal(isUsableAnimationTrack(q('tail01.quaternion', [1.1e-29, 2.0e-27, 0, 0, 1.2e-29, 2.0e-27, 0, 0])), false);
  assert.equal(isUsableAnimationTrack(q('wingLbase.quaternion', [-1.3e33, 3.6e10, 0, 0, 0, 0, 0, 1])), false);
  assert.equal(isUsableAnimationTrack(new THREE.VectorKeyframeTrack('tail01.position', [0], [NaN, 0, 0])), false);
  const corrupt = new THREE.AnimationClip('Idle_Relaxed_Tail', 4, [
    q('tail01.quaternion', [0, 0, 0, 0, 0, 0, 0, 0]),
    new THREE.VectorKeyframeTrack('tail01.position', [0], [0.1, 0, 0]),
  ]);
  assert.equal(sanitizePetClip(corrupt), null, 'nothing visible is left to play');
  const mixed = new THREE.AnimationClip('Idle', 1, [q('head.quaternion', [0, 0, 0, 1, 0, 0, 0, 1]), q('tail01.quaternion', [0, 0, 0, 0, 0, 0, 0, 0])]);
  assert.deepEqual(sanitizePetClip(mixed).tracks.map((t) => t.name), ['head.quaternion']);
});

// A minimal quadruped rig: pelvis -> chest -> front leg, with tail and wings, facing `dir` in its root.
function pet({ facing = new THREE.Vector3(1, 0, 0), names = { pelvis: 'pelvis', chest: 'chest', leg: 'front.L.upper' } } = {}) {
  const root = new THREE.Group();
  const rig = new THREE.Group(); rig.name = 'Creature_Rig';
  root.add(rig);
  const bone = (name, parent, pos) => { const b = new THREE.Bone(); b.name = THREE.PropertyBinding.sanitizeNodeName(name); b.position.copy(pos); parent.add(b); return b; };
  const pelvis = bone(names.pelvis, rig, new THREE.Vector3(0, 0.4, 0));
  const chest = bone(names.chest, pelvis, facing.clone().multiplyScalar(0.3));
  const leg = bone(names.leg, chest, new THREE.Vector3(0, -0.05, 0));
  bone('foot', leg, new THREE.Vector3(0, -0.3, 0));
  const tail1 = bone('tail.01', pelvis, facing.clone().multiplyScalar(-0.1));
  bone('tail.02', tail1, facing.clone().multiplyScalar(-0.1));
  const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), facing).normalize();
  const wl = bone('wing.L.base', chest, side.clone().multiplyScalar(0.08).setY(0.1));
  bone('wing.L.tip', wl, side.clone().multiplyScalar(0.2));
  const wr = bone('wing.R.base', chest, side.clone().multiplyScalar(-0.08).setY(0.1));
  bone('wing.R.tip', wr, side.clone().multiplyScalar(-0.2));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 8)); ring.name = 'ring';
  root.add(ring);
  root.updateMatrixWorld(true);
  return { root, rig, pelvis, chest, leg, ring };
}

test('#160-style pets are turned to face +Z inside their root, once, without moving the ground ring', () => {
  const p = pet();
  const turn = faceFactionPetForward(p.root, 'winged_faction_3_160');
  assert.ok(Math.abs(Math.abs(turn) - Math.PI / 2) < 1e-6, `turned ${turn}`);
  const d = p.chest.getWorldPosition(new THREE.Vector3()).sub(p.pelvis.getWorldPosition(new THREE.Vector3()));
  assert.ok(d.z > 0.29 && Math.abs(d.x) < 1e-6, `body now points ${d.toArray()}`);
  assert.equal(p.root.quaternion.angleTo(new THREE.Quaternion()), 0, 'the AI-driven root keeps yaw 0');
  assert.equal(p.ring.quaternion.angleTo(new THREE.Quaternion()), 0, 'the ring is not rigged and is left alone');
  assert.equal(faceFactionPetForward(p.root, 'winged_faction_3_160'), turn, 'idempotent');
  assert.equal(p.rig.quaternion.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn)) < 1e-6, true);
  assert.equal(faceFactionPetForward(new THREE.Group(), 'winged_faction_3_160'), 0, 'no bones, no change');
  assert.equal(faceFactionPetForward(p.root, 'faction_bear'), 0, 'unknown profiles are untouched');
});

test('a +Z wolf stride retargets as a forward/back swing on a pet that faced +X (no sideways splay)', () => {
  // source: the baby-wolf naming, facing +Z, front leg swinging 30 degrees about X over the walk cycle
  const src = new THREE.Group();
  const sb = (name, parent, pos) => { const b = new THREE.Bone(); b.name = name; b.position.copy(pos); parent.add(b); return b; };
  const sp = sb('RigPelvis_01', src, new THREE.Vector3(0, 0.4, 0));
  const sc = sb('RigChest_010', sp, new THREE.Vector3(0, 0, 0.3));
  const sl = sb('RigLFLeg1_012', sc, new THREE.Vector3(0, -0.05, 0));
  sb('RigLFLeg2_013', sl, new THREE.Vector3(0, -0.3, 0));
  src.updateMatrixWorld(true);
  const swing = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a).toArray();
  // the inspected 14.6 s baby-wolf take; the walk cycle is 389/30..415/30 s
  const take = new THREE.AnimationClip('Take 001', 14.6, [new THREE.QuaternionKeyframeTrack('RigLFLeg1_012.quaternion', [0, 389 / 30, 402 / 30, 415 / 30, 14.6], [...swing(0), ...swing(0), ...swing(0.5), ...swing(0), ...swing(0)])]);
  const map = { pelvis: 'RigPelvis_01', chest: 'RigChest_010', 'front.L.upper': 'RigLFLeg1_012' };
  for (const turnFirst of [true, false]) {
    const p = pet();
    if (turnFirst) faceFactionPetForward(p.root, 'winged_faction_3_160');
    const clips = retargetDogMountClips(src, [take], p.root, 'faction_tiger', map);
    const walk = clips.find((c) => c.name === 'walk');
    const mixer = new THREE.AnimationMixer(p.root);
    mixer.clipAction(walk).play();
    mixer.setTime(walk.duration / 2);
    p.root.updateMatrixWorld(true);
    const foot = p.leg.children[0].getWorldPosition(new THREE.Vector3()).sub(p.leg.getWorldPosition(new THREE.Vector3()));
    const body = p.chest.getWorldPosition(new THREE.Vector3()).sub(p.pelvis.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
    const along = foot.dot(body);
    const lateral = foot.clone().addScaledVector(body, -along).setY(0).length();
    assert.ok(Math.abs(along) > 0.1, `${turnFirst ? 'turned' : 'unturned'} pet: the paw moves along the body (${along.toFixed(3)})`);
    assert.ok(lateral < 0.02, `${turnFirst ? 'turned' : 'unturned'} pet: no sideways splay (${lateral.toFixed(3)})`);
  }
});

test('the life layer animates tail and wings in loops, with unit quaternions only', () => {
  const p = pet();
  faceFactionPetForward(p.root, 'winged_faction_3_160');
  for (const mode of ['idle', 'walk', 'run']) {
    const tracks = factionPetLifeTracks(p.root, mode, mode === 'idle' ? 4 : 0.87);
    const names = tracks.map((t) => t.name);
    for (const bone of ['tail01', 'tail02', 'wingLbase', 'wingLtip', 'wingRbase', 'wingRtip']) assert.ok(names.includes(`${bone}.quaternion`), `${mode}: ${bone}`);
    for (const t of tracks) {
      assert.ok(isUsableAnimationTrack(t), t.name);
      const n = t.values.length;
      assert.deepEqual(Array.from(t.values.slice(0, 4)).map((v) => v.toFixed(5)), Array.from(t.values.slice(n - 4)).map((v) => v.toFixed(5)), `${mode} ${t.name} loops`);
    }
  }
});

test('withFactionPetLife replaces a corrupt idle and adds tail/wing motion to the gait without doubling tracks', () => {
  const p = pet();
  faceFactionPetForward(p.root, 'winged_faction_3_160');
  const corruptIdle = new THREE.AnimationClip('Idle_Relaxed_Tail', 4, [q('tail01.quaternion', [0, 0, 0, 0, 0, 0, 0, 0])]);
  const gait = [
    new THREE.AnimationClip('idle', 5, [q('frontLupper.quaternion', [0, 0, 0, 1, 0, 0, 0, 1])]),
    new THREE.AnimationClip('walk', 0.87, [q('frontLupper.quaternion', [0, 0, 0, 1, 0, 0, 0, 1])]),
    new THREE.AnimationClip('run', 0.87, [q('frontLupper.quaternion', [0, 0, 0, 1, 0, 0, 0, 1])]),
  ];
  const combined = combineNativeFactionPetClips([corruptIdle], gait, 'winged_faction_3_160');
  for (const c of combined) for (const t of c.tracks) assert.ok(isUsableAnimationTrack(t), `${c.name}: corrupt ${t.name} was grafted`);
  const clips = withFactionPetLife(p.root, combined, [corruptIdle], 'winged_faction_3_160');
  // ... plus the ridden flight clip (character/mountFlight.mjs)
  assert.deepEqual(clips.map((c) => c.name), ['idle', 'walk', 'run', 'fly']);
  for (const c of clips) {
    const names = c.tracks.map((t) => t.name);
    assert.equal(new Set(names).size, names.length, `${c.name}: one track per bone`);
    assert.ok(names.includes('frontLupper.quaternion'), `${c.name} keeps its gait`);
    assert.ok(names.includes('tail01.quaternion') && names.includes('wingLbase.quaternion'), `${c.name} moves tail and wings`);
    for (const t of c.tracks) assert.ok(isUsableAnimationTrack(t), `${c.name} ${t.name}`);
  }
});

test('both mount loaders face the pet forward before the gait retarget and finish with the life layer', () => {
  const src = readFileSync('src/components/game3d/character/mountAnimations.mjs', 'utf8');
  const face = src.indexOf('faceFactionPetForward(root,definition.animationRigProfile)');
  const retarget = src.indexOf('retargetDogMountClips(source.scene,source.animations||[],root,definition.id,profile.map)');
  assert.ok(face > 0 && retarget > face, 'turned before anything measures the body');
  // Faction 3 keeps the clone's outer facing frame; turning its content as well would face it backwards
  assert.match(src, /if\(!isFactionThreeMount\(definition\)\)faceFactionPetForward\(root,definition\.animationRigProfile\);/);
  assert.match(src, /return withFactionPetLife\(root,combined,embeddedClips,definition\.animationRigProfile\)/);
  assert.match(src, /return withFactionPetLife\(root,proceduralFactionPetGait\(/);
  for (const p of Object.values(FACTION_PET_RIG_PROFILES)) assert.equal(p.forward.length, 2);
});

test('the loader turns Faction 2 (#158) content but never Faction 3 (#160), which its facing frame owns', async () => {
  const { prepareMountAnimationClips } = await import('../src/components/game3d/character/mountAnimations.mjs');
  const { createFactionThreeFacingFrame } = await import('../src/components/game3d/character/factionThreeMountFacing.mjs');
  const warn = console.warn;
  console.warn = () => {}; // no baby-wolf GLB in node: the loader falls back to the local gait, by design
  try {
    const wolf = pet({ names: { pelvis: 'pelvis', chest: 'neck', leg: 'front.L.upper' } }); // #158 measures pelvis -> neck
    const def2 = { id: 'faction_armored_wolf', animationSource: 'baby-wolf-retarget', animationRigProfile: 'winged_faction_2_158' };
    const clips2 = await prepareMountAnimationClips(wolf.root, [], def2);
    const yaw = wolf.root.userData.factionPetFacingYaw;
    assert.ok(Number.isFinite(yaw) && Math.abs(Math.abs(yaw) - Math.PI / 2) < 1e-6, `Faction 2 content turned (${yaw})`);
    const d = wolf.chest.getWorldPosition(new THREE.Vector3()).sub(wolf.pelvis.getWorldPosition(new THREE.Vector3()));
    assert.ok(d.z > 0.29 && Math.abs(d.x) < 1e-6, `#158 body now points ${d.toArray()}`);
    assert.deepEqual(clips2.map((c) => c.name).sort(), ['fly', 'idle', 'run', 'walk']);
    const tiger = pet();
    const def3 = { id: 'faction_tiger', animationSource: 'baby-wolf-retarget', animationRigProfile: 'winged_faction_3_160', modelUrl: 'x.glb' };
    createFactionThreeFacingFrame(tiger.root, def3);
    const clips3 = await prepareMountAnimationClips(tiger.root, [], def3);
    assert.equal(tiger.root.userData.factionPetFacingYaw, undefined, 'Faction 3 content is not turned by the loader');
    assert.equal(tiger.rig.quaternion.angleTo(new THREE.Quaternion()), 0);
    assert.deepEqual(clips3.map((c) => c.name).sort(), ['fly', 'idle', 'run', 'walk']);
    for (const c of clips3) for (const t of c.tracks) assert.ok(isUsableAnimationTrack(t), `${c.name} ${t.name}`);
  } finally {
    console.warn = warn;
  }
});
