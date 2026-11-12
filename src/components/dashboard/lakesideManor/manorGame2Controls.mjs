// Third-person camera math shared by the world camera, the palace camera and the
// Game 3D play camera.
//
// Game 2 yaw convention: yaw 0 faces +Z, so the camera sits behind the target on
// the -Z side and the eye swings around it as yaw grows.

export const MANOR_GAME2_CAMERA = Object.freeze({
  distance: 4.2,
  minDistance: 2.4,
  maxDistance: 9,
  pitch: 0.18,
  pitchMin: -0.6,
  pitchMax: 1.05,
  targetHeight: 1.45,
  shoulderOffset: 0.32,
  sensitivity: 0.0024,
  keyLookSpeed: 1.7,
  followRate: 14,
});

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function manorGame2Follow(current, target, dt, rate = MANOR_GAME2_CAMERA.followRate) {
  const to = target || {};
  if (!current) return { x: num(to.x, 0), y: num(to.y, 0), z: num(to.z, 0) };
  const k = clamp(num(dt, 1 / 60) * rate, 0, 1);
  return {
    x: num(current.x, 0) + (num(to.x, 0) - num(current.x, 0)) * k,
    y: num(current.y, 0) + (num(to.y, 0) - num(current.y, 0)) * k,
    z: num(current.z, 0) + (num(to.z, 0) - num(current.z, 0)) * k,
  };
}

export function manorGame2CameraPose({ x = 0, y = 0, z = 0, yaw = 0, pitch = MANOR_GAME2_CAMERA.pitch, distance = MANOR_GAME2_CAMERA.distance } = {}) {
  const safePitch = clamp(num(pitch, MANOR_GAME2_CAMERA.pitch), MANOR_GAME2_CAMERA.pitchMin, MANOR_GAME2_CAMERA.pitchMax);
  const safeDistance = clamp(num(distance, MANOR_GAME2_CAMERA.distance), MANOR_GAME2_CAMERA.minDistance, MANOR_GAME2_CAMERA.maxDistance);
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const flat = Math.cos(safePitch) * safeDistance;

  const target = { x, y: y + MANOR_GAME2_CAMERA.targetHeight, z };
  return {
    target,
    eye: {
      x: x - sin * flat + cos * MANOR_GAME2_CAMERA.shoulderOffset,
      y: target.y + Math.sin(safePitch) * safeDistance,
      z: z - cos * flat - sin * MANOR_GAME2_CAMERA.shoulderOffset,
    },
  };
}

// Terrain rays contract the boom immediately; the outward recovery is eased so
// the camera never snaps back after an obstruction clears.
export function manorGame2EaseCameraClip(clipped, previousDistance, dt, rate = 12) {
  const pose = clipped?.pose ?? clipped;
  const target = num(clipped?.distance, NaN);
  if (!Number.isFinite(target)) return { pose, distance: previousDistance };
  const previous = num(previousDistance, target);
  const distance = target < previous ? target : previous + (target - previous) * clamp(num(dt, 1 / 60) * rate, 0, 1);
  return { pose, distance };
}

const isPressed = (pressed, code) =>
  Boolean(pressed?.has?.(code) || pressed?.has?.(code.toLowerCase()) || pressed?.[code] || pressed?.[code.toLowerCase()]);

export function updateManorGame2ArrowLook(look, pressed, delta) {
  if (!look || !pressed) return false;
  const step = clamp(num(delta, 0), 0, 0.1) * MANOR_GAME2_CAMERA.keyLookSpeed;
  let changed = false;
  if (isPressed(pressed, 'ArrowLeft')) {
    look.cameraYaw += step;
    changed = true;
  }
  if (isPressed(pressed, 'ArrowRight')) {
    look.cameraYaw -= step;
    changed = true;
  }
  if (isPressed(pressed, 'ArrowUp')) {
    look.pitch = clamp(num(look.pitch, MANOR_GAME2_CAMERA.pitch) - step * 0.6, MANOR_GAME2_CAMERA.pitchMin, MANOR_GAME2_CAMERA.pitchMax);
    changed = true;
  }
  if (isPressed(pressed, 'ArrowDown')) {
    look.pitch = clamp(num(look.pitch, MANOR_GAME2_CAMERA.pitch) + step * 0.6, MANOR_GAME2_CAMERA.pitchMin, MANOR_GAME2_CAMERA.pitchMax);
    changed = true;
  }
  return changed;
}