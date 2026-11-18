// Bakes the Baby Wolf companion's idle, walk and gallop onto the Faction 1 bear.
//
//   node tools/avatar-motion/retarget-mounts.mjs
//
// Fallen-sky's winged Faction 2/3 pets (#158, #160) keep the runtime retarget in
// src/components/game3d/character/mountAnimations.mjs. On the bear that runtime
// retarget laid the long spine flat in the gallop (its first spine bone took the
// wolf pelvis's tilt over a much longer lever, and its short legs the wolf's full
// swing); this bake places the spine on the wolf's centre line and gives the bear
// 60% of the swing, so it lopes upright.
//
// Reads and rewrites public/models/mounts/faction_<name>.glb in place: the owner's Tripo-rigged models, whose
// animations (if any) are replaced by Idle, Walk and Run. The source is the Baby Wolf's single 14.6 s take
// (tools/avatar-motion/sources/BabyWolf_Take001.glb, mesh removed), cut into SEGMENTS.
//
// Tripo's bone names do not say what a bone is (the armored wolf's whole body hangs from "Head_0" and its "Spine_3" is
// a hind hip), so every bone is mapped by hand in MOUNTS below, from its rest position, to a part of the Baby Wolf.
//
// How a frame is transferred:
//  - spine, neck, head and tail chains: each joint is placed on the Baby Wolf's centre line (tail tip to snout) at the
//    same spot in body proportions (along hips->shoulders, up by leg height), and each bone turns by the rotation the
//    centre line makes there away from its rest pose. A long mount bone follows the whole stretch of wolf spine it
//    covers, not one short wolf bone, and every mount keeps its own build;
//  - other body bones (jaw, belly, hip tops, tail tufts) follow one Baby Wolf bone: they turn in world space by the
//    rotation that bone made away from its rest pose;
//  - each leg is a chain of mount bones with an anchor on the Baby Wolf leg at every joint (plus one past the last
//    bone). A bone swings away from its rest direction by the rotation its anchor segment makes away from that
//    segment's average direction over the clip, so the legs swing around the mount's own standing pose, not the
//    wolf's staggered rest stance;
//  - bones hanging off the static Tripo root move by their anchor's offset from its clip average, scaled by leg
//    height; then the whole body moves up or down so that paws the Baby Wolf has planted stay on the ground.
import * as THREE from 'three';
import { readGlb, addAccessor, writeGlb, compactGlb } from './glb-io.mjs';
import { buildNodeGraph, animationSampler } from './rig-graph.mjs';

export const SOURCE = 'tools/avatar-motion/sources/BabyWolf_Take001.glb';
// Take 001: idle (head down, sniff, look around) 0-10.7 s, then a two-stride gallop loop, then a walk loop.
export const SEGMENTS = Object.freeze({ Idle: [0, 10.7], Walk: [12.0667, 12.9333], Run: [10.7333, 11.6] });
const GAIT = { Idle: 'idle', Walk: 'walk', Run: 'run' };
const FPS = 30;

// root:   bones under the static Tripo root -> Baby Wolf point whose movement moves them
// chains: spine/neck/head/tail bones in order; each turns with the Baby Wolf centre line between its joint and the next
// follow: mount bone -> Baby Wolf bone it turns with
// legs:   [mount bones from the top of the leg down], [Baby Wolf anchors: one per joint and one past the last bone]
//         anchor: 'Bone' a joint, 'A>B@f' the point a fraction f from joint A to joint B, 'Bone+tip' past a leaf
// legSwing / chainSwing: share of the wolf's leg swing / of each chain's bend a heavier build takes (default 1)
// Sides: the Baby Wolf faces +Z with its left legs on +X; a mount that faces -Z is matched to it turned around.
export const MOUNTS = {
  bear: {
    file: 'public/models/mounts/faction_bear.glb',
    facing: 1,
    // A bear's short, heavy legs reach less than a wolf's, and its head stays low and steady.
    legSwing: 0.6,
    chainSwing: [0.5, 1],
    root: {
      'tripo::Spine_0': 'RigPelvis', 'tripo::1_Left_Limb_0': 'RigLBLeg1', 'tripo::1_Right_Limb_0': 'RigRBLeg1',
      bone_32: 'RigLBLeg1', bone_33: 'RigRBLeg1', bone_20: 'RigPelvis', bone_31: 'RigPelvis', bone_34: 'RigTail1',
    },
    chains: [
      ['tripo::Spine_0', 'tripo::Spine_1', 'tripo::Spine_2', 'tripo::Head_0', 'bone_5', 'bone_6', 'bone_7'],
      ['bone_34', 'bone_35'],
    ],
    follow: {
      bone_8: 'RigJaw1', bone_19: 'RigSpine2', bone_20: 'RigPelvis', bone_31: 'RigPelvis', bone_32: 'RigPelvis', bone_33: 'RigPelvis',
      bone_36: 'RigTail3', bone_37: 'RigTail3', bone_38: 'RigTail3', bone_39: 'RigTail3',
    },
    legs: [
      [['tripo::0_Left_Limb_0', 'tripo::0_Left_Limb_1', 'tripo::0_Left_Limb_2', 'tripo::0_Left_Limb_3', 'tripo::0_Left_Limb_4'],
        ['RigLFLeg1', 'RigLFLeg2', 'RigLFLeg3', 'RigLFLegAnkle', 'RigLFLegDigit11', 'RigLFLegDigit11+tip']],
      [['tripo::0_Right_Limb_0', 'tripo::0_Right_Limb_1', 'tripo::0_Right_Limb_2', 'tripo::0_Right_Limb_3', 'tripo::0_Right_Limb_4'],
        ['RigRFLeg1', 'RigRFLeg2', 'RigRFLeg3', 'RigRFLegAnkle', 'RigRFLegDigit11', 'RigRFLegDigit11+tip']],
      [['tripo::1_Left_Limb_0', 'tripo::1_Left_Limb_1', 'tripo::1_Left_Limb_2', 'tripo::1_Left_Limb_3', 'tripo::1_Left_Limb_4'],
        ['RigLBLeg1', 'RigLBLeg2', 'RigLBLeg3', 'RigLBLegAnkle', 'RigLBLegDigit11', 'RigLBLegDigit11+tip']],
      [['tripo::1_Right_Limb_0', 'tripo::1_Right_Limb_1', 'tripo::1_Right_Limb_2', 'tripo::1_Right_Limb_3', 'tripo::1_Right_Limb_4'],
        ['RigRBLeg1', 'RigRBLeg2', 'RigRBLeg3', 'RigRBLegAnkle', 'RigRBLegDigit11', 'RigRBLegDigit11+tip']],
    ],
  },
};

const wp = (o) => o.getWorldPosition(new THREE.Vector3());
const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());

function setWorldQuaternion(bone, world) {
  const parent = bone.parent ? wq(bone.parent) : new THREE.Quaternion();
  bone.quaternion.copy(parent.invert().multiply(world)).normalize();
  bone.updateMatrixWorld(true);
}

// The Baby Wolf take, turned to face the mount's way, with named anchor points.
function loadSource(facing) {
  const glb = readGlb(SOURCE), g = buildNodeGraph(glb);
  const turn = new THREE.Object3D();
  if (facing < 0) turn.rotation.y = Math.PI;
  turn.add(g.root);
  turn.updateMatrixWorld(true);
  const sampler = animationSampler(glb, glb.json.animations[0]);
  const bone = (name) => {
    const found = g.objects.find((o) => o.name === name || new RegExp(`^${name}_\\d+$`).test(o.name));
    if (!found) throw new Error(`Baby Wolf has no ${name}`);
    return found;
  };
  const rest = () => { g.reset(); g.update(); };
  const anchor = (spec) => {
    rest();
    if (spec.endsWith('+tip')) {
      const b = bone(spec.slice(0, -4)), at = wp(b), from = wp(b.parent);
      const local = b.worldToLocal(at.clone().add(at.clone().sub(from).multiplyScalar(0.6)));
      return () => b.localToWorld(local.clone());
    }
    const m = spec.match(/^(\w+)>(\w+)@([\d.]+)$/);
    if (m) { const a = bone(m[1]), b = bone(m[2]), f = +m[3]; return () => wp(a).lerp(wp(b), f); }
    const b = bone(spec);
    return () => wp(b);
  };
  const pose = (t) => { g.reset(); sampler.apply(g, t); g.update(); };
  // snout: three jaw-hinge lengths ahead of the head joint, carried by the head
  rest();
  const head = bone('RigHead'), jaw = bone('RigJaw1');
  const snoutLocal = head.worldToLocal(wp(head).add(wp(jaw).sub(wp(head)).multiplyScalar(3)));
  const snout = () => head.localToWorld(snoutLocal.clone());
  return { bone, anchor, pose, rest, snout };
}

// The Baby Wolf's centre line from tail tip to snout.
const CENTRE = ['RigTail6+tip', 'RigTail6', 'RigTail5', 'RigTail4', 'RigTail3', 'RigTail2', 'RigTail1', 'RigPelvis', 'RigSpine1',
  'RigSpine2', 'RigSpine3', 'RigChest', 'RigNeck1', 'RigNeck2', 'RigNeck3', 'RigNeck4', 'RigHead', 'snout'];
const isFront = (spec) => /^Rig[LR]F/.test(spec);

// Body proportions: along hips->shoulders (0 at the hind leg tops, 1 at the fore leg tops) and up by leg-top height.
function bodyFrame(hind, front, facing) {
  const mean = (ps) => ps.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / ps.length);
  const hip = mean(hind), shoulder = mean(front), length = (shoulder.z - hip.z) * facing;
  const height = [...hind, ...front].reduce((a, p) => a + p.y, 0) / (hind.length + front.length);
  return (p) => new THREE.Vector2(((p.z - hip.z) * facing) / length, p.y / height);
}

// Nearest point of a 2D polyline to q, as [segment index, fraction along it].
function nearestOnLine(points, q) {
  let best = [0, 0], bestD = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], ab = points[i + 1].clone().sub(a), len2 = ab.lengthSq();
    const f = len2 > 0 ? Math.max(0, Math.min(1, q.clone().sub(a).dot(ab) / len2)) : 0;
    const d = a.clone().addScaledVector(ab, f).distanceTo(q);
    if (d < bestD) { bestD = d; best = [i, f]; }
  }
  return best;
}
const meanDir = (dirs) => dirs.reduce((s, d) => s.add(d), new THREE.Vector3()).normalize();

function bakeClip(cfg, src, tgt, name, [t0, t1]) {
  const frames = Math.round((t1 - t0) * FPS) + 1, times = [];
  for (let i = 0; i < frames; i++) times.push(i / FPS);
  const J = tgt.glb.json;
  const T = (n) => { const o = tgt.g.byName.get(n); if (!o) throw new Error(`${cfg.file} has no ${n}`); return o; };

  // ---- sample the source: follow-bone world rotations and anchor positions per frame
  const followSrc = [...new Set(Object.values(cfg.follow))];
  const anchorSpecs = [...new Set([...Object.values(cfg.root), ...cfg.legs.flatMap(([, a]) => a), ...CENTRE.filter((c) => c !== 'snout')])];
  const anchorFns = new Map(anchorSpecs.map((s) => [s, src.anchor(s)]));
  anchorFns.set('snout', src.snout);
  anchorSpecs.push('snout');
  src.rest();
  const srcRestInv = new Map(followSrc.map((s) => [s, wq(src.bone(s)).invert()]));
  const rot = [], pos = [];
  for (const t of times) {
    src.pose(t0 + t);
    rot.push(new Map(followSrc.map((s) => [s, wq(src.bone(s))])));
    pos.push(new Map(anchorSpecs.map((s) => [s, anchorFns.get(s)()])));
  }
  const meanPos = new Map(anchorSpecs.map((s) => [s, pos.reduce((acc, p) => acc.add(p.get(s)), new THREE.Vector3()).multiplyScalar(1 / frames)]));

  // ---- scale: mount leg-top height over Baby Wolf leg-top height (front and hind legs averaged)
  tgt.g.reset(); tgt.g.update();
  src.rest();
  const tTops = cfg.legs.map(([bones]) => wp(T(bones[0])).y), sTops = cfg.legs.map(([, a]) => anchorFns.get(a[0])().y);
  const k = tTops.reduce((a, b) => a + b) / sTops.reduce((a, b) => a + b);

  // ---- per-bone plans
  const restWorld = new Map(), restPos = new Map();
  for (const j of tgt.joints) { restWorld.set(j, wq(j)); restPos.set(j, wp(j)); }
  const legPlan = new Map();
  for (const [bones, anchors] of cfg.legs) {
    bones.forEach((n, i) => {
      const dirs = pos.map((p) => p.get(anchors[i + 1]).clone().sub(p.get(anchors[i])).normalize());
      legPlan.set(T(n), { dirs, ref: meanDir(dirs.map((d) => d.clone())) });
    });
  }
  // centre-line chains: place each joint (and a tip past the last) on the Baby Wolf's centre line by body proportions
  const legRoots = (front) => cfg.legs.filter(([, a]) => isFront(a[0]) === front);
  src.rest();
  const tFrame = bodyFrame(legRoots(false).map(([b]) => restPos.get(T(b[0]))), legRoots(true).map(([b]) => restPos.get(T(b[0]))), cfg.facing);
  const sFrame = bodyFrame(legRoots(false).map(([, a]) => anchorFns.get(a[0])()), legRoots(true).map(([, a]) => anchorFns.get(a[0])()), cfg.facing);
  const centreRest = CENTRE.map((c) => sFrame(anchorFns.get(c)()));
  const centreRestWorld = CENTRE.map((c) => anchorFns.get(c)());
  // A bone that carries legs (shoulders, the back, a Tripo root at the neck) is placed on the wolf's spine only, pelvis
  // to chest: on the neck it would swing the fore legs with every nod of the head.
  const spineFrom = CENTRE.indexOf('RigPelvis'), spineTo = CENTRE.indexOf('RigChest');
  const legTops = new Set(cfg.legs.map(([b]) => T(b[0])));
  const carriesLegs = (j) => { let found = false; j.traverse((o) => { if (o !== j && legTops.has(o)) found = true; }); return found; };
  const onCentre = (p, spineOnly) => {
    if (!spineOnly) return nearestOnLine(centreRest, tFrame(p));
    const [seg, f] = nearestOnLine(centreRest.slice(spineFrom, spineTo + 1), tFrame(p));
    return [seg + spineFrom, f];
  };
  const centreAt = (i, [seg, f]) => pos[i].get(CENTRE[seg]).clone().lerp(pos[i].get(CENTRE[seg + 1]), f);
  const centreRestAt = ([seg, f]) => centreRestWorld[seg].clone().lerp(centreRestWorld[seg + 1], f);
  const chainPlan = new Map();
  for (const [chainIndex, chain] of (cfg.chains || []).entries()) {
    const amount = cfg.chainSwing?.[chainIndex] ?? 1;
    chain.forEach((n, c) => {
      const from = restPos.get(T(n));
      const to = c + 1 < chain.length ? restPos.get(T(chain[c + 1]))
        : from.clone().add(from.clone().sub(restPos.get(T(chain[c - 1]))).multiplyScalar(0.6));
      const spineOnly = carriesLegs(T(n));
      let a = onCentre(from, spineOnly), b = onCentre(to, spineOnly);
      // Past either end of the centre line (a snout or tail reaching further than the wolf's) both ends of the bone
      // land on one point: the bone then turns with the wolf segment it reaches past (head->snout, tail tip).
      if (centreRestAt(b).distanceTo(centreRestAt(a)) < 1e-6) {
        const seg = Math.min(a[0], CENTRE.length - 2);
        a = [seg, 0]; b = [seg, 1];
      }
      const restDir = centreRestAt(b).sub(centreRestAt(a));
      chainPlan.set(T(n), { restDir: restDir.normalize(), dirs: pos.map((_, i) => centreAt(i, b).sub(centreAt(i, a)).normalize()), a, b, amount });
    });
  }
  const followPlan = new Map(Object.entries(cfg.follow).map(([n, s]) => [T(n), s]));
  const rootPlan = new Map(Object.entries(cfg.root).map(([n, s]) => [T(n), s]));
  for (const j of tgt.joints) {
    if (j !== tgt.root && !legPlan.has(j) && !chainPlan.has(j) && !followPlan.has(j)) throw new Error(`${cfg.file}: ${j.name} is not mapped`);
  }

  // paw contact point of each leg: under its last joint at ground level at rest, carried by that bone
  const paws = cfg.legs.map(([bones, anchors]) => {
    const leaf = T(bones[bones.length - 1]), at = restPos.get(leaf);
    const local = leaf.worldToLocal(new THREE.Vector3(at.x, tgt.groundY, at.z));
    const srcY = pos.map((p) => p.get(anchors[anchors.length - 1]).y);
    const lo = Math.min(...srcY), hi = Math.max(...srcY);
    return { leaf, local, restY: tgt.groundY, planted: srcY.map((y) => y < lo + Math.max(0.12 * (hi - lo), 0.5)) };
  });

  // ---- pose every frame (pass 1: no ground correction), recording local rotations, root offsets and paw heights
  const local = new Map(tgt.joints.map((j) => [j, []])), rootOffsets = new Map([...rootPlan.keys()].map((j) => [j, []]));
  const pawHeight = paws.map(() => []);
  for (let i = 0; i < frames; i++) {
    tgt.g.reset(); tgt.g.update();
    for (const j of tgt.order) {
      if (rootPlan.has(j)) {
        const s = rootPlan.get(j), offset = pos[i].get(s).clone().sub(meanPos.get(s)).multiplyScalar(k);
        rootOffsets.get(j).push(offset);
        j.position.copy(j.parent.worldToLocal(restPos.get(j).clone().add(offset)));
        j.updateMatrixWorld(true);
      }
      if (legPlan.has(j)) {
        const { dirs, ref } = legPlan.get(j);
        const swing = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(ref, dirs[i]), cfg.legSwing ?? 1);
        setWorldQuaternion(j, swing.multiply(restWorld.get(j)));
      } else if (chainPlan.has(j)) {
        const { dirs, restDir, amount } = chainPlan.get(j);
        const turn = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(restDir, dirs[i]), amount);
        setWorldQuaternion(j, turn.multiply(restWorld.get(j)));
      } else if (followPlan.has(j)) {
        const s = followPlan.get(j);
        setWorldQuaternion(j, rot[i].get(s).clone().multiply(srcRestInv.get(s)).multiply(restWorld.get(j)));
      }
    }
    for (const j of tgt.joints) local.get(j).push(j.quaternion.toArray());
    paws.forEach((p, n) => pawHeight[n].push(p.leaf.localToWorld(p.local.clone()).y));
  }

  // ---- pass 2: vertical shift so planted paws touch the ground; frames with all paws in the air interpolate
  const shift = new Array(frames).fill(null);
  for (let i = 0; i < frames; i++) {
    const errs = paws.map((p, n) => (p.planted[i] ? pawHeight[n][i] - p.restY : null)).filter((e) => e !== null);
    if (errs.length) shift[i] = -errs.reduce((a, b) => a + b) / errs.length;
  }
  const known = shift.map((s, i) => (s === null ? -1 : i)).filter((i) => i >= 0);
  for (let i = 0; i < frames; i++) {
    if (shift[i] !== null) continue;
    if (!known.length) { shift[i] = 0; continue; }
    const before = [...known].reverse().find((x) => x < i) ?? known[known.length - 1] - frames;
    const after = known.find((x) => x > i) ?? known[0] + frames;
    const a = shift[(before + frames) % frames], b = shift[after % frames], f = (i - before) / (after - before);
    shift[i] = a + (b - a) * f;
  }

  // ---- write the clip: rotations of every joint, translations of the root-hanging bones
  const out = { name, channels: [], samplers: [] };
  const input = addAccessor(tgt.glb, times.map((t) => [t]), 'SCALAR', true);
  const add = (node, path, rows, type) => {
    const flat = rows.every((r) => r.every((v, n) => Math.abs(v - rows[0][n]) < 1e-6));
    const inp = flat ? addAccessor(tgt.glb, [[0], [times[times.length - 1]]], 'SCALAR', true) : input;
    out.samplers.push({ input: inp, output: addAccessor(tgt.glb, flat ? [rows[0], rows[0]] : rows, type), interpolation: 'LINEAR' });
    out.channels.push({ sampler: out.samplers.length - 1, target: { node, path } });
  };
  for (const j of tgt.joints) {
    if (j === tgt.root) continue;
    const rows = local.get(j);
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0) rows[i] = b.map((v) => -v);
    }
    add(j.userData.index, 'rotation', rows, 'VEC4');
  }
  for (const [j, offsets] of rootOffsets) {
    tgt.g.reset(); tgt.g.update();
    const rows = offsets.map((o, i) => j.parent.worldToLocal(restPos.get(j).clone().add(o).add(new THREE.Vector3(0, shift[i], 0))).toArray());
    add(j.userData.index, 'translation', rows, 'VEC3');
  }

  // ground speed of the gait: how fast planted Baby Wolf paws move back, in mount units per second
  const back = [];
  cfg.legs.forEach(([, anchors], n) => {
    const s = anchors[anchors.length - 1];
    for (let i = 1; i < frames; i++) {
      if (paws[n].planted[i] && paws[n].planted[i - 1]) back.push(-(pos[i].get(s).z - pos[i - 1].get(s).z) * cfg.facing * FPS * k);
    }
  });
  back.sort((a, b) => a - b);
  const speed = name === 'Idle' || !back.length ? 0 : +back[back.length >> 1].toFixed(4);
  out.extras = {
    loop: true, gait: GAIT[name], speed, cycleSeconds: +times[times.length - 1].toFixed(4), scale: +k.toFixed(6),
    source: `Baby Wolf Take 001 ${t0}-${t1} s`, author: 'tools/avatar-motion/retarget-mounts.mjs',
  };
  J.animations.push(out);
  if (name === 'Idle' && process.env.MOUNT_MAP) {
    for (const [j, { a, b }] of chainPlan) {
      console.log('  ' + j.name.padEnd(24) + CENTRE[a[0]] + '>' + CENTRE[a[0] + 1] + '@' + a[1].toFixed(2) + '  ->  ' + CENTRE[b[0]] + '>' + CENTRE[b[0] + 1] + '@' + b[1].toFixed(2));
    }
  }
  return { clip: name, frames, seconds: out.extras.cycleSeconds, speed, scale: out.extras.scale, maxShift: +Math.max(...shift.map(Math.abs)).toFixed(4) };
}

export function buildMount(key) {
  const cfg = MOUNTS[key], glb = readGlb(cfg.file), J = glb.json;
  J.animations = [];
  const g = buildNodeGraph(glb);
  const jointSet = new Set((J.skins?.[0]?.joints || []).map((i) => g.objects[i]));
  const order = []; g.root.traverse((o) => { if (jointSet.has(o)) order.push(o); });
  const root = order[0];
  let groundY = Infinity;
  for (const [i, n] of J.nodes.entries()) {
    if (n.mesh === undefined) continue;
    for (const prim of J.meshes[n.mesh].primitives) {
      const a = J.accessors[prim.attributes.POSITION];
      if (a.min) groundY = Math.min(groundY, new THREE.Vector3(...a.min).applyMatrix4(g.objects[i].matrixWorld).y);
    }
  }
  const tgt = { glb, g, joints: order, order, root, groundY: Number.isFinite(groundY) ? groundY : 0 };
  const src = loadSource(cfg.facing);
  const report = Object.entries(SEGMENTS).map(([name, range]) => bakeClip(cfg, src, tgt, name, range));
  compactGlb(glb);
  return { glb, report };
}

if (process.argv[1]?.endsWith('retarget-mounts.mjs')) {
  const only = process.argv.slice(2);
  for (const key of Object.keys(MOUNTS)) {
    if (only.length && !only.includes(key)) continue;
    const { glb, report } = buildMount(key);
    writeGlb(glb, MOUNTS[key].file);
    console.log(MOUNTS[key].file);
    console.table(report);
  }
}
