// Fixed viewpoints for the Game 3D draw-cost probe (Game3DPerfProbe.mjs) and its node compare script
// (scripts/game3d-perf-compare.mjs). Pure data: no DOM, no three.js, so node can load it.
//
// Coordinates are LOCAL Wolfveil metres: x east, z north; world z = local z + 70 (the market at local (0, -70) is
// world (0, 0)). The eye is EYE_HEIGHT metres above the ground (or the water surface, where that is higher).
// Directions are compass headings: N looks to +z, E to +x. Every area's first point is measured in the four compass
// directions so its worst view is found; a point with no direction of its own also gets all four.
// Source of the points: docs/game3d/three-empires/research/WORLD_TODAY.md section 1.4 (named places).
// Change a point only together with a note in PERF_BASELINE_WEBGPU.md: results are compared by viewpoint id.

export const PERF_VIEWPOINT_SCHEMA = 'game3d-perf-viewpoints/1';
export const PERF_EYE_HEIGHT = 1.7;
export const PERF_WORLD_Z_OFFSET = 70;
export const PERF_AREAS = Object.freeze(['town', 'south', 'west', 'east', 'north']);

const ALL = Object.freeze(['N', 'E', 'S', 'W']);
// unit vectors (x east, z north) of each heading
export const PERF_HEADINGS = Object.freeze({
  N: [0, 1], NE: [Math.SQRT1_2, Math.SQRT1_2], E: [1, 0], SE: [Math.SQRT1_2, -Math.SQRT1_2],
  S: [0, -1], SW: [-Math.SQRT1_2, -Math.SQRT1_2], W: [-1, 0], NW: [-Math.SQRT1_2, Math.SQRT1_2],
});

const point = (area, key, label, x, z, headings) => Object.freeze({ area, key, label, x, z, headings: Object.freeze(headings) });

// In order: each area's first point first.
export const PERF_POINTS = Object.freeze([
  // SW from the plaza looks at the Three Roads Oath Tree (local (-11.5, -74.6))
  point('town', 'plaza', 'Fountain plaza', 0, -70, [...ALL, 'SW']),
  point('town', 'southGate', 'Southern Wolf Gate', 0, -225, ['N']),
  point('town', 'hill', 'Hill above town', -110, 170, ['S']),
  point('town', 'wagonYard', 'Wagon yard (Three Roads)', 70, -210, ALL),
  point('south', 'threshing', 'Threshing Floor', 25, -390, ALL),
  // the briefed (-130, -350) looking east; also the Three Roads granary and mill
  point('south', 'granary', 'Granary and mill (Three Roads)', -130, -350, ['E', 'N', 'S', 'W']),
  // just inside the south area, 2.4 m past the Southern Fields Way gate (8.6, -265)
  point('south', 'gateFields', 'Gate Fields from the gate (Three Roads)', 8.6, -267.4, ['S']),
  point('south', 'graveyard', 'Graveyard (Three Roads)', -130, -450, ALL),
  point('south', 'barrow', 'Barrow (Three Roads)', 20, -500, ALL),
  point('west', 'cedarTerraces', 'Cedar Terraces', -297, -136, ALL),
  point('west', 'wolfStones', 'Wolf Stones', -325, 235, ['S']),
  point('west', 'grotto', 'Jade Lantern Grotto mouth', -360, -400, ['NE']),
  point('east', 'flats', 'East flat ground', 350, -410, ALL),
  point('east', 'quarry', 'Quarry', 350, -40, ALL),
  point('east', 'waterfall', 'Waterfall', 142, 179, ['SE']),
  point('north', 'flats', 'North flat ground', 30, 330, ['S', 'E', 'N', 'W']),
  point('north', 'howlingPlateau', 'Howling Plateau', -240, 400, ALL),
  point('north', 'vortexLake', 'Vortex Lake', 205, 320, ALL),
]);

/** One entry per (point, heading): the unit the probe measures and the compare script lines up. */
export function perfViewpoints({ areas = PERF_AREAS, ids = null } = {}) {
  const views = [];
  for (const p of PERF_POINTS) {
    if (!areas.includes(p.area)) continue;
    for (const heading of p.headings) {
      const id = `${p.area}.${p.key}.${heading}`;
      if (ids && !ids.includes(id) && !ids.includes(`${p.area}.${p.key}`)) continue;
      const [dx, dz] = PERF_HEADINGS[heading];
      views.push(Object.freeze({ id, area: p.area, point: `${p.area}.${p.key}`, label: p.label, heading,
        x: p.x, z: p.z, worldX: p.x, worldZ: p.z + PERF_WORLD_Z_OFFSET, dirX: dx, dirZ: dz }));
    }
  }
  return views;
}

/** Views grouped by area, in PERF_AREAS order. */
export function perfViewpointsByArea(options) {
  const byArea = new Map();
  for (const view of perfViewpoints(options)) {
    if (!byArea.has(view.area)) byArea.set(view.area, []);
    byArea.get(view.area).push(view);
  }
  return byArea;
}
