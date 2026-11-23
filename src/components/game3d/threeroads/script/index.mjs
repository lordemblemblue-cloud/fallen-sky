// Every band of The War of Three Roads that has been written, in order.
// A band is { id, built, title, areas, points, pointAreas, lines, pledges, staging }.
// Only the pledges of a band with `built: true` are registered in the game.
// `pointAreas` maps a point-name prefix to the area its points must lie in;
// a band with `defaultPointArea` uses that for every other point.
import {
  BAND1_POINTS, BAND1_LINES, BAND1_PLEDGES, BAND1_STAGING,
} from './band1.mjs';
import {
  BAND2_POINTS, BAND2_POINT_AREAS, BAND2_LINES, BAND2_PLEDGES, BAND2_STAGING,
} from './band2.mjs';

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
]);

// The bands whose places exist in the game. With `preview` (the builders' switch,
// threeRoadsFlag.mjs) every written band counts, finished or not, so it can be played
// before players are offered it.
export const threeRoadsBuiltBands = ({ preview = false } = {}) => THREE_ROADS_BANDS.filter(band => band.built || preview);

// The area a named point of a band has to lie in, or null if the band does not say.
export function threeRoadsPointArea(band, name) {
  for (const [prefix, area] of Object.entries(band.pointAreas || {}))
    if (name.startsWith(prefix)) return area;
  return band.defaultPointArea || null;
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
