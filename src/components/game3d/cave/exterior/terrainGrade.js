// Cuts a walkable bench along the Ashen Cliff approach and lifts the rock
// shoulders beside the mouth. Installed into wolfveilHeight before the
// terrain mesh is built, so the rendered hill and the player raycast agree.
import {
  setWolfveilCaveApproachTerrainGrade,
  wolfveilCaveApproachTerrainGrade,
} from '../../wolfveil/WolfveilLayout.js';
import { approachPointDistance, getAshenCliffApproach } from './approachPlan.js';

const MARK = Symbol.for('game3d.ashenCliffTerrainGrade');

const smooth01 = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

function cliffLift(x, z, entrance) {
  const ix = entrance.inward.x, iz = entrance.inward.z;
  const along = (x - entrance.position.x) * ix + (z - entrance.position.z) * iz;
  const lateral = Math.abs(-(x - entrance.position.x) * iz + (z - entrance.position.z) * ix);
  if (along < -16 || along > 32 || lateral > 26 || lateral < 3.55) return 0;
  const side = smooth01((lateral - 3.55) / 4.2) * (1 - smooth01((lateral - 14) / 12));
  const depth = along < 0
    ? smooth01((along + 16) / 12)
    : 1 - smooth01((along - 16) / 16);
  const broken = 0.72 + 0.28 * Math.sin(x * 0.23 + z * 0.19);
  const peak = along < 1.5 ? 8.4 : 11.5;
  return peak * side * depth * broken;
}

/**
 * @param {number} x local metres
 * @param {number} z local metres
 * @param {number} y height before this grade
 */
export function gradeCaveExteriorTerrain(x, z, y) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(y)) return y;
  const approach = getAshenCliffApproach();
  const box = approach.bounds;
  if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) return y;
  const near = approachPointDistance(x, z, approach);
  let out = y;
  if (near && near.d < 8.2) {
    const inner = 3.4;
    const w = near.d <= inner ? 1 : 1 - smooth01((near.d - inner) / (8.2 - inner));
    out = y + (near.py - y) * w;
    // Low, broken shoulder just outside the tread. The centre stays the path.
    if (near.d > 3.55 && near.d < 7.4 && near.kind !== 'throat' && near.kind !== 'interior') {
      const n = Math.sin(near.px * 0.31 + near.pz * 0.23);
      const berm = 0.48 * Math.exp(-(((near.d - 5.1) / 1.25) ** 2)) * (0.5 + 0.5 * Math.max(0, n));
      out += berm;
    }
  }
  return out + cliffLift(x, z, approach.entrance);
}

/** Idempotent. Call before the Wolfveil terrain mesh is generated. */
export function ensureCaveExteriorGrade() {
  const current = wolfveilCaveApproachTerrainGrade;
  if (current && current[MARK]) return getAshenCliffApproach();
  // Build the polyline against the hillside BEFORE wrapping, or the sampler
  // and this grade recurse through each other.
  const approach = getAshenCliffApproach();
  const previous = current;
  const wrapped = (x, z, y) => {
    const base = typeof previous === 'function' ? previous(x, z, y) : y;
    return gradeCaveExteriorTerrain(x, z, base);
  };
  wrapped[MARK] = true;
  setWolfveilCaveApproachTerrainGrade(wrapped);
  return approach;
}
