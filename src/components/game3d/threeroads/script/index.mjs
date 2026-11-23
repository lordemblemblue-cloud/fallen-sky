// Every band of The War of Three Roads that has been written, in order.
// A band is { id, built, title, areas, points, pointAreas, lines, pledges, staging }.
// Only the pledges of a band with `built: true` are registered in the game.
// `pointAreas` maps a point-name prefix to the area its points must lie in;
// a band with `defaultPointArea` uses that for every other point.
// `regions` and `pointRegions` do the same for points under the valley: a prefix
// names the region (a separate scene) those points lie in.
import {
  BAND1_POINTS, BAND1_LINES, BAND1_PLEDGES, BAND1_STAGING,
} from './band1.mjs';
import {
  BAND2_POINTS, BAND2_POINT_AREAS, BAND2_LINES, BAND2_PLEDGES, BAND2_STAGING,
} from './band2.mjs';
import {
  BAND3_POINTS, BAND3_POINT_AREAS, BAND3_POINT_REGIONS, BAND3_LINES, BAND3_PLEDGES, BAND3_STAGING,
} from './band3.mjs';

export const THREE_ROADS_BANDS = Object.freeze([
  Object.freeze({
    id: 'band1',
    built: true,
    title: 'The opening: the town and the Gate Fields',
    areas: Object.freeze(['town', 'south']),
    points: BAND1_POINTS,
    pointAreas: Object.freeze({ floor_: 'south', woodpile: 'south', salt_store: 'south', graves_: 'south' }),
    defaultPointArea: 'town',
    lines: BAND1_LINES,
    pledges: BAND1_PLEDGES,
    staging: BAND1_STAGING,
  }),
  Object.freeze({
    id: 'band2',
    built: false, // its camps are not built yet: written, checked, not offered in the game
    title: "Each empire's camp and its first two chapters",
    areas: Object.freeze(['west', 'east', 'north']),
    points: BAND2_POINTS,
    pointAreas: BAND2_POINT_AREAS,
    defaultPointArea: null,
    lines: BAND2_LINES,
    pledges: BAND2_PLEDGES,
    staging: BAND2_STAGING,
  }),
  Object.freeze({
    id: 'band3',
    built: false,
    // Its chapters go under the valley and use roles, which the pledge engine cannot run yet
    // (band3.mjs, header). Not offered even in the preview until this is taken away.
    staged: false,
    title: 'The first half of the main story: the grotto, the stones, the hollow and the cistern',
    areas: Object.freeze(['west', 'north']),
    regions: Object.freeze(['wolfveil-caves']),
    points: BAND3_POINTS,
    pointAreas: BAND3_POINT_AREAS,
    pointRegions: BAND3_POINT_REGIONS,
    defaultPointArea: null,
    lines: BAND3_LINES,
    pledges: BAND3_PLEDGES,
    staging: BAND3_STAGING,
  }),
]);

// The bands whose places exist in the game. With `preview` (the builders' switch,
// threeRoadsFlag.mjs) every band the engine can run counts, finished or not, so it can be
// played before players are offered it. A band marked `staged: false` is written and
// checked but asks the engine for something it cannot do yet, so nobody is offered it.
export const threeRoadsBuiltBands = ({ preview = false } = {}) =>
  THREE_ROADS_BANDS.filter(band => band.built || (preview && band.staged !== false));

// The region (a separate scene under the valley) a named point of a band lies in, or null
// for a point on the surface.
export function threeRoadsPointRegion(band, name) {
  for (const [prefix, region] of Object.entries(band.pointRegions || {}))
    if (name.startsWith(prefix)) return region;
  return null;
}

// The area a named point of a band has to lie in, or null if the band does not say
// (a point under the valley has a region instead).
export function threeRoadsPointArea(band, name) {
  if (threeRoadsPointRegion(band, name)) return null;
  for (const [prefix, area] of Object.entries(band.pointAreas || {}))
    if (name.startsWith(prefix)) return area;
  return band.defaultPointArea || null;
}

// Where a named point is: { area, region } with exactly one of them set, or null.
export function threeRoadsPointScene(name) {
  for (const band of THREE_ROADS_BANDS) {
    if (!band.points[name]) continue;
    const region = threeRoadsPointRegion(band, name);
    return Object.freeze({ area: region ? null : threeRoadsPointArea(band, name), region });
  }
  return null;
}

// One line by id, from whichever band holds it.
export function threeRoadsLine(lineId) {
  for (const band of THREE_ROADS_BANDS) if (band.lines[lineId]) return band.lines[lineId];
  return null;
}

// One named point by name, from whichever band holds it.
export function threeRoadsPoint(name) {
  for (const band of THREE_ROADS_BANDS) if (band.points[name]) return band.points[name];
  return null;
}
