import * as THREE from 'three';

// A radial spring arm: never interpolate positions across walls or let collision
// change the player's requested heading. The same 3D registry as gameplay is
// queried, including negative floors, ramps, ceilings and doorway cutouts.
const ARM = 4.3;
const CLEARANCE = .16;
const SKIN = .025;
const EYE_HEIGHTS = [1.45, 1.25, 1.05, .85, 1.65];
export function createInteriorOrbit(camera) {
  const eye = new THREE.Vector3(), back = new THREE.Vector3();
  const desired = new THREE.Vector3(), look = new THREE.Vector3();
  let distance = ARM, first = true;
  return {
    snap() { first = true; },
    update(dt, { target, yaw, pitch, ray }) {
      // A jump beneath a beam can put the normal eye inside padded geometry.
      // Prefer a nearby clear point on the body before reducing clearance.
      let pad = CLEARANCE, clear = false;
      for (const radius of [CLEARANCE, .08, .025, 0]) {
        for (const height of EYE_HEIGHTS) {
          eye.set(target.x, target.y + height, target.z);
          if (ray(eye, eye, radius) >= 1) { pad = radius; clear = true; break; }
        }
        if (clear) break;
      }
      back.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      if (!clear) {
        // An invalid/transient body pose must not create a camera inside solid geometry.
        // Retain the last valid position for this frame; retry immediately next frame.
        camera.lookAt(look.copy(camera.position).sub(back));
        first = true;
        return;
      }
      desired.copy(eye).addScaledVector(back, ARM);
      const hit = ray(eye, desired, pad);
      const allowed = hit >= 1 ? ARM : Math.max(0, ARM * hit - SKIN);
      // Pull in immediately at a corner; ease only the outward recovery.
      distance = first || allowed <= distance ? allowed : Math.min(allowed, distance + (allowed - distance) * -Math.expm1(-Math.max(0, dt) * 10));
      first = false;
      camera.position.copy(eye).addScaledVector(back, distance);
      // Even at zero arm length, keep a well-defined look direction. Do not
      // lookAt(eye), which becomes degenerate when the camera is fully retracted.
      camera.lookAt(look.copy(camera.position).sub(back));
    },
  };
}
