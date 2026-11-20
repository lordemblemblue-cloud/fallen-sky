// The owner's Blender-edited weapon clips (tools/game3d-weapon-anim, weapons/weaponClipPack.mjs): the pack's manifest
// and files, the binder playing an authored clip in place of the baked one on every weapon that swings that move set
// (a long blade keeps its katana moves), and the live controller taking the strike and the held wind-up from the
// clip's own markers. The clips here are the game's own bakes, slowed down as an edit would, written in the pack's
// format (a skeleton-only GLB) and read back with the GLTFLoader as the game reads them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  AUTHORABLE_WEAPON_STATES, WEAPON_CLIP_PACK_DIR, WEAPON_CLIP_TIMING, loadWeaponClipPack, weaponClipPackEntries,
  weaponClipUserData,
} from '../src/components/game3d/weapons/weaponClipPack.mjs';
import { createWeaponComboBinder, weaponMoveVariant } from '../src/components/game3d/weapons/weaponComboBinder.js';
import { WEAPON_COMBO_STATES, WEAPON_IDLE_STATES, BOW_POSE_STATES } from '../src/components/game3d/weapons/weaponComboClips.js';
import { solveFallbackGrip } from '../src/components/game3d/weapons/playerWeaponRuntime.js';
import { createPlayerMovementFallbackClips } from '../src/components/game3d/player/playerMovementFallbackClips.js';
import {
  BODIES, bakeAllWeaponClips, clipsToGlb, clipTiming, withPackClips,
} from '../tools/game3d-weapon-anim/export-game-clips.mjs';

globalThis.self ??= globalThis;
const weaponManifest = JSON.parse(readFileSync('public/game3d/weapons/manifest.json', 'utf8'));
const SLOWER = 1.4; // the "edit": the swing 40% slower, its markers moved with it

async function parse(bytes) {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'NO_IMAGE_DECODE', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
async function loadBody(name) {
  const { file, rigId } = BODIES[name];
  const gltf = await parse(readFileSync(file));
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

// An exported pack for the male body: swordCombo1 slowed down, as Blender's export writes it (file + manifest timing).
let pack = null;
async function malePack() {
  if (pack) return pack;
  const model = await loadBody('male');
  const { clips } = bakeAllWeaponClips(model, BODIES.male.rigId, weaponManifest);
  const baked = clips.swordCombo1;
  const edited = baked.clone();
  for (const track of edited.tracks) track.times = track.times.map((t) => t * SLOWER);
  edited.duration = baked.duration * SLOWER;
  const timing = clipTiming(baked);
  const entry = { file: 'swordCombo1.glb', duration: edited.duration, hit: timing.hit * SLOWER, cancel: timing.cancel * SLOWER,
    windUp: timing.windUp * SLOWER, sweep: timing.sweep.map((t) => t * SLOWER) };
  const manifest = { version: 1, bodies: { [BODIES.male.rigId]: { dir: '', clips: { swordCombo1: entry, daggerCharge: { file: 'daggerCharge.glb' } } } } };
  const files = {
    [`${WEAPON_CLIP_PACK_DIR}swordCombo1.glb`]: clipsToGlb(readFileSync(BODIES.male.file), { swordCombo1: edited }),
  };
  // a clip solved on another rig: its bones are not this body's
  const foreign = new THREE.AnimationClip('daggerCharge', 1, [new THREE.QuaternionKeyframeTrack('Spine_02.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])]);
  const loadClip = async (url) => (url.endsWith('daggerCharge.glb') ? foreign : (await parse(files[url])).animations[0]);
  pack = { baked, entry, manifest, loadClip, bytes: files[`${WEAPON_CLIP_PACK_DIR}swordCombo1.glb`] };
  return pack;
}
const quietly = async (fn) => {
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try { return { value: await fn(), warnings }; } finally { console.warn = warn; }
};

test('the manifest lists only states the game plays, by plain file names inside the pack folder', () => {
  const manifest = { version: 1, bodies: {
    'fused-male-v1': { dir: '', clips: {
      swordCombo1: { file: 'swordCombo1.glb' }, daggerCharge: { file: 'daggerCharge.glb' }, bowHold: { file: 'bowHold.glb' },
      idleSword: { file: 'idleSword.glb' }, notAState: { file: 'notAState.glb' }, swordCombo2: { file: '../../secret.glb' },
      swordCombo3: { file: 'a/b/c.glb' }, bowDraw: { file: 'bowDraw.fbx' }, bowCombo1: { file: '/abs.glb' }, bowCombo2: {},
    } },
    'fused-female-v1': { dir: 'female/', clips: { swordCombo1: { file: 'female/swordCombo1.glb' } } },
  } };
  assert.deepEqual(weaponClipPackEntries(manifest, 'fused-male-v1').map((e) => [e.state, e.url]),
    ['swordCombo1', 'daggerCharge', 'bowHold', 'idleSword'].map((s) => [s, `/models/animations/weapons/${s}.glb`]));
  assert.deepEqual(weaponClipPackEntries(manifest, 'fused-female-v1').map((e) => e.url), ['/models/animations/weapons/female/swordCombo1.glb']);
  for (const bad of [null, {}, { version: 2, bodies: manifest.bodies }, { version: 1, bodies: { 'fused-male-v1': { clips: ['swordCombo1'] } } }]) {
    assert.deepEqual(weaponClipPackEntries(bad, 'fused-male-v1'), []);
  }
  assert.deepEqual(weaponClipPackEntries(manifest, null), []);
  for (const state of [...Object.values(WEAPON_COMBO_STATES).flat(), ...WEAPON_IDLE_STATES, ...BOW_POSE_STATES]) {
    assert.ok(AUTHORABLE_WEAPON_STATES.includes(state), `${state} can be edited`);
  }
  assert.deepEqual(weaponClipUserData({ duration: 1, hit: 0.5, cancel: 0.7, windUp: 0.1, sweep: [0.4, 0.6], nock: NaN, full: -1, loop: true, variant: 'longBlade' }),
    { generated: 'weaponClipPack', authored: true, variant: 'longBlade', hit: 0.5, cancel: 0.7, windUp: 0.1, sweep: [0.4, 0.6], loop: true });
  assert.equal(weaponClipUserData({}).variant, 'standard');
});

test('a pack clip loads on its body with its own timing; a foreign clip or no pack changes nothing', async () => {
  const { entry, manifest, loadClip } = await malePack();
  const male = await loadBody('male');
  const { value: clips, warnings } = await quietly(() => loadWeaponClipPack(male, { readManifest: async () => manifest, loadClip }));
  assert.deepEqual(Object.keys(clips), ['swordCombo1'], 'the foreign clip is skipped');
  assert.ok(warnings.some((w) => /Weapon clip daggerCharge skipped/.test(w)));
  const clip = clips.swordCombo1;
  assert.equal(clip.name, 'swordCombo1');
  assert.ok(Math.abs(clip.duration - entry.duration) < 1e-3, 'the edited length');
  for (const key of ['hit', 'cancel', 'windUp']) assert.equal(clip.userData[key], entry[key]);
  assert.deepEqual(clip.userData.sweep, entry.sweep);
  assert.equal(clip.userData.url, `${WEAPON_CLIP_PACK_DIR}swordCombo1.glb`);
  // every track binds to the body (bone names survive the GLB) and the hips keep moving with the clip
  for (const track of clip.tracks) assert.ok(male.getObjectByName(track.name.slice(0, track.name.lastIndexOf('.'))), track.name);
  // no pack (a 404, or the dev server's index.html instead of JSON), no rig id, or the other body: {}
  assert.deepEqual(await loadWeaponClipPack(male, { readManifest: async () => { throw new SyntaxError('Unexpected token <'); } }), {});
  assert.deepEqual(await loadWeaponClipPack(new THREE.Group(), { readManifest: async () => manifest, loadClip }), {});
  const female = await loadBody('female');
  assert.deepEqual(await loadWeaponClipPack(female, { readManifest: async () => manifest, loadClip }), {});
});

test('the binder plays an authored clip for every weapon of its move set; a long blade keeps its katana moves', async () => {
  const { entry, manifest, loadClip } = await malePack();
  const model = await loadBody('male');
  const { value: clips } = await quietly(() => loadWeaponClipPack(model, { readManifest: async () => manifest, loadClip }));
  const authored = clips.swordCombo1;
  const pushed = [];
  let refuse = false;
  const controller = { setWeaponComboClips: (c) => { if (refuse) return false; pushed.push(c); return true; }, getComboState: () => null };
  const gripOf = (id) => new THREE.Quaternion().fromArray(weaponManifest.weapons.find((w) => w.id === id).grips[BODIES.male.rigId].combat.quaternion);
  const daggerGrip = (side) => new THREE.Quaternion().fromArray(solveFallbackGrip(model, { hand: side, class: 'dagger', handleRadius: 0.0155 }, ['combat'], 1.7).grips.combat.quaternion);
  let held = null;
  const runtime = {
    getCurrent: () => held,
    getHands: () => (held?.cls === 'dagger' ? [{ side: 'right', gripQuaternion: daggerGrip('right') }, { side: 'left', gripQuaternion: daggerGrip('left') }]
      : held ? [{ side: 'right', gripQuaternion: gripOf('fantasy_sword') }] : []),
  };
  const binder = createWeaponComboBinder({ model, controller, runtime });
  const latest = (state) => [...pushed].reverse().find((c) => state in c)?.[state];
  assert.equal(latest('swordCombo1').userData.generated, 'weaponComboClips', 'baked at start');
  // the pack loads while a swing plays: it waits, then goes in for every family already baked
  refuse = true;
  assert.equal(binder.setAuthoredClips(clips), false);
  refuse = false;
  binder.update();
  assert.equal(latest('swordCombo1'), authored);
  assert.deepEqual(binder.authoredStates(), ['swordCombo1']);
  // its own timing; what it does not say comes from the baked clip it replaces
  assert.equal(authored.userData.hit, entry.hit);
  assert.equal(authored.userData.windUp, entry.windUp);
  assert.equal(authored.userData.combo, 'swordCombo');
  assert.equal(authored.userData.index, 0);
  // a one-handed sword in hand: its family is rebaked with its grip, and still plays the edited clip
  held = { id: 'fantasy_sword', cls: 'sword', length: 0.95 };
  assert.equal(binder.update(), true);
  assert.equal(pushed.at(-1).swordCombo1, authored);
  assert.equal(pushed.at(-1).swordCombo2.userData.generated, 'weaponComboClips', 'states the pack lacks stay baked');
  // a long blade swings the katana moves under the same names: its own baked clip
  held = { id: 'odachi', cls: 'sword', length: 1.6 };
  assert.equal(weaponMoveVariant('swordCombo', held), 'longBlade');
  assert.equal(weaponMoveVariant('swordCombo', { id: 'fantasy_sword', cls: 'sword' }), 'standard');
  assert.equal(binder.update(), true);
  assert.notEqual(pushed.at(-1).swordCombo1, authored);
  assert.equal(pushed.at(-1).swordCombo1.userData.generated, 'weaponComboClips');
  // daggers rebake without touching the sword's clips
  held = { id: 'wp_dagger', cls: 'dagger' };
  assert.equal(binder.update(), true);
  assert.ok(!('swordCombo1' in pushed.at(-1)) && 'daggerCharge' in pushed.at(-1));
  // back to a one-handed sword: the edited clip again
  held = { id: 'fantasy_sword', cls: 'sword', length: 0.95 };
  assert.equal(binder.update(), true);
  assert.equal(pushed.at(-1).swordCombo1, authored);
  // the studio export's merge does the same: pack timing over the baked userData
  const packClip = authored.clone();
  packClip.userData = weaponClipUserData(entry); // as packClipsFor reads it
  const merged = withPackClips({ swordCombo1: (await malePack()).baked, swordCombo2: pushed.at(-1).swordCombo2 }, { swordCombo1: packClip });
  assert.equal(merged.swordCombo1.userData.hit, entry.hit);
  assert.equal(merged.swordCombo1.userData.combo, 'swordCombo');
});

// ---- the real player controller on the male body ----
const built = buildSync({
  entryPoints: ['src/components/game3d/player/LunaDashboardPlayerController.jsx'],
  bundle: true, platform: 'node', format: 'cjs', write: false, outdir: 'unused', external: ['three'],
}).outputFiles;

test('live: an edited swing strikes on its own hit marker, and a held press waits at its own wind-up', async () => {
  const { baked, entry, manifest, loadClip } = await malePack();
  const clock = { seconds: 0 };
  const runtime = { exports: {} };
  new Function('module', 'exports', 'require', 'performance', built[0].text)(
    runtime, runtime.exports, createRequire(import.meta.url), { now: () => clock.seconds * 1000 },
  );
  const model = await loadBody('male');
  const mixer = new THREE.AnimationMixer(model);
  const ctl = runtime.exports.createLunaDashboardPlayerController({ mixer });
  const own = (name) => model.animations.find((c) => c.name === name);
  ctl.bindClips({ ...createPlayerMovementFallbackClips(model), idle: own('Stand'), walk: own('Walk'), run: own('Run') });
  const binder = createWeaponComboBinder({ model, controller: ctl });
  const { value: clips } = await quietly(() => loadWeaponClipPack(model, { readManifest: async () => manifest, loadClip }));
  assert.equal(binder.setAuthoredClips(clips), true);
  assert.equal(ctl.actions.swordCombo1.getClip(), clips.swordCombo1);
  const cues = [];
  const step = (seconds) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
      clock.seconds += 1 / 60;
      ctl.updateAnimation(1 / 60);
      mixer.update(1 / 60);
      ctl.lateUpdate(1 / 60);
      ctl.updateActionState({ moving: false, running: false, direction: 'forward', aiming: false });
      cues.push(...ctl.pollComboEvents().map((c) => ({ ...c, at: clock.seconds })));
    }
  };
  ctl.setEquipmentContext({ weaponType: 'sword', equipped: true, summon: true });
  step(0.3);
  const started = clock.seconds;
  assert.equal(ctl.HandleCombat('swordCombo', { speed: 1 }), true);
  step(entry.duration + 0.2);
  const hit = cues.find((c) => c.type === 'hit');
  assert.equal(hit?.state, 'swordCombo1');
  const at = hit.at - started;
  assert.ok(Math.abs(at - entry.hit) < 0.035, `the strike lands on the edited hit (${at.toFixed(3)} s, marker ${entry.hit.toFixed(3)} s)`);
  assert.ok(Math.abs(at - baked.userData.hit) > 0.06, `not on the baked one (${baked.userData.hit.toFixed(3)} s)`);
  step(1.5); // the chain's grace runs out: the next press is a first swing again
  cues.length = 0;
  assert.equal(ctl.HandleCombat('swordCombo', { speed: 1, hold: true, pressedAt: clock.seconds }), true);
  assert.equal(ctl.getCurrent(), 'swordCombo1');
  step(0.15); // held, not yet a charge: the swing waits at the edited wind-up
  const swing = ctl.actions.swordCombo1;
  assert.ok(Math.abs(swing.time - entry.windUp) < 0.02, `waits at its wind-up (${swing.time.toFixed(3)} s, marker ${entry.windUp.toFixed(3)} s)`);
  step(0.15); // held past the click window: the charge move takes over
  assert.equal(ctl.getCurrent(), 'swordCharge');
  ctl.releaseCharge();
  step(1);
  assert.ok(cues.some((c) => c.type === 'hit'), 'the released charge strikes');
});

test('the game loads the pack into the binder, and the studio tools write what it reads', () => {
  const world = readFileSync('src/components/game3d/GameWorld3D.jsx', 'utf8');
  assert.match(world, /import \{ loadWeaponClipPack \} from '\.\/weapons\/weaponClipPack\.mjs';/);
  assert.match(world, /loadWeaponClipPack\(fbx\)\.then\(\(clips\) => \{\s*if \(weaponCombos === binder && Object\.keys\(clips\)\.length\) binder\.setAuthoredClips\(clips\);/);
  const exporter = readFileSync('tools/game3d-weapon-anim/export_clips.py', 'utf8');
  const builder = readFileSync('tools/game3d-weapon-anim/build_studio.py', 'utf8');
  const tuple = (src, name) => [...src.match(new RegExp(`${name} = \\(([^)]*)\\)`))[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(new Set(tuple(exporter, 'MARKER_KEYS')), new Set(WEAPON_CLIP_TIMING), 'every timing the game reads is a marker');
  assert.deepEqual(new Set(tuple(builder, 'MARKERS')), new Set(WEAPON_CLIP_TIMING));
  assert.match(exporter, /'file': f'\{sub_dir\}\{state\}\.glb'/);
  assert.match(exporter, /out\['sweep'\] = \[seconds\(marks\['sweep_start'\]\), seconds\(marks\['sweep_end'\]\)\]/);
  assert.match(exporter, /RIGS = \{'Male': \('fused-male-v1', ''\), 'Female': \('fused-female-v1', 'female\/'\)\}/);
  // the export only writes what changed: both scripts hash an action the same way
  const fn = (src) => ['def action_fcurves', 'def fingerprint'].map((name) => src.slice(src.indexOf(name), src.indexOf('\n\n\n', src.indexOf(name)))).join('\n');
  assert.equal(fn(exporter), fn(builder), 'action_fcurves and fingerprint match between the two scripts');
  assert.match(builder, /act\['studio_fingerprint'\] = fingerprint\(act\)/);
  assert.match(exporter, /a\.get\('studio_fingerprint'\) != fingerprint\(a\)/);
});

test('the shipped pack (public/models/animations/weapons): every clip binds to its body with sane timing', async () => {
  const manifestPath = 'public/models/animations/weapons/manifest.json';
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { return; } // no pack shipped: every weapon keeps its baked clips
  const byRig = Object.fromEntries(Object.entries(BODIES).map(([name, b]) => [b.rigId, name]));
  for (const [rigId, entry] of Object.entries(manifest.bodies)) {
    assert.ok(byRig[rigId], `${rigId} is a fused body`);
    const listed = weaponClipPackEntries(manifest, rigId);
    assert.equal(listed.length, Object.keys(entry.clips).length, `${rigId}: every listed clip is a game state with a plain file name`);
    const model = await loadBody(byRig[rigId]);
    const { value: clips, warnings } = await quietly(() => loadWeaponClipPack(model, {
      readManifest: async () => manifest,
      loadClip: async (url) => (await parse(readFileSync(`public${url}`))).animations[0],
    }));
    assert.deepEqual(warnings, [], `${rigId}: nothing skipped`);
    assert.deepEqual(Object.keys(clips).sort(), listed.map((e) => e.state).sort());
    for (const [state, clip] of Object.entries(clips)) {
      const u = clip.userData;
      const end = clip.duration + 1e-3;
      assert.ok(Number.isFinite(u.hit) && u.hit >= 0 && u.hit <= end, `${state}: hit inside the clip`);
      if (Number.isFinite(u.windUp)) assert.ok(u.windUp <= u.hit, `${state}: wind-up before the hit`);
      if (Number.isFinite(u.cancel)) assert.ok(u.cancel >= u.hit && u.cancel <= end, `${state}: cancel after the hit`);
      if (u.sweep) assert.ok(u.sweep[0] <= u.hit && u.hit <= u.sweep[1] && u.sweep[1] <= end, `${state}: the sweep holds the hit`);
      for (const track of clip.tracks) assert.ok(track.values.every(Number.isFinite), `${state} ${track.name}`);
    }
  }
});
