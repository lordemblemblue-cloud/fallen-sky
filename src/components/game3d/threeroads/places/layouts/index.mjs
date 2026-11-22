// Every place layout, and the named points other subsystems may import.
// Positions: the place's centre in LOCAL Wolfveil metres (x east, z north;
// world z = local z + 70); pieces and anchors relative to that centre.
import { TOWN_PLACES } from './town.mjs';
import { SOUTH_PLACES } from './south.mjs';
import { CAMP_PLACES } from './camps.mjs';

// Band 2's camps are `preview: true`: built only with the preview switch.
export const THREE_ROADS_PLACES = Object.freeze([...TOWN_PLACES, ...SOUTH_PLACES, ...CAMP_PLACES]);

const BY_ID = new Map(THREE_ROADS_PLACES.map(place => [place.id, place]));
export const placeLayout = id => BY_ID.get(id) || null;

// A named point of a place in LOCAL metres: { x, z, facing } (facing in
// radians, 0 = looking north), or null.
export function placeAnchorLocal(placeId, name) {
  const place = BY_ID.get(placeId);
  const anchor = place?.anchors?.[name];
  if (!anchor) return null;
  return Object.freeze({ x: place.x + anchor.x, z: place.z + anchor.z, facing: anchor.facing ?? 0 });
}

// The same in WORLD metres (what the scene, the cast and the enemies use).
export function placeAnchorWorld(placeId, name) {
  const local = placeAnchorLocal(placeId, name);
  return local ? Object.freeze({ x: local.x, z: local.z + 70, facing: local.facing }) : null;
}
