#!/usr/bin/env node
/* global process, console */
// Builds the Game 3D mobility clip pack for the fused bodies (src/components/game3d/player/mobilityClipPack.mjs):
//
//   node tools/avatar-motion/mobility-clips.mjs [--pack "C:/Users/<you>/Downloads/Pro Longbow Pack"]
//                                               [--body male|female|both] [--only Sprint,Back_Roll] [--authored-only]
//                                               [--blender "<blender.exe>"]
//
// Output: public/models/animations/mocap/<Name>.glb (male) and .../mocap/female/<Name>.glb (female): skeleton-only
// game clips (one animation named like the file, extras; the mocap clip format), plus
// public/models/animations/mocap/manifest.json listing every clip per rig id. The game loads the pack by that
// manifest and binds the clips by bone name.
//
// The pack fills what dodgeMoves.js (Flip_Left / Flip_Right / Back_Flip / Front_Roll) does not have:
//  - Dodge_Forward: the owner's Mixamo Pro Longbow Pack "standing dodge forward" (the double-tap W sidestep),
//  - Sprint: the pack's "standing run forward", trimmed to one cycle (Ctrl sprint),
//  - Back_Roll: a backward shoulder roll authored here on each fused rig (the "Roll dodges" S and R alone).
// FBX goes through Blender in the background (tools/mocap/blender/fbx_to_glb.py) and onto the fused rig with
// src/lib/mocap/retarget.js. Authored clips key joint angles in degrees about the character's own axes, solved with
// forward kinematics; grounded frames keep the lowest foot on the floor. All clips are in place (the game moves the
// hero through its collision sweep); Sprint carries `speed`, the planted-foot speed of the cycle, so
// fusedLocomotionSync can keep the feet from sliding. The FBX files are the owner's and are not in the repository.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { retargetToRig } from '../../src/lib/mocap/retarget.js';
import { buildRig, restBasis } from '../../src/lib/mocap/rig.js';
import { parseGlb, skeletonOnly, appendAnimation, serializeGlb } from '../../src/lib/mocap/glbClip.js';
import { readGlb, readAccessor, sampleAnimation } from './glb-io.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PACK_DIR = path.join(ROOT, 'public/models/animations/mocap');
export const MANIFEST_PATH = path.join(PACK_DIR, 'manifest.json');
export const DEFAULT_LONGBOW_DIR = process.env.LONGBOW_PACK || 'C:/Users/marcu/Downloads/Pro Longbow Pack';
const DEG = Math.PI / 180;
const AUTHOR = 'tools/avatar-motion/mobility-clips.mjs';

// Longbow pack clips the game plays. `kind` decides the post-processing.
// (The pack's "standing dodge backward / left / right" and "standing dive forward" convert the same way; the game
// plays dodgeMoves.js's authored flips and roll for those, so they are not built.)
export const LONGBOW_CLIPS = Object.freeze([
  { name: 'Dodge_Forward', file: 'standing dodge forward.fbx', kind: 'dodge' },
  { name: 'Sprint', file: 'standing run forward.fbx', kind: 'gait', gait: 'sprint' },
]);

// ------------------------------------------------------------------------------------------- sources and bodies

export const BODY_FILES = { male: 'public/models/characters/fused/Male_Fused_v2.glb', female: 'public/models/characters/fused/Female_Fused_v2.glb' };
export const RIG_IDS = { male: 'fused-male-v1', female: 'fused-female-v1' };
export const bodiesOf = (b = 'male') => (b === 'both' ? ['male', 'female'] : [b]);

export function parseArgs(argv, defaults = {}) {
  const out = { _: [], ...defaults };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); out[k] = v !== undefined ? v : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true); }
    else out._.push(a);
  }
  return out;
}

const bodyCache = new Map();
export function loadBody(body) {
  const file = path.join(ROOT, BODY_FILES[body] || body);
  if (!bodyCache.has(file)) { const glb = parseGlb(fs.readFileSync(file)); bodyCache.set(file, { file, glb, rig: buildRig(glb.json) }); }
  return bodyCache.get(file);
}

export function findBlender() {
  const env = process.env.BLENDER;
  if (env && fs.existsSync(env)) return env;
  const root = 'C:/Program Files/Blender Foundation';
  if (fs.existsSync(root)) {
    for (const d of fs.readdirSync(root).filter((x) => /^Blender/.test(x)).sort().reverse()) {
      const exe = path.join(root, d, 'blender.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return 'blender';
}

// glTF animation of a skinned skeleton -> retarget.js source (joints at rest, local rotations per frame)
export function gltfSource(file, animName) {
  const g = readGlb(file), J = g.json;
  const anims = J.animations || [];
  if (!anims.length) throw new Error(`${file} has no animations`);
  const anim = animName ? anims.find((a) => a.name === animName) : anims[0];
  if (!anim) throw new Error(`no animation ${animName}; have ${anims.map((a) => a.name).join(', ')}`);
  const hips = J.nodes.findIndex((n) => /hips$/i.test(n.name || ''));
  if (hips < 0) throw new Error('no Hips node');
  const parent = new Array(J.nodes.length).fill(-1);
  J.nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
  const chain = []; for (let p = parent[hips]; p >= 0; p = parent[p]) chain.unshift(p);
  const order = [...chain]; (function walk(i) { order.push(i); (J.nodes[i].children || []).forEach(walk); })(hips);
  const idx = new Map(order.map((n, k) => [n, k]));
  const restOf = (n) => ({ t: new THREE.Vector3(...(n.translation || [0, 0, 0])), r: new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])) });
  let s = 1; for (const c of chain) s *= (J.nodes[c].scale || [1, 1, 1])[0]; // armature scale (Mixamo FBX: 0.01)
  const joints = order.map((ni, k) => { const n = J.nodes[ni], r = restOf(n); if (!chain.includes(ni)) r.t.multiplyScalar(s); return { name: n.name, parent: k === 0 ? -1 : idx.get(parent[ni]), ...r }; });
  const times = readAccessor(g, anim.samplers[0].input).map((r) => r[0]);
  const T = Math.max(...anim.samplers.map((sm) => { const t = readAccessor(g, sm.input); return t[t.length - 1][0]; }));
  const fps = Math.round((times.length - 1) / (times[times.length - 1] - times[0] || 1)) || 30;
  const nF = Math.round(T * fps) + 1, frames = [];
  for (let f = 0; f < nF; f++) {
    const m = sampleAnimation(g, anim, f / fps);
    const rotations = order.map((ni, k) => (m.get(ni)?.rotation ? new THREE.Quaternion(...m.get(ni).rotation) : joints[k].r.clone()));
    const ht = m.get(hips)?.translation;
    frames.push({ rotations, rootPosition: ht ? new THREE.Vector3(...ht).multiplyScalar(s) : null });
  }
  return { joints, frames, fps, rootIndex: idx.get(hips), name: anim.name };
}

// FBX -> temporary GLB (Blender in the background) -> retarget source
export function loadFbxSource(file, { blender } = {}) {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mobility-')), 'clip.glb');
  const script = path.join(ROOT, 'tools/mocap/blender/fbx_to_glb.py');
  const r = spawnSync(blender || findBlender(), ['--background', '--factory-startup', '--python', script, '--', path.resolve(file), tmp], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(tmp)) throw new Error(`Blender FBX conversion failed (${r.error?.message || r.status}):\n${(r.stdout || '').slice(-1500)}\n${(r.stderr || '').slice(-1500)}`);
  return gltfSource(tmp);
}

// net hips travel of a solved clip, in the hips' parent space
function travelOf(solved) {
  const t = solved.hips.translations, n = t.length / 3;
  return [0, 1, 2].map((k) => +(t[(n - 1) * 3 + k] - t[k]).toFixed(4));
}
// keep the vertical hips motion, drop the horizontal travel (the game moves the hero itself)
function makeInPlace(solved) {
  const t = solved.hips.translations, n = t.length / 3, x0 = t[0], z0 = t[2];
  for (let i = 0; i < n; i++) { t[i * 3] = x0; t[i * 3 + 2] = z0; }
  return solved;
}
function contactRuns(flags, fps) {
  const r = []; let s = -1;
  flags.forEach((c, i) => { if (c && s < 0) s = i; if (!c && s >= 0) { r.push([s, i - 1]); s = -1; } });
  if (s >= 0) r.push([s, flags.length - 1]);
  return r.map(([a, b]) => [+(a / fps).toFixed(3), +(b / fps).toFixed(3)]);
}

/** Write one solved clip as a skeleton-only game clip GLB next to the others. */
export function writeGameClip(solved, { name, body, inPlace = false, source, extras = {} }) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw new Error(`clip name "${name}": letters, digits and _ only`);
  const { glb } = loadBody(body);
  const travel = travelOf(solved);
  if (inPlace) makeInPlace(solved);
  const left = solved.contacts?.left || [], right = solved.contacts?.right || [];
  const anim = {
    name,
    channels: [
      { node: solved.hips.node, path: 'translation', times: solved.times, values: solved.hips.translations },
      ...solved.bones.map((b) => ({ node: b.node, path: 'rotation', times: solved.times, values: b.rotations })),
    ],
    extras: {
      loop: false, duration: +solved.times[solved.times.length - 1].toFixed(3), fps: solved.fps, inPlace: !!inPlace, rootMotion: !inPlace, travel,
      ...(left.some(Boolean) || right.some(Boolean) ? { footContacts: { left: contactRuns(left, solved.fps), right: contactRuns(right, solved.fps) } } : {}),
      source, author: AUTHOR, ...extras,
    },
  };
  const out = skeletonOnly(glb);
  out.json.extras = { rigId: glb.json.extras?.rigId || RIG_IDS[body] };
  appendAnimation(out, anim);
  const bytes = serializeGlb(out);
  const file = path.join(PACK_DIR, body === 'female' ? 'female' : '', `${name}.glb`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return { body, out: path.relative(ROOT, file).replace(/\\/g, '/'), bytes: bytes.length, clip: name, frames: solved.times.length, seconds: +solved.times[solved.times.length - 1].toFixed(3), bones: solved.bones.length };
}

// ---------------------------------------------------------------------------------------------- pose helpers

/** World matrices (model space) of the hips subtree for one frame of a solved clip (rest for unsolved bones). */
export function solvedFrameWorld(rig, solved, frame) {
  const rotations = new Map(solved.bones.map((b) => [b.node, b.rotations]));
  const world = new Map();
  const parentWorld = rig.world[rig.parent[rig.hipsIndex]];
  for (const i of rig.order) {
    const q = rotations.has(i) ? new THREE.Quaternion().fromArray(rotations.get(i), frame * 4) : rig.local[i].r;
    const t = i === rig.hipsIndex ? new THREE.Vector3().fromArray(solved.hips.translations, frame * 3) : rig.local[i].t;
    const m = new THREE.Matrix4().compose(t, q, rig.local[i].s);
    world.set(i, (i === rig.hipsIndex ? parentWorld : world.get(rig.parent[i])).clone().multiply(m));
  }
  return world;
}
const positionOf = (world, i) => new THREE.Vector3().setFromMatrixPosition(world.get(i));

/** Planted-foot speed of a gait cycle (m/s in the character's forward axis), measured relative to the hips. */
export function gaitSpeed(rig, solved) {
  const n = solved.times.length, fwd = restBasis(rig).fwd;
  const feet = ['LeftFoot', 'RightFoot'].map((name) => rig.bone(name));
  const frames = Array.from({ length: n }, (_, f) => solvedFrameWorld(rig, solved, f));
  const heights = feet.map((foot) => frames.map((w) => positionOf(w, foot).y));
  const samples = [];
  feet.forEach((foot, k) => {
    const floor = Math.min(...heights[k]);
    for (let f = 0; f + 1 < n; f++) {
      if (heights[k][f] > floor + 0.03 || heights[k][f + 1] > floor + 0.03) continue;
      const a = positionOf(frames[f], foot).sub(positionOf(frames[f], rig.hipsIndex));
      const b = positionOf(frames[f + 1], foot).sub(positionOf(frames[f + 1], rig.hipsIndex));
      const dt = solved.times[f + 1] - solved.times[f];
      if (dt > 0) samples.push(-b.sub(a).dot(fwd) / dt);
    }
  });
  if (samples.length < 6) throw new Error(`too few planted frames (${samples.length}) to measure the gait speed`);
  samples.sort((x, y) => x - y);
  return { speed: samples[samples.length >> 1], samples: samples.length };
}

const quatAngle = (a, ia, b, ib) => {
  const d = Math.min(1, Math.abs(a[ia] * b[ib] + a[ia + 1] * b[ib + 1] + a[ia + 2] * b[ib + 2] + a[ia + 3] * b[ib + 3]));
  return 2 * Math.acos(d);
};

/** Cut a locomotion take to its best repeating cycle: the frame (past `minFraction`) closest to frame 0, which then becomes equal to it. */
export function trimToCycle(solved, minFraction = 0.5) {
  const n = solved.times.length;
  let best = n - 1, bestDistance = Infinity;
  for (let f = Math.max(2, Math.floor(n * minFraction)); f < n; f++) {
    let d = 0;
    for (const b of solved.bones) d += quatAngle(b.rotations, 0, b.rotations, f * 4);
    if (d < bestDistance) { bestDistance = d; best = f; }
  }
  const m = best + 1;
  solved.times = solved.times.slice(0, m);
  for (const b of solved.bones) {
    b.rotations = b.rotations.slice(0, m * 4);
    b.rotations.set(b.rotations.subarray(0, 4), (m - 1) * 4);
  }
  const t = solved.hips.translations.slice(0, m * 3);
  t[(m - 1) * 3 + 1] = t[1];
  solved.hips.translations = t;
  solved.contacts = { left: [], right: [] };
  return { frames: m, seconds: +solved.times[m - 1].toFixed(3), residualRad: +bestDistance.toFixed(3) };
}

// --------------------------------------------------------------------------------------- authored flips/rolls

// Keyed channels, degrees unless noted. Rotations are about the character's axes at rest: pitch channels about
// the left axis (positive = the top of the segment moves forward), armDown about the forward axis (0 = T-pose,
// 90 = hanging), swing about the left axis (positive = forward/up), elbow about the up axis (positive = bent).
// hipsY is a model-space offset in metres; grounded frames are clamped so the lowest foot touches the floor.
const CHANNELS = ['pitch', 'hipsY', 'spine', 'spine2', 'head', 'hip', 'knee', 'ankle', 'armDown', 'swing', 'elbow'];
const NEUTRAL = { pitch: 0, hipsY: 0, spine: 0, spine2: 0, head: 0, hip: 0, knee: 0, ankle: 0, armDown: 78, swing: 0, elbow: 12 };

export const AUTHORED_CLIPS = Object.freeze([
  {
    name: 'Back_Roll', seconds: 0.9, extras: { airborne: false, kind: 'back-roll' },
    keys: [
      { t: 0.00, ...NEUTRAL, grounded: true },
      { t: 0.12, pitch: 18, hipsY: -0.30, spine: 22, spine2: 14, head: 10, hip: 68, knee: 96, ankle: 30, armDown: 84, swing: 40, elbow: 40, grounded: true },
      { t: 0.22, pitch: -28, hipsY: -0.46, spine: 40, spine2: 26, head: 40, hip: 96, knee: 122, ankle: 20, armDown: 70, swing: 72, elbow: 88 },
      { t: 0.34, pitch: -118, hipsY: -0.50, spine: 50, spine2: 32, head: 48, hip: 118, knee: 138, ankle: 10, armDown: 50, swing: 118, elbow: 104 },
      { t: 0.46, pitch: -208, hipsY: -0.50, spine: 50, spine2: 32, head: 48, hip: 120, knee: 140, ankle: 10, armDown: 48, swing: 110, elbow: 108 },
      { t: 0.58, pitch: -292, hipsY: -0.48, spine: 36, spine2: 22, head: 30, hip: 110, knee: 126, ankle: 18, armDown: 66, swing: 80, elbow: 64 },
      { t: 0.70, pitch: -350, hipsY: -0.40, spine: 20, spine2: 12, head: 8, hip: 92, knee: 112, ankle: 26, armDown: 78, swing: 42, elbow: 32, grounded: true },
      { t: 0.80, pitch: -346, hipsY: -0.22, spine: 14, spine2: 8, head: 4, hip: 60, knee: 80, ankle: 24, armDown: 80, swing: 30, elbow: 22, grounded: true },
      { t: 0.90, ...NEUTRAL, pitch: -360, hip: 2, knee: 4, grounded: true },
    ],
  },
]);

const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
function channelAt(keys, channel, t) {
  const fallback = NEUTRAL[channel] ?? 0;
  const value = (k) => (k[channel] === undefined ? fallback : k[channel]);
  if (t <= keys[0].t) return value(keys[0]);
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b.t) return value(a) + (value(b) - value(a)) * smooth((t - a.t) / (b.t - a.t));
  }
  return value(keys[keys.length - 1]);
}
// A frame is grounded only inside a segment between two grounded keys: the hips follow the authored height
// through take-off and touchdown segments and the floor clamp applies while both feet should be planted.
const groundedAt = (keys, t) => {
  if (t >= keys[keys.length - 1].t - 1e-9) return !!keys[keys.length - 1].grounded;
  for (let i = 0; i + 1 < keys.length; i++) {
    if (t >= keys[i].t - 1e-9 && t < keys[i + 1].t - 1e-9) return !!keys[i].grounded && !!keys[i + 1].grounded;
  }
  return !!keys[0].grounded;
};

/** Author one clip on a fused rig: returns the solved form writeGameClip() takes. */
export function authorClip(rig, spec, fps = 30) {
  const basis = restBasis(rig);
  const L = basis.left.clone(), U = basis.up.clone(), F = basis.fwd.clone();
  const need = (name) => { const i = rig.bone(name); if (i === undefined) throw new Error(`rig has no ${name}`); return i; };
  const maybe = (name) => rig.bone(name);
  const B = {
    hips: need('Hips'), spine: need('Spine'), spine1: maybe('Spine1'), spine2: need('Spine2'), neck: need('Neck'), head: need('Head'),
    lUpLeg: need('LeftUpLeg'), lLeg: need('LeftLeg'), lFoot: need('LeftFoot'), lToe: maybe('LeftToeBase'),
    rUpLeg: need('RightUpLeg'), rLeg: need('RightLeg'), rFoot: need('RightFoot'), rToe: maybe('RightToeBase'),
    lArm: need('LeftArm'), lForeArm: need('LeftForeArm'), rArm: need('RightArm'), rForeArm: need('RightForeArm'),
  };
  const restW = (i) => rig.worldRot(i);
  const localRest = (i) => restW(rig.parent[i]).invert().multiply(restW(i));
  // A rotation R about the character's axes (at rest), applied in the bone's parent frame so it follows the
  // parent's own motion: local = (parentRest⁻¹ R parentRest) · localRest.
  const localFor = (i, R) => {
    const p = restW(rig.parent[i]);
    return p.clone().invert().multiply(R).multiply(p).multiply(localRest(i)).normalize();
  };
  const rot = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, deg * DEG);
  const hipsRest = rig.pos('Hips');
  const parentHipsInv = rig.world[rig.parent[rig.hipsIndex]].clone().invert();
  const feet = [B.lFoot, B.rFoot, B.lToe, B.rToe].filter((i) => i !== undefined);
  const floorY = Math.min(...feet.map((i) => new THREE.Vector3().setFromMatrixPosition(rig.world[i]).y));
  // The GLBs are not in metres (the runtime scales the body to its height); hipsY keys are metres on a 1.73 m
  // body whose hips stand about 0.97 m above the floor.
  const unitsPerMetre = (hipsRest.y - floorY) / 0.97;

  const n = Math.round(spec.seconds * fps) + 1;
  const times = new Float32Array(n);
  const animated = [B.hips, B.spine, B.spine1, B.spine2, B.neck, B.head, B.lUpLeg, B.lLeg, B.lFoot, B.rUpLeg, B.rLeg, B.rFoot, B.lArm, B.lForeArm, B.rArm, B.rForeArm].filter((i) => i !== undefined);
  const order = rig.order.filter((i) => animated.includes(i));
  const rotations = new Map(order.map((i) => [i, new Float32Array(n * 4)]));
  const translations = new Float32Array(n * 3);
  const contacts = [];
  const shifts = [];
  for (let f = 0; f < n; f++) {
    const t = Math.min(spec.seconds, f / fps);
    times[f] = t;
    const v = Object.fromEntries(CHANNELS.map((c) => [c, channelAt(spec.keys, c, t)]));
    const q = new Map();
    q.set(B.hips, localFor(B.hips, rot(L, v.pitch)));
    q.set(B.spine, localFor(B.spine, rot(L, v.spine)));
    if (B.spine1 !== undefined) q.set(B.spine1, localFor(B.spine1, rot(L, v.spine2 * 0.5)));
    q.set(B.spine2, localFor(B.spine2, rot(L, v.spine2)));
    q.set(B.neck, localFor(B.neck, rot(L, v.head * 0.4)));
    q.set(B.head, localFor(B.head, rot(L, v.head)));
    for (const side of ['l', 'r']) {
      const sign = side === 'l' ? 1 : -1;
      q.set(B[`${side}UpLeg`], localFor(B[`${side}UpLeg`], rot(L, -v.hip)));
      q.set(B[`${side}Leg`], localFor(B[`${side}Leg`], rot(L, v.knee)));
      q.set(B[`${side}Foot`], localFor(B[`${side}Foot`], rot(L, -v.ankle)));
      q.set(B[`${side}Arm`], localFor(B[`${side}Arm`], rot(L, -v.swing).multiply(rot(F, -sign * v.armDown))));
      q.set(B[`${side}ForeArm`], localFor(B[`${side}ForeArm`], rot(U, -sign * v.elbow)));
    }
    const grounded = groundedAt(spec.keys, t);
    let desired = hipsRest.clone().add(U.clone().multiplyScalar(v.hipsY * unitsPerMetre));
    let hipsLocal = desired.clone().applyMatrix4(parentHipsInv);
    if (grounded) {
      const touchdown = f > 0 && !contacts[f - 1] ? 0.5 : (f > 1 && !contacts[f - 2] ? 0.85 : 1); // ease the clamp in after flight
      const probe = { times, bones: order.map((i) => ({ node: i, rotations: q.get(i).toArray() })), hips: { translations: hipsLocal.toArray() } };
      const world = solvedFrameWorld(rig, probe, 0);
      const lowest = Math.min(...feet.map((i) => positionOf(world, i).y));
      const shift = (floorY - lowest) * touchdown;
      shifts.push(+(shift / unitsPerMetre).toFixed(3));
      desired = desired.add(U.clone().multiplyScalar(shift));
      hipsLocal = desired.applyMatrix4(parentHipsInv);
    }
    translations.set(hipsLocal.toArray(), f * 3);
    for (const i of order) rotations.get(i).set(q.get(i).toArray(), f * 4);
    contacts.push(grounded);
  }
  // keep every quaternion track on one hemisphere so the runtime slerps the short way
  for (const r of rotations.values()) for (let f = 1; f < n; f++) {
    const a = (f - 1) * 4, b = f * 4;
    if (r[a] * r[b] + r[a + 1] * r[b + 1] + r[a + 2] * r[b + 2] + r[a + 3] * r[b + 3] < 0) for (let k = 0; k < 4; k++) r[b + k] = -r[b + k];
  }
  return {
    fps, times,
    bones: order.map((i) => ({ node: i, name: rig.nodes[i].name, rotations: rotations.get(i) })),
    hips: { node: rig.hipsIndex, name: rig.nodes[rig.hipsIndex].name, translations },
    contacts: { left: contacts, right: contacts },
    stats: { frames: n, groundShifts: shifts, unitsPerMetre: +unitsPerMetre.toFixed(4) },
  };
}

// ------------------------------------------------------------------------------------------------- manifest

/** Scan the pack directory and write manifest.json (every non-sample clip, per rig id). */
export function writeManifest() {
  const bodies = {};
  for (const [dir, rigId] of [['', 'fused-male-v1'], ['female/', 'fused-female-v1']]) {
    const folder = path.join(PACK_DIR, dir);
    if (!fs.existsSync(folder)) continue;
    const clips = [];
    for (const file of fs.readdirSync(folder).filter((f) => /^[A-Za-z][A-Za-z0-9_]*\.glb$/.test(f) && !/^Sample_/.test(f)).sort()) {
      const { json } = readGlb(path.join(folder, file));
      const name = file.replace(/\.glb$/, '');
      if (json.extras?.rigId !== rigId || !json.animations?.some((a) => a.name === name)) continue;
      clips.push(name);
    }
    bodies[rigId] = { dir, clips };
  }
  const manifest = { version: 1, generatedBy: AUTHOR, bodies };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

// ------------------------------------------------------------------------------------------------------ CLI

export function buildPack({ packDir = DEFAULT_LONGBOW_DIR, body = 'both', only = null, authoredOnly = false, blender } = {}) {
  const bodies = bodiesOf(body), report = [];
  const wanted = (name) => !only || only.includes(name);
  if (!authoredOnly) {
    for (const entry of LONGBOW_CLIPS) {
      if (!wanted(entry.name)) continue;
      const file = path.join(packDir, entry.file);
      if (!fs.existsSync(file)) { report.push({ clip: entry.name, error: `missing ${file}` }); continue; }
      const source = loadFbxSource(file, { blender });
      for (const b of bodies) {
        const { rig } = loadBody(b);
        const solved = retargetToRig(rig, source, { fps: 30, rootMotion: true });
        const extras = { author: AUTHOR, sourceFile: entry.file, sourcePack: 'Mixamo Pro Longbow Pack (owner)', kind: entry.kind };
        let cycle = null;
        if (entry.kind === 'gait') {
          cycle = trimToCycle(solved);
          const { speed, samples } = gaitSpeed(rig, solved);
          Object.assign(extras, { loop: true, gait: entry.gait, speed: +speed.toFixed(4), cycleSeconds: cycle.seconds, plantedSamples: samples });
        }
        if (entry.airborne) extras.airborne = true;
        const out = writeGameClip(solved, { name: entry.name, body: b, inPlace: true, source: 'mixamo-fbx', extras });
        report.push({ clip: entry.name, body: b, seconds: out.seconds, frames: out.frames, bones: out.bones, speed: extras.speed, bytes: out.bytes, trim: cycle?.residualRad });
      }
    }
  }
  for (const spec of AUTHORED_CLIPS) {
    if (!wanted(spec.name)) continue;
    for (const b of bodies) {
      const { rig } = loadBody(b);
      const solved = authorClip(rig, spec);
      const out = writeGameClip(solved, { name: spec.name, body: b, inPlace: true, source: 'authored', extras: { author: AUTHOR, ...spec.extras } });
      report.push({ clip: spec.name, body: b, seconds: out.seconds, frames: out.frames, bones: out.bones, bytes: out.bytes, groundShift: `${Math.min(...solved.stats.groundShifts)}..${Math.max(...solved.stats.groundShifts)}` });
    }
  }
  const manifest = writeManifest();
  return { report, manifest };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const a = parseArgs(process.argv.slice(2), { body: 'both' });
  const { report, manifest } = buildPack({
    packDir: a.pack || DEFAULT_LONGBOW_DIR, body: a.body, only: a.only ? String(a.only).split(',') : null,
    authoredOnly: !!a['authored-only'], blender: a.blender,
  });
  console.table(report);
  console.log(JSON.stringify(manifest.bodies, null, 1));
  if (report.some((r) => r.error)) process.exitCode = 1;
}
