import * as THREE from 'three';
import { game3dGame2MovementBasis } from './Game3DGame2Camera.mjs';
import { dodgeDirectionFromAxes } from './game3dEightWayDodge.mjs';

// Dodge direction is CHARACTER-relative, never camera-relative.
// Camera yaw/pitch have ZERO influence here: forward/back come from the body's
// own facing (flattened to the ground plane) and left/right come from the
// perpendicular of that facing. So "dodge left" always goes to the character's
// left side, whatever angle the camera happens to be looking from.
//
// Facing convention in this world: the player model is yawed with
// setFromAxisAngle(up, atan2(moveX, moveZ)), so the body's forward is
// (sin yaw, 0, cos yaw) — NOT three.js' default -Z. Right is derived to match
// the same basis the movement code uses for A/D, so dodge and strafe agree.

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _euler = new THREE.Euler();

export function getCharacterPlanarVectors(facingSource) {
  // Read the body's world yaw (works whether the root or the mesh is rotated,
  // as long as facingSource is the object that visually turns).
  facingSource.updateWorldMatrix?.(true, false);
  _euler.setFromQuaternion(
    facingSource.getWorldQuaternion
      ? facingSource.getWorldQuaternion(new THREE.Quaternion())
      : facingSource.quaternion,
    'YXZ',
  );
  const yaw = _euler.y;
  _forward.set(Math.sin(yaw), 0, Math.cos(yaw));
  // Right is DERIVED from forward — (-f.z, 0, f.x) — never hand-signed, so
  // left/right can't skew into a diagonal at some yaws.
  _right.set(-_forward.z, 0, _forward.x);
  return { forward: _forward, right: _right };
}

// Shared planar basis for camera-yaw-driven movement. Forward is the camera's
// ground-plane facing; right is derived from it so the strafe axis is always a
// true perpendicular.
export function getPlanarBasisFromYaw(yaw) {
  // Exactly the Game 2/Luna yaw convention used for the camera.
  // Keep the established combat and character-relative dodge axes untouched.
  // Non-finite external yaw recovers to the initial camera heading.
  const basis=game3dGame2MovementBasis(yaw);
  const forward=new THREE.Vector3(basis.forward.x,0,basis.forward.z);
  const right=new THREE.Vector3(basis.right.x,0,basis.right.z);
  return {forward,right};
}

// input: { forward, backward, left, right } booleans (WASD).
// A neutral R uses a backward shoulder roll; a neutral double-tap defaults
// forward. Every diagonal has its OWN named animation, not a left/right alias.
// All eight directions are flattened and normalized, so diagonals aren't
// faster than forward/backward dodges. This does not rotate the player root.
export function getCharacterDodge(facingSource, input = {}, { fallback = 'forward' } = {}) {
  const { forward, right } = getCharacterPlanarVectors(facingSource);
  const advance = Number(!!input.forward) - Number(!!input.backward);
  const strafe = Number(!!input.right) - Number(!!input.left);
  const direction = dodgeDirectionFromAxes(advance, strafe, fallback);
  _dir.copy(forward).multiplyScalar(advance).addScaledVector(right,strafe);
  _dir.y=0;
  if(_dir.lengthSq() === 0) {
    if(direction.startsWith('backward'))_dir.copy(forward).negate();
    else if(direction==='left')_dir.copy(right).negate();
    else if(direction==='right')_dir.copy(right);
    else _dir.copy(forward);
  }
  _dir.normalize();
  return {direction,vector:_dir.clone()};
}
