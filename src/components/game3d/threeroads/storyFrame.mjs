// The world a story's tools work in. A story sets this once, before its world is created.
//
// The War of Three Roads (retired 2026-11-27) filled it with the old Wolfveil valley: region
// 'wolfveil', layout z + 70 = world z, the valley's five separately loaded areas, and the spots
// of the town's own quest givers. Nothing fills it now, so the tools switch on nowhere.
const NEUTRAL = Object.freeze({
  regions: Object.freeze([]),        // the region ids the tools switch on in
  zOffset: 0,                        // world z = layout z + zOffset
  areaAtWorld: () => null,           // the separately loaded area a world point { x, z } is in, or null
  areaIds: Object.freeze([]),        // every such area
  giverSpots: Object.freeze({}),     // quest giver id -> { x, z } in layout metres, for givers the game places itself
});
let frame = NEUTRAL;

export function setStoryFrame(next = null) {
  frame = next ? Object.freeze({ ...NEUTRAL, ...next }) : NEUTRAL;
  return frame;
}
export const storyFrame = () => frame;
