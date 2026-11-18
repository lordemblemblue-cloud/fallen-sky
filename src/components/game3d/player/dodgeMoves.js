// Dodge moves: aerial side flips, a back flip and a forward roll instead of the
// old vanish-and-reappear dodge. The clips are authored on the fused Mixamo rig
// by tools/avatar-motion/author-dodges.py and shipped as one small GLB. They are
// retargeted at load onto whichever body the player uses (fused Eve/Adam,
// Artemis/Getsuga v5): world-space rotation transfer per mapped bone, and the
// hips' jump arc moved in world space and scaled by leg length, so a rig whose
// root is rotated (Getsuga's Z-up root) still jumps upward.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export const DODGE_PACK_URL = '/models/animations/dodges/dodges.glb';

// controller state -> clip in the pack
export const DODGE_CLIPS = Object.freeze({
  dodgeLeft: 'Flip_Left',
  dodgeRight: 'Flip_Right',
  dodgeBackward: 'Back_Flip',
  dodgeForward: 'Front_Roll',
  diveForward: 'Front_Roll',
});

// How far each move carries the character along the dodge direction (metres
// for a 1.7 m body, scaled by the body's height) and over which part of the
// clip: the crouch before take-off and the landing settle do not travel.
export const DODGE_TRAVEL = Object.freeze({
  Flip_Left: { distance: 3.4, start: 0.12, end: 0.84 },
  Flip_Right: { distance: 3.4, start: 0.12, end: 0.84 },
  Back_Flip: { distance: 3.0, start: 0.14, end: 0.84 },
  Front_Roll: { distance: 3.6, start: 0.05, end: 0.82 },
});

// Mixamo (canonical) <-> Unreal-style names used by the v5 rigs.
const UE_NAMES = {
  Hips: 'pelvis', Spine: 'spine_01', Spine2: 'spine_02', Neck: 'neck_01', Head: 'head',
  LeftShoulder: 'clavicle_l', LeftArm: 'upperarm_l', LeftForeArm: 'lowerarm_l', LeftHand: 'hand_l',
  RightShoulder: 'clavicle_r', RightArm: 'upperarm_r', RightForeArm: 'lowerarm_r', RightHand: 'hand_r',
  LeftUpLeg: 'thigh_l', LeftLeg: 'calf_l', LeftFoot: 'foot_l', LeftToeBase: 'ball_l',
  RightUpLeg: 'thigh_r', RightLeg: 'calf_r', RightFoot: 'foot_r', RightToeBase: 'ball_r',
};
const MIXAMO_FOR_UE = Object.fromEntries(Object.entries(UE_NAMES).map(([m, u]) => [u, m]));
export const canonicalBone = (name = '') => {
  const plain = String(name).replace(/^mixamorig:?/i, '');
  return MIXAMO_FOR_UE[plain] || plain;
};

const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
const wp = (o) => o.getWorldPosition(new THREE.Vector3());

function legLength(bones) {
  const up = bones.get('LeftUpLeg'), knee = bones.get('LeftLeg'), foot = bones.get('LeftFoot');
  return up && knee && foot ? wp(up).distanceTo(wp(knee)) + wp(knee).distanceTo(wp(foot)) : 0;
}

// The rest frame is the nodes' loaded transforms, which every clip in these files is authored
// against, not the skin's bind pose: Getsuga's bind pose is turned 90 degrees from his node
// rest, so retargeting against it would turn a back flip into a cartwheel. Call before any
// animation has posed the body (playerAnimationLibrary does, at load).
function restPose(root) {
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);
}

/** Retarget one pack clip onto `target` (a loaded character root). Returns a THREE.AnimationClip. */
export function retargetDodgeClip(sourceRoot, target, clip, fps = 30) {
  const s = clone(sourceRoot), t = clone(target);
  restPose(s); restPose(t);
  const src = new Map(), dst = new Map(), targetBones = [];
  s.traverse((n) => { if (n.isBone) src.set(canonicalBone(n.name), n); });
  t.traverse((n) => { if (n.isBone) { targetBones.push(n); if (!dst.has(canonicalBone(n.name))) dst.set(canonicalBone(n.name), n); } });
  const entries = targetBones.map((bone) => {
    const sourceBone = src.get(canonicalBone(bone.name));
    return sourceBone ? { bone, sourceBone, sRestInv: wq(sourceBone).invert(), tRest: wq(bone), values: [] } : null;
  }).filter(Boolean);
  const sh = src.get('Hips'), th = dst.get('Hips');
  const sLeg = legLength(src), tLeg = legLength(dst);
  const ratio = sLeg > 0 && tLeg > 0 ? tLeg / sLeg : 1;
  const sHips0 = sh ? wp(sh) : null, tHips0 = th ? wp(th) : null;
  const hipValues = [];
  const mixer = new THREE.AnimationMixer(s);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const count = Math.max(2, Math.ceil(clip.duration * fps) + 1), times = [];
  const parentQ = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const time = (i * clip.duration) / (count - 1);
    times.push(time);
    mixer.setTime(time);
    s.updateMatrixWorld(true);
    for (const e of entries) {
      const world = wq(e.sourceBone).multiply(e.sRestInv).multiply(e.tRest);
      if (e.bone.parent) e.bone.parent.getWorldQuaternion(parentQ); else parentQ.identity();
      e.bone.quaternion.copy(parentQ.invert().multiply(world).normalize());
      e.bone.updateMatrixWorld(true);
      const q = e.bone.quaternion, prev = e.values.length ? e.values.slice(-4) : null;
      if (prev && prev[0] * q.x + prev[1] * q.y + prev[2] * q.z + prev[3] * q.w < 0) e.values.push(-q.x, -q.y, -q.z, -q.w);
      else e.values.push(q.x, q.y, q.z, q.w);
    }
    if (sh && th) {
      const world = tHips0.clone().add(wp(sh).sub(sHips0).multiplyScalar(ratio));
      const local = th.parent ? th.parent.worldToLocal(world) : world;
      hipValues.push(local.x, local.y, local.z);
    }
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(s);
  const tracks = entries.map((e) => new THREE.QuaternionKeyframeTrack(`${e.bone.name}.quaternion`, times, e.values));
  if (hipValues.length) tracks.push(new THREE.VectorKeyframeTrack(`${th.name}.position`, times, hipValues));
  const out = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  out.userData = { ...(clip.userData || {}), dodgeTravel: DODGE_TRAVEL[clip.name] || null, legRatio: ratio };
  return out;
}

let packPromise = null;
export function loadDodgePack(url = DODGE_PACK_URL) {
  packPromise ||= new GLTFLoader().loadAsync(url).catch((error) => { packPromise = null; throw error; });
  return packPromise;
}

/** Controller clip map ({dodgeLeft, dodgeRight, dodgeBackward, dodgeForward, diveForward}) for this body. */
export async function loadDodgeClips(target, url = DODGE_PACK_URL) {
  if (!target) return {};
  const pack = await loadDodgePack(url);
  const made = new Map();
  const clips = {};
  for (const [key, name] of Object.entries(DODGE_CLIPS)) {
    const source = pack.animations.find((c) => c.name === name);
    if (!source) continue;
    if (!made.has(name)) made.set(name, retargetDodgeClip(pack.scene, target, source));
    const clip = made.get(name).clone();
    clip.name = key;
    clip.userData = made.get(name).userData;
    clips[key] = clip;
  }
  return clips;
}

/** Distance covered by the start of the clip at fraction x (0..1), as a 0..1 share of the move's travel. */
export function dodgeTravelShare(travel, x) {
  if (!travel) return Math.max(0, Math.min(1, x));
  const u = Math.max(0, Math.min(1, (x - travel.start) / Math.max(1e-6, travel.end - travel.start)));
  return u * u * (3 - 2 * u);
}

// Game 3D's eight-way dodge slots (game3dEightWayDodge.mjs) -> the authored move that plays in each. Diagonals
// use the roll / back flip along the diagonal; the quick side dodge and the R side roll both flip sideways.
export const EIGHT_WAY_DODGE_PACK_SLOTS = Object.freeze({
  dodgeRollForward: 'dodgeForward', dodgeRollForwardLeft: 'dodgeForward', dodgeRollForwardRight: 'dodgeForward',
  dodgeRollBackward: 'dodgeBackward', dodgeRollBackwardLeft: 'dodgeBackward', dodgeRollBackwardRight: 'dodgeBackward',
  dodgeStepLeft: 'dodgeLeft', dodgeStepRight: 'dodgeRight', dodgeRollLeft: 'dodgeLeft', dodgeRollRight: 'dodgeRight',
});

/**
 * One frame of an authored dodge's travel: advances `move.elapsed` by dt and returns the planar [dx, dz] to sweep.
 * move = { dir: Vector3, travel: DODGE_TRAVEL entry, duration, elapsed, distance }.
 */
export function dodgeTravelStep(move, dt) {
  const before = move.elapsed;
  move.elapsed = Math.min(move.duration, before + Math.max(0, dt));
  const share = dodgeTravelShare(move.travel, move.elapsed / move.duration) - dodgeTravelShare(move.travel, before / move.duration);
  return [move.dir.x * share * move.distance, move.dir.z * share * move.distance];
}
