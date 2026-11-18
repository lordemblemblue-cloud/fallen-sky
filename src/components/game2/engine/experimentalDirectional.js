// First 360° prototype: a continuous cursor-driven direction, isolated from
// damage, collision, animation and Classic gameplay. Screen coordinates: +x right, +y down.
export const DIRECTION_SECTORS = Object.freeze(['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR']);
export const DIRECTION_SENSITIVITY = 0.015;
export const DIRECTION_DEADZONE = 0.12;

export function updateExperimentalDirection(previous, { dx = 0, dy = 0, active = false } = {}) {
  if (!active) return null;
  const x = (previous?.x || 0) + (Number.isFinite(dx) ? dx : 0) * DIRECTION_SENSITIVITY;
  const y = (previous?.y || 0) + (Number.isFinite(dy) ? dy : 0) * DIRECTION_SENSITIVITY;
  const length = Math.hypot(x, y);
  if (length < DIRECTION_DEADZONE) return { x, y, sector: null, angle: null };
  const nx = x / Math.max(1, length), ny = y / Math.max(1, length);
  const angle = Math.atan2(ny, nx);
  const sector = DIRECTION_SECTORS[(Math.round(angle * 4 / Math.PI) + 8) % 8];
  return { x: nx, y: ny, sector, angle };
}
