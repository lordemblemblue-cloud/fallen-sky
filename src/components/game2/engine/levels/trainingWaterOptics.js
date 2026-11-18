// Optical depth sampled from the same authored radial pond-bed equations as
// buildAbyssPondBed(). This is visual data only: no gameplay water level,
// collision, or CPU wave simulation is modified.
export const TRAINING_POND_OPTICAL_DEPTH_M = 8;
export const TRAINING_RIVER_OPTICAL_DEPTH_M = 1.2;

const clamp01 = value => Math.min(1, Math.max(0, value));

export function sampleTrainingPondDepthMeters({
  angle, radius, shoreRadius, surfaceY, waterY,
}) {
  if (![angle, radius, shoreRadius, surfaceY, waterY].every(Number.isFinite) ||
      radius < 0 || shoreRadius <= 0) {
    throw new RangeError('Invalid training pond optical-depth sample');
  }
  // The bed is generated to shoreRadius + 3m, while the visible lake lip
  // reaches shoreRadius + 2.5m. Match the bed's exact t/erosion formula.
  const t = clamp01(radius / (shoreRadius + 3));
  const erosion = Math.sin(angle * 13 + t * 26) *
    Math.cos(angle * 21 - t * 38);
  const bedDepth = 1.65 + 5.4 * Math.pow(1 - t, 1.28);
  const bedY = waterY - bedDepth +
    (erosion * .44 * t + .15 * Math.sin(radius * .21 + angle * 7)) *
    Math.sin(t * Math.PI * .95);
  return Math.max(0, surfaceY - bedY);
}

export function encodeTrainingWaterOpticalDepth(depthMeters, maxDepthMeters) {
  if (!Number.isFinite(depthMeters) || !Number.isFinite(maxDepthMeters) ||
      maxDepthMeters <= 0) {
    throw new RangeError('Invalid training water optical-depth encoding');
  }
  return Math.round(255 * clamp01(depthMeters / maxDepthMeters));
}

// Beer-Lambert channel attenuation, used as a testable CPU reference for
// the depth-weighted GPU shader. Red always attenuates fastest.
export function trainingWaterTransmittance(depthMeters) {
  if (!Number.isFinite(depthMeters) || depthMeters < 0)
    throw new RangeError('Invalid optical depth');
  return [.52, .23, .095].map(sigma => Math.exp(-sigma * depthMeters));
}
