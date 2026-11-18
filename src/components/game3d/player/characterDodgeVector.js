import * as THREE from 'three';
import { game3dGame2MovementBasis } from './Game3DGame2Camera.mjs';
import { dodgeDirectionFromAxes } from './game3dEightWayDodge.mjs';

// getCharacterDodge resolves W/A/S/D in the CHARACTER's frame: forward/back
// come from the body's own facing (flattened to the ground plane) and
// left/right from its perpendicular, whatever the camera looks from. The
// angled Air Jump aims with it. Dodges use getInputDodge below instead: the
// owner asked for the Luna dashboard's screen-relative controls (2026-11).
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

// Dodges on the Luna dashboard / Game 2 controls (owner, 2026-11): W/A/S/D point
// on SCREEN through the camera yaw (or the lock-on axes), exactly like movement,
// so double-tap A always goes screen-left, whichever way the body faces. The
// eight-way move then comes from where that points relative to the BODY, in
// 45-degree sectors, so the animation still matches the body: running left and
// double-tapping A rolls on along the run. No key: the body's own `fallback`
// direction (R alone rolls backward).
// `basis` replaces the camera basis while locked on ({ forward, right }).
// Returns { direction, vector } like getCharacterDodge; vector is a fresh unit Vector3.
const EIGHT_WAY_SECTORS = ['forward', 'forwardRight', 'right', 'backwardRight', 'backward', 'backwardLeft', 'left', 'forwardLeft'];
export function getInputDodge(facingSource, cameraYaw, input = {}, { basis = null, fallback = 'forward' } = {}) {
  const { forward: camForward, right: camRight } = basis || getPlanarBasisFromYaw(cameraYaw);
  const dir = new THREE.Vector3();
  if (input.forward) dir.add(camForward);
  if (input.backward) dir.sub(camForward);
  if (input.right) dir.add(camRight);
  if (input.left) dir.sub(camRight);
  dir.y = 0;
  if (dir.lengthSq() < 1e-8) return getCharacterDodge(facingSource, {}, { fallback });
  dir.normalize();
  const { forward, right } = getCharacterPlanarVectors(facingSource);
  const angle = Math.atan2(dir.dot(right), dir.dot(forward)); // 0 along the body, +PI/2 its right side
  const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return { direction: EIGHT_WAY_SECTORS[sector], vector: dir };
}
