// Hold to charge (owner 2026-11-19): holding the attack button charges the swing. The wind-up slows to slow motion
// while held and the strike speeds back up on release, a montage over locomotion. Double damage when the held
// weapon's mastery passive is maxed and the hold reached the full charge; otherwise a normal hit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  HOLD_CHARGE, holdChargeMultiplier, holdChargeStatus, isChargePassiveMaxed, chargeWindUpSpeed,
} from '../src/components/game3d/combat/HoldChargeRules.mjs';
import { BOW_FULL_CHARGE_MS } from '../src/components/game3d/combat/ArcheryChargeRules.mjs';
import {
  bakeWeaponComboClips, captureRestPose, CHARGE_STATE_FOR_KIND, WEAPON_COMBO_STATES,
} from '../src/components/game3d/weapons/weaponComboClips.js';
import { movesForFamily, createWeaponComboBinder } from '../src/components/game3d/weapons/weaponComboBinder.js';
import { solveFallbackGrip } from '../src/components/game3d/weapons/playerWeaponRuntime.js';
import { createPlayerMovementFallbackClips } from '../src/components/game3d/player/playerMovementFallbackClips.js';

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

test('the rule: double damage only for a full charge with the mastery passive maxed', () => {
  assert.equal(HOLD_CHARGE.fullMs, BOW_FULL_CHARGE_MS, 'the same 1.2 s as the bow');
  assert.equal(holdChargeMultiplier({ heldMs: 1300, engaged: true, passiveMaxed: true }), 2);
  assert.equal(holdChargeMultiplier({ heldMs: 1300, engaged: true, passiveMaxed: false }), 1, 'the passive is not maxed');
  assert.equal(holdChargeMultiplier({ heldMs: 900, engaged: true, passiveMaxed: true }), 1, 'not held long enough');
  assert.equal(holdChargeMultiplier({ heldMs: 1300, engaged: false, passiveMaxed: true }), 1, 'never became a charge');
  assert.equal(holdChargeMultiplier({ heldMs: HOLD_CHARGE.fullMs, engaged: true, passiveMaxed: true }), 2, 'exactly full');
  const levels = { sword: 20, bow: 7 };
  assert.equal(isChargePassiveMaxed('sword', { levelOf: (f) => levels[f], maxLevel: 20 }), true);
  assert.equal(isChargePassiveMaxed('bow', { levelOf: (f) => levels[f], maxLevel: 20 }), false);
  assert.equal(isChargePassiveMaxed(null, { levelOf: () => 99 }), false);
  const s = holdChargeStatus(600);
  assert.ok(s.percent === 50 && !s.full && s.engaged);
  assert.equal(holdChargeStatus(100).engaged, false, 'a click is not a charge');
  // the wind-up's speed reaches its peak when the charge is full, never slower than minSlowSpeed
  assert.ok(Math.abs(chargeWindUpSpeed(0.3, 200) - 0.3) < 1e-9);
  assert.equal(chargeWindUpSpeed(0.001, 0), HOLD_CHARGE.minSlowSpeed);
  assert.equal(chargeWindUpSpeed(0.3, 5000), 1, 'past full: no slower than real time');
  assert.equal(chargeWindUpSpeed(0, 300), 0, 'at the peak it holds');
});

test('every basic swing kind has a charge move, and the bakes carry its timing', () => {
  for (const kind of ['swordCombo', 'swordTwoHand', 'daggerLight', 'daggerStab']) {
    const state = CHARGE_STATE_FOR_KIND[kind];
    assert.ok(WEAPON_COMBO_STATES[state]?.includes(state), `${kind} -> ${state}`);
  }
  assert.ok(movesForFamily('daggerCombo').some((m) => m.name === 'daggerCharge'));
  const swordMoves = movesForFamily('swordCombo').map((m) => m.name);
  assert.ok(swordMoves.includes('swordCharge') && swordMoves.includes('swordTwoHandCharge'));
  // a long two-handed blade charges two-handed
  const odachi = movesForFamily('swordCombo', { id: 'odachi', cls: 'sword', length: 1.6 }).find((m) => m.name === 'swordCharge');
  assert.ok(odachi.keys.every((k) => !k.l || 'hilt' in k.l), 'the odachi keeps both hands on the hilt');
});

const bodies = {};
test.before(async () => {
  for (const id of Object.keys(RIGS)) bodies[id] = await loadBody(id);
});

for (const rigId of Object.keys(RIGS)) {
  test(`${rigId} charge moves: clean motion, the coil deepens to the peak, the strike lands after it`, () => {
    const model = bodies[rigId];
    const rest = captureRestPose(model);
    const sword = manifest.weapons.find((w) => w.id === 'fantasy_sword');
    const swordClips = bakeWeaponComboClips(model, 'sword', { right: new THREE.Quaternion().fromArray(sword.grips[rigId].combat.quaternion) },
      { rest, reach: sword.length, moves: movesForFamily('swordCombo', { id: 'fantasy_sword', cls: 'sword' }) });
    const daggerGrips = {};
    for (const side of ['right', 'left']) {
      const solved = solveFallbackGrip(model, { hand: side, class: 'dagger', handleRadius: 0.0155 }, ['combat'], 1.7);
      daggerGrips[side] = new THREE.Quaternion().fromArray(solved.grips.combat.quaternion);
    }
    const daggerClips = bakeWeaponComboClips(model, 'dagger', daggerGrips, { rest, moves: movesForFamily('daggerCombo') });
    const clips = { swordCharge: swordClips.swordCharge, swordTwoHandCharge: swordClips.swordTwoHandCharge, daggerCharge: daggerClips.daggerCharge };
    for (const [name, clip] of Object.entries(clips)) {
      assert.ok(clip, name);
      const u = clip.userData;
      assert.ok(u.chargeFrom < u.charge && u.charge < u.hit && u.hit < u.cancel && u.cancel < clip.duration, `${name} timing`);
      assert.equal(u.combo, name);
      for (const track of clip.tracks) assert.ok(track.values.every(Number.isFinite), `${name} ${track.name} finite`);
      // the wrist that strikes: raised highest at the peak of the coil, well below it at the strike
      const mixer = new THREE.AnimationMixer(model);
      const action = mixer.clipAction(clip);
      const at = (t) => { mixer.stopAllAction(); action.reset().play(); mixer.setTime(t); model.updateMatrixWorld(true); return W(bone(model, 'RightHand')); };
      const from = at(u.chargeFrom), peak = at(u.charge), strike = at(u.hit);
      const feet = [0, u.charge, u.hit].map((t) => { at(t); return W(bone(model, 'LeftFoot')); });
      mixer.stopAllAction(); mixer.uncacheRoot(model);
      assert.ok(peak.y > from.y + 0.02, `${name}: the coil raises the striking hand (${from.y.toFixed(2)} -> ${peak.y.toFixed(2)})`);
      assert.ok(peak.y - strike.y > 0.25, `${name}: the strike comes down from the coil (${peak.y.toFixed(2)} -> ${strike.y.toFixed(2)})`);
      assert.ok(Math.max(...feet.map((f) => f.distanceTo(feet[0]))) < 0.02, `${name}: the feet stay planted`);
    }
  });
}

// ---- the real player controller on a real body ----
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
  const clip = (name) => model.animations.find((c) => c.name === name);
  ctl.bindClips({ ...createPlayerMovementFallbackClips(model), idle: clip('Stand'), walk: clip('Walk'), run: clip('Run') });
  createWeaponComboBinder({ model, controller: ctl });
  let moving = { moving: false, running: false };
  const cues = [];
  const step = (seconds, each = null) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
      clock.seconds += 1 / 60;
      ctl.updateAnimation(1 / 60);
      mixer.update(1 / 60);
      ctl.lateUpdate(1 / 60);
      ctl.updateActionState({ ...moving, direction: 'forward', aiming: ctl.getIsAiming() });
      cues.push(...ctl.pollComboEvents().map((c) => ({ ...c, at: clock.seconds })));
      each?.();
    }
  };
  // a left click held: the swing starts with the press (as the world's strike does), the release ends the hold
  const press = (kind = 'swordCombo') => ctl.HandleCombat(kind, { speed: 1, hold: true, pressedAt: clock.seconds });
  return { ctl, model, step, clock, cues, press,
    move: (m) => { moving = m; ctl.updateActionState({ ...m, direction: 'forward', aiming: ctl.getIsAiming() }); } };
}

test('a click is a normal swing; a hold slows the wind-up, holds the coil, and strikes fast on release', async () => {
  const { ctl, step, clock, cues, press } = await liveController('fused-male-v1');
  ctl.setEquipmentContext({ weaponType: 'sword', equipped: true, summon: true });
  step(0.3);
  // a click (released after 0.1 s): the normal first swing, no charge
  assert.equal(press(), true);
  const tap = ctl.getLastSwingSerial();
  step(0.1);
  ctl.releaseCharge();
  step(0.6);
  assert.deepEqual(cues.filter((c) => c.type === 'hit').map((c) => [c.state, c.serial]), [['swordCombo1', tap]]);
  assert.equal(ctl.getSwingCharge(tap).engaged, false);
  step(0.8);
  cues.length = 0;
  // a hold
  const pressedAt = clock.seconds;
  assert.equal(press(), true);
  const held = ctl.getLastSwingSerial();
  step(0.25);
  assert.equal(ctl.getCurrent(), 'swordCharge', 'held past the click window: the charge move');
  const action = ctl.actions.swordCharge;
  const u = action.getClip().userData;
  step(0.35); // 0.6 s held: half charged, the coil in slow motion between its start and its peak
  assert.ok(action.time > u.chargeFrom && action.time < u.charge - 0.03, `coiling slowly (${action.time.toFixed(3)} s of ${u.charge})`);
  assert.ok(action.getEffectiveTimeScale() > 0 && action.getEffectiveTimeScale() < 0.6, `slow motion (${action.getEffectiveTimeScale().toFixed(2)}x)`);
  assert.equal(ctl.getHoldCharge().engaged, true);
  step(0.7); // 1.3 s held: fully charged, the coil holds at its peak and nothing strikes
  assert.ok(Math.abs(action.time - u.charge) < 0.02, `the coil peaks with the full charge (${action.time.toFixed(3)} vs ${u.charge})`);
  assert.equal(action.getEffectiveTimeScale(), 0);
  assert.equal(cues.filter((c) => c.type === 'hit').length, 0, 'no strike while held');
  assert.equal(ctl.isMovementOverridden(), false, 'a charge is a montage: moving is allowed');
  const released = clock.seconds;
  const result = ctl.releaseCharge();
  assert.ok(result.engaged && Math.abs(result.heldMs - (released - pressedAt) * 1000) < 1);
  step(0.5);
  const hit = cues.find((c) => c.type === 'hit');
  assert.ok(hit && hit.serial === held && hit.kind === 'swordCombo', 'the strike lands as the held swing (its own number)');
  const strikeSeconds = hit.at - released;
  assert.ok(strikeSeconds < (u.hit - u.charge) / HOLD_CHARGE.releaseSpeed + 0.04, `the strike is fast (${strikeSeconds.toFixed(3)} s)`);
  const charge = ctl.getSwingCharge(held);
  assert.ok(charge.engaged && charge.heldMs >= HOLD_CHARGE.fullMs, 'a full charge');
  step(1);
  assert.equal(ctl.getCurrent(), 'idleSword', 'back to the stance');
});

test('a long frame (the game does not clamp its delta) never carries a held swing past its wind-up or the coil past its peak', async () => {
  const { ctl, step, clock, cues, press, model } = await liveController('fused-male-v1');
  const mixer = ctl.actions.idleSword.getMixer();
  const longFrame = (seconds) => {
    clock.seconds += seconds;
    ctl.updateAnimation(seconds);
    mixer.update(seconds);
    ctl.lateUpdate(seconds);
    cues.push(...ctl.pollComboEvents().map((c) => ({ ...c, at: clock.seconds })));
  };
  assert.ok(model);
  ctl.setEquipmentContext({ weaponType: 'sword', equipped: true, summon: true });
  step(0.3);
  // pressed, then a frame longer than the wind-up but inside the click window: the swing stops at its wind-up
  assert.equal(press(), true);
  const swing = ctl.actions.swordCombo1;
  longFrame(0.15);
  assert.ok(Math.abs(swing.time - swing.getClip().userData.windUp) < 1e-3, `at the wind-up (${swing.time.toFixed(3)} s)`);
  assert.equal(ctl.getCurrent(), 'swordCombo1');
  // a 0.5 s frame (a first swing loading its effects) crosses the click window: the charge engages in that frame
  // and coils at its own slow speed, short of its peak
  longFrame(0.5);
  assert.equal(ctl.getCurrent(), 'swordCharge');
  const coil = ctl.actions.swordCharge;
  const { charge: peak, chargeFrom } = coil.getClip().userData;
  assert.ok(coil.time > chargeFrom && coil.time < peak, `coiling (${coil.time.toFixed(3)} s, peak ${peak})`);
  assert.equal(cues.filter((c) => c.type === 'hit').length, 0);
  longFrame(2.5); // a frozen tab or a load: the coil stops at its peak, still held, still the charge
  assert.equal(ctl.getCurrent(), 'swordCharge', 'still the charge');
  assert.ok(coil.time <= peak + 1e-3, `not past the peak (${coil.time.toFixed(3)} s of ${peak})`);
  step(0.1);
  assert.ok(Math.abs(coil.time - peak) < 2e-3 && coil.getEffectiveTimeScale() === 0, 'holding the peak');
  assert.equal(cues.filter((c) => c.type === 'hit').length, 0, 'no strike while held');
  ctl.releaseCharge();
  step(0.5);
  assert.equal(cues.filter((c) => c.type === 'hit').length, 1, 'the release strikes once');
});

test('charging while walking keeps the legs walking; a dodge cancels the charge', async () => {
  const { ctl, step, cues, press, move } = await liveController('fused-female-v1');
  ctl.setEquipmentContext({ weaponType: 'sword', equipped: true, summon: true });
  move({ moving: true, running: false });
  step(0.5);
  assert.equal(press(), true);
  step(0.6);
  assert.equal(ctl.getCurrent(), 'swordCharge');
  assert.ok(ctl.getMontageState().weight > 0.99 && ctl.getMontageState().gait === 'walk', 'the legs keep the walk');
  assert.equal(ctl.requestDodge(new THREE.Vector3(1, 0, 0), 'left'), true, 'a dodge cuts the charge');
  assert.notEqual(ctl.getCurrent(), 'swordCharge');
  assert.equal(ctl.getHoldCharge(), null);
  ctl.releaseCharge();
  step(1);
  assert.equal(cues.filter((c) => c.type === 'hit').length, 0, 'a cancelled charge lands nothing');
});

test('daggers charge into a double hammer strike; the two-hand stance into an overhead cleave', async () => {
  const { ctl, step, cues, press } = await liveController('fused-male-v1');
  ctl.setEquipmentContext({ weaponType: 'dual_blades', equipped: true, summon: true });
  step(0.3);
  press('daggerLight');
  step(0.5);
  assert.equal(ctl.getCurrent(), 'daggerCharge');
  ctl.releaseCharge();
  step(0.6);
  assert.equal(cues.filter((c) => c.type === 'hit').length, 1);
  ctl.setEquipmentContext({ weaponType: 'sword', equipped: true, summon: true, twoHand: true });
  step(1);
  press('swordTwoHand');
  step(0.5);
  assert.equal(ctl.getCurrent(), 'swordTwoHandCharge');
  ctl.releaseCharge();
  step(1);
  assert.equal(cues.filter((c) => c.type === 'hit').length, 2);
});

test('the bow: the draw comes back slowly and reaches full draw with the full charge', async () => {
  const { ctl, step } = await liveController('fused-female-v1');
  ctl.setEquipmentContext({ weaponType: 'bow', equipped: true, summon: true });
  step(0.3);
  ctl.setAiming(true);
  step(0.6);
  assert.equal(ctl.getCurrent(), 'bowDraw', 'still drawing at half charge');
  const draw = ctl.actions.bowDraw;
  const u = draw.getClip().userData;
  assert.ok(draw.time > u.nock && draw.time < u.full - 0.05, `half drawn (${draw.time.toFixed(3)} of ${u.full})`);
  step(0.7);
  assert.equal(ctl.getCurrent(), 'bowHold', 'fully drawn once fully charged');
});

test('GameWorld3D: the held left button charges a basic swing and the charge lands where the damage is decided', () => {
  const world = readFileSync('src/components/game3d/GameWorld3D.jsx', 'utf8');
  assert.match(world, /attackPressed\.current=true;\s*\/\/[^\n]*\n\s*meleeHold\.active=true;meleeHold\.at=performance\.now\(\);/);
  assert.match(world, /if\(e\.button===0\)releaseMeleeHold\(\);/);
  assert.match(world, /const cancelBowCharge=\(\)=>\{[\s\S]{0,140}releaseMeleeHold\(\);/);
  assert.match(world, /\? \{ hold: true, pressedAt: meleeHold\.at \/ 1000 \} : \{\}\),/);
  assert.match(world, /pendingMeleeContacts\.splice\(waiting, 1\)\[0\]\.land\(meleeChargeMultiplier\(cue\.serial\)\);/);
  assert.match(world, /const swingMultiplier = strikeMultiplier;\s*const landStrike = \(charge = 1\) => \{\s*const strikeMultiplier = swingMultiplier \* Math\.max\(1, Number\(charge\) \|\| 1\);/);
  // inside landStrike the rogue/boss bridge and the PvE strike resolution keep main's call sites and get the charge
  const landed = world.slice(world.indexOf('const landStrike = (charge = 1) => {'), world.indexOf('if (contactSerial) pendingMeleeContacts.push'));
  assert.equal(landed.split('skillMultiplier: strikeMultiplier, targetHp').length - 1, 1, 'the PvE strike carries it');
  assert.equal(landed.split(/dispatchRogueAttack\(playerDerivedRef,\s*strikeMultiplier,\s*bowAimTarget\)/).length - 1, 2, 'both bridge calls carry it');
  assert.match(world, /if\(!charge\?\.engaged\|\|window\.__activeDuel\)return 1;/);
  assert.match(world, /'CHARGED · DOUBLE DAMAGE'/);
});
