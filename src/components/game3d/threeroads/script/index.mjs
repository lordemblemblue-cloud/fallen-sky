// The bands of whatever story is registered with the story tools, in order.
// A band is { id, built, staged?, title, areas, regions?, points, pointAreas, pointRegions?,
// defaultPointArea, lines, pledges, staging }. Only the pledges of a band with `built: true`
// are offered; a band marked `staged: false` is offered to nobody, preview or not.
// `pointAreas` maps a point-name prefix to the area its points lie in (a band with
// `defaultPointArea` uses that for every other point); `regions` and `pointRegions` do the
// same for points in a region that is a scene of its own.
//
// No story is registered: the War of Three Roads was retired on 2026-11-27. Its three bands
// are the tests' sample story (tests/fixtures/three-roads-sample/) and show every field in use.
// A story registers its bands with setStoryBands before its world is created.
export let THREE_ROADS_BANDS = Object.freeze([]);
export function setStoryBands(bands = []) {
  THREE_ROADS_BANDS = Object.freeze([...bands]);
  return THREE_ROADS_BANDS;
}

// The bands that are offered. With `preview` (the builders' switch, threeRoadsFlag.mjs) every
// band the engine can run counts, finished or not, so it can be played before players are
// offered it. A band marked `staged: false` is written and checked but asks the engine for
// something it cannot do yet, so nobody is offered it.
export const threeRoadsBuiltBands = ({ preview = false } = {}) =>
  THREE_ROADS_BANDS.filter(band => band.built || (preview && band.staged !== false));

// The region (a scene of its own) a named point of a band lies in, or null for a point in an area.
export function threeRoadsPointRegion(band, name) {
  for (const [prefix, region] of Object.entries(band.pointRegions || {}))
    if (name.startsWith(prefix)) return region;
  return null;
}

// The area a named point of a band has to lie in, or null if the band does not say
// (a point in a region has a region instead).
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
