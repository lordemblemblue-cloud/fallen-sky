// Where the monsters of a group stand: pure maths, so node can test it.
//
// Candidates are spread over the whole disc (a Fibonacci disc, as the zombie
// camps use), visited in a seeded order so a group does not always fill from
// the centre, and kept only where
//   - the loaded ground answers (sampleGroundY is a finite number),
//   - the ground one metre away on all four sides rises no more than maxRise
//     (the check of safeZombieGround / selectWolfveilGroundedEnemySpawns),
//   - no monster already chosen stands closer than minSpacing.
// The same group id always gives the same points on the same ground.
const GOLDEN_ANGLE = 2.399963229728653;
export const ENEMY_PLACEMENT_DEFAULTS = Object.freeze({
  minRadius: 3, maxRadius: 40, minSpacing: 2.2, maxRise: 1.5, candidatesPerMonster: 4,
});

// Small deterministic hash and generator (mulberry32), seeded from text.
export function seedFromText(text) {
  let h = 2166136261;
  for (const ch of String(text ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function groundIsStandable(sampleGroundY, x, z, maxRise = ENEMY_PLACEMENT_DEFAULTS.maxRise) {
  if (typeof sampleGroundY !== 'function') return null;
  const y = sampleGroundY(x, z);
  if (!Number.isFinite(y)) return null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = sampleGroundY(x + dx, z + dz);
    if (!Number.isFinite(n) || Math.abs(n - y) > maxRise) return null;
  }
  return y;
}

// Returns [{ x, y, z }] in world metres, at most `count` long; shorter when the
// ground does not have room. Never throws on bad input: it returns [].
export function planGroupPositions({
  x, z, radius, count, sampleGroundY, seed = 0,
  minSpacing = ENEMY_PLACEMENT_DEFAULTS.minSpacing,
  maxRise = ENEMY_PLACEMENT_DEFAULTS.maxRise,
} = {}) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n || !Number.isFinite(x) || !Number.isFinite(z) || typeof sampleGroundY !== 'function') return [];
  const r = Math.min(ENEMY_PLACEMENT_DEFAULTS.maxRadius,
    Math.max(ENEMY_PLACEMENT_DEFAULTS.minRadius, Number(radius) || 0));
  const total = Math.max(12, n * ENEMY_PLACEMENT_DEFAULTS.candidatesPerMonster);
  const random = seededRandom(typeof seed === 'number' ? seed : seedFromText(seed));
  const turn = random() * Math.PI * 2;
  const order = Array.from({ length: total }, (_, i) => i);
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const chosen = [];
  const spacing2 = minSpacing * minSpacing;
  for (const i of order) {
    if (chosen.length >= n) break;
    // 0.92 keeps the jittered point and its one-metre ground probes in the disc.
    const d = r * 0.92 * Math.sqrt((i + 0.5) / total);
    const a = GOLDEN_ANGLE * i + turn;
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    if (chosen.some(p => (p.x - px) ** 2 + (p.z - pz) ** 2 < spacing2)) continue;
    const y = groundIsStandable(sampleGroundY, px, pz, maxRise);
    if (y === null) continue;
    chosen.push({ x: px, y, z: pz });
  }
  return chosen;
}
