// Menu and match-view fighter stance: use the same original, retargeted idle clips as combat.
// Never reveal a raw rig rest/T-pose while an optional motion pack is loading or unavailable.
import * as THREE from 'three';
import { CLASSES } from '../core/classes.mjs';
import { clipsForBody } from '../client/motionLibrary.mjs';
import { bakeDuelMoves } from '../client/duelMoves.mjs';
import { createClassWeapon, equipClassWeapon, wholeWeapon, mirrorGrip, STAFF_HANDS } from '../client/classWeapons.mjs';
import { createSecondHand } from '../client/secondHand.mjs';

export const IDLE_CLIP_BY_CLASS = Object.freeze({
  warrior: 'swordIdle',
  duelist: 'bladesIdle',
  assassin: 'staffIdle',
  healer: 'swordIdle',
});

export function idleCandidates(classId) {
  return [...new Set([IDLE_CLIP_BY_CLASS[classId] || 'swordIdle', 'swordIdle'])];
}

export function chooseIdleClip(classId, pack = {}, embedded = null) {
  return idleCandidates(classId).map((name) => pack[name])
    .find((clip) => clip?.tracks?.length > 0)
    || (embedded?.tracks?.length > 0 ? embedded : null);
}

// A valid animation clip can still leave an imported rig in a T/A pose when its
// bone tracks don't bind. Check the actual world-space upper-arm direction, not the
// local Euler axes (those differ between fused, Mixamo and custom character rigs).
// Rotate ONLY arms that point sideways; intentional relaxed/weapon poses are untouched.
export function correctSpreadArms(model) {
  const bones = { left: {}, right: {} };
  model.traverse((part) => {
    if (!part.isBone) return;
    const name = part.name.toLowerCase().replace(/[^a-z]/g, '');
    for (const side of ['left', 'right']) {
      if (name.endsWith(side + 'arm')) bones[side].upper = part;
      if (name.endsWith(side + 'forearm')) bones[side].forearm = part;
    }
  });
  model.updateMatrixWorld(true);
  let corrected = 0;
  for (const side of ['left', 'right']) {
    const { upper, forearm } = bones[side];
    if (!upper || !forearm || !upper.parent) continue;
    const shoulder = upper.getWorldPosition(new THREE.Vector3());
    const elbow = forearm.getWorldPosition(new THREE.Vector3());
    const out = elbow.sub(shoulder);
    const length = out.length();
    if (length < 1e-5 || Math.abs(out.y / length) > 0.45 || Math.abs(out.x / length) < 0.60) continue;
    // Aim the upper arm mostly down, slightly away from the torso and forward.
    const direction = new THREE.Vector3(Math.sign(out.x) * 0.28, -0.94, 0.2).normalize();
    const turn = new THREE.Quaternion().setFromUnitVectors(out.normalize(), direction);
    const parentWorld = upper.parent.getWorldQuaternion(new THREE.Quaternion());
    const upperWorld = upper.getWorldQuaternion(new THREE.Quaternion());
    upper.quaternion.copy(parentWorld.invert().multiply(turn.multiply(upperWorld)));
    upper.updateWorldMatrix(true, true);
    corrected += 1;
  }
  return corrected;
}

// A missing/corrupt motion pack must leave a ready fighter, not an exposed rig.
function relaxedFallback(model) {
  correctSpreadArms(model);
}

// Arms and equipment use the actual class form. The scene renderer belongs to each caller,
// not to this helper, so no WebGPU lifecycle code is changed.
export async function prepareIdlePreview({ model, bodyId, classId = 'duelist', embeddedIdle = null, armed = true }) {
  let weapon = null;
  let secondHand = null;
  if (armed && CLASSES[classId]) {
    try {
      const { grip, handBone } = bakeDuelMoves(model, ['held']);
      const rightHand = model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(handBone || 'mixamorig:RightHand'));
      const leftHand = model.getObjectByName('mixamorigLeftHand');
      if (rightHand && grip) {
        const pieces = createClassWeapon(classId);
        equipClassWeapon(pieces, { rightHand, leftHand, grip });
        weapon = wholeWeapon(pieces);
        if (pieces.kind === 'staff') secondHand = createSecondHand({ model, weapon: weapon.group, grip: mirrorGrip(grip), along: STAFF_HANDS });
      }
    } catch {
      // The model can still idle without a weapon when a skeleton is incomplete.
    }
  }
  let pack = {};
  try { pack = await clipsForBody(model, { rigKey: bodyId, names: idleCandidates(classId) }); }
  catch { /* Offline or missing pack: fall through to the embedded clip/ready pose. */ }

  const clip = chooseIdleClip(classId, pack, embeddedIdle);
  let mixer = null;
  if (clip) {
    mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
    mixer.update(1 / 60); // apply the first pose before the model can appear on screen
  } else relaxedFallback(model);
  // Some embedded/retargeted clips include tracks but leave the shoulders in
  // bind pose. Repair that pose after the mixer, before showing the first frame.
  correctSpreadArms(model);
  secondHand?.apply(1); // the Assassin's off hand meets the staff at rest, just as it does in combat

  return {
    update(dt) { mixer?.update(dt); correctSpreadArms(model); secondHand?.apply(1); weapon?.update(dt); },
    dispose() { mixer?.stopAllAction(); weapon?.dispose(); },
  };
}
