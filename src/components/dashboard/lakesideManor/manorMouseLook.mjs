// Relative mouse-look for the shared camera. Writes back onto the caller's
// mutable look object so both the Game 2 palace and Game 3D play camera keep
// one source of truth for yaw and pitch.
import { MANOR_GAME2_CAMERA } from './manorGame2Controls.mjs';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function applyManorMouseLook(look, dx, dy, options = {}) {
  if (!look || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;

  const sensitivity = Number.isFinite(Number(options.sensitivity))
    ? Number(options.sensitivity)
    : MANOR_GAME2_CAMERA.sensitivity;
  const pitchMin = Number.isFinite(Number(options.pitchMin)) ? Number(options.pitchMin) : MANOR_GAME2_CAMERA.pitchMin;
  const pitchMax = Number.isFinite(Number(options.pitchMax)) ? Number(options.pitchMax) : MANOR_GAME2_CAMERA.pitchMax;

  const yaw = Number.isFinite(look.cameraYaw) ? look.cameraYaw : 0;
  const pitch = Number.isFinite(look.pitch) ? look.pitch : MANOR_GAME2_CAMERA.pitch;

  look.cameraYaw = yaw - dx * sensitivity;
  look.pitch = clamp(pitch + dy * sensitivity, pitchMin, pitchMax);
  return true;
}