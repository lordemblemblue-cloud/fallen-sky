// The subsystems of The War of Three Roads, in the order they start.
// Each lives in its own folder and is built by its own session, so this list
// and GameWorld3D do not change when one of them grows. Order matters only
// where one listens for another's events on ctx.bus:
//   places   dresses the adventure spots of the current area
//   enemies  kinds of monster, and groups of them placed at a spot
//   cast     the people: quest givers and actors
//   pledges  watches the steps of the pledges the player has sworn
import { createPlacesSubsystem } from './places/placesSubsystem.mjs';
import { createEnemiesSubsystem } from './enemies/enemiesSubsystem.mjs';
import { createCastSubsystem } from './cast/castSubsystem.mjs';
import { createPledgeWorldSubsystem } from './pledgeworld/pledgeWorldSubsystem.mjs';

export const THREE_ROADS_SUBSYSTEMS = Object.freeze([
  Object.freeze({ id: 'places', create: createPlacesSubsystem }),
  Object.freeze({ id: 'enemies', create: createEnemiesSubsystem }),
  Object.freeze({ id: 'cast', create: createCastSubsystem }),
  Object.freeze({ id: 'pledges', create: createPledgeWorldSubsystem }),
]);
