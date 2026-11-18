// Weapon summon / dismiss (owner design 2026-11): weapons are summoned into the hand and melted away,
// never sheathed. Pins Space, the auto-dismiss constant, the one-shot gesture and the stuck draw loop fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import * as THREE from 'three';
import {
  resolveSpaceAction, createWeaponAutoDismiss, weaponVisualForItem,
  WEAPON_AUTO_DISMISS_SECONDS, FAMILY_DEFAULT_WEAPON_MODELS,
} from '../src/components/game3d/weapons/playerWeaponSummon.js';
import { summonGestureWeight, WEAPON_SUMMON_SECONDS } from '../src/components/game3d/weapons/weaponSummonGesture.js';
import { PLAYER_AFK_DELAY_SECONDS } from '../src/components/game3d/player/playerNativeAnimationClips.js';

const world = readFileSync('src/components/game3d/GameWorld3D.jsx', 'utf8');

test('Space melts a drawn weapon on foot; with nothing drawn (or riding) it jumps', () => {
  assert.equal(resolveSpaceAction({ weaponOut: true, mounted: false }), 'dismiss');
  assert.equal(resolveSpaceAction({ weaponOut: false, mounted: false }), 'jump');
  assert.equal(resolveSpaceAction({ weaponOut: true, mounted: true }), 'jump');
  assert.equal(resolveSpaceAction(), 'jump');
});

test('GameWorld3D asks resolveSpaceAction before it jumps', () => {
  const space = world.slice(world.indexOf("if(k===' '){"), world.indexOf("if(k==='r'){"));
  assert.ok(space.includes('resolveSpaceAction'), 'Space handler uses the summon rule');
  assert.ok(space.indexOf('weaponSummon.dismiss()') < space.indexOf('requestJump'), 'dismiss is checked first');
  // Merged with the Air Jump -> wing glide -> Skywalk chain: the dismiss runs only on the press that would leave
  // the ground, and the jump chain stays the fallback.
  assert.match(space, /const spaceOnGround=\(playerAnim\?\.getAirWalkState\?\.\(\)\.mode\|\|'idle'\)==='idle'/, 'dismiss only on the ground');
  assert.match(space, /if\(!e\.repeat && spaceOnGround && resolveSpaceAction\(/);
  assert.match(space, /else if\(!e\.repeat && !isMountedRef\.current\)\{[\s\S]*requestAirWalkAction[\s\S]*requestJump/, 'the jump chain stays the fallback');
});

test('auto-dismiss: one config constant, only uninterrupted out-of-combat movement counts', () => {
  assert.equal(WEAPON_AUTO_DISMISS_SECONDS, 6);
  const timer = createWeaponAutoDismiss();
  const run = (seconds, state) => { let fired = 0; for (let t = 0; t < seconds; t += 0.1) fired += timer.update(0.1, state) ? 1 : 0; return fired; };
  assert.equal(run(5.9, { out: true, moving: true, inCombat: false }), 0);
  assert.equal(run(0.3, { out: true, moving: true, inCombat: false }), 1);
  assert.equal(run(5.5, { out: true, moving: true, inCombat: false }), 0);
  run(0.2, { out: true, moving: false, inCombat: false }); // standing still resets it
  assert.equal(run(5.5, { out: true, moving: true, inCombat: false }), 0);
  assert.equal(run(10, { out: true, moving: true, inCombat: true }), 0, 'never while fighting');
  assert.equal(run(10, { out: false, moving: true, inCombat: false }), 0, 'nothing to dismiss');
});

test('what the hand shows: pack model, family default, daggers, or the item\'s own GLB', () => {
  assert.deepEqual(weaponVisualForItem({ instanceId: 'a', appearance: { weaponModelId: 'odachi' } }, 'sword'), { type: 'pack', id: 'odachi', kind: 'blade' });
  assert.deepEqual(weaponVisualForItem({ instanceId: 'b' }, 'sword'), { type: 'pack', id: FAMILY_DEFAULT_WEAPON_MODELS.sword, kind: 'blade' });
  assert.deepEqual(weaponVisualForItem({ instanceId: 'c' }, 'bow'), { type: 'pack', id: FAMILY_DEFAULT_WEAPON_MODELS.bow, kind: 'bow' });
  assert.equal(weaponVisualForItem({ instanceId: 'd' }, 'dual_blades').type, 'daggers');
  assert.equal(weaponVisualForItem({ instanceId: 'e', modelUrl: '/game3d/test-gear/training-bow.glb' }, 'bow').type, 'external');
  assert.equal(weaponVisualForItem({ instanceId: 'f' }, 'sky'), null);
  assert.equal(weaponVisualForItem(null, 'sword'), null);
  assert.equal(weaponVisualForItem({ instanceId: 'g', equipped: false }, 'sword'), null);
});

test('the summon gesture plays once: out, hold, back to the base clip', () => {
  const total = WEAPON_SUMMON_SECONDS.raise + WEAPON_SUMMON_SECONDS.hold + WEAPON_SUMMON_SECONDS.lower;
  assert.equal(summonGestureWeight(0), 0);
  assert.equal(summonGestureWeight(WEAPON_SUMMON_SECONDS.raise + 0.01), 1);
  for (let t = 0; t <= total + 2; t += 0.01) {
    const w = summonGestureWeight(t);
    assert.ok(w >= 0 && w <= 1, `weight ${w} at ${t}`);
    if (t >= total) assert.equal(w, 0, `still posed at ${t.toFixed(2)} s`);
  }
});

// The reported bug: drawing a sword dropped the player into the longbow pack's bow-holding idle and its
// look/examine variants, which loop. Exercise the real controller with stand-in clips.
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
  const bone = new THREE.Bone();
  bone.name = 'Root';
  root.add(bone);
  const mixer = new THREE.AnimationMixer(root);
  const ctl = runtime.exports.createLunaDashboardPlayerController({ mixer });
  const clip = (name, d = 1) => new THREE.AnimationClip(name, d, [new THREE.QuaternionKeyframeTrack('Root.quaternion', [0, d], [0, 0, 0, 1, 0, 0, 0, 1])]);
  ctl.bindClips(Object.fromEntries(['idle', 'idleArmed', 'idleLook', 'idleExamine', 'walk', 'run', 'equipBow', 'disarmBow'].map((k) => [k, clip(k)])));
  return { ctl, mixer };
}
const settle = ({ ctl, mixer }, clock, seconds) => {
  for (let t = 0; t < seconds; t += 0.1) { clock.seconds += 0.1; ctl.updateActionState({ moving: false }); mixer.update(0.1); ctl.updateMotion(new THREE.Object3D(), 0.1, 0); }
};

test('drawing a sword or daggers keeps the normal idle, also past the idle-variant delay', () => {
  for (const weaponType of ['sword', 'dual_blades']) {
    const clock = { seconds: 0 };
    const c = controller(clock);
    c.ctl.setEquipmentContext({ weaponType, equipped: true, summon: true });
    settle(c, clock, PLAYER_AFK_DELAY_SECONDS + 3);
    assert.equal(c.ctl.getCurrent(), 'idle', `${weaponType}: ${c.ctl.getCurrent()}`);
  }
});

test('bows keep the bow idle; a summoned bow skips the draw-from-the-back montage', () => {
  const clock = { seconds: 0 };
  const summoned = controller(clock);
  summoned.ctl.setEquipmentContext({ weaponType: 'bow', equipped: true, summon: true });
  assert.notEqual(summoned.ctl.getCurrent(), 'equipBow');
  settle(summoned, clock, 1);
  assert.equal(summoned.ctl.getCurrent(), 'idleArmed');
  const legacy = controller({ seconds: 0 });
  legacy.ctl.setEquipmentContext({ weaponType: 'bow', equipped: true });
  assert.equal(legacy.ctl.getCurrent(), 'equipBow', 'unsummoned callers keep the old montage');
});

test('the oil-metal effect patches every shader anchor and restores the real material when done', async () => {
  const { createWeaponConstructFx, WEAPON_CONSTRUCT_SECONDS } = await import('../src/components/game3d/weapons/weaponConstructFx.js');
  const scene = new THREE.Scene();
  const fx = createWeaponConstructFx({ scene });
  const original = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.01).translate(0, 0.4, 0), original);
  const root = new THREE.Group();
  root.add(blade);
  scene.add(root);
  fx.play(root, { kind: 'blade', mode: 'build' });
  assert.notEqual(blade.material, original, 'patched while forming');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  blade.material.onBeforeCompile(shader);
  for (const marker of ['vCF_d = uCF_kind', 'transformed += objectNormal * cfSwell']) assert.ok(shader.vertexShader.includes(marker), marker);
  for (const marker of ['if (vCF_d > cfEdge) discard;', 'vec3(0.008, 0.008, 0.011), cfOil', 'roughnessFactor = mix(', 'metalnessFactor = mix(', 'cfMolten * cfHot']) {
    assert.ok(shader.fragmentShader.includes(marker), `fragment anchor: ${marker}`);
  }
  assert.equal(blade.castShadow, false, 'no shadow while the front reveals it');
  for (let t = 0; t < WEAPON_CONSTRUCT_SECONDS.build + WEAPON_CONSTRUCT_SECONDS.settle + 0.2; t += 1 / 30) fx.update(1 / 30);
  assert.equal(blade.material, original, 'the real material is back once it has set');
  assert.equal(fx.activeCount(), 0);
  let melted = false;
  fx.play(root, { kind: 'blade', mode: 'melt', onDone: () => { melted = true; } });
  for (let t = 0; t < WEAPON_CONSTRUCT_SECONDS.melt + 0.2; t += 1 / 30) fx.update(1 / 30);
  assert.ok(melted, 'melt reports completion so the weapon can be removed');
  fx.dispose();
});

test('GameWorld3D drives the summon flow every frame around the mixer', () => {
  assert.match(world, /weaponSummon\?\.preUpdate\(\);/);
  assert.match(world, /weaponSummon\?\.sync\(equippedForAnimation, equippedFamily\);/);
  assert.match(world, /setEquipmentContext\?\.\(\{ weaponType: equippedFamily \|\| 'unarmed', summon: !!weaponSummon,/);
  const mixerAt = world.indexOf('if (mixer) mixer.update(delta);');
  assert.ok(mixerAt > 0 && world.indexOf('weaponSummon?.update(delta,', mixerAt) > mixerAt, 'summon update runs after the mixer');
  assert.match(world, /weaponSummon\?\.ensureOut\(\);/, 'attacking with nothing out summons the weapon');
  assert.match(world, /weaponSummon\?\.constructOn\(mountedWeaponObject/, 'the riding hand forms its weapon too');
});
