// The place layouts of whatever story is registered with the story tools, and the named points
// other subsystems may ask for. Positions: the place's centre in LAYOUT metres (x east, z
// north; world z = layout z + the story frame's zOffset); pieces and anchors relative to it.
//
// No story is registered: the War of Three Roads was retired on 2026-11-27. Its places are the
// tests' sample (tests/fixtures/three-roads-sample/layouts/). A story registers its places with
// setStoryPlaces before its world is created.
import { storyZOffset } from '../../coords.mjs';

export let THREE_ROADS_PLACES = Object.freeze([]);
let BY_ID = new Map();
export function setStoryPlaces(places = []) {
  THREE_ROADS_PLACES = Object.freeze([...places]);
  BY_ID = new Map(THREE_ROADS_PLACES.map(place => [place.id, place]));
  return THREE_ROADS_PLACES;
}
export const placeLayout = id => BY_ID.get(id) || null;

// A named point of a place in LAYOUT metres: { x, z, facing } (facing in radians, 0 = looking
// north), or null.
export function placeAnchorLocal(placeId, name) {
  const place = BY_ID.get(placeId);
  const anchor = place?.anchors?.[name];
  if (!anchor) return null;
  return Object.freeze({ x: place.x + anchor.x, z: place.z + anchor.z, facing: anchor.facing ?? 0 });
}

// The same in WORLD metres (what the scene, the cast and the enemies use).
export function placeAnchorWorld(placeId, name) {
  const local = placeAnchorLocal(placeId, name);
  return local ? Object.freeze({ x: local.x, z: local.z + storyZOffset(), facing: local.facing }) : null;
}
