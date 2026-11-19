import * as THREE from 'three';

// The fused bodies' Walk and Run are in-place clips whose planted feet move back at `clip.userData.speed`
// (GLB units per second; tools/avatar-motion/retarget-fused.mjs). Playing the clip at
// moveSpeed / (speed * body scale) keeps those feet still on the ground.
//
// Within a human cadence only: Game 3D moves faster than any of these clips (walk 4 m/s, Shift run 9 m/s,
// Ctrl sprint 12 m/s against a ~3.8 m/s motion-captured run), and matching that by playback rate alone spins the
// legs 2.5-3.7x too fast. Past LOCOMOTION_CADENCE.max the step rate stays natural and the extra ground speed
// shows as a longer glide, the same trade the Luna dashboard makes by playing its gaits at their own rate.
export const LOCOMOTION_CADENCE = Object.freeze({ min: 0.75, max: 1.45 });
// Sprint is the mobility pack's run cycle (tools/avatar-motion/mobility-clips.mjs), with its speed measured the same way.
const LOCOMOTION_STATES = new Set(['walk', 'run', 'sprint']);
const scratch = new THREE.Vector3();

export function locomotionTimeScale(clipSpeed, bodyScale, moveSpeed) {
  if (!(clipSpeed > 0) || !(bodyScale > 0) || !(moveSpeed > 0)) return null;
  return Math.max(LOCOMOTION_CADENCE.min, Math.min(LOCOMOTION_CADENCE.max, moveSpeed / (clipSpeed * bodyScale)));
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
