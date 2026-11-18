// Bakes the v5 body clips (Getsuga / Artemis skeletons) onto the fused Mixamo bodies from tools/avatar-fuse.
//
//   node tools/avatar-motion/retarget-fused.mjs     -> public/models/characters/fused/{Male,Female}_Fused_v2.glb
//
// The v1 file is read and copied unchanged (meshes, skin, inverse bind matrices, shape keys, hair); only animations are
// added, so every hair layer that binds to v1 binds to v2 too (tests/avatar-fused-assets.test.mjs checks this).
//
// How a frame is retargeted:
//  - rotations: each mapped target bone takes the source bone's world rotation change since its rest pose, applied on
//    top of the target bone *first turned to point the way the source bone points at rest*. The v5 rigs rest in an
//    A-pose and the fused rigs in a T-pose, so without that alignment the arms would hang 45 degrees off. Spine1 (no
//    source bone: the v5 rigs have two spine bones) is the halfway rotation between Spine and Spine2.
//  - hips: the pelvis' movement from rest, scaled by the leg ratio (target hip-to-ankle height / source).
//  - legs: two-bone IK puts each ankle where the source ankle is relative to its hip joint, scaled by the same ratio,
//    keeping the knee in the plane the rotation pass gave it. A planted source foot therefore stays planted, and an
//    in-place locomotion clip moves its stance foot back at exactly `speed * ratio`, which is the speed written into
//    the baked clip's extras: the runtime moves the character at that speed and the feet do not slide.
//  - fingers, eyes, jaw, props (bow, sword) and face shape keys are not mapped from the v5 rigs (no matching bones on
//    the fused rig).
//
// A source can also be a Mixamo rig (mixamorig:* names, e.g. an FBX from Mixamo converted to GLB): every v5 name in
// BONE_MAP then resolves to the Mixamo bone of the same role, and Spine1 and the fingers map one to one.
import * as THREE from 'three';
import { readGlb, addAccessor, writeGlb, compactGlb } from './glb-io.mjs';
import { buildNodeGraph, animationSampler } from './rig-graph.mjs';

const MALE_SRC = 'public/models/characters/Getsuga_Tensho_Character_v5.glb';
const FEMALE_SRC = 'public/models/characters/Artemis_Character_v5.glb';
// Mixamo "Running" (motion capture, in place, 0.7 s loop): the run the Luna dashboard retargets onto avatars
// (COMPANION_MOTIONS in src/components/onboarding/genesisAssets.js). Converted from that FBX with Blender (armature
// and action only); its extras carry the measured stance-foot speed and foot contacts.
const MIXAMO_RUN_SRC = 'tools/avatar-motion/sources/Running.glb';

// target (mixamorig:<name>) <- source bone; `aim` is the child used to align rest directions on each side
export const BONE_MAP = [
  { t: 'Hips', s: 'pelvis' },
  { t: 'Spine', s: 'spine_01', aim: ['Spine2', 'spine_02'] },
  { t: 'Spine2', s: 'spine_02', aim: ['Neck', 'neck_01'] },
  { t: 'Neck', s: 'neck_01', aim: ['Head', 'head'] },
  { t: 'Head', s: 'head' },
  ...['Left', 'Right'].flatMap((side) => {
    const l = side === 'Left' ? 'l' : 'r';
    return [
      { t: `${side}Shoulder`, s: `clavicle_${l}`, aim: [`${side}Arm`, `upperarm_${l}`] },
      { t: `${side}Arm`, s: `upperarm_${l}`, aim: [`${side}ForeArm`, `lowerarm_${l}`] },
      { t: `${side}ForeArm`, s: `lowerarm_${l}`, aim: [`${side}Hand`, `hand_${l}`] },
      { t: `${side}Hand`, s: `hand_${l}`, aim: [`${side}HandMiddle1`, `fingers_${l}`] },
      { t: `${side}UpLeg`, s: `thigh_${l}`, aim: [`${side}Leg`, `calf_${l}`] },
      { t: `${side}Leg`, s: `calf_${l}`, aim: [`${side}Foot`, `foot_${l}`] },
      { t: `${side}Foot`, s: `foot_${l}`, aim: [`${side}ToeBase`, `ball_${l}`] },
      { t: `${side}ToeBase`, s: `ball_${l}` },
    ];
  }),
];

// v5 role name -> Mixamo role name, for sources rigged in Mixamo
const MIXAMO_ROLE = new Map(BONE_MAP.flatMap((m) => [[m.s, m.t], ...(m.aim ? [[m.aim[1], m.aim[0]]] : [])]));
const FINGER = /^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)([1-3])$/;

const MALE_CLIPS = ['Idle', 'Stand', 'Combat_Idle', 'Walk', 'Run', 'Dodge_Left', 'Dodge_Right', 'GetsugaTensho', 'Chidori_Attack_01', 'Chidori_Ultimate', 'Chidori_Hit_Stun_Fall'];
const FEMALE_CLIPS = ['Idle', 'Stand', 'Combat_Idle', 'Walk', 'Run', 'Bow_Draw', 'Bow_Sheathe', 'Call_Of_The_Husky', 'Rain_Of_Arrows', 'Lunar_Beam', 'Chidori_Ultimate', 'Chidori_Hit_Stun_Fall'];
// The female runs with the motion-captured Mixamo run; Artemis' run is procedural (tools/avatar-motion/locomotion.mjs).
const FEMALE_SOURCES = { Run: { from: MIXAMO_RUN_SRC, name: 'Running', as: 'Run', measureSpeed: true } };

export const BODIES = {
  male: { src: 'public/models/characters/fused/Male_Fused_v1.glb', out: 'public/models/characters/fused/Male_Fused_v2.glb', rigId: 'fused-male-v1',
    clips: [...MALE_CLIPS.map((name) => ({ from: MALE_SRC, name }))] },
  // Artemis has no dodges: the female body takes them from the male source (same retarget, her own leg ratio).
  female: { src: 'public/models/characters/fused/Female_Fused_v1.glb', out: 'public/models/characters/fused/Female_Fused_v2.glb', rigId: 'fused-female-v1',
    clips: [...FEMALE_CLIPS.map((name) => FEMALE_SOURCES[name] || { from: FEMALE_SRC, name }), { from: MALE_SRC, name: 'Dodge_Left' }, { from: MALE_SRC, name: 'Dodge_Right' }] },
};

// extras keys that are distances in the source body's metres
const DISTANCE_EXTRAS = ['speed', 'travel', 'targetDistance'];
const DISTANCE_ARRAYS = ['rootMotion', 'impactHand', 'impactFingers'];

const wp = (o) => o.getWorldPosition(new THREE.Vector3());
const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());

function setWorldQuaternion(bone, world) {
  const parent = bone.parent ? wq(bone.parent) : new THREE.Quaternion();
  bone.quaternion.copy(parent.invert().multiply(world)).normalize();
  bone.updateMatrixWorld(true);
}

// Two-bone IK: rotate upper and lower so `end` reaches `goal`, knee staying in the plane (upper, current knee, goal).
function solveTwoBone(upper, lower, end, goal) {
  const a = wp(upper), b = wp(lower), c = wp(end);
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  const toGoal = goal.clone().sub(a);
  const d = Math.min(Math.max(toGoal.length(), Math.abs(l1 - l2) + 1e-4), (l1 + l2) * 0.9995);
  const dir = toGoal.clone().normalize();
  // knee direction perpendicular to the hip->goal line, from the current knee
  let pole = b.clone().sub(a);
  pole.sub(dir.clone().multiplyScalar(pole.dot(dir)));
  if (pole.lengthSq() < 1e-10) pole = new THREE.Vector3(0, 0, 1).sub(dir.clone().multiplyScalar(dir.z));
  pole.normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const knee = a.clone().add(dir.clone().multiplyScalar(x)).add(pole.multiplyScalar(h));
  const goalPoint = a.clone().add(dir.multiplyScalar(d));
  const turn = (bone, from, to) => {
    const q = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
    setWorldQuaternion(bone, q.multiply(wq(bone)));
  };
  turn(upper, b.clone().sub(a), knee.clone().sub(a));
  turn(lower, wp(end).sub(wp(lower)), goalPoint.clone().sub(wp(lower)));
}

export function makeRetargeter(srcGlb, tgtGlb) {
  const src = buildNodeGraph(srcGlb), tgt = buildNodeGraph(tgtGlb);
  const T = (n) => tgt.byName.get(`mixamorig:${n}`);
  const S = (n) => src.byName.get(n) || src.byName.get(`mixamorig:${MIXAMO_ROLE.get(n) || n}`);
  // A Mixamo source has the fused rig's own bones: map Spine1 and the finger joints directly as well.
  const mixamoSource = !!src.byName.get('mixamorig:Hips');
  const extra = !mixamoSource ? [] : [
    { t: 'Spine1', s: 'mixamorig:Spine1', aim: ['Spine2', 'mixamorig:Spine2'] },
    ...[...tgt.byName.keys()].map((n) => n.replace(/^mixamorig:/, '')).filter((n) => FINGER.test(n)).map((n) => {
      const [, side, finger, k] = n.match(FINGER), child = `${side}Hand${finger}${+k + 1}`;
      return { t: n, s: `mixamorig:${n}`, aim: [child, `mixamorig:${child}`] };
    }),
  ];
  const entries = [...BONE_MAP, ...extra].filter((m) => T(m.t) && S(m.s)).map((m) => {
    const tb = T(m.t), sb = S(m.s);
    let align = new THREE.Quaternion();
    if (m.aim && T(m.aim[0]) && S(m.aim[1])) {
      const dt = wp(T(m.aim[0])).sub(wp(tb)).normalize(), ds = wp(S(m.aim[1])).sub(wp(sb)).normalize();
      align = new THREE.Quaternion().setFromUnitVectors(dt, ds);
    }
    return { ...m, tb, sb, sRestInv: wq(sb).invert(), tAligned: align.multiply(wq(tb)) };
  });
  const order = []; tgt.root.traverse((o) => order.push(o));
  entries.sort((x, y) => order.indexOf(x.tb) - order.indexOf(y.tb));
  const spine1 = T('Spine1'), spine1Mapped = entries.some((e) => e.t === 'Spine1');
  const legs = ['Left', 'Right'].map((side) => {
    const l = side === 'Left' ? 'l' : 'r';
    return { up: T(`${side}UpLeg`), low: T(`${side}Leg`), foot: T(`${side}Foot`), sThigh: S(`thigh_${l}`), sFoot: S(`foot_${l}`) };
  }).filter((g) => g.up && g.low && g.foot && g.sThigh && g.sFoot);
  const legHeight = (thigh, foot) => wp(thigh).y - wp(foot).y;
  const ratio = legHeight(legs[0].up, legs[0].foot) / legHeight(legs[0].sThigh, legs[0].sFoot);
  const sPelvis = S('pelvis'), tHips = T('Hips');
  const restAnkle = Math.min(...legs.map((g) => wp(g.foot).y));
  const sPelvis0 = wp(sPelvis), tHips0 = wp(tHips);

  // world rotations / hip position for the source pose currently applied to `src`
  function pose() {
    tgt.reset(); tgt.update();
    const desired = new Map();
    for (const e of entries) {
      const world = wq(e.sb).multiply(e.sRestInv).multiply(e.tAligned);
      desired.set(e.t, world);
      if (e.t === 'Hips') {
        const p = tHips0.clone().add(wp(sPelvis).sub(sPelvis0).multiplyScalar(ratio));
        tHips.position.copy(tHips.parent.worldToLocal(p));
      }
      setWorldQuaternion(e.tb, world);
      if (e.t === 'Spine2' && spine1 && !spine1Mapped) { // halfway between its neighbours, then Spine2 again on top of it
        setWorldQuaternion(spine1, wq(T('Spine')).slerp(world, 0.5));
        setWorldQuaternion(e.tb, world);
      }
    }
    // Stance width: a foot keeps the source's offset from its own hip, scaled to leg length, but is
    // never set wider than the source's stance measured from the pelvis centre. A body with wide hips
    // for its leg length (the fused female) otherwise stands and walks wide-legged.
    const sC = legs.length === 2 ? wp(legs[0].sThigh).add(wp(legs[1].sThigh)).multiplyScalar(0.5) : null;
    const tC = legs.length === 2 ? wp(legs[0].up).add(wp(legs[1].up)).multiplyScalar(0.5) : null;
    const lat = legs.length === 2 ? wp(legs[0].up).sub(wp(legs[1].up)).normalize() : null;
    for (const g of legs) {
      const goal = wp(g.up).add(wp(g.sFoot).sub(wp(g.sThigh)).multiplyScalar(ratio));
      if (sC) {
        const byCentre = tC.clone().add(wp(g.sFoot).sub(sC).multiplyScalar(ratio));
        const a = goal.clone().sub(tC).dot(lat), b = byCentre.clone().sub(tC).dot(lat);
        if (Math.sign(a) === Math.sign(b) && Math.abs(b) < Math.abs(a)) goal.addScaledVector(lat, b - a);
      }
      solveTwoBone(g.up, g.low, g.foot, goal);
      const side = g.up.name.includes('Left') ? 'Left' : 'Right';
      setWorldQuaternion(g.foot, desired.get(`${side}Foot`));
      const toe = T(`${side}ToeBase`);
      if (toe && desired.get(`${side}ToeBase`)) setWorldQuaternion(toe, desired.get(`${side}ToeBase`));
    }
  }

  function bake(anim, fps) {
    const sampler = animationSampler(srcGlb, anim);
    const duration = sampler.duration, count = Math.max(2, Math.round(duration * fps) + 1);
    const times = [], rot = new Map(entries.map((e) => [e.tb, []])), hips = [], feet = [];
    if (spine1) rot.set(spine1, []);
    for (let i = 0; i < count; i++) {
      const t = (duration * i) / (count - 1);
      times.push(t);
      src.reset(); sampler.apply(src, t); src.update();
      pose();
      for (const [bone, rows] of rot) rows.push(bone.quaternion.toArray());
      hips.push(tHips.position.toArray());
      feet.push(legs.map((g) => wp(g.foot)));
    }
    for (const rows of rot.values()) for (let i = 1; i < rows.length; i++) { // keep each track on one hemisphere
      const a = rows[i - 1], b = rows[i];
      if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0) rows[i] = b.map((v) => -v);
    }
    return { times, rot, hips, duration, feet };
  }

  return { src, tgt, ratio, entries, pose, bake, tHips, legs, restAnkle };
}

function scaleExtras(extras = {}, ratio) {
  const out = JSON.parse(JSON.stringify(extras));
  for (const k of DISTANCE_EXTRAS) if (typeof out[k] === 'number') out[k] = +(out[k] * ratio).toFixed(4);
  for (const k of DISTANCE_ARRAYS) if (Array.isArray(out[k])) out[k] = out[k].map((v) => +(v * ratio).toFixed(4));
  return out;
}

// Median backward (-Z) speed of a planted foot, ankle within 1 cm of its rest height, over a baked in-place clip: the
// ground speed at which this body's feet stay still. Used for motion-capture sources, whose stance speed varies through
// the step, instead of scaling a figure measured on the source body.
function stanceSpeed(times, feet, restAnkle) {
  const v = [];
  for (let k = 0; k < feet[0].length; k++) {
    for (let i = 1; i < times.length; i++) {
      const a = feet[i - 1][k], b = feet[i][k];
      if (a.y < restAnkle + 0.01 && b.y < restAnkle + 0.01) v.push(-(b.z - a.z) / (times[i] - times[i - 1]));
    }
  }
  v.sort((x, y) => x - y);
  return v.length ? v[v.length >> 1] : null;
}

const constant = (rows) => rows.every((r) => r.every((v, k) => Math.abs(v - rows[0][k]) < 1e-6));

export function buildFused(key) {
  const body = BODIES[key], glb = readGlb(body.src), J = glb.json;
  J.animations = [];
  const cache = new Map(), report = [];
  for (const clip of body.clips) {
    if (!cache.has(clip.from)) { const s = readGlb(clip.from); cache.set(clip.from, { glb: s, rt: makeRetargeter(s, glb) }); }
    const { glb: sg, rt } = cache.get(clip.from);
    const anim = sg.json.animations.find((a) => a.name === clip.name);
    if (!anim) throw new Error(`${clip.from} has no ${clip.name}`);
    const name = clip.as || clip.name;
    const fps = anim.extras?.fps && anim.extras.fps > 30 ? anim.extras.fps : name === 'Run' ? 60 : 30;
    const { times, rot, hips, duration, feet } = rt.bake(anim, fps);
    const out = { name, channels: [], samplers: [], extras: { ...scaleExtras(anim.extras, rt.ratio), retargetedFrom: clip.from.split('/').pop(), legRatio: +rt.ratio.toFixed(4), author: 'tools/avatar-motion/retarget-fused.mjs' } };
    if (clip.measureSpeed) {
      const speed = stanceSpeed(times, feet, rt.restAnkle);
      if (speed > 0) out.extras.speed = +speed.toFixed(4);
    }
    const input = addAccessor(glb, times.map((t) => [t]), 'SCALAR', true);
    const add = (node, path, rows, type) => {
      const flat = constant(rows), keys = flat ? [rows[0], rows[0]] : rows;
      const inp = flat ? addAccessor(glb, [[0], [duration]], 'SCALAR', true) : input;
      out.samplers.push({ input: inp, output: addAccessor(glb, keys, type), interpolation: 'LINEAR' });
      out.channels.push({ sampler: out.samplers.length - 1, target: { node, path } });
    };
    for (const [bone, rows] of rot) add(bone.userData.index, 'rotation', rows, 'VEC4');
    add(rt.tHips.userData.index, 'translation', hips, 'VEC3');
    J.animations.push(out);
    report.push({ clip: name, from: out.extras.retargetedFrom, duration: +duration.toFixed(3), frames: times.length, ratio: out.extras.legRatio, speed: out.extras.speed });
  }
  J.extras = { ...(J.extras || {}), rigId: body.rigId };
  compactGlb(glb);
  return { glb, report };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('retarget-fused.mjs')) {
  const only = process.argv.slice(2);
  for (const key of Object.keys(BODIES)) {
    if (only.length && !only.includes(key)) continue;
    const { glb, report } = buildFused(key);
    const bytes = writeGlb(glb, BODIES[key].out);
    console.log(`${BODIES[key].out}  ${(bytes / 1048576).toFixed(2)} MB`);
    console.table(report);
  }
}
