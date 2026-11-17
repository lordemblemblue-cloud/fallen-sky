// Shared cave layout anchor.
//
// Interior work (agent 1) should import `entrance` and start the underground
// floor at `entrance.interiorStart`, heading along `entrance.inward`.
// Exterior work owns the path, the cliff and the throat up to that point.
// If the interior later publishes a richer layout from this module, keep
// this `entrance` export — the approach, the grade and the mouth all read it.
//
// Coordinates are Wolfveil-local. Add `entrance.worldOffsetZ` to Z for the
// player position used by Game 3D when the market-origin village is mounted.

export { getAshenCliffApproach } from './exterior/approachPlan.js';

import { getAshenCliffApproach } from './exterior/approachPlan.js';

export const entrance = getAshenCliffApproach().entrance;
