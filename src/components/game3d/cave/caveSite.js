// Ashen Cliff — the shared outdoor site for the collaborative cave.
// Coordinates are Wolfveil-local metres. The live village group adds +70 on Z,
// so a player standing at the mouth is at world (x, y, z + 70).
//
// Agent 1 (interior) should begin rooms at `interiorStart`, continuing along
// `inward`. Agent 3 (exterior) owns everything outside that point, including
// the throat floor that arrives there. Gameplay content stays with agent 4.

export const ASHEN_CLIFF_SITE = Object.freeze({
  id: 'ashen_cliff_mouth',
  name: 'Ashen Cliff Mouth',
  // Existing Quarry Approach waypoint. The path leaves this trail.
  junction: Object.freeze({ x: 350, z: -40, trail: 'Quarry Approach' }),
  // Feet at the rock face, on the cut bench — not the raw hillside.
  mouth: Object.freeze({ x: 494, z: -122 }),
  floorY: 43.55,
  // Due east, into the rising quarry cliffs.
  inward: Object.freeze({ x: 1, z: 0 }),
  openingWidth: 6.6,
  openingHeight: 7.4,
  // Metres past the face where the interior floor takes over.
  interiorDistance: 5.6,
  // Gentle settle across the whole throat, not a step.
  throatLength: 6.8,
  throatDrop: 0.3,
});
