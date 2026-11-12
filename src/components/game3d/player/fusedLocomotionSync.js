import * as THREE from 'three';

// The fused bodies' Walk and Run are in-place clips whose planted feet move back at `clip.userData.speed`
// (GLB units per second; tools/avatar-motion/retarget-fused.mjs). Playing the clip at
// moveSpeed / (speed * body scale) keeps those feet still on the ground at any move speed.
const LOCOMOTION_STATES = new Set(['walk', 'run']);
const scratch = new THREE.Vector3();

export function locomotionTimeScale(clipSpeed, bodyScale, moveSpeed) {
  if (!(clipSpeed > 0) || !(bodyScale > 0) || !(moveSpeed > 0)) return null;
  return Math.max(0.25, Math.min(4, moveSpeed / (clipSpeed * bodyScale)));
}

export function syncFusedLocomotion(playerAnim, model, moveSpeed) {
  if (!model?.userData?.fusedCharacter || !playerAnim) return null;
  const state = playerAnim.getCurrent?.();
  if (!LOCOMOTION_STATES.has(state)) return null;
  const action = playerAnim.actions?.[state];
  const scale = locomotionTimeScale(action?.getClip?.()?.userData?.speed, model.getWorldScale(scratch).y, moveSpeed);
  if (scale !== null) action.setEffectiveTimeScale(scale);
  return scale;
}
