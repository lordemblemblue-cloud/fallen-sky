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

// If all animation files are missing, bend the arms into a modest ready pose.
// The model remains visible and usable instead of exposing a spread-arm rig rest pose.
function relaxedFallback(model) {
  model.traverse((part) => {
    if (!part.isBone) return;
    const name = part.name.toLowerCase().replace(/[^a-z]/g, '');
    if (name.endsWith('leftarm')) { part.rotation.z += 0.85; part.rotation.x -= 0.2; }
    if (name.endsWith('rightarm')) { part.rotation.z -= 0.85; part.rotation.x += 0.2; }
    if (name.endsWith('leftforearm')) part.rotation.y -= 0.18;
    if (name.endsWith('rightforearm')) part.rotation.y += 0.18;
  });
  model.updateMatrixWorld(true);
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
  secondHand?.apply(1); // the Assassin's off hand meets the staff at rest, just as it does in combat

  return {
    update(dt) { mixer?.update(dt); secondHand?.apply(1); weapon?.update(dt); },
    dispose() { mixer?.stopAllAction(); weapon?.dispose(); },
  };
}
