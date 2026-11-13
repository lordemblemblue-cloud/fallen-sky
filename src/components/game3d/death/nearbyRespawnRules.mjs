// Local presentation-only respawn search. World collision/terrain stay authoritative
// within the current client; multiplayer server positions still require validation.
export const NEARBY_RESPAWN_ID = 'nearby-safe';
const RADII_METERS = Object.freeze([2.2, 3.2, 4.5, 6, 8, 10, 12]);
const ANGLES = 12;
const finite = Number.isFinite;

export function findSafeNearbyRespawn(deathPosition, {
  sampleGroundY, isInBounds = () => true, isBlocked = () => false,
  isDangerous = () => false, maxGroundDifference = 2.4,
} = {}) {
  if (!deathPosition || !finite(deathPosition.x) || !finite(deathPosition.z) ||
      typeof sampleGroundY !== 'function') return null;
  const centerGround = sampleGroundY(deathPosition.x, deathPosition.z);
  const seed = (Math.abs(Math.round(deathPosition.x * 7 + deathPosition.z * 11)) % ANGLES);
  for (const radius of RADII_METERS) {
    for (let i = 0; i < ANGLES; i += 1) {
      const angle = ((i + seed) % ANGLES) * Math.PI * 2 / ANGLES;
      const x = deathPosition.x + Math.cos(angle) * radius;
      const z = deathPosition.z + Math.sin(angle) * radius;
      if (!finite(x) || !finite(z) || !isInBounds(x, z)) continue;
      const y = sampleGroundY(x, z);
      if (!finite(y) || (finite(centerGround) &&
          Math.abs(y - centerGround) > maxGroundDifference)) continue;
      // Reject cliffs, loose ledges and places where a character capsule has
      // no continuous ground under its feet.
      let stable = true;
      for (const [dx, dz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) {
        const foot = sampleGroundY(x + dx, z + dz);
        if (!finite(foot) || Math.abs(foot - y) > 0.65) { stable = false; break; }
      }
      if (!stable) continue;
      const candidate = { x, y, z };
      if (isBlocked(candidate, 0.75) || isDangerous(candidate)) continue;
      return {
        id: NEARBY_RESPAWN_ID, label: 'Near Where You Fell',
        ...candidate, distance: Math.round(radius * 10) / 10, temporary: true,
      };
    }
  }
  return null;
}
