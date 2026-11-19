// Retarget a skeletal animation from another skeleton (BVH from Rokoko / Brekel / iPi / FreeMoCap, FBX converted
// through Blender, Mixamo) onto the fused bodies' mixamorig:* rig.
//
// Per mapped bone: the source's world rotation change from its rest pose is re-expressed in the target's axes
// (the two skeletons may face / point up along different axes) and applied on top of the target bone's rest world
// rotation, after a small rest alignment (target rest bone direction -> source rest bone direction) so a source in a
// slightly different T/A pose still lines up. Hips translation is scaled by the leg-length ratio.
import * as THREE from 'three';
import { restBasis } from './rig.js';

// source name (lower case, prefix stripped) -> Mixamo name
const ALIASES = {
  hips: 'Hips', pelvis: 'Hips', root: null,
  spine: 'Spine', spine1: 'Spine1', spine2: 'Spine2', chest: 'Spine2', upperchest: 'Spine2', neck: 'Neck', neck1: 'Neck', head: 'Head',
  leftshoulder: 'LeftShoulder', leftcollar: 'LeftShoulder', leftarm: 'LeftArm', leftupperarm: 'LeftArm', leftforearm: 'LeftForeArm', leftlowerarm: 'LeftForeArm', lefthand: 'LeftHand',
  rightshoulder: 'RightShoulder', rightcollar: 'RightShoulder', rightarm: 'RightArm', rightupperarm: 'RightArm', rightforearm: 'RightForeArm', rightlowerarm: 'RightForeArm', righthand: 'RightHand',
  leftupleg: 'LeftUpLeg', leftthigh: 'LeftUpLeg', leftupperleg: 'LeftUpLeg', lefthip: 'LeftUpLeg', leftleg: 'LeftLeg', leftshin: 'LeftLeg', leftlowerleg: 'LeftLeg', leftknee: 'LeftLeg', leftfoot: 'LeftFoot', leftankle: 'LeftFoot', lefttoebase: 'LeftToeBase', lefttoe: 'LeftToeBase', lefttoes: 'LeftToeBase',
  rightupleg: 'RightUpLeg', rightthigh: 'RightUpLeg', rightupperleg: 'RightUpLeg', righthip: 'RightUpLeg', rightleg: 'RightLeg', rightshin: 'RightLeg', rightlowerleg: 'RightLeg', rightknee: 'RightLeg', rightfoot: 'RightFoot', rightankle: 'RightFoot', righttoebase: 'RightToeBase', righttoe: 'RightToeBase', righttoes: 'RightToeBase',
};
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

export function canonicalName(name) {
  const bare = String(name).replace(/^.*[:|]/, '').replace(/^(mixamorig\d*|rokoko|bip\d*|def|b)[_ ]?/i, '');
  const key = bare.toLowerCase().replace(/[_\s.-]/g, '');
  if (key in ALIASES) return ALIASES[key];
  for (const S of ['Left', 'Right']) for (const F of FINGERS) for (const n of [1, 2, 3]) if (key === `${S}Hand${F}${n}`.toLowerCase() || key === `${S}${F}${n}`.toLowerCase()) return `${S}Hand${F}${n}`;
  return null;
}

// source: { joints: [{ name, parent, t: Vector3, r: Quaternion }] (rest), frames: [{ rotations: Quaternion[] (local),
// rootPosition?: Vector3 }], fps }. Several source joints may map to one name (Rokoko's Spine..Spine4): the first
// (closest to the root) wins, except Spine2 which takes the last spine joint (the chest).
export function retargetToRig(rig, source, { fps = source.fps, rootMotion = true } = {}) {
  const J = source.joints, n = J.length, rootIndex = source.rootIndex || 0; // rootPosition replaces this joint's translation
  const fk = (rots, rootPos) => {
    const W = new Array(n), P = new Array(n);
    for (let i = 0; i < n; i++) {
      const j = J[i], r = rots ? rots[i] : j.r, t = i === rootIndex && rootPos ? rootPos : j.t;
      if (j.parent < 0) { W[i] = r.clone(); P[i] = t.clone(); }
      else { W[i] = W[j.parent].clone().multiply(r); P[i] = t.clone().applyQuaternion(W[j.parent]).add(P[j.parent]); }
    }
    return { W, P };
  };
  // name map
  const byName = new Map();
  J.forEach((j, i) => {
    const c = canonicalName(j.name);
    if (!c || rig.bone(c) === undefined) return;
    if (!byName.has(c)) byName.set(c, i);
  });
  const spines = J.map((j, i) => [String(j.name).replace(/^.*[:|]/, '').toLowerCase(), i]).filter(([k]) => /^spine\d*$/.test(k));
  if (spines.length > 3) { byName.set('Spine', spines[0][1]); byName.set('Spine1', spines[Math.floor(spines.length / 2)][1]); byName.set('Spine2', spines[spines.length - 1][1]); }
  for (const need of ['Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftArm', 'RightArm', 'Neck']) if (!byName.has(need)) throw new Error(`source has no joint for ${need} (joints: ${J.map((j) => j.name).join(', ')})`);

  const rest = fk(null, null), sp = (c) => rest.P[byName.get(c)].clone();
  // Both skeletons are taken as Y-up (BVH and glTF convention; Blender's FBX import converts to it), so the axis
  // change is a turn about Y that matches their facing. Using each rest spine as 'up' instead would tilt the whole
  // take by the difference in rest posture (the fused bodies stand with the neck ~9 degrees behind the hips).
  const Y = new THREE.Vector3(0, 1, 0);
  const flatLeft = (v) => { v.y = 0; return v.normalize(); };
  const sLeft = flatLeft(sp('LeftUpLeg').sub(sp('RightUpLeg')).add(sp('LeftArm').sub(sp('RightArm'))));
  const sFwd = new THREE.Vector3().crossVectors(sLeft, Y);
  const t = restBasis(rig), tLeft = flatLeft(t.left.clone()), tFwd = new THREE.Vector3().crossVectors(tLeft, Y);
  const C = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tLeft, Y, tFwd).multiply(new THREE.Matrix4().makeBasis(sLeft, Y, sFwd).transpose()));
  const Ci = C.clone().invert();
  const sLeg = sp('LeftUpLeg').distanceTo(sp('LeftLeg')) + sp('LeftLeg').distanceTo(sp('LeftFoot'));
  const tLeg = rig.pos('LeftUpLeg').distanceTo(rig.pos('LeftLeg')) + rig.pos('LeftLeg').distanceTo(rig.pos('LeftFoot'));
  const scale = tLeg / sLeg;

  // rest alignment per mapped bone: rotate the target rest bone direction onto the source's (in target axes)
  const CHILD = { Hips: null, Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', LeftShoulder: 'LeftArm', RightShoulder: 'RightArm', LeftArm: 'LeftForeArm', RightArm: 'RightForeArm',
    LeftForeArm: 'LeftHand', RightForeArm: 'RightHand', LeftUpLeg: 'LeftLeg', RightUpLeg: 'RightLeg', LeftLeg: 'LeftFoot', RightLeg: 'RightFoot', LeftFoot: 'LeftToeBase', RightFoot: 'RightToeBase' };
  const mapped = [...byName.entries()].map(([c, si]) => {
    const ti = rig.bone(c), child = CHILD[c];
    let align = new THREE.Quaternion();
    if (child && byName.has(child) && rig.bone(child) !== undefined) {
      const sd = rest.P[byName.get(child)].clone().sub(rest.P[si]).applyQuaternion(C).normalize();
      const td = rig.pos(child).sub(rig.pos(c)).normalize();
      align = new THREE.Quaternion().setFromUnitVectors(td, sd);
    }
    return { c, si, ti, align, restTW: rig.worldRot(ti), restSWi: rest.W[si].clone().invert() };
  });
  const byTarget = new Map(mapped.map((m) => [m.ti, m]));
  const hipsRestT = rig.pos('Hips'), hipsRestS = rest.P[byName.get('Hips')];
  const parentHipsInv = rig.world[rig.parent[rig.hipsIndex]].clone().invert();

  const nF = source.frames.length, srcFps = source.fps, T = (nF - 1) / srcFps, outN = Math.max(2, Math.round(T * fps) + 1);
  const bones = [...byTarget.keys()].sort((a, b) => rig.order.indexOf(a) - rig.order.indexOf(b));
  const rot = new Map(bones.map((i) => [i, new Float32Array(outN * 4)])), trans = new Float32Array(outN * 3), times = new Float32Array(outN);
  for (let f = 0; f < outN; f++) {
    const time = Math.min(T, f / fps), x = time * srcFps, a = Math.floor(x), b = Math.min(nF - 1, a + 1), k = x - a;
    const A = source.frames[a], B = source.frames[b];
    const rots = A.rotations.map((q, i) => q.clone().slerp(B.rotations[i], k));
    const rp = A.rootPosition ? A.rootPosition.clone().lerp(B.rootPosition, k) : null;
    const s = fk(rots, rp), worldNew = new Map();
    for (const i of rig.order) {
      const p = rig.parent[i], pw = worldNew.get(p) || rig.worldRot(p), m = byTarget.get(i);
      let w;
      if (!m) w = pw.clone().multiply(rig.local[i].r);
      else {
        const dS = s.W[m.si].clone().multiply(m.restSWi), dT = C.clone().multiply(dS).multiply(Ci);
        w = dT.multiply(m.align).multiply(m.restTW);
        rot.get(i).set(pw.clone().invert().multiply(w).normalize().toArray(), f * 4);
      }
      worldNew.set(i, w);
    }
    const d = s.P[byName.get('Hips')].clone().sub(hipsRestS).applyQuaternion(C).multiplyScalar(scale);
    if (!rootMotion) { d.x = 0; d.z = 0; } // keep only the vertical motion
    trans.set(hipsRestT.clone().add(d).applyMatrix4(parentHipsInv).toArray(), f * 3);
    times[f] = time;
  }
  return {
    fps, times, bones: bones.map((i) => ({ node: i, name: rig.nodes[i].name, rotations: rot.get(i) })),
    hips: { node: rig.hipsIndex, name: rig.nodes[rig.hipsIndex].name, translations: trans },
    contacts: { left: [], right: [] }, stats: { frames: outN, scale, mapped: mapped.map((m) => `${J[m.si].name}->${m.c}`) },
  };
}
