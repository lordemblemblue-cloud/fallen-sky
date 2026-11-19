#!/usr/bin/env node
/* global process, console */
// Writes the game's weapon clips for Blender (the Weapon Animation Studio, tools/game3d-weapon-anim/README.md):
//
//   node tools/game3d-weapon-anim/export-game-clips.mjs [--out tools/game3d-weapon-anim/studio] [--body male|female|both]
//
// For each fused body it bakes every sword, two-hand, dagger and bow clip exactly as the game does
// (weapons/weaponComboClips.js through the binder's moves, with the pack weapons' own grips), and writes
//   <out>/game-clips-<body>.glb   the body with one animation per game state (swordCombo1, bowDraw, daggerCharge ...)
//   <out>/game-clips-<body>.json  the timing each state carries (hit, sweep, cancel, wind-up, charge, nock, full ...),
//                                 the body's game scale and where each weapon sits in the hand at rest
// tools/game3d-weapon-anim/build_studio.py turns them into a .blend; export_clips.py writes edited clips back into the
// game (public/models/animations/weapons/), where they replace the baked ones. A state the game already plays from that
// pack is written as the pack's clip (with its timing, marked authored), so a rebuilt studio starts from it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { parseGlb, skeletonOnly, appendAnimation, serializeGlb } from '../../src/lib/mocap/glbClip.js';
import { bakeWeaponComboClips, captureRestPose } from '../../src/components/game3d/weapons/weaponComboClips.js';
import { movesForFamily } from '../../src/components/game3d/weapons/weaponComboBinder.js';
import { solveFallbackGrip, DAGGER_PAIR_MODEL } from '../../src/components/game3d/weapons/playerWeaponRuntime.js';
import { weaponClipPackEntries, weaponClipUserData } from '../../src/components/game3d/weapons/weaponClipPack.mjs';

globalThis.self ??= globalThis;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const BODIES = Object.freeze({
  male: Object.freeze({ file: 'public/models/characters/fused/Male_Fused_v2.glb', rigId: 'fused-male-v1' }),
  female: Object.freeze({ file: 'public/models/characters/fused/Female_Fused_v2.glb', rigId: 'fused-female-v1' }),
});
export const GAME_HEIGHT = 1.7; // the game scales every body to this height (GameWorld3D / the tests)
const TIMING_KEYS = ['hit', 'sweep', 'cancel', 'windUp', 'chargeFrom', 'charge', 'nock', 'full', 'combo', 'index', 'idle', 'loop', 'pose',
  'authored', 'variant'];
const PACK_DIR = 'public/models/animations/weapons';
const sanitize = (name) => THREE.PropertyBinding.sanitizeNodeName(name);

function args(argv) {
  const out = { out: 'tools/game3d-weapon-anim/studio', body: 'both' };
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}

export async function loadBody(file) {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'NO_IMAGE_DECODE', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const bytes = fs.readFileSync(path.join(ROOT, file));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const model = gltf.scene;
  const box = new THREE.Box3();
  model.updateMatrixWorld(true);
  model.traverse((n) => { if (n.isSkinnedMesh) box.expandByObject(n); });
  const scale = GAME_HEIGHT / (box.max.y - box.min.y);
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);
  return { model, scale };
}

// Each clip with the hands closed as the game closes them on that family's grip (playerWeaponRuntime.js: the weapon
// manifest's fist for the sword's and the bow's hand; the daggers' solved fists, the thumb on the pommel). The game
// closes the hands itself after the mixer, whatever a clip says, so these finger keys are for the studio's look.
export function withFists(clips, fist) {
  const bones = new Set(Object.keys(fist).map((name) => `${sanitize(name)}.quaternion`));
  return Object.fromEntries(Object.entries(clips).map(([name, clip]) => {
    const tracks = clip.tracks.filter((track) => !bones.has(track.name));
    for (const [bone, q] of Object.entries(fist)) {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${sanitize(bone)}.quaternion`, [0, clip.duration], [...q, ...q]));
    }
    const out = new THREE.AnimationClip(clip.name, clip.duration, tracks);
    out.userData = clip.userData;
    return [name, out];
  }));
}

// Every weapon clip of every family, baked as the game bakes it, with each family's held weapon and closed hands.
export function bakeAllWeaponClips(model, rigId, manifest) {
  const rest = captureRestPose(model);
  const quat = (grip) => new THREE.Quaternion().fromArray(grip.quaternion);
  const sword = manifest.weapons.find((w) => w.id === 'fantasy_sword');
  const bow = manifest.weapons.find((w) => w.id === 'fantasy_bow');
  const hands = manifest.rigs?.[rigId]?.hands || {};
  const daggerGrips = {};
  const daggerFist = {};
  for (const side of ['right', 'left']) {
    const solved = solveFallbackGrip(model, { hand: side, class: 'dagger', handleRadius: DAGGER_PAIR_MODEL.handleRadius }, ['combat'], GAME_HEIGHT);
    daggerGrips[side] = solved.grips.combat;
    Object.assign(daggerFist, Object.keys(solved.fist).length ? solved.fist : hands[side]?.fist || {});
  }
  const fists = { sword: hands[sword.hand]?.fist || {}, bow: hands[bow.hand]?.fist || {}, dagger: daggerFist };
  const clips = {
    ...withFists(bakeWeaponComboClips(model, 'sword', { right: quat(sword.grips[rigId].combat) },
      { rest, reach: sword.length, moves: movesForFamily('swordCombo', { id: sword.id, cls: 'sword', length: sword.length }) }), fists.sword),
    ...withFists(bakeWeaponComboClips(model, 'bow', { left: quat(bow.grips[rigId].combat) }, { rest, moves: movesForFamily('bowCombo') }), fists.bow),
    ...withFists(bakeWeaponComboClips(model, 'dagger', { right: quat(daggerGrips.right), left: quat(daggerGrips.left) },
      { rest, moves: movesForFamily('daggerCombo') }), fists.dagger),
  };
  // where each weapon sits at rest: its root as a child of the hand at the combat grip, in the game's scene
  const weapons = [];
  const place = (family, file, hand, grip, node = null) => {
    const handBone = model.getObjectByName(sanitize(hand));
    const root = new THREE.Object3D();
    root.position.fromArray(grip.position); root.quaternion.fromArray(grip.quaternion); root.scale.setScalar(grip.scale ?? 1);
    handBone.add(root);
    model.updateMatrixWorld(true);
    weapons.push({ family, file, node, hand, matrixWorld: root.matrixWorld.toArray() });
    root.removeFromParent();
  };
  place('sword', `public${sword.url}`, `mixamorig:${sword.hand === 'left' ? 'Left' : 'Right'}Hand`, sword.grips[rigId].combat);
  place('bow', `public${bow.url}`, `mixamorig:${bow.hand === 'left' ? 'Left' : 'Right'}Hand`, bow.grips[rigId].combat);
  place('daggers', `public${DAGGER_PAIR_MODEL.url}`, 'mixamorig:RightHand', daggerGrips.right, DAGGER_PAIR_MODEL.nodes.right);
  place('daggers', `public${DAGGER_PAIR_MODEL.url}`, 'mixamorig:LeftHand', daggerGrips.left, DAGGER_PAIR_MODEL.nodes.left);
  return { clips, weapons, fists };
}

// three.js clips -> a GLB with one animation per clip. skeleton: true writes only the body's node hierarchy (what
// the game loads); otherwise the whole body (mesh and skin) comes along with the clips as its only animations,
// which is what Blender needs to import them as one armature's actions (a skin-less hierarchy imports as empties).
export function clipsToGlb(bodyBytes, clips, { skeleton = true } = {}) {
  const src = parseGlb(bodyBytes);
  const glb = skeleton ? skeletonOnly(src) : src;
  if (!skeleton) glb.json.animations = []; // the body's own clips (Idle, Walk ...) stay out of the studio
  const index = new Map(src.json.nodes.map((n, i) => [sanitize(n.name || ''), i]));
  for (const clip of Object.values(clips)) {
    const channels = [];
    for (const track of clip.tracks) {
      const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
      const node = index.get(nodeName);
      const pathName = propertyName === 'quaternion' ? 'rotation' : propertyName === 'position' ? 'translation' : null;
      if (node === undefined || !pathName) continue;
      channels.push({ node, path: pathName, times: Float32Array.from(track.times), values: Float32Array.from(track.values) });
    }
    appendAnimation(glb, { name: clip.name, channels });
  }
  return serializeGlb(glb);
}

// The clips the game already plays from the pack for this rig, keyed by state, with their pack timing ({} without a pack).
export async function packClipsFor(rigId, { root = ROOT } = {}) {
  const manifestPath = path.join(root, PACK_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return {};
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const out = {};
  for (const { state, entry } of weaponClipPackEntries(manifest, rigId)) {
    const bytes = fs.readFileSync(path.join(root, PACK_DIR, entry.file));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const clip = gltf.animations[0];
    if (!clip) continue;
    clip.name = state;
    clip.userData = weaponClipUserData(entry);
    out[state] = clip;
  }
  return out;
}

// the baked clips, each state the pack has replaced by the pack's clip: its own timing over the baked clip's userData
export function withPackClips(clips, pack) {
  const out = { ...clips };
  for (const [state, clip] of Object.entries(pack)) {
    if (!clips[state]) continue;
    clip.userData = { ...clips[state].userData, ...clip.userData };
    out[state] = clip;
  }
  return out;
}

export function clipTiming(clip) {
  const out = { duration: clip.duration };
  for (const key of TIMING_KEYS) if (clip.userData?.[key] !== undefined && clip.userData[key] !== null) out[key] = clip.userData[key];
  return out;
}

async function main() {
  const opts = args(process.argv.slice(2));
  const outDir = path.resolve(ROOT, opts.out);
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/game3d/weapons/manifest.json'), 'utf8'));
  for (const body of opts.body === 'both' ? Object.keys(BODIES) : [opts.body]) {
    const { file, rigId } = BODIES[body];
    const { model, scale } = await loadBody(file);
    const baked = bakeAllWeaponClips(model, rigId, manifest);
    const pack = await packClipsFor(rigId);
    const clips = withPackClips(baked.clips, pack);
    const { weapons } = baked;
    const glb = clipsToGlb(fs.readFileSync(path.join(ROOT, file)), clips, { skeleton: false });
    fs.writeFileSync(path.join(outDir, `game-clips-${body}.glb`), glb);
    const info = { body, rigId, bodyFile: file, gameHeight: GAME_HEIGHT, scale, fps: 60,
      clips: Object.fromEntries(Object.values(clips).map((c) => [c.name, clipTiming(c)])), weapons };
    fs.writeFileSync(path.join(outDir, `game-clips-${body}.json`), `${JSON.stringify(info, null, 2)}\n`);
    console.log(`[game clips] ${body}: ${Object.keys(clips).length} clips (${Object.keys(pack).length} from the pack) -> ${path.relative(ROOT, outDir)}/game-clips-${body}.glb`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
