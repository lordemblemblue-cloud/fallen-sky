// Game 2's normal Force Lightning is a directional spread, not a target lock.
// Game 2 coordinates are metres; use a short, controllable reach and narrow sides.
export const LIGHTNING_RANGE_M = 10;
export const LIGHTNING_HALF_ANGLE_DEG = 18;
const MIN_HIT_DISTANCE_M = 0.2;
const cosLimit = Math.cos(LIGHTNING_HALF_ANGLE_DEG * Math.PI / 180);

export function insideLightningCone(origin, aim, point) {
  const x = point[0] - origin[0], y = point[1] - origin[1], z = point[2] - origin[2];
  const distance = Math.hypot(x, y, z), aimLength = Math.hypot(aim[0], aim[1], aim[2]);
  if (!Number.isFinite(distance) || !Number.isFinite(aimLength) ||
      distance < MIN_HIT_DISTANCE_M || distance > LIGHTNING_RANGE_M || aimLength < 1e-8) return false;
  return (x * aim[0] + y * aim[1] + z * aim[2]) / (distance * aimLength) >= cosLimit;
}

// A non-homing visual endpoint inside the same forward spread, for both hands.
// thetaFraction and radiusFraction are sampled anew every bolt refresh.
export function lightningSpreadEnd(origin, aim, distance, thetaFraction, radiusFraction) {
  const length = Math.hypot(aim[0], aim[1], aim[2]) || 1;
  const d = aim.map(v => v / length);
  let right = [-d[2], 0, d[0]];
  const rightLength = Math.hypot(...right);
  right = rightLength < 1e-8 ? [1, 0, 0] : right.map(v => v / rightLength);
  const up = [d[1] * right[2] - d[2] * right[1], d[2] * right[0] - d[0] * right[2], d[0] * right[1] - d[1] * right[0]];
  const theta = 2 * Math.PI * thetaFraction;
  const radius = Math.tan(LIGHTNING_HALF_ANGLE_DEG * Math.PI / 180) * Math.sqrt(Math.max(0, Math.min(1, radiusFraction)));
  const sideways = [0, 1, 2].map(i => right[i] * Math.cos(theta) + up[i] * Math.sin(theta));
  return [0, 1, 2].map(i => origin[i] + distance * (d[i] + radius * sideways[i]));
}
