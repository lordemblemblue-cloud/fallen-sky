// A testing landmark may sit inside a fort's collision or on the edge of a
// field. Probe small offsets using the EXISTING Wolfveil ground and occupancy
// checks, and accept only safe places in the currently streamed area.
import { findWorkflowSpawn } from '../workflow/workflowDestinations.mjs';
import { wolfveilAreaAtWorld } from '../wolfveil/streaming/WolfveilFiveAreaPlan.mjs';

export const QUEST_TEST_LANDING_RADII = Object.freeze([0, 2.5, 5, 8, 12, 16]);
const DIRECTIONS = Object.freeze([
  [0, 1], [1, 0], [0, -1], [-1, 0],
  [0.7071068, 0.7071068], [0.7071068, -0.7071068],
  [-0.7071068, -0.7071068], [-0.7071068, 0.7071068],
]);

export function findQuestTestSafeLanding(target, {
  area, sampleGroundY, isBlocked,
  findSafe = findWorkflowSpawn,
} = {}) {
  if (target?.questTest !== true ||
      !Number.isFinite(target.x) || !Number.isFinite(target.z) ||
      typeof area !== 'string' || typeof sampleGroundY !== 'function' ||
      typeof isBlocked !== 'function') return null;
  for (const radius of QUEST_TEST_LANDING_RADII) {
    const directions = radius === 0 ? [[0, 0]] : DIRECTIONS;
    for (const [dx, dz] of directions) {
      const x = Math.round((target.x + dx * radius) * 1000) / 1000;
      const z = Math.round((target.z + dz * radius) * 1000) / 1000;
      if (wolfveilAreaAtWorld({ x, z }) !== area) continue;
      const candidate = findSafe(`X ${x}, Z ${z}`, { sampleGroundY, isBlocked });
      if (candidate) return candidate;
    }
  }
  return null;
}
