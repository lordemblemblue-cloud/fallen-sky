// Weapon feel (owner request 2026-11-18 + the approved Blacksmith/combat handoff, section 5):
// - daggers: left click chains two light slashes (0.33 / 0.37 s, contact 0.12 / 0.15 s), right click stabs
//   (0.43 s, contact 0.18 s); a stance idle with both blades forward
// - sword: the handoff's timing (0.50 / 0.54 / 0.48 s, contact 0.22 / 0.24 / 0.21 s); holding the right button
//   puts the off hand on the hilt (two-hand swings and stance), hits 20 % harder, walks 25 % slower
// - only the bow zooms with the right button
// - an idle for every weapon family; empty hands keep the normal idle
// - a basic melee strike lands on its swing's contact frame
// Baked on the real fused bodies and checked like the sword and bow combos (game3d-weapon-combos.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  bakeWeaponComboClips, captureRestPose, WEAPON_COMBO_STATES, WEAPON_IDLE_STATES, weaponIdleState,
} from '../src/components/game3d/weapons/weaponComboClips.js';
import { movesForFamily } from '../src/components/game3d/weapons/weaponComboBinder.js';
import { solveFallbackGrip } from '../src/components/game3d/weapons/playerWeaponRuntime.js';
import {
  RIGHT_CLICK, resolveRightClickAction, createSwordStance, SWORD_STANCE, DAGGER_ATTACKS, weaponStyleMultiplier,
  basicMeleeComboKind, BASIC_MELEE_COMBOS, isLongBlade,
} from '../src/components/game3d/player/weaponRightClick.mjs';

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
  model.userData.rigId = rigId;
  const box = new THREE.Box3();
  model.updateMatrixWorld(true);
  model.traverse((n) => { if (n.isSkinnedMesh) box.expandByObject(n); });
  model.scale.multiplyScalar(1.7 / (box.max.y - box.min.y));
  model.updateMatrixWorld(true);
  return model;
}
const bone = (model, name) => model.getObjectByName(name);
function sample(model, clip, fn, rate = 120) {
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip);
  const steps = Math.ceil(clip.duration * rate);
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = Math.min(clip.duration - 1e-4, (clip.duration * i) / steps);
    mixer.stopAllAction(); action.reset().play(); mixer.setTime(t);
    model.updateMatrixWorld(true);
    out.push(fn(t));
  }
  mixer.stopAllAction(); mixer.uncacheRoot(model);
  return out;
}
const JOINTS = ['Hips', 'Spine1', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftUpLeg', 'RightUpLeg'];
// A held weapon as a child of the hand at its combat grip (+Y = the blade), like the runtime does.
// grip: { position, quaternion, scale } arrays; tip: the point in the weapon frame.
function hold(model, side, grip, tipPoint) {
  const root = new THREE.Object3D();
  root.position.fromArray(grip.position);
  root.quaternion.fromArray(grip.quaternion);
  root.scale.setScalar(grip.scale ?? 1);
  const tip = new THREE.Object3D();
  tip.position.fromArray(tipPoint);
  root.add(tip);
  bone(model, side === 'left' ? 'mixamorigLeftHand' : 'mixamorigRightHand').add(root);
  return { root, tip, release: () => root.removeFromParent() };
}
// Shared checks: unit and finite, seamless, no joint jumps, feet planted, facing forward, blades above ground.
function checkMotion(model, clip, held, { loop = true } = {}) {
  for (const track of clip.tracks) {
    assert.ok(track.values.every(Number.isFinite), `${clip.name} ${track.name} finite`);
    if (track.ValueTypeName !== 'quaternion') continue;
    for (let i = 0; i < track.values.length; i += 4) assert.ok(Math.abs(Math.hypot(...track.values.slice(i, i + 4)) - 1) < 1e-4, `${track.name} unit`);
    if (loop) {
      const n = track.values.length;
      const a = new THREE.Quaternion().fromArray(track.values, 0);
      const b = new THREE.Quaternion().fromArray(track.values, n - 4);
      assert.ok(Math.abs(Math.abs(a.dot(b)) - 1) < 1e-5, `${clip.name} ${track.name} ends where it starts`);
    }
  }
  let prev = null;
  let worst = { deg: 0 };
  const feet = [];
  const frames = sample(model, clip, (t) => {
    const qs = JOINTS.map((j) => bone(model, `mixamorig${j}`).getWorldQuaternion(new THREE.Quaternion()));
    if (prev) qs.forEach((q, j) => { const d = q.angleTo(prev[j]) * DEG; if (d > worst.deg) worst = { deg: d, joint: JOINTS[j], t }; });
    prev = qs;
    feet.push(['Left', 'Right'].map((s) => bone(model, `mixamorig${s}Foot`).getWorldPosition(new THREE.Vector3())));
    const l = bone(model, 'mixamorigLeftUpLeg').getWorldPosition(new THREE.Vector3());
    const r = bone(model, 'mixamorigRightUpLeg').getWorldPosition(new THREE.Vector3());
    const facing = new THREE.Vector3().crossVectors(l.sub(r), new THREE.Vector3(0, 1, 0)).setY(0).normalize();
    const tips = held.map((h) => h.tip.getWorldPosition(new THREE.Vector3()));
    const blades = held.map((h, i) => tips[i].clone().sub(h.root.getWorldPosition(new THREE.Vector3())).normalize());
    const hands = ['Left', 'Right'].map((s) => bone(model, `mixamorig${s}Hand`).getWorldPosition(new THREE.Vector3()));
    const hips = bone(model, 'mixamorigHips').getWorldPosition(new THREE.Vector3());
    return { t, facing, tips, blades, hands, hips };
  });
  assert.ok(worst.deg < 30, `${clip.name}: ${worst.joint} jumps ${worst.deg.toFixed(1)} deg at ${worst.t?.toFixed(3)} s`);
  for (const s of [0, 1]) {
    const drift = Math.max(...feet.map((f) => f[s].distanceTo(feet[0][s])));
    assert.ok(drift < 0.02, `${clip.name}: foot ${s} slides ${drift.toFixed(3)} m`);
  }
  for (const f of frames) assert.ok(f.facing.z > Math.cos(45 / DEG), `${clip.name} at ${f.t.toFixed(2)}: hips face ${f.facing.toArray().map((x) => x.toFixed(2))}`);
  for (const f of frames) f.tips.forEach((tip, i) => assert.ok(tip.y > 0.05, `${clip.name}: blade ${i} tip ${tip.y.toFixed(2)} m at ${f.t.toFixed(2)} s`));
  const at = (time) => frames.reduce((a, b) => (Math.abs(b.t - time) < Math.abs(a.t - time) ? b : a));
  return { frames, at };
}
const right = (p) => -p.x; // the character's right is -X when facing +Z

const bodies = {};
test.before(async () => {
  for (const id of Object.keys(RIGS)) bodies[id] = await loadBody(id);
});

for (const rigId of Object.keys(RIGS)) {
  test(`${rigId} daggers: light slash, cross-cut and stab on the handoff's timing, both blades clear`, () => {
    const model = bodies[rigId];
    const grips = {};
    const solvedGrips = {};
    for (const side of ['right', 'left']) {
      const solved = solveFallbackGrip(model, { hand: side, class: 'sword', handleRadius: 0.0155 }, ['combat'], 1.7);
      solvedGrips[side] = solved.grips.combat;
      grips[side] = new THREE.Quaternion().fromArray(solved.grips.combat.quaternion);
    }
    const rest = captureRestPose(model);
    const clips = bakeWeaponComboClips(model, 'dagger', grips, { rest, moves: movesForFamily('daggerCombo') });
    assert.deepEqual(Object.keys(clips), ['daggerLight1', 'daggerLight2', 'daggerStab', 'idleDaggers']);
    const timing = { daggerLight1: [0.33, 0.12, 'daggerLight', 0], daggerLight2: [0.37, 0.15, 'daggerLight', 1], daggerStab: [0.43, 0.18, 'daggerStab', 0] };
    const held = [hold(model, 'right', solvedGrips.right, [0, 0.37, 0]), hold(model, 'left', solvedGrips.left, [0, 0.37, 0])];
    try {
      for (const [name, [duration, hit, combo, index]] of Object.entries(timing)) {
        const clip = clips[name];
        assert.ok(Math.abs(clip.duration - duration) < 1e-6 && clip.userData.hit === hit, `${name}: ${clip.duration} s, contact ${clip.userData.hit}`);
        assert.deepEqual([clip.userData.combo, clip.userData.index], [combo, index]);
        assert.ok(clip.userData.hit < clip.userData.cancel && clip.userData.cancel < clip.duration, `${name} cancels after the contact`);
        const { at } = checkMotion(model, clip, held);
        const [a, b] = clip.userData.sweep.map(at);
        if (name === 'daggerLight1') assert.ok(right(a.tips[0]) - right(b.tips[0]) > 0.35, `right blade cuts right to left: ${right(a.tips[0]).toFixed(2)} -> ${right(b.tips[0]).toFixed(2)}`);
        if (name === 'daggerLight2') assert.ok(right(b.tips[1]) - right(a.tips[1]) > 0.35, `left blade cuts left to right: ${right(a.tips[1]).toFixed(2)} -> ${right(b.tips[1]).toFixed(2)}`);
        if (name === 'daggerStab') {
          const c = at(hit);
          assert.ok(c.blades[0].z > Math.cos(35 / DEG), `the stab points ahead: ${c.blades[0].toArray().map((x) => x.toFixed(2))}`);
          assert.ok(c.hands[1].z - c.hips.z > 0.45, `the stabbing hand reaches ${(c.hands[1].z - c.hips.z).toFixed(2)} m ahead of the hips`);
        }
      }
      const idle = clips.idleDaggers;
      assert.ok(idle.userData.idle && idle.userData.loop && Math.abs(idle.duration - 2) < 1e-6);
      const { frames } = checkMotion(model, idle, held);
      for (const f of frames) f.blades.forEach((blade, i) => assert.ok(blade.z > 0.3, `idle: blade ${i} points forward (${blade.z.toFixed(2)})`));
    } finally {
      held.forEach((h) => h.release());
    }
  });

  test(`${rigId} sword: two-hand swings keep the off hand on the hilt; both stances loop`, () => {
    const model = bodies[rigId];
    const w = manifest.weapons.find((x) => x.id === 'fantasy_sword');
    const q = new THREE.Quaternion().fromArray(w.grips[rigId].combat.quaternion);
    const rest = captureRestPose(model);
    const clips = bakeWeaponComboClips(model, 'sword', { right: q }, { rest, reach: w.length, moves: movesForFamily('swordCombo', { id: 'fantasy_sword', cls: 'sword' }) });
    for (const name of [...WEAPON_COMBO_STATES.swordTwoHand, 'idleSword', 'idleSwordTwoHand']) assert.ok(clips[name], name);
    const held = [hold(model, 'right', w.grips[rigId].combat, w.points?.tip || [0, w.length * 0.9, 0])];
    try {
      WEAPON_COMBO_STATES.swordTwoHand.forEach((name, index) => {
        const clip = clips[name];
        assert.deepEqual([clip.userData.combo, clip.userData.index], ['swordTwoHand', index]);
        assert.ok(clip.duration <= 0.62 && clip.userData.hit > 0.2 && clip.userData.hit < clip.userData.cancel, `${name} timing`);
        const { frames } = checkMotion(model, clip, held);
        const apart = Math.max(...frames.map((f) => f.hands[0].distanceTo(f.hands[1])));
        assert.ok(apart < 0.2, `${name}: the hands stay together on the hilt (at most ${apart.toFixed(2)} m apart)`);
      });
      for (const [name, seconds] of [['idleSword', 2.4], ['idleSwordTwoHand', 2.0]]) {
        const clip = clips[name];
        assert.ok(clip.userData.idle && Math.abs(clip.duration - seconds) < 1e-6, name);
        const { frames } = checkMotion(model, clip, held);
        if (name === 'idleSwordTwoHand') {
          for (const f of frames) assert.ok(f.hands[0].distanceTo(f.hands[1]) < 0.2 && f.tips[0].y > f.hands[1].y + 0.3,
            'two-hand stance: both hands on the hilt, the blade raised');
        }
      }
    } finally {
      held.forEach((h) => h.release());
    }
  });

  test(`${rigId} bow stance: the bow is held upright at the side and the loop is seamless`, () => {
    const model = bodies[rigId];
    const w = manifest.weapons.find((x) => x.id === 'fantasy_bow');
    const q = new THREE.Quaternion().fromArray(w.grips[rigId].combat.quaternion);
    const clips = bakeWeaponComboClips(model, 'bow', { left: q }, { rest: captureRestPose(model), moves: movesForFamily('bowCombo') });
    assert.deepEqual(Object.keys(clips), ['bowCombo1', 'bowCombo2', 'bowCombo3', 'idleBow']);
    const held = [hold(model, 'left', w.grips[rigId].combat, [0, 0.6, 0])];
    try {
      const { frames } = checkMotion(model, clips.idleBow, held);
      for (const f of frames) assert.ok(f.blades[0].y > Math.cos(40 / DEG), `the bow stays upright (${f.blades[0].toArray().map((x) => x.toFixed(2))})`);
    } finally {
      held.forEach((h) => h.release());
    }
  });
}

test('right button: only the bow aims; a sword holds its stance, daggers stab, the rest guards', () => {
  assert.equal(resolveRightClickAction({ family: 'bow' }), RIGHT_CLICK.AIM);
  assert.equal(resolveRightClickAction({ family: 'sword', ranged: true }), RIGHT_CLICK.AIM);
  assert.equal(resolveRightClickAction({ family: 'sword' }), RIGHT_CLICK.STANCE);
  assert.equal(resolveRightClickAction({ family: 'dual_blades' }), RIGHT_CLICK.ATTACK);
  assert.equal(resolveRightClickAction({ family: null }), RIGHT_CLICK.GUARD);
  assert.equal(resolveRightClickAction({ family: 'sword', mounted: true }), RIGHT_CLICK.GUARD);
  assert.equal(resolveRightClickAction({ family: 'bow', mounted: true }), RIGHT_CLICK.AIM);
  // the stance switches on after the hold; a shorter press is a tap (the guard)
  const stance = createSwordStance();
  stance.press(1000);
  assert.equal(stance.update(1000 + SWORD_STANCE.holdMs - 1), false);
  assert.equal(stance.update(1000 + SWORD_STANCE.holdMs), true);
  assert.deepEqual(stance.release(1500), { heldMs: 500, wasActive: true });
  assert.equal(stance.isActive(), false);
  stance.press(2000);
  assert.deepEqual(stance.release(2100), { heldMs: 100, wasActive: false });
  // numbers (audit decision 11) and which swing a click plays
  assert.deepEqual([SWORD_STANCE.damageMultiplier, SWORD_STANCE.moveSpeedMultiplier], [1.2, 0.75]);
  assert.equal(weaponStyleMultiplier({ family: 'sword', stance: true }), 1.2);
  assert.equal(weaponStyleMultiplier({ family: 'sword', stance: true, isSkill: true, skillWeaponType: 'sword' }), 1.2);
  assert.equal(weaponStyleMultiplier({ family: 'sword', stance: false }), 1);
  assert.equal(weaponStyleMultiplier({ family: 'dual_blades', variant: 'light' }), DAGGER_ATTACKS.lightMultiplier);
  assert.equal(weaponStyleMultiplier({ family: 'dual_blades', variant: 'normal' }), DAGGER_ATTACKS.normalMultiplier);
  assert.equal(weaponStyleMultiplier({ family: 'dual_blades', isSkill: true, skillWeaponType: 'guardian' }), 1);
  assert.equal(basicMeleeComboKind({ family: 'dual_blades' }), 'daggerLight');
  assert.equal(basicMeleeComboKind({ family: 'dual_blades', variant: 'normal' }), 'daggerStab');
  assert.equal(basicMeleeComboKind({ family: 'sword', stance: true }), 'swordTwoHand');
  assert.equal(basicMeleeComboKind({ family: 'sword', stance: true, longBlade: true }), 'swordCombo');
  assert.equal(basicMeleeComboKind({ family: null }), null);
  assert.ok(isLongBlade({ id: 'odachi', cls: 'greatsword' }) && !isLongBlade({ id: 'fantasy_sword', cls: 'sword' }));
  for (const kind of ['swordCombo', 'swordTwoHand', 'daggerLight', 'daggerStab']) assert.ok(BASIC_MELEE_COMBOS.has(kind) && WEAPON_COMBO_STATES[kind], kind);
  assert.deepEqual(['sword', 'dual_blades', 'bow', null].map((f) => weaponIdleState(f)), ['idleSword', 'idleDaggers', 'idleBow', null]);
  assert.equal(weaponIdleState('sword', { twoHand: true }), 'idleSwordTwoHand');
});

test('GameWorld3D: the bow alone begins the aim hold; the stance slows walking; strikes wait for the contact cue', () => {
  const world = readFileSync('src/components/game3d/GameWorld3D.jsx', 'utf8');
  assert.equal(world.split('otsAim.current.beginHold(').length - 1, 1, 'one aim hold');
  assert.match(world, /if \(rightClickAction === RIGHT_CLICK\.AIM\) otsAim\.current\.beginHold\(rightPressAt\);/);
  assert.match(world, /\(swordStanceActive \? SWORD_STANCE\.moveSpeedMultiplier : 1\)/);
  assert.match(world, /!stance\.wasActive && action !== RIGHT_CLICK\.ATTACK\) \{/);
  assert.match(world, /twoHand: swordStanceActive/);
  assert.match(world, /if \(cue\.type === 'hit' && BASIC_MELEE_COMBOS\.has\(cue\.kind\)\) \{/);
  assert.match(world, /if \(contactSerial\) pendingMeleeContacts\.push\(\{ serial: contactSerial, at: performance\.now\(\), land: landStrike \}\);\s*else landStrike\(\);/);
  // daggers swing their own combo instead of the old 'damage'/'melee' path check (they are the defense role)
  assert.ok(!world.includes(`['damage', 'melee'].includes(activeWeaponPath)`));
});

// ---- the real player controller with stand-in clips ----
const built = buildSync({
  entryPoints: ['src/components/game3d/player/LunaDashboardPlayerController.jsx'],
  bundle: true, platform: 'node', format: 'cjs', write: false, outdir: 'unused', external: ['three'],
}).outputFiles;
function controller(clock) {
  const runtime = { exports: {} };
  new Function('module', 'exports', 'require', 'performance', built[0].text)(
    runtime, runtime.exports, createRequire(import.meta.url), { now: () => clock.seconds * 1000 },
  );
  const root = new THREE.Group();
  const b = new THREE.Bone();
  b.name = 'Root';
  root.add(b);
  const mixer = new THREE.AnimationMixer(root);
  const ctl = runtime.exports.createLunaDashboardPlayerController({ mixer });
  const clip = (name, d = 1, userData = null) => {
    const c = new THREE.AnimationClip(name, d, [new THREE.QuaternionKeyframeTrack('Root.quaternion', [0, d], [0, 0, 0, 1, 0, 0, 0, 1])]);
    if (userData) c.userData = userData;
    return c;
  };
  ctl.bindClips(Object.fromEntries(['idle', 'walk', 'run', 'kick', 'attack', 'hitReact'].map((k) => [k, clip(k)])));
  const combos = Object.fromEntries(Object.entries(WEAPON_COMBO_STATES).flatMap(([kind, states]) =>
    states.map((name, index) => [name, clip(name, 0.4, { combo: kind, index, hit: 0.15, sweep: [0.05, 0.25], cancel: 0.3 })])));
  const idles = Object.fromEntries(WEAPON_IDLE_STATES.map((name) => [name, clip(name, 2, { idle: true, loop: true })]));
  ctl.setWeaponComboClips({ ...combos, ...idles });
  const step = (seconds) => {
    for (let t = 0; t < seconds; t += 1 / 60) { clock.seconds += 1 / 60; mixer.update(1 / 60); ctl.updateAnimation(1 / 60); ctl.updateActionState({ moving: false }); }
  };
  return { ctl, step };
}

test('the controller stands in the held weapon\'s stance, and the sword stance while it is held', () => {
  const clock = { seconds: 0 };
  const { ctl, step } = controller(clock);
  const standing = (context) => { ctl.setEquipmentContext(context); step(0.3); return ctl.getCurrent(); };
  assert.equal(standing({ weaponType: 'sword', equipped: true, summon: true }), 'idleSword');
  assert.equal(standing({ weaponType: 'sword', equipped: true, summon: true, twoHand: true }), 'idleSwordTwoHand');
  assert.equal(standing({ weaponType: 'dual_blades', equipped: true, summon: true }), 'idleDaggers');
  assert.equal(standing({ weaponType: 'bow', equipped: true, summon: true }), 'idleBow');
  assert.equal(standing({ weaponType: 'unarmed', equipped: false, summon: true }), 'idle');
  // the stance clip loops while standing
  standing({ weaponType: 'sword', equipped: true, summon: true });
  step(5);
  assert.equal(ctl.getCurrent(), 'idleSword');
});

test('every accepted swing has a number; its contact cue carries it, a buffered swing gets its own', () => {
  const clock = { seconds: 0 };
  const { ctl, step } = controller(clock);
  ctl.setEquipmentContext({ weaponType: 'dual_blades', equipped: true, summon: true });
  step(0.2);
  assert.equal(ctl.HandleCombat('daggerLight', { speed: 1 }), true);
  const first = ctl.getLastSwingSerial();
  assert.equal(ctl.getComboState().state, 'daggerLight1');
  step(0.05);
  assert.equal(ctl.HandleCombat('daggerLight', { speed: 1 }), true, 'buffered during the swing');
  const second = ctl.getLastSwingSerial();
  assert.ok(second > first);
  const cues = [];
  for (let i = 0; i < 60; i++) { step(1 / 60); cues.push(...ctl.pollComboEvents()); }
  const hits = cues.filter((c) => c.type === 'hit');
  assert.deepEqual(hits.map((c) => [c.state, c.serial]), [['daggerLight1', first], ['daggerLight2', second]]);
  // the stab is its own one-hit combo
  step(1);
  assert.equal(ctl.HandleCombat('daggerStab', { speed: 1 }), true);
  assert.equal(ctl.getComboState().state, 'daggerStab');
});
