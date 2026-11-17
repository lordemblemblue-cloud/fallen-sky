// Visual-only landscaping for the four EXISTING Wolfveil cave entry paths.
// Grok/other cave work owns the entrances, stairs, elevation, collision,
// thresholds, map coordinates and underground routes. This module owns none.
export const WOLFVEIL_CAVE_LANDSCAPE_THEMES = Object.freeze({
  cedar_lantern: Object.freeze({
    title: 'Jade Lantern Grotto', stone: '#77776d', foliage: '#557762',
    accent: '#9cd8b3', feature: 'fern',
  }),
  root_steps: Object.freeze({
    title: 'Whispering Root Hollow', stone: '#756c59', foliage: '#416d4e',
    accent: '#bad990', feature: 'root',
  }),
  hot_spring_stone: Object.freeze({
    title: 'Sunken Inkstone Cistern', stone: '#667a82', foliage: '#657f73',
    accent: '#a3e1e7', feature: 'reed',
  }),
  crystal_ridge: Object.freeze({
    title: 'Echoing Crystal Vault', stone: '#717886', foliage: '#657287',
    accent: '#a5caff', feature: 'crystal',
  }),
});
export const WOLFVEIL_CAVE_LANDSCAPE_LIMITS = Object.freeze({
  distanceStep: 18, maxStationsPerApproach: 32,
  minSideOffset: 5.8, entranceSideOffset: 8.8,
  maxCrossSlope: 4.5, riverBankBuffer: 17,
  maxPlacements: 300,
});

const hash = (a, b, c = 0) => {
  const n = Math.sin(a * 12.9898 + b * 78.233 + c * 17.753) * 43758.5453;
  return n - Math.floor(n);
};
const finite = (...values) => values.every(Number.isFinite);

function samplePath(points, along) {
  let remaining = along;
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1], end = points[i];
    const dx = end.x - start.x, dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (!(length > .001)) continue;
    if (remaining <= length || i === points.length - 1) {
      const t = Math.max(0, Math.min(1, remaining / length));
      return {
        x: start.x + dx * t, z: start.z + dz * t,
        y: start.y + (end.y - start.y) * t,
        tx: dx / length, tz: dz / length,
      };
    }
    remaining -= length;
  }
  return null;
}

function totalLength(points) {
  return points.reduce((sum, point, i) => i
    ? sum + Math.hypot(point.x - points[i - 1].x, point.z - points[i - 1].z)
    : sum, 0);
}

/**
 * Computes decorative ground cover from the ACTUAL authored walkable approach.
 * The options are injected to keep this file pure (and independently testable).
 * Never outputs geometry, route edits, player interactions or collision data.
 */
export function planWolfveilCaveEntranceLandscaping(approaches, {
  heightAt, reservedAt = () => false, routeClearance = () => Infinity,
  riverDistance = () => Infinity, clearAt = () => true,
} = {}) {
  if (!Array.isArray(approaches) || typeof heightAt !== 'function')
    throw new TypeError('Cave approaches and terrain height sampler required');
  const output = [];
  const limit = WOLFVEIL_CAVE_LANDSCAPE_LIMITS;

  const place = (approach, sample, side, station, entrance = false) => {
    const theme = WOLFVEIL_CAVE_LANDSCAPE_THEMES[approach.style];
    if (!theme || !sample || !finite(sample.x, sample.y, sample.z, sample.tx, sample.tz))
      return;
    const jitter = entrance ? 0 : (hash(sample.x, sample.z, station) - .5) * 1.5;
    const sideways = (entrance ? limit.entranceSideOffset :
      limit.minSideOffset + 1.2 * hash(station, sample.z, side)) + jitter;
    const x = sample.x - sample.tz * side * sideways;
    const z = sample.z + sample.tx * side * sideways;
    const y = heightAt(x, z);
    if (!finite(x, y, z) || Math.abs(y - sample.y) > limit.maxCrossSlope)
      return;
    // Paths must remain clean and easy to follow. No decor inside the
    // existing 3.4m tread, 6.8m cave apron, real Wolfveil roads or river.
    if (reservedAt(x, z, 1.0) || routeClearance(x, z) < 2.0 ||
        riverDistance(x, z) < limit.riverBankBuffer || !clearAt(x, z))
      return;
    // Each station is a small natural grouping beside the path, never a wall.
    // The near-mouth accent is more legible but still outside the rail posts.
    const variant = hash(x, z, station + side);
    let kind = variant > .74 ? 'stone' : theme.feature;
    if (station % 5 === 0 || entrance) kind = 'waystone';
    if (station % 11 === 0 && !entrance) kind = 'lantern';
    if (approach.style === 'crystal_ridge' && !entrance && variant < .84)
      kind = 'crystal';
    const color = kind === 'stone' || kind === 'waystone' ? theme.stone
      : kind === 'lantern' || kind === 'crystal' ? theme.accent : theme.foliage;
    const scale = entrance ? 1.32 : .68 + hash(station, x, z) * .65;
    output.push(Object.freeze({
      id: approach.caveId + ':' + (entrance ? 'gate' : station) + ':' + side,
      caveId: approach.caveId, theme: approach.style,
      kind, color, x, y, z, scale, yaw: hash(z, x, side) * Math.PI * 2,
      decorative: true, collision: false, walkable: false,
    }));
  };

  for (const approach of approaches) {
    const points = approach?.points;
    if (!WOLFVEIL_CAVE_LANDSCAPE_THEMES[approach?.style] ||
        !Array.isArray(points) || points.length < 2) continue;
    const length = totalLength(points);
    if (!Number.isFinite(length) || length < 12) continue;
    const stations = Math.min(limit.maxStationsPerApproach,
      Math.max(0, Math.floor((length - 12) / limit.distanceStep)));
    for (let k = 0; k < stations; k++) {
      // Even spacing along the winding authored path, not world-coordinate
      // placement; a cave-mouth relocation naturally moves the landscaping.
      const sample = samplePath(points, 13 + k * limit.distanceStep);
      for (const side of [-1, 1]) place(approach, sample, side, k + 1);
    }
    // A quiet pair of entrance forecourt accents sits OUTSIDE the existing
    // guard rails. Never cover the opening or add a second false floor.
    const last = points.at(-1);
    const prev = points.at(-2);
    const dx = last.x - prev.x, dz = last.z - prev.z;
    const d = Math.hypot(dx, dz) || 1;
    const landing = samplePath(points, Math.max(0, length - 13));
    if (landing) {
      const entry = { ...landing, tx: dx / d, tz: dz / d };
      for (const side of [-1, 1]) place(approach, entry, side, 0, true);
    }
  }
  return Object.freeze(output.slice(0, limit.maxPlacements));
}
