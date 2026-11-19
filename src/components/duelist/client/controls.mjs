// Keyboard and mouse for Duelist Adventure, and the follow camera.
// Default bindings (rebindable later in Settings):
//   WASD move · Shift sprint · Left click light · E heavy · Right button (hold) guard (a fresh guard parries)
//   Space roll · Ctrl dash · 1 push · 2 pull · 3 grip (hold, let go to throw) · 4 Veil Breach · Z resist
//   Tab lock on · mouse look (click the arena to capture the mouse, Esc releases it)
/* global window, document */
import * as THREE from 'three';

export const DEFAULT_BINDINGS = Object.freeze({
  KeyE: 'heavy', Space: 'roll', ControlLeft: 'dash', ControlRight: 'dash', Digit1: 'push', Digit2: 'pull', Digit3: 'grip',
  Digit4: 'breach', KeyZ: 'resist',
});

const AIMED = new Set(['light', 'heavy', 'push', 'pull', 'grip', 'breach']);

export function createControls(canvas, { bindings = DEFAULT_BINDINGS, sensitivity = 1 } = {}) {
  const keys = new Set();
  const presses = [];
  let yaw = 0;
  let pitch = 0.32;
  let lockRequested = false;
  const onKeyDown = (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    const command = bindings[e.code];
    if (command) { presses.push(command); e.preventDefault(); }
    if (e.code === 'Tab') { lockRequested = true; e.preventDefault(); }
  };
  const onKeyUp = (e) => {
    keys.delete(e.code);
    if (bindings[e.code] === 'grip') presses.push('release');
  };
  const onMouseDown = (e) => {
    if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.()?.catch?.(() => {}); return; }
    if (e.button === 0) presses.push('light');
    if (e.button === 2) presses.push('blockDown');
    e.preventDefault();
  };
  const onMouseUp = (e) => { if (e.button === 2) presses.push('blockUp'); };
  const onMouseMove = (e) => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.0026 * sensitivity;
    pitch = THREE.MathUtils.clamp(pitch + e.movementY * 0.0022 * sensitivity, -0.2, 1.1);
  };
  const onContext = (e) => e.preventDefault();
  const onBlur = () => { keys.clear(); presses.push('blockUp'); };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('contextmenu', onContext);
  window.addEventListener('blur', onBlur);

  return {
    // This frame's input for the player's fighter (world-space move from the camera's yaw).
    read({ faceYaw = null, strafe = false } = {}) {
      const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
      const right = { x: -Math.cos(yaw), z: Math.sin(yaw) };
      let x = forward.x * f + right.x * s;
      let z = forward.z * f + right.z * s;
      const len = Math.hypot(x, z);
      if (len > 1) { x /= len; z /= len; }
      const moving = len > 0.01;
      const pressed = presses.splice(0);
      // strikes and powers go where the camera looks; otherwise the body turns the way it moves
      const aiming = pressed.some((c) => AIMED.has(c)) || keys.has('KeyE');
      return {
        move: { x, z },
        run: true,
        sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        face: faceYaw ?? (aiming ? yaw : moving ? Math.atan2(x, z) : null),
        strafe,
        presses: pressed,
      };
    },
    // a command from the on-screen buttons (touch screens) or a test
    press(command) { if (command) presses.push(command); },
    takeLockToggle() { const r = lockRequested; lockRequested = false; return r; },
    yaw: () => yaw,
    pitch: () => pitch,
    setYaw(v) { yaw = v; },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('contextmenu', onContext);
      window.removeEventListener('blur', onBlur);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    },
  };
}

// Third-person camera: behind and above the fighter, eased; with a lock-on target it frames both.
export function createFollowCamera(camera) {
  const focus = new THREE.Vector3();
  const wanted = new THREE.Vector3();
  let first = true;
  return {
    update(dt, { target, yaw, pitch, lockOn = null }) {
      const distance = 4.3;
      focus.set(target.x, target.y + 1.45, target.z);
      if (lockOn) focus.lerp(new THREE.Vector3(lockOn.x, lockOn.y + 1.2, lockOn.z), 0.25);
      wanted.set(
        focus.x - Math.sin(yaw) * Math.cos(pitch) * distance,
        focus.y + Math.sin(pitch) * distance,
        focus.z - Math.cos(yaw) * Math.cos(pitch) * distance,
      );
      wanted.y = Math.max(0.4, wanted.y);
      if (first) { camera.position.copy(wanted); first = false; }
      camera.position.lerp(wanted, 1 - Math.exp(-dt * 14));
      camera.lookAt(focus);
    },
    // a cut (a respawn): the next update jumps instead of gliding
    snap() { first = true; },
    distanceTo(target) { return Math.hypot(focus.x - target.x, focus.z - target.z); },
  };
}
