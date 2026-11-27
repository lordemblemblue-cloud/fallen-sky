// Can any zombie camp spawn in a given area scene? (docs/GAME3D_LOW_POLY_20261122.md, part 3.)
// The horde runtime spawns a camp's zombie when the player comes within its active radius (115 m). In the five-area
// valley the 150 planned camps sit in the east, north and west; none of their radii reaches the town or the south,
// so those two area scenes never show a zombie and need not download the 16 MB zombie FBX and its six clips.
// Sampled on a 5 m grid around each camp with the same area plan the game uses (wolfveilAreaAtWorld).
import { wolfveilAreaAtWorld } from './streaming/WolfveilFiveAreaPlan.mjs';

export function zombieCampsCanSpawnInArea(planned, area, radius = 115, { step = 5, areaAt = wolfveilAreaAtWorld } = {}) {
  if (!area) return true;
  for (const camp of planned || []) {
    const x = camp.x; const z = camp.viewerZ ?? camp.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    if (areaAt({ x, z }) === area) return true;
    for (let dx = -radius; dx <= radius; dx += step) {
      for (let dz = -radius; dz <= radius; dz += step) {
        if (dx * dx + dz * dz > radius * radius) continue;
        if (areaAt({ x: x + dx, z: z + dz }) === area) return true;
      }
    }
  }
  return false;
}
