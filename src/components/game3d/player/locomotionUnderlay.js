// Attacks and the bow as animation montages over locomotion (owner 2026-11-19): a weapon swing, the bow's
// draw, hold and release play on the upper body while the legs keep walking, running or sprinting.
//
// The player controller plays those montages as ordinary mixer states; their baked clips pose the whole body
// with the feet planted. After the mixer has posed the body, the underlay puts the hips and legs back on the
// locomotion cycle the player is moving with, sampled at that cycle's own running phase, by `weight` (0
// standing still: the montage's own planted stance; 1 moving), and turns the first spine bone so the chest
// keeps the montage's facing however the walking hips sway (a mesh-space blend). Only bones that the
// montage's own clip animates are written, so the mixer rewrites every one of them on the next frame.
//
// overlayArm lays one arm of a pose clip (the bow carried while running) over whatever the mixer posed.
// Presentation only: no movement, collision, damage or network state lives here.
import * as THREE from 'three';
import { solveMountedLimb } from './mountedRiderPose.mjs';

// How much of the locomotion hips' sway the chest keeps: the rest is cancelled, so a swing or an aim stays on
// target while the hips walk.
export const CHEST_FOLLOWS_HIPS = 0.25;

const parse = (name) => THREE.PropertyBinding.parseTrackName(name);

/**
 * bones: { hips, spine, lUp, lLeg, lFoot, rUp, rLeg, rFoot, lArm, lFore, lHand, rArm, rFore, rHand }
 * (weaponComboClips.findComboBones). Returns null when the rig lacks the hips or legs.
 */
export function createLocomotionUnderlay(model, bones) {
  if (!model || !bones?.hips || !bones.lUp || !bones.rUp) return null;
  const lower = new Set([bones.hips, bones.lUp, bones.lLeg, bones.lFoot, bones.rUp, bones.rLeg, bones.rFoot].filter(Boolean));
  const arms = {
    left: [bones.lArm, bones.lFore, bones.lHand].filter(Boolean),
    right: [bones.rArm, bones.rFore, bones.rHand].filter(Boolean),
  };
  const samplers = new WeakMap(); // clip -> [{ node, prop, interpolant }]
  const animatedBy = new WeakMap(); // clip -> Set of nodes it animates
  const hipsBefore = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  let clip = null; // the locomotion clip the legs follow
  let phase = 0; // 0..1 through that clip
  let synced = false; // the phase was taken from the playing locomotion this frame
  let lastWeight = 0;

  const samplersFor = (source) => {
    if (!source) return [];
    if (!samplers.has(source)) {
      const list = [];
      for (const track of source.tracks) {
        const { nodeName, propertyName } = parse(track.name);
        const node = THREE.PropertyBinding.findNode(model, nodeName);
        if (!node) continue;
        if (propertyName !== 'quaternion' && !(propertyName === 'position' && node === bones.hips)) continue;
        list.push({ node, prop: propertyName, interpolant: track.createInterpolant() });
      }
      samplers.set(source, list);
    }
    return samplers.get(source);
  };
  // The pose's first frame worked out in the model's own frame (forward kinematics from the pose's tracks;
  // nodes it does not animate keep their own transform): the hips, the elbow and the hand positions and the
  // hand's orientation. The live skeleton is not touched.
  const armReferences = new WeakMap(); // pose -> { [side]: reference }
  const rotationScale = new THREE.Matrix4();
  const armReference = (pose, side, [, fore, hand]) => {
    const bySide = armReferences.get(pose) || {};
    if (bySide[side]) return bySide[side];
    const quaternions = new Map();
    let hipsPosition = null;
    for (const { node, prop, interpolant } of samplersFor(pose)) {
      const value = interpolant.evaluate(0);
      if (prop === 'quaternion') quaternions.set(node, new THREE.Quaternion().fromArray(value).normalize());
      else if (node === bones.hips) hipsPosition = new THREE.Vector3().fromArray(value);
    }
    const local = (node) => {
      const path = [];
      for (let n = node; n && n !== model; n = n.parent) path.unshift(n);
      const m = new THREE.Matrix4();
      for (const n of path) {
        m.multiply(new THREE.Matrix4().compose(n === bones.hips && hipsPosition ? hipsPosition : n.position,
          quaternions.get(n) || n.quaternion, n.scale));
      }
      return m;
    };
    const handMatrix = local(hand);
    const handQ = new THREE.Quaternion();
    handMatrix.decompose(new THREE.Vector3(), handQ, new THREE.Vector3());
    const reference = { hips: new THREE.Vector3().setFromMatrixPosition(local(bones.hips)),
      elbow: new THREE.Vector3().setFromMatrixPosition(local(fore)), hand: new THREE.Vector3().setFromMatrixPosition(handMatrix), handQ };
    armReferences.set(pose, { ...bySide, [side]: reference });
    return reference;
  };
  const nodesOf = (source) => {
    if (!source) return null;
    if (!animatedBy.has(source)) {
      const set = new Set();
      for (const track of source.tracks) {
        const node = THREE.PropertyBinding.findNode(model, parse(track.name).nodeName);
        if (node) set.add(node);
      }
      animatedBy.set(source, set);
    }
    return animatedBy.get(source);
  };

  return {
    // The locomotion itself is playing: follow its phase so a montage that starts now continues the stride.
    sync(source, normalizedPhase) {
      if (!source || !Number.isFinite(normalizedPhase)) return;
      clip = source;
      phase = ((normalizedPhase % 1) + 1) % 1;
      synced = true;
    },
    // Call after the mixer has posed the body. locomotion: the clip the legs should follow (null keeps the last
    // one, so the legs can settle while the weight falls); timeScale: its playback rate; weight: 0..1;
    // montage: the montage clip on screen (only bones it animates are written).
    update(delta, { locomotion = null, timeScale = 1, weight = 0, montage = null } = {}) {
      if (locomotion && locomotion !== clip) clip = locomotion; // a new gait keeps the stride's phase
      if (clip && !synced && clip.duration > 0) phase = (phase + (Math.max(0, delta) * Math.max(0, timeScale)) / clip.duration) % 1;
      synced = false;
      lastWeight = THREE.MathUtils.clamp(Number(weight) || 0, 0, 1);
      const written = nodesOf(montage);
      if (!clip || !written || lastWeight <= 1e-3) return false;
      const t = phase * clip.duration;
      hipsBefore.copy(bones.hips.quaternion);
      for (const { node, prop, interpolant } of samplersFor(clip)) {
        if (!lower.has(node) || !written.has(node)) continue;
        const value = interpolant.evaluate(t);
        if (prop === 'quaternion') node.quaternion.slerp(q.fromArray(value).normalize(), lastWeight);
        else node.position.lerp(p.fromArray(value), lastWeight);
      }
      if (bones.spine && written.has(bones.spine)) {
        // the chest keeps the montage's own turn: undo (most of) what the new hips did to it
        q.copy(bones.hips.quaternion).invert().multiply(hipsBefore).multiply(bones.spine.quaternion);
        bones.spine.quaternion.slerp(q, 1 - CHEST_FOLLOWS_HIPS);
      }
      return true;
    },
    // One arm of `pose` (a baked pose clip) laid over the current pose by `weight`, held in the body's frame:
    // the hand goes where the pose puts it relative to the hips (two-bone IK, the elbow towards the pose's
    // elbow) and turns to the pose's own orientation. However far the gait under it leans or twists the
    // chest, the hand and what it holds stay where the pose put them. Only bones the mixer is animating this
    // frame may be passed in: animated = the clip on screen.
    overlayArm(pose, side, weight, { animated = null } = {}) {
      const w = THREE.MathUtils.clamp(Number(weight) || 0, 0, 1);
      const [arm, fore, hand] = arms[side] || [];
      const written = nodesOf(animated);
      if (!pose || !arm || !fore || !hand || !written || w <= 1e-3) return false;
      if (![arm, fore, hand].every((node) => written.has(node))) return false;
      const ref = armReference(pose, side, [arm, fore, hand]);
      model.updateMatrixWorld(true);
      const hipsLive = bones.hips.getWorldPosition(new THREE.Vector3());
      const fromHips = (local) => local.clone().sub(ref.hips).applyMatrix4(rotationScale.extractRotation(model.matrixWorld))
        .multiplyScalar(model.getWorldScale(p).x).add(hipsLive);
      const before = [arm, fore, hand].map((node) => node.quaternion.clone());
      if (!solveMountedLimb(arm, fore, hand, fromHips(ref.hand), fromHips(ref.elbow))) return false;
      const handWorld = model.getWorldQuaternion(new THREE.Quaternion()).multiply(ref.handQ);
      hand.quaternion.copy(fore.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handWorld));
      [arm, fore, hand].forEach((node, i) => { const solved = node.quaternion.clone(); node.quaternion.copy(before[i]).slerp(solved, w); });
      return true;
    },
    getPhase: () => phase,
    getClip: () => clip,
    getWeight: () => lastWeight,
  };
}
