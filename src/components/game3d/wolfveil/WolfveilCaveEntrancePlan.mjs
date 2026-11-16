// Wolfveil cave entrances: how each rock mouth is framed from outside, and the
// walk-in rule that lets a player actually step INSIDE the opening instead of
// needing a key press at the hillside.
//
// Coordinates stay Wolfveil-local (Game 3D adds +70m Z on the world group).
import { WOLFVEIL_EXPLORABLE_CAVES } from './WolfveilCaveLayout.mjs';

export const CAVE_WALK_IN = Object.freeze({
  halfWidth: 2.45,        // opening half-width a body can pass through
  outsideLead: 0.7,       // metres outside the mouth where the walk-in engages
  insideLead: 2.3,        // metres inside the mouth before entry commits
  heightTolerance: 3.2,   // feet must be near the mouth, never on the hilltop
});

/** Which cave mouth a walker is stepping into, or null. */
export function caveEntranceAt(x, y, z) {
  if (![x, y, z].every(Number.isFinite)) return null;
  for (const cave of WOLFVEIL_EXPLORABLE_CAVES) {
    const [mx, mz] = cave.mouth;
    const [dx, dz] = cave.dir;
    const rx = x - mx, rz = z - mz;
    const along = rx * dx + rz * dz;
    if (along < -CAVE_WALK_IN.outsideLead || along > CAVE_WALK_IN.insideLead) continue;
    const lateral = Math.abs(-rx * dz + rz * dx);
    if (lateral > CAVE_WALK_IN.halfWidth) continue;
    if (Math.abs(y - cave.mouthY) > CAVE_WALK_IN.heightTolerance) continue;
    return cave;
  }
  return null;
}

// Boulders and scree sit wide of the walking line so the mouth stays passable.
const BOULDERS = Object.freeze([
  Object.freeze([-4.7, 0.7, 1.55, 0.21]),
  Object.freeze([4.9, 0.3, 1.72, 0.34]),
  Object.freeze([-3.2, 2.5, 1.02, 0.48]),
  Object.freeze([3.5, 2.9, 1.18, 0.16]),
  Object.freeze([-6.7, -1.4, 2.10, 0.28]),
  Object.freeze([6.5, -1.1, 1.90, 0.42]),
]);

export const WOLFVEIL_CAVE_ENTRANCE_FRAMES = Object.freeze(
  WOLFVEIL_EXPLORABLE_CAVES.map(cave => {
    const [mx, mz] = cave.mouth;
    const [dx, dz] = cave.dir;
    return Object.freeze({
      caveId: cave.id,
      name: cave.name,
      lightColor: cave.lightColor,
      mouth: Object.freeze([mx, cave.mouthY, mz]),
      dir: Object.freeze([dx, dz]),
      side: Object.freeze([-dz, dx]),
      yaw: Math.atan2(dx, dz),
      openingHalfWidth: 2.55,
      openingHeight: 5.35,
      throatRadius: 2.72,
      throatEndRadius: 1.1,
      throatDepth: 8.4,
      boulders: BOULDERS,
      // Packed-earth apron: centre x/y/z plus radius.
      apron: Object.freeze([
        cave.threshold[0], cave.threshold[1] + 0.02, cave.threshold[2], 5.2,
      ]),
    });
  }),
);