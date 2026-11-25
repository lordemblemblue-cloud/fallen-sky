// Keyboard and mouse for Duelist Adventure, and the follow camera.
// What each key and mouse button does is the player's own choice (client/bindings.mjs; Settings). The
// defaults: WASD move · Shift sprint · Left click light · E heavy · Right button (hold) guard (a fresh guard
// parries) · Space jump · C roll · Alt dash · 1-4 the class's abilities (without a class: push, pull, grip (hold, let
// go to throw), Veil Breach) · Q the special · R Veil Breach · Z resist · Tab shop · middle click lock on · F (hold) use what is in
// front of you. Mouse look: click to capture the mouse, Esc releases it.
/* global window, document */
import * as THREE from 'three';
import { DEFAULT_KEYS, KIND, keysFrom, actionFor } from './bindings.mjs';
import { createInteriorOrbit } from './interiorOrbit.mjs';

const AIMED = new Set(['light', 'heavy', 'ability1', 'ability2', 'ability3', 'ability4', 'special', 'breach']);

/** keys: the player's bindings ({ action: code }; anything missing is a default). */
export function createControls(canvas, { keys = DEFAULT_KEYS, sensitivity = 1, onShopToggle = null } = {}) {
  const bound = keysFrom(keys);
  const held = new Set(); // actions held down right now
  const touchHeld = new Set(); // virtual controls are independent of physical keys
  let touchMove = { x: 0, y: 0 };
  const presses = [];
  let yaw = 0;
  let pitch = 0.32;
  let lockRequested = false;
  let paused = false;
  // an input went down: what its action does on pressing (held actions are read each step)
  const down = (code) => {
    if (paused) return false;
    const action = actionFor(bound, code);
    if (!action) return false;
    if (held.has(action)) return true;
    held.add(action);
    const kind = KIND[action];
    if (action === 'lock') lockRequested = true;
    else if (kind === 'press' || kind === 'ability') presses.push(action);
    else if (kind === 'guard') presses.push('blockDown');
    return true;
  };
  const up = (code) => {
    const action = actionFor(bound, code);
    if (!action || !held.has(action)) return;
    held.delete(action);
    if (KIND[action] === 'guard') presses.push('blockUp');
    if (KIND[action] === 'ability') presses.push('release');
  };
  const onKeyDown = (e) => {
    const mine = actionFor(bound, e.code);
    // The shop's toggle must work while movement/combat controls are paused by an open shop.
    if (mine === 'shop') {
      e.preventDefault();
      if (!e.repeat) onShopToggle?.();
      return;
    }
    if (paused) return;
    if (mine) e.preventDefault(); // Space and other bound game keys do not trigger browser actions
    if (!e.repeat) down(e.code);
  };
  const onKeyUp = (e) => {
    if (actionFor(bound, e.code)) e.preventDefault(); // Alt let go would otherwise open the browser's menu
    up(e.code);
  };
  const onMouseDown = (e) => {
    const code = `Mouse${e.button}`;
    const action = actionFor(bound, code);
    if (action === 'shop') { e.preventDefault(); onShopToggle?.(); return; }
    if (paused) return;
    // A middle click must lock the nearest target even when this is the first click on the canvas.
    // Do not require an earlier click solely to capture the pointer.
    if (action === 'lock') { down(code); e.preventDefault(); return; }
    if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.()?.catch?.(() => {}); return; }
    down(code);
    e.preventDefault();
  };
  const onMouseUp = (e) => up(`Mouse${e.button}`);
  const onMouseMove = (e) => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.0026 * sensitivity;
    pitch = THREE.MathUtils.clamp(pitch + e.movementY * 0.0022 * sensitivity, -0.2, 1.1);
  };
  const onContext = (e) => e.preventDefault();
  // Middle-click target lock must not activate the browser's auto-scroll behavior.
  const onAuxClick = (e) => { if (e.button === 1) e.preventDefault(); };
  // the window lost focus: whatever was held is let go (a raised guard drops, a held grip throws)
  const onBlur = () => {
    if (['ability1', 'ability2', 'ability3', 'ability4'].some((a) => held.has(a))) presses.push('release');
    held.clear();
    presses.push('blockUp');
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('contextmenu', onContext);
  canvas.addEventListener('auxclick', onAuxClick);
  window.addEventListener('blur', onBlur);

  return {
    keys: bound,
    setPaused(value) {
      paused = !!value;
      if (paused) {
        held.clear();
        touchHeld.clear();
        touchMove = { x: 0, y: 0 };
        presses.length = 0;
        presses.push('blockUp');
      }
    },
    // This frame's input for the player's fighter (world-space move from the camera's yaw).
    read({ faceYaw = null, strafe = false, aimWhileAttacking = false } = {}) {
      if (paused) return { move: { x: 0, z: 0 }, run: false, sprint: false,
        interact: false, face: null, strafe, presses: presses.splice(0) };
      const f = (held.has('forward') ? 1 : 0) - (held.has('back') ? 1 : 0) + touchMove.y;
      const s = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0) + touchMove.x;
      const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
      const right = { x: -Math.cos(yaw), z: Math.sin(yaw) };
      let x = forward.x * f + right.x * s;
      let z = forward.z * f + right.z * s;
      const len = Math.hypot(x, z);
      if (len > 1) { x /= len; z /= len; }
      const moving = len > 0.01;
      const pressed = presses.splice(0);
      // During a sword swing the camera/locked target stays authoritative for aim,
      // even when a lateral/backward WASD input moves the feet elsewhere.
      // The match simulation supplies aimWhileAttacking from the current move;
      // plain traversal still faces the movement direction.
      const aiming = aimWhileAttacking || pressed.some((c) => AIMED.has(c)) ||
        held.has('heavy') || held.has('light') || touchHeld.has('heavy') || touchHeld.has('light');
      return {
        move: { x, z },
        run: true,
        sprint: held.has('sprint') || touchHeld.has('sprint'),
        interact: held.has('interact') || touchHeld.has('interact'), // held at a crate, a console, a ledger core, a bell (story missions)
        face: faceYaw ?? (aiming ? yaw : moving ? Math.atan2(x, z) : null),
        strafe,
        presses: pressed,
      };
    },
    // Mobile uses the same simulated press/hold/release semantics as keyboard.
    // No ability is granted here; the match simulation/server validates all casts.
    setTouchMove({ x = 0, y = 0 } = {}) {
      touchMove = {
        x: THREE.MathUtils.clamp(Number(x) || 0, -1, 1),
        y: THREE.MathUtils.clamp(Number(y) || 0, -1, 1),
      };
    },
    touchActionDown(action) {
      if (paused || !KIND[action] || touchHeld.has(action)) return;
      if (action === 'shop') { onShopToggle?.(); return; }
      touchHeld.add(action);
      if (action === 'lock') lockRequested = true;
      else if (KIND[action] === 'guard') presses.push('blockDown');
      else if (KIND[action] === 'press' || KIND[action] === 'ability') presses.push(action);
    },
    touchActionUp(action) {
      if (!touchHeld.delete(action)) return;
      if (KIND[action] === 'guard') presses.push('blockUp');
      if (KIND[action] === 'ability') presses.push('release');
    },
    look(dx = 0, dy = 0) {
      if (paused) return;
      yaw -= THREE.MathUtils.clamp(Number(dx) || 0, -120, 120) * 0.0026 * sensitivity;
      pitch = THREE.MathUtils.clamp(pitch +
        THREE.MathUtils.clamp(Number(dy) || 0, -120, 120) * 0.0022 * sensitivity, -0.2, 1.1);
    },
    // Existing on-screen HUD and automated test compatibility.
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
      canvas.removeEventListener('auxclick', onAuxClick);
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
  const interior = createInteriorOrbit(camera);
  let wasInterior = false;
  return {
    // clamp(target, point): indoors, pulls a camera position back inside the room (walls, the ceiling)
    update(dt, { target, yaw, pitch, lockOn = null, clamp = null, interiorRay = null }) {
      if (interiorRay) {
        focus.set(target.x, target.y + 1.45, target.z);
        if (first || !wasInterior) interior.snap();
        interior.update(dt, { target, yaw, pitch, ray: interiorRay });
        first = false; wasInterior = true;
        return;
      }
      if (wasInterior) { first = true; wasInterior = false; }
      const distance = 4.3;
      focus.set(target.x, target.y + 1.45, target.z);
      if (lockOn) focus.lerp(new THREE.Vector3(lockOn.x, lockOn.y + 1.2, lockOn.z), 0.25);
      wanted.set(
        focus.x - Math.sin(yaw) * Math.cos(pitch) * distance,
        focus.y + Math.sin(pitch) * distance,
        focus.z - Math.cos(yaw) * Math.cos(pitch) * distance,
      );
      wanted.y = Math.max(0.4, wanted.y);
      if (clamp) clamp(target, wanted);
      if (first) { camera.position.copy(wanted); first = false; }
      camera.position.lerp(wanted, 1 - Math.exp(-dt * 14));
      if (clamp) clamp(target, camera.position);
      camera.lookAt(focus);
    },
    // a cut (a respawn): the next update jumps instead of gliding
    snap() { first = true; },
    distanceTo(target) { return Math.hypot(focus.x - target.x, focus.z - target.z); },
  };
}
