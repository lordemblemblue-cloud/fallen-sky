// Shared deterministic 360-degree Fleet Assault layout and asteroid cover.
// Pure code: server collision, AI routing and the client renderer use identical positions.
import { segmentHitsSphere } from './vec.mjs';
const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
export const BATTLEFIELD = Object.freeze({
  capitalRadius: 3350, asteroidCount: 92, asteroidMin: 75, asteroidMax: 215,
  asteroidCell: 640, visualRadius: 6200, pilotLaunchSpread: 140,
  shipModelRange: 900, cruiserDetailRange: 5500,
});
// Each team's capital ships occupy multiple elevations and every compass sector.
// Interleaving both teams' points avoids the old two-wall battle line.
export function capitalPosition(side, index, perSide) {
  const n = perSide * 2, k = index * 2 + (side === 'republic' ? 0 : 1);
  const y = 1 - 2 * (k + 0.5) / n;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const a = GOLDEN * k + 0.35;
  const r = BATTLEFIELD.capitalRadius + ((index * 7 + (side === 'republic' ? 0 : 2)) % 3) * 235;
  return [Math.cos(a) * ring * r, y * r * 0.8, Math.sin(a) * ring * r];
}
export function fleetPositions(perSide) {
  const out = [];
  for (const side of ['republic', 'separatist']) for (let i = 0; i < perSide; i++)
    out.push({ side, index: i, p: capitalPosition(side, i, perSide) });
  return out;
}
function random(seed) { let n = seed >>> 0; return () => ((n = (1664525 * n + 1013904223) >>> 0) / 4294967296); }
export function createAsteroidField(cruisers = fleetPositions(7), count = BATTLEFIELD.asteroidCount) {
  const rng = random(0x4aa3c37);
  const out = [];
  // Fibonacci/golden-angle spherical distribution, multiple shells and scattered
  // dense pockets. Leave hangar and capital approaches clear.
  for (let k = 0; k < count * 8 && out.length < count; k++) {
    const altitude = rng() * 2 - 1, a = GOLDEN * k + rng() * 0.55;
    const radial = Math.sqrt(1 - altitude * altitude);
    const d = [radial * Math.cos(a), altitude, radial * Math.sin(a)];
    const r = 1050 + rng() * 4550, radius = BATTLEFIELD.asteroidMin + Math.pow(rng(), 2.4) * (BATTLEFIELD.asteroidMax - BATTLEFIELD.asteroidMin);
    const p = [d[0] * r, d[1] * r * 0.85, d[2] * r];
    if (cruisers.some(c => Math.hypot(...c.p.map((v, i) => p[i] - v)) < radius + 590)) continue;
    if (out.some(x => Math.hypot(...x.p.map((v, i) => p[i] - v)) < radius + x.r + 80)) continue;
    out.push({ id: out.length + 1, p, r: radius, spin: (rng() * 2 - 1) * 0.04, seed: Math.floor(rng() * 2 ** 24) });
  }
  return out;
}
export function asteroidHitFraction(a, b, asteroids, padding = 0) {
  let best = -1;
  for (const rock of asteroids) {
    // Cheap broad-phase AABB: avoids most sphere intersection calculations.
    const r = rock.r + padding;
    if (Math.min(a[0], b[0]) > rock.p[0] + r || Math.max(a[0], b[0]) < rock.p[0] - r ||
        Math.min(a[1], b[1]) > rock.p[1] + r || Math.max(a[1], b[1]) < rock.p[1] - r ||
        Math.min(a[2], b[2]) > rock.p[2] + r || Math.max(a[2], b[2]) < rock.p[2] - r) continue;
    const t = segmentHitsSphere(a, b, rock.p, r);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}
export function coverBlocks(a, b, asteroids, padding = 0) {
  return asteroidHitFraction(a, b, asteroids, padding) >= 0;
}
