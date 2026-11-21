// The staff's second hand. The staff's clips were posed in Blender with both hands on the shaft, on the body the
// motion pack was made on; a body with other proportions would hold it a hand's breadth off. So after the clips
// have posed a fighter, the left arm is solved again: the left hand's grip goes onto the shaft, `along` metres up
// the weapon from the right hand, as much as the clips say the hand is on it (the pack records that per clip).
import * as THREE from 'three';
import { MOTION_CLIPS } from '../core/motionPack.data.mjs';

/** How much the second hand is on the shaft at a time of a clip (0..1; 0 for clips that are not the staff's). */
export function secondHandAt(clipName, time) {
  const held = MOTION_CLIPS[clipName]?.secondHand;
  if (!held) return 0;
  const info = MOTION_CLIPS[clipName];
  const t = info.loop ? ((time % info.duration) + info.duration) % info.duration : Math.min(Math.max(time, 0), info.duration);
  const x = Math.min(held.on.length - 1, t / held.step);
  const i = Math.min(held.on.length - 2, Math.floor(x));
  return i < 0 ? held.on[0] : held.on[i] + (held.on[i + 1] - held.on[i]) * (x - i);
}

const shoulder = new THREE.Vector3();
const elbow = new THREE.Vector3();
const wrist = new THREE.Vector3();
const origin = new THREE.Vector3();
const shaft = new THREE.Vector3();
const axisNow = new THREE.Vector3();
const offset = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const pole = new THREE.Vector3();
const bend = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const parentQ = new THREE.Quaternion();
const upperQ = new THREE.Quaternion();
const foreQ = new THREE.Quaternion();
const handQ = new THREE.Quaternion();
const turn = new THREE.Quaternion();
const turn2 = new THREE.Quaternion();
const solved = new THREE.Quaternion();

/**
 * model: the body; weapon: the staff's group (the right hand's grip at its origin, the shaft along +Y);
 * grip: the left hand's grip in its bone's space ({ position, quaternion }: the right hand's, mirrored);
 * along: metres from the right hand's grip to the left's. Returns { apply(weight) } or null without the bones.
 */
export function createSecondHand({ model, weapon, grip, along }) {
  const bone = (name) => model.getObjectByName(`mixamorig${name}`);
  const upper = bone('LeftArm');
  const fore = bone('LeftForeArm');
  const hand = bone('LeftHand');
  if (!upper || !fore || !hand || !weapon || !grip) return null;
  const gripAt = new THREE.Vector3().fromArray(grip.position);
  const gripAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion().fromArray(grip.quaternion)).normalize();
  return {
    /** Call after the mixer has posed the body. weight: how much the hand is on the shaft now (0..1). */
    apply(weight) {
      if (!(weight > 0.001)) return 0;
      hand.updateWorldMatrix(true, false);
      weapon.updateWorldMatrix(true, false);
      shoulder.setFromMatrixPosition(upper.matrixWorld);
      elbow.setFromMatrixPosition(fore.matrixWorld);
      wrist.setFromMatrixPosition(hand.matrixWorld);
      origin.setFromMatrixPosition(weapon.matrixWorld);
      shaft.setFromMatrixColumn(weapon.matrixWorld, 1).normalize();
      upper.parent.getWorldQuaternion(parentQ);
      upper.getWorldQuaternion(upperQ);
      fore.getWorldQuaternion(foreQ);
      hand.getWorldQuaternion(handQ);
      // the hand turns the least it must for its grip to lie along the shaft, thumb up it
      axisNow.copy(gripAxis).applyQuaternion(handQ);
      turn.setFromUnitVectors(axisNow, shaft);
      handQ.premultiply(turn);
      // the grip's place from the wrist, as the hand is now turned
      offset.copy(gripAt).applyMatrix4(hand.matrixWorld).sub(wrist).applyQuaternion(turn);
      const miss = a.copy(origin).addScaledVector(shaft, along).sub(wrist).sub(offset).length();
      toTarget.copy(origin).addScaledVector(shaft, along).sub(offset).sub(shoulder); // where the wrist must be
      const l1 = shoulder.distanceTo(elbow);
      const l2 = elbow.distanceTo(wrist);
      const d = Math.min(Math.max(toTarget.length(), Math.abs(l1 - l2) + 1e-4), (l1 + l2) * 0.999);
      toTarget.normalize();
      // the elbow stays on the side the clip has it
      bend.copy(elbow).sub(shoulder);
      pole.copy(bend).addScaledVector(toTarget, -bend.dot(toTarget));
      if (pole.lengthSq() < 1e-8) pole.set(0, -1, 0).addScaledVector(toTarget, toTarget.y);
      pole.normalize();
      const c = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
      a.copy(toTarget).multiplyScalar(l1 * c).addScaledVector(pole, l1 * Math.sqrt(Math.max(0, 1 - c * c))); // shoulder to the new elbow
      turn.setFromUnitVectors(bend.normalize(), b.copy(a).normalize());
      upperQ.premultiply(turn);
      // the forearm, carried by the upper arm's turn, then pointed at the wrist's place
      b.copy(wrist).sub(elbow).normalize().applyQuaternion(turn);
      turn2.setFromUnitVectors(b, pole.copy(toTarget).multiplyScalar(d).sub(a).normalize());
      foreQ.premultiply(turn).premultiply(turn2);
      // back to each bone's own rotation, as much as the hand is on the shaft
      upper.quaternion.slerp(solved.copy(parentQ).invert().multiply(upperQ), weight);
      fore.quaternion.slerp(solved.copy(upperQ).invert().multiply(foreQ), weight);
      hand.quaternion.slerp(solved.copy(foreQ).invert().multiply(handQ), weight);
      return miss;
    },
  };
}
