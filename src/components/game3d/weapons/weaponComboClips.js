// 3-hit weapon combos, baked onto each character's own skeleton.
//
// Poses are written in body space (forward, up, right of the character) and solved on the actual rig with
// two-bone IK from the rig's rest pose, so the same combo fits the fused female/male (Mixamo) and the v5
// bodies. Each hand is turned so the held weapon points where the key says (the blade's arc for a sword, an
// upright bow with the arrow forward for a bow), using that weapon's own combat grip from the weapon pack.
// Output: ordinary AnimationClips that the player controller binds as one-shot states.
//
//   sword: swordCombo1 forehand cut, swordCombo2 rising backhand, swordCombo3 overhead chop
//   bow:   bowCombo1 quick shot, bowCombo2 fast shot with a sidestep lean, bowCombo3 overdrawn power shot
// clip.userData: { combo, index, hit, sweep, cancel } in clip seconds — hit = the strike / arrow release,
// sweep = [start, end] of the blade's cutting arc (trail recording), cancel = when the next hit may start.
import * as THREE from 'three';
import { solveMountedLimb } from '../player/mountedRiderPose.mjs';

export const WEAPON_COMBO_STATES = Object.freeze({
  swordCombo: Object.freeze(['swordCombo1', 'swordCombo2', 'swordCombo3']),
  bowCombo: Object.freeze(['bowCombo1', 'bowCombo2', 'bowCombo3']),
});
export const WEAPON_COMBO_STATE_NAMES = Object.freeze([...WEAPON_COMBO_STATES.swordCombo, ...WEAPON_COMBO_STATES.bowCombo]);

// 'bow' -> bowCombo; sword / greatsword / dagger / blade -> swordCombo; anything else has no combo.
export function comboKindForWeapon(kindOrClass) {
  const k = String(kindOrClass || '').toLowerCase();
  if (/bow/.test(k)) return 'bowCombo';
  if (/sword|blade|dagger/.test(k)) return 'swordCombo';
  return null;
}

const sanitize = (n) => THREE.PropertyBinding.sanitizeNodeName(n);
const RIG = {
  hips: ['mixamorig:Hips', 'pelvis'],
  spine: ['mixamorig:Spine', 'spine_01'], spine1: ['mixamorig:Spine1', 'spine_02'], spine2: ['mixamorig:Spine2', 'spine_03'],
  neck: ['mixamorig:Neck', 'neck_01'], head: ['mixamorig:Head', 'head'],
  rSh: ['mixamorig:RightShoulder', 'clavicle_r'], lSh: ['mixamorig:LeftShoulder', 'clavicle_l'],
  rArm: ['mixamorig:RightArm', 'upperarm_r'], rFore: ['mixamorig:RightForeArm', 'lowerarm_r'], rHand: ['mixamorig:RightHand', 'hand_r'],
  lArm: ['mixamorig:LeftArm', 'upperarm_l'], lFore: ['mixamorig:LeftForeArm', 'lowerarm_l'], lHand: ['mixamorig:LeftHand', 'hand_l'],
  rUp: ['mixamorig:RightUpLeg', 'thigh_r'], rLeg: ['mixamorig:RightLeg', 'calf_r'], rFoot: ['mixamorig:RightFoot', 'foot_r'],
  lUp: ['mixamorig:LeftUpLeg', 'thigh_l'], lLeg: ['mixamorig:LeftLeg', 'calf_l'], lFoot: ['mixamorig:LeftFoot', 'foot_l'],
};
const DEG = Math.PI / 180;

// Body-space vectors: [forward, up, right] in metres for a 1.7 m body (scaled to the actual rig).
// arm: wrist target relative to that arm's shoulder, third component towards that arm's own side (mirrored);
// blade: where the weapon's +Y (blade tip / upper limb) points, true body right (not mirrored). The roll about
// the blade, and so the edge, follows from the grip and the forearm: the wrist stays as straight as it can.
// spine: [twist about up (+ = turn right), bend about right (+ = forward), lean about forward (+ = right)] degrees.
// hips: [drop m, twist deg (+ = right)].
const STANCE = { l: [0.14, -0.13, 0], r: [-0.12, 0.14, -25] }; // [forward, right, toe-out yaw deg] of each foot
const GUARD = { arm: [0.32, -0.28, -0.05] }; // free hand in front of the chest
const SWORD_READY = { spine: [0, 4, 0], hips: [0.03, 0], r: { arm: [0.36, -0.2, 0.12], blade: [0.55, 0.65, 0.15] }, l: GUARD };

export const SWORD_COMBO = [
  { name: 'swordCombo1', hit: 0.29, sweep: [0.15, 0.41], cancel: 0.4, keys: [ // forehand: right-back to front-left, flat
    { t: 0.0, ...SWORD_READY },
    { t: 0.15, spine: [34, 2, -3], hips: [0.05, 10], r: { arm: [-0.08, 0.06, 0.34], blade: [-0.6, 0.15, 0.78] }, l: { arm: [0.35, -0.15, -0.2] } },
    { t: 0.29, spine: [-26, 9, 2], hips: [0.06, -12], r: { arm: [0.58, -0.04, -0.2], blade: [0.75, 0.0, -0.66] }, l: { arm: [0.12, -0.4, -0.16] } },
    { t: 0.41, spine: [-44, 8, 3], hips: [0.06, -18], r: { arm: [0.24, -0.08, -0.5], blade: [-0.2, 0.05, -0.98] }, l: { arm: [0.05, -0.45, -0.14] } },
    { t: 0.64, ...SWORD_READY },
  ] },
  { name: 'swordCombo2', hit: 0.27, sweep: [0.14, 0.39], cancel: 0.38, keys: [ // rising backhand: low-left to high-right
    { t: 0.0, ...SWORD_READY },
    { t: 0.14, spine: [-36, 14, 6], hips: [0.08, -14], r: { arm: [0.34, -0.5, -0.36], blade: [0.2, -0.8, -0.55] }, l: { arm: [0.1, -0.42, -0.2] } },
    { t: 0.27, spine: [22, -4, -4], hips: [0.05, 10], r: { arm: [0.5, 0.28, 0.32], blade: [0.42, 0.75, 0.5] }, l: { arm: [0.3, -0.12, -0.28] } },
    { t: 0.39, spine: [36, -8, -5], hips: [0.04, 16], r: { arm: [0.12, 0.42, 0.42], blade: [-0.3, 0.9, 0.3] }, l: { arm: [0.32, -0.18, -0.24] } },
    { t: 0.62, ...SWORD_READY },
  ] },
  { name: 'swordCombo3', hit: 0.37, sweep: [0.2, 0.44], cancel: 0.55, keys: [ // overhead chop: raise behind the head, cleave down in front
    { t: 0.0, ...SWORD_READY },
    { t: 0.2, spine: [8, -14, 0], hips: [0.02, 4], r: { arm: [-0.02, 0.5, 0.04], blade: [-0.75, 0.62, 0.0] }, l: { arm: [0.08, 0.42, 0.24] } },
    { t: 0.37, spine: [-4, 24, 0], hips: [0.11, -4], r: { arm: [0.58, -0.22, -0.06], blade: [0.55, -0.83, -0.06] }, l: { arm: [0.46, -0.3, 0.18] } },
    { t: 0.52, spine: [-4, 26, 0], hips: [0.12, -4], r: { arm: [0.58, -0.26, -0.06], blade: [0.5, -0.86, -0.06] }, l: { arm: [0.44, -0.33, 0.17] } },
    { t: 0.65, spine: [0, 12, 0], hips: [0.07, -2], r: { arm: [0.5, -0.24, 0.04], blade: [0.85, 0.15, 0.1] }, l: { arm: [0.36, -0.3, 0.05] } }, // lift the blade
    { t: 0.82, ...SWORD_READY },
  ] },
];

// Bow: the left hand holds the bow out in front, upright, arrow forward; the right hand draws to the face.
const BOW_READY = { spine: [12, 3, 0], hips: [0.03, 6], l: { arm: [0.42, -0.28, 0.06], blade: [0.25, 0.97, 0] }, r: { arm: [0.32, -0.3, -0.12] } };
const AIM = (draw, extra = {}) => ({
  spine: extra.spine || [24, 0, extra.lean || 0], hips: extra.hips || [0.04, 10],
  l: { arm: [0.6, extra.raise || 0.02, 0.06], blade: [0, 1, 0] },
  r: { arm: draw, pole: [-0.4, 0.2, 0.5] },
});
export const BOW_COMBO = [
  { name: 'bowCombo1', hit: 0.31, cancel: 0.37, keys: [ // quick shot
    { t: 0.0, ...BOW_READY },
    { t: 0.13, ...AIM([0.42, 0.05, -0.18]) },
    { t: 0.29, ...AIM([0.06, 0.1, -0.14]) },
    { t: 0.33, ...AIM([-0.02, 0.1, 0.0]) }, // release: the drawing hand flicks back
    { t: 0.56, ...BOW_READY },
  ] },
  { name: 'bowCombo2', hit: 0.25, cancel: 0.31, keys: [ // fast follow-up with a sidestep lean
    { t: 0.0, ...BOW_READY },
    { t: 0.1, ...AIM([0.4, 0.05, -0.18], { lean: -8, hips: [0.06, 18] }) },
    { t: 0.23, ...AIM([0.08, 0.1, -0.14], { lean: -10, hips: [0.07, 20] }) },
    { t: 0.27, ...AIM([0.0, 0.1, 0.02], { lean: -10, hips: [0.07, 20] }) },
    { t: 0.48, ...BOW_READY },
  ] },
  { name: 'bowCombo3', hit: 0.56, cancel: 0.66, keys: [ // power shot: deep overdraw, lean back, recoil
    { t: 0.0, ...BOW_READY },
    { t: 0.16, ...AIM([0.42, 0.05, -0.18], { spine: [30, -4, 0], hips: [0.08, 14] }) },
    { t: 0.42, ...AIM([-0.06, 0.12, -0.06], { spine: [34, -8, 0], hips: [0.1, 16], raise: 0.06 }) },
    { t: 0.54, ...AIM([-0.1, 0.13, -0.04], { spine: [36, -9, 0], hips: [0.11, 16], raise: 0.07 }) },
    { t: 0.6, ...AIM([-0.22, 0.16, 0.12], { spine: [30, -12, 0], hips: [0.08, 14], raise: 0.16 }) }, // recoil
    { t: 0.88, ...BOW_READY },
  ] },
];

function findBones(model) {
  const out = {};
  for (const [k, names] of Object.entries(RIG)) out[k] = names.map((n) => model.getObjectByName(sanitize(n))).find(Boolean) || null;
  return out;
}

// The rig's rest pose (local position / rotation of every bone under the model). Capture it before any
// clip has played: the combos are solved from it. Not the inverse bind matrices: the fused bodies keep
// those outside their node_0 (-90 degree yaw, and the male's offset armature), so the "bind pose" read from
// them faces sideways (see onboarding/retargetAvatarClip.js restoreBindPose); every other bone's rest
// equals its bind anyway. Every bone, not one skin's skeleton: an FBX with several skinned meshes (the
// remote players' archer) gets a duplicate of each bone per mesh, nested under the bone that
// getObjectByName finds, and that bone may belong to any one of the meshes' skeletons.
export function captureRestPose(model) {
  const rest = new Map();
  model?.traverse((n) => { if (n.isBone) rest.set(n, { position: n.position.clone(), quaternion: n.quaternion.clone() }); });
  return rest;
}

/**
 * Bake the combo clips for `model`. kind: 'sword' | 'bow' (or a combo kind / weapon class).
 * grips: { right?: Quaternion, left?: Quaternion } — the held weapon's combat grip (weapon root rotation in
 * the hand bone's space); without one that hand keeps the IK result.
 * rest: captureRestPose(model) taken before any animation played (default: the current pose).
 * reach: the held blade's length in metres (default 1): a low cut lifts the blade so its tip clears the ground.
 * moves: other moves to bake instead of the built-in three, in the same key format (katanaTechniques.mjs).
 *   A hand given as { hilt: metres } instead of { arm } holds the hilt that far below the other hand.
 *   Captured moves (katanaCapturedMoves.mjs) also key hips[2..3] (shift), feet, look and each elbow's pole.
 * Returns { [clipName]: AnimationClip } or {} when the rig lacks the bones.
 */
export function bakeWeaponComboClips(model, kind = 'sword', grips = {}, { rest = null, reach = null, moves = null } = {}) {
  if (!model) return {};
  const b = findBones(model);
  const needed = ['hips', 'spine', 'rArm', 'rFore', 'rHand', 'lArm', 'lFore', 'lHand'];
  if (needed.some((k) => !b[k])) return {};
  const restPose = rest?.size ? rest : captureRestPose(model);
  if (!restPose.has(b.hips) || !restPose.has(b.rHand) || !restPose.has(b.lHand)) return {};
  const animated = [...new Set(Object.values(b).filter(Boolean))];
  const saved = [...restPose.keys()].map((bone) => [bone, bone.position.clone(), bone.quaternion.clone()]);
  const restore = () => { for (const [bone, p, q] of saved) { bone.position.copy(p); bone.quaternion.copy(q); } model.updateMatrixWorld(true); };
  const toRest = () => { for (const [bone, v] of restPose) { bone.position.copy(v.position); bone.quaternion.copy(v.quaternion); } model.updateMatrixWorld(true); };
  const comboKind = comboKindForWeapon(kind) || 'swordCombo';
  const bladeReach = Number(reach) > 0 ? Number(reach) : 1;
  const out = {};
  try {
    toRest();
    // body frame in world space at bake time; bone rotations are recorded locally, so it cancels out
    const rootQ = model.getWorldQuaternion(new THREE.Quaternion());
    const F = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ).setY(0).normalize();
    const U = new THREE.Vector3(0, 1, 0);
    const R = new THREE.Vector3().crossVectors(F, U).normalize(); // the character's right
    const body = (v) => new THREE.Vector3().addScaledVector(F, v[0]).addScaledVector(U, v[1]).addScaledVector(R, v[2]);
    // metres for a 1.7 m body -> this rig: head height above the ground in the rest pose
    const feet = [b.lFoot, b.rFoot].filter(Boolean).map((f) => f.getWorldPosition(new THREE.Vector3()).y);
    const groundY = model.getWorldPosition(new THREE.Vector3()).y;
    const headY = (b.head || b.neck || b.spine2 || b.spine).getWorldPosition(new THREE.Vector3()).y;
    const k = Math.max(0.3, (headY - Math.min(groundY, ...feet)) / 1.55);
    const ankleY = feet.length ? Math.min(...feet) : groundY + 0.08 * k;
    const footRestWorld = new Map([b.lFoot, b.rFoot].filter(Boolean).map((f) => [f, f.getWorldQuaternion(new THREE.Quaternion())]));
    const spineBones = [b.spine, b.spine1, b.spine2].filter(Boolean);
    const setWorldQ = (bone, q) => {
      const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.copy(pq.invert().multiply(q));
      bone.updateWorldMatrix(false, true);
    };
    const rotateWorld = (bone, axis, angle) => {
      if (!bone || !angle) return;
      setWorldQ(bone, new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
    };
    // The hand's long axis (wrist -> middle knuckle) in its own frame, and seen from the held weapon's frame.
    const handInfo = new Map();
    for (const [side, hand, grip] of [['r', b.rHand, grips.right], ['l', b.lHand, grips.left]]) {
      const S = side === 'r' ? 'Right' : 'Left';
      const knuckle = [`mixamorig:${S}HandMiddle1`, `fingers_${side}`].map((n) => model.getObjectByName(sanitize(n))).find((c) => c?.parent === hand)
        || hand.children.find((c) => c.isBone && c.position.lengthSq() > 1e-12);
      const axis = knuckle ? knuckle.position.clone().normalize() : new THREE.Vector3(0, 1, 0);
      const inWeapon = grip ? axis.clone().applyQuaternion(grip.clone().invert()) : null;
      handInfo.set(hand, { axis, grip, ay: inWeapon ? THREE.MathUtils.clamp(inWeapon.y, -1, 1) : 0, beta: inWeapon ? Math.atan2(inWeapon.x, inWeapon.z) : 0 });
    }
    // Wrist bend (degrees) with the best roll about the blade, for a forearm pointing along f.
    const bestBend = (info, B, f) => {
      const x = THREE.MathUtils.clamp(B.dot(f), -1, 1);
      return Math.acos(THREE.MathUtils.clamp(info.ay * x + Math.sqrt(1 - info.ay * info.ay) * Math.sqrt(1 - x * x), -1, 1));
    };
    // Arm frames in the rest pose (world): the upper arm's long axis, the way its elbow points when the arm
    // bends (backwards), and the forearm / hand rotations relative to their parents.
    const frame = (a, p) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(a, p, new THREE.Vector3().crossVectors(a, p)));
    const armRest = new Map();
    for (const [arm, fore, hand] of [[b.rArm, b.rFore, b.rHand], [b.lArm, b.lFore, b.lHand]]) {
      const S = arm.getWorldPosition(new THREE.Vector3());
      const E = fore.getWorldPosition(new THREE.Vector3());
      const W = hand.getWorldPosition(new THREE.Vector3());
      const qU = arm.getWorldQuaternion(new THREE.Quaternion());
      const qF = fore.getWorldQuaternion(new THREE.Quaternion());
      const qH = hand.getWorldQuaternion(new THREE.Quaternion());
      const aU = E.clone().sub(S).normalize();
      const back = F.clone().negate().addScaledVector(aU, F.dot(aU)).normalize();
      armRest.set(arm, { qU, relF: qU.clone().invert().multiply(qF), relH: qF.clone().invert().multiply(qH),
        aU, back, foreAxis: hand.position.clone().normalize(), up: S.distanceTo(E), lo: E.distanceTo(W) });
    }
    // Analytic arm. The elbow sits on its swing circle where the held blade can point along B with the
    // straightest wrist (staying near the default elbow otherwise); the upper arm turns so the elbow points
    // that way, the forearm carries the pronation and the wrist only bends. A blade the wrist cannot reach
    // within 50 degrees gives way instead of the wrist.
    // A captured move is keyed many times a second, so its arms are solved with the key before in mind:
    // the elbow stays near where it was, and the forearm's turn fades out before it would flip over.
    let flowing = null;
    const placeArm = (arm, fore, hand, target, pole, B, sideAxis) => {
      const ab = armRest.get(arm);
      const info = handInfo.get(hand);
      const held = !!(B && info?.grip);
      const S = arm.getWorldPosition(new THREE.Vector3());
      const toTarget = target.clone().sub(S);
      const d = THREE.MathUtils.clamp(toTarget.length(), Math.abs(ab.up - ab.lo) + 1e-4, ab.up + ab.lo - 1e-4);
      const dir = toTarget.lengthSq() > 1e-10 ? toTarget.normalize() : F.clone();
      const W = S.clone().addScaledVector(dir, d);
      const along = (ab.up * ab.up - ab.lo * ab.lo + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, ab.up * ab.up - along * along));
      const C = S.clone().addScaledVector(dir, along);
      const u0 = pole.clone().sub(S);
      u0.addScaledVector(dir, -u0.dot(dir));
      if (u0.lengthSq() < 1e-10) u0.copy(sideAxis).addScaledVector(dir, -sideAxis.dot(dir));
      u0.normalize();
      const v0 = new THREE.Vector3().crossVectors(dir, u0);
      const outAt = (phi) => u0.clone().multiplyScalar(Math.cos(phi)).addScaledVector(v0, Math.sin(phi));
      let phiBest = 0;
      if (held) {
        let best = Infinity;
        for (let deg = -90; deg <= 90; deg += 5) {
          const phi = deg * DEG;
          const E = C.clone().addScaledVector(outAt(phi), h);
          const f = W.clone().sub(E).normalize();
          const inside = Math.max(0, -E.clone().sub(S).dot(sideAxis)); // elbow tucked into the chest
          const before = flowing?.get(arm);
          const cost = bestBend(info, B, f) + 0.45 * Math.abs(phi) + 6 * inside + (before === undefined ? 0 : 0.5 * Math.abs(phi - before));
          if (cost < best) { best = cost; phiBest = phi; }
        }
      }
      if (flowing && held) flowing.set(arm, phiBest);
      const out = outAt(phiBest);
      const E = C.clone().addScaledVector(out, h);
      const dirU = E.clone().sub(S).normalize();
      const dirF = W.clone().sub(E).normalize();
      const elbowOut = out.addScaledVector(dirU, -out.dot(dirU)).normalize();
      const qU = frame(dirU, elbowOut).multiply(frame(ab.aU, ab.back).invert()).multiply(ab.qU);
      setWorldQ(arm, qU);
      // forearm: its rest relation to the upper arm, bent at the elbow
      const qF0 = qU.clone().multiply(ab.relF);
      qF0.premultiply(new THREE.Quaternion().setFromUnitVectors(ab.foreAxis.clone().applyQuaternion(qF0).normalize(), dirF));
      let qH = null;
      let pronation = 0;
      if (held) {
        // the blade along B, rolled about it so the hand's long axis lines up with the forearm
        const u = dirF.clone().addScaledVector(B, -dirF.dot(B));
        if (u.lengthSq() < 1e-8) u.copy(F).addScaledVector(B, -F.dot(B));
        u.normalize().applyAxisAngle(B, -info.beta);
        const X = new THREE.Vector3().crossVectors(B, u).normalize();
        qH = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, B, u)).multiply(info.grip.clone().invert());
        const L = info.axis.clone().applyQuaternion(qH);
        const bend = Math.acos(THREE.MathUtils.clamp(L.dot(dirF), -1, 1));
        const limit = 50 * DEG;
        if (bend > limit) qH.premultiply(new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(L, dirF), (bend - limit) / bend));
        // most of the hand's roll away from the neutral wrist is the forearm's pronation
        const D = qH.clone().multiply(qF0.clone().multiply(ab.relH).invert());
        const twist = 2 * Math.atan2(D.x * dirF.x + D.y * dirF.y + D.z * dirF.z, D.w);
        const turn = Math.atan2(Math.sin(twist), Math.cos(twist));
        const fade = flowing ? THREE.MathUtils.clamp((180 * DEG - Math.abs(turn)) / (60 * DEG), 0, 1) : 1;
        pronation = THREE.MathUtils.clamp(turn * 0.8 * fade, -150 * DEG, 150 * DEG);
      }
      const qF = new THREE.Quaternion().setFromAxisAngle(dirF, pronation).multiply(qF0);
      setWorldQ(fore, qF);
      setWorldQ(hand, qH || qF.clone().multiply(ab.relH));
    };

    const pose = (key, move = {}) => {
      toRest();
      // hips: lower by `drop` metres and turn by `twist` (+ = right; the right is -X when facing +Z); a
      // captured move also shifts them [forward, right] over feet that stay where they were planted
      const [drop, twist, shiftF = 0, shiftR = 0] = key.hips || [0, 0];
      const hipsWorld = b.hips.getWorldPosition(new THREE.Vector3());
      const standing = hipsWorld.clone();
      hipsWorld.add(new THREE.Vector3(0, -drop * k, 0)).add(body([shiftF * k, 0, shiftR * k]));
      b.hips.position.copy(b.hips.parent.worldToLocal(hipsWorld));
      b.hips.updateWorldMatrix(false, true);
      rotateWorld(b.hips, U, -twist * DEG);
      // spine: spread twist / bend / lean over the spine bones; the head keeps looking ahead
      const [st, sb, sl] = key.spine || [0, 0, 0];
      for (const bone of spineBones) {
        rotateWorld(bone, U, (-st * DEG) / spineBones.length);
        rotateWorld(bone, R, (-sb * DEG) / spineBones.length);
        rotateWorld(bone, F, (sl * DEG) / spineBones.length);
      }
      // a key may say where the head looks (degrees right of the chest) instead of "straight ahead"
      const look = Number.isFinite(key.look) ? -key.look * DEG : (st + twist) * 0.75 * DEG;
      if (b.neck && b.head) rotateWorld(b.neck, U, look * 0.4);
      rotateWorld(b.head || b.neck, U, b.head && b.neck ? look * 0.6 : look);
      if (sb) rotateWorld(b.head || b.neck, R, sb * 0.5 * DEG);
      // legs: planted stance (feet relative to the hips, flat on the ground). A key with its own `feet`
      // ([forward, right, yaw, lift, knee] per foot) places them from where the body stands at rest instead,
      // so a step, a lunge or a knee on the ground stays put while the hips travel over it.
      const hipsP = b.hips.getWorldPosition(new THREE.Vector3());
      for (const [side, up, leg, foot] of [['l', b.lUp, b.lLeg, b.lFoot], ['r', b.rUp, b.rLeg, b.rFoot]]) {
        if (!up || !leg || !foot) continue;
        const own = Array.isArray(key.feet?.[side]) ? key.feet[side] : null;
        const [fwd, right, yaw, lift = 0, knee = null] = own || STANCE[side];
        const target = (own ? standing : hipsP).clone().add(body([fwd * k, 0, right * k])).setY(ankleY + Math.max(0, lift) * k);
        const pole = Array.isArray(knee) ? hipsP.clone().add(body([knee[0] * k, knee[1] * k, knee[2] * k]))
          : hipsP.clone().add(body([0.6 * k, -0.4 * k, right * 2 * k]));
        solveMountedLimb(up, leg, foot, target, pole);
        const flat = footRestWorld.get(foot);
        if (flat) setWorldQ(foot, new THREE.Quaternion().setFromAxisAngle(U, -yaw * DEG).multiply(flat));
      }
      // arms: wrist targets relative to each shoulder, then the weapon direction through the grip
      for (const [side, arm, fore, hand] of [['r', b.rArm, b.rFore, b.rHand], ['l', b.lArm, b.lFore, b.lHand]]) {
        const spec = key[side];
        const sideSign = side === 'r' ? 1 : -1;
        if (spec && !spec.arm && Number.isFinite(spec.hilt)) {
          // Second hand of a two-handed grip: on the hilt, `hilt` metres towards the pommel from the hand
          // that carries the blade (placed first: the right hand is solved before the left).
          const lead = side === 'l' ? b.rHand : b.lHand;
          const leadSpec = key[side === 'l' ? 'r' : 'l'];
          const leadInfo = handInfo.get(lead);
          const leadQ = lead.getWorldQuaternion(new THREE.Quaternion());
          const along = leadInfo?.grip ? new THREE.Vector3(0, 1, 0).applyQuaternion(leadQ.clone().multiply(leadInfo.grip))
            : leadSpec?.blade ? body(leadSpec.blade).normalize() : U.clone();
          const shoulder = arm.getWorldPosition(new THREE.Vector3());
          const target = lead.getWorldPosition(new THREE.Vector3()).addScaledVector(along, -spec.hilt * k);
          const p = spec.pole || [-0.2, -0.5, 0.5];
          const pole = shoulder.clone().add(body([p[0] * k, p[1] * k, p[2] * sideSign * k]));
          placeArm(arm, fore, hand, target, pole, null, R.clone().multiplyScalar(sideSign));
          continue;
        }
        if (!spec?.arm) continue;
        const shoulder = arm.getWorldPosition(new THREE.Vector3());
        // a captured move says how long the arm it was measured on is: reach as far along this body's own arm
        const ab = armRest.get(arm);
        const fit = Number(move.armLength) > 0 && ab ? THREE.MathUtils.clamp((ab.up + ab.lo) / k / Number(move.armLength), 0.7, 1.3) : 1;
        const v = spec.arm;
        const target = shoulder.clone().add(body([v[0] * k * fit, v[1] * k * fit, v[2] * sideSign * k * fit]));
        const p = spec.pole || [-0.3, -0.3, 0.6];
        const pole = shoulder.clone().add(body([p[0] * k, p[1] * k, p[2] * sideSign * k]));
        const B = spec.blade ? body(spec.blade).normalize() : null;
        placeArm(arm, fore, hand, target, pole, B, R.clone().multiplyScalar(sideSign));
        const info = handInfo.get(hand);
        if (B && comboKind === 'swordCombo' && info?.grip) {
          // A long blade (the odachi) would cut into the ground: the hands stop higher instead, keeping the
          // blade's angle, until the tip of the blade as actually held (grip a hand's breadth past the wrist)
          // clears the floor.
          const floor = groundY + 0.16 * k;
          for (let pass = 0; pass < 4; pass++) {
            const handQ = hand.getWorldQuaternion(new THREE.Quaternion());
            const blade = new THREE.Vector3(0, 1, 0).applyQuaternion(handQ.clone().multiply(info.grip));
            const gripY = hand.getWorldPosition(new THREE.Vector3()).addScaledVector(info.axis.clone().applyQuaternion(handQ), 0.09 * k).y;
            const tipY = gripY + blade.y * bladeReach;
            if (tipY >= floor) break;
            target.y += floor - tipY;
            placeArm(arm, fore, hand, target, pole, B, R.clone().multiplyScalar(sideSign));
          }
        }
      }
      model.updateMatrixWorld(true);
      return { q: animated.map((bone) => bone.quaternion.clone()), hips: b.hips.position.clone() };
    };

    const combos = Array.isArray(moves) && moves.length ? moves : comboKind === 'bowCombo' ? BOW_COMBO : SWORD_COMBO;
    for (const [index, combo] of combos.entries()) {
      flowing = combo.ease === 'linear' ? new Map() : null;
      const poses = combo.keys.map((key) => pose(key, combo));
      flowing = null;
      // densify with eased in-betweens so each strike reads sharp and its recovery settles; a captured move
      // (ease: 'linear', its own `steps`) already carries its timing in closely spaced keys
      const steps = Number(combo.steps) >= 1 ? Math.round(Number(combo.steps)) : 6;
      const linear = combo.ease === 'linear';
      const times = [];
      const values = animated.map(() => []);
      const hipValues = [];
      for (let i = 0; i < combo.keys.length - 1; i++) {
        const a = combo.keys[i].t;
        const bt = combo.keys[i + 1].t;
        for (let s = 0; s < steps; s++) {
          const u = s / steps;
          const e = linear ? u : u * u * (3 - 2 * u); // smoothstep
          times.push(a + (bt - a) * u);
          animated.forEach((bone, j) => values[j].push(...poses[i].q[j].clone().slerp(poses[i + 1].q[j], e).toArray()));
          hipValues.push(...poses[i].hips.clone().lerp(poses[i + 1].hips, e).toArray());
        }
      }
      const last = combo.keys.length - 1;
      times.push(combo.keys[last].t);
      animated.forEach((bone, j) => values[j].push(...poses[last].q[j].toArray()));
      hipValues.push(...poses[last].hips.toArray());
      const tracks = animated.map((bone, j) => new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values[j]));
      tracks.push(new THREE.VectorKeyframeTrack(`${b.hips.name}.position`, times, hipValues));
      const clip = new THREE.AnimationClip(combo.name, combo.keys[last].t, tracks);
      clip.userData = { combo: comboKind, index, hit: combo.hit, sweep: combo.sweep || null, cancel: combo.cancel, generated: 'weaponComboClips',
        ...(combo.technique ? { technique: combo.technique } : {}) };
      out[combo.name] = clip;
    }
  } finally {
    restore();
  }
  return out;
}
