// The War of Three Roads: changes to the valley's ground, as data.
//
// This module is the list and nothing else. It imports nothing, so the height
// chain can read it without an import cycle. One call in the height chain
// (added and owned by the Wolfveil doorways session) applies the list in
// order; with the list empty the ground is exactly what it was.
//
// All positions are LOCAL Wolfveil metres (x east, z north). Kinds:
//   pad    { id, area, kind, x, z, radius, falloff, y }
//          level a disc to `y` (a number, or 'mean' for the mean of the ground
//          under it), blended back to the land over `falloff` metres
//   mound  { id, area, kind, x, z, radius, height, falloff }   raise a disc
//   cut    { id, area, kind, x, z, radius, depth, falloff }    lower a disc
//   bank   { id, area, kind, x, z, radius, width, height }
//          a ring `width` metres wide centred on `radius`; `height` is its
//          crest (negative = a ring ditch)
//   ramp   { id, area, kind, ax, az, bx, bz, width, falloff }
//          a graded strip from a to b (a way up to a gate)
// Optional on any entry:
//   near   ['river', 'trail', 'anchor:<name>']  things this landform is close
//          to on purpose; without it the 40 m rule below applies
//   note   why it is there
//
// The 40 m rule: no landform may reach within THREE_ROADS_LANDFORM_CLEARANCE
// metres of a pinned anchor, the river or an existing road or trail, or
// within 30 m of an area border, unless its `near` says so. The rule is
// checked by tests/game3d-three-roads-landforms.test.mjs against the real
// terrain modules.
export const THREE_ROADS_LANDFORM_KINDS = Object.freeze(['pad', 'mound', 'cut', 'bank', 'ramp']);
export const THREE_ROADS_LANDFORM_AREAS = Object.freeze(['town', 'south', 'west', 'east', 'north']);
export const THREE_ROADS_LANDFORM_CLEARANCE = 40;
export const THREE_ROADS_LANDFORM_BORDER_MARGIN = 30;
export const THREE_ROADS_LANDFORM_HALF_SPAN = 528;

// Empty until band 2 shapes the three camps. Add entries here and nowhere else.
export const THREE_ROADS_LANDFORMS = Object.freeze([]);

const finite = Number.isFinite;
const positive = value => finite(value) && value > 0;
const ID_PATTERN = /^[a-z0-9_]{3,48}$/;

// Every problem with one entry, as plain sentences. Empty = valid.
export function threeRoadsLandformProblems(entry) {
  const problems = [];
  if (!entry || typeof entry !== 'object') return ['a landform must be an object'];
  if (typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) problems.push('needs an id of lower-case letters, digits and _');
  if (!THREE_ROADS_LANDFORM_AREAS.includes(entry.area)) problems.push('area must be one of ' + THREE_ROADS_LANDFORM_AREAS.join(', '));
  if (!THREE_ROADS_LANDFORM_KINDS.includes(entry.kind)) {
    problems.push('kind must be one of ' + THREE_ROADS_LANDFORM_KINDS.join(', '));
    return problems;
  }
  const inside = value => finite(value) && Math.abs(value) <= THREE_ROADS_LANDFORM_HALF_SPAN;
  if (entry.kind === 'ramp') {
    if (![entry.ax, entry.az, entry.bx, entry.bz].every(inside)) problems.push('a ramp needs ax, az, bx, bz inside the playable square');
    else if (Math.hypot(entry.bx - entry.ax, entry.bz - entry.az) < 2) problems.push('a ramp needs two different ends');
    if (!positive(entry.width) || entry.width > 30) problems.push('a ramp needs a width between 0 and 30 m');
    if (!finite(entry.falloff) || entry.falloff < 0 || entry.falloff > 40) problems.push('falloff must be between 0 and 40 m');
  } else {
    if (!inside(entry.x) || !inside(entry.z)) problems.push('needs x and z inside the playable square');
    if (!positive(entry.radius) || entry.radius > 80) problems.push('needs a radius between 0 and 80 m');
    if (entry.kind === 'bank') {
      if (!positive(entry.width) || entry.width > 20) problems.push('a bank needs a width between 0 and 20 m');
      if (!finite(entry.height) || entry.height === 0 || Math.abs(entry.height) > 6) problems.push('a bank needs a height between -6 and 6 m, not 0');
    } else {
      if (!finite(entry.falloff) || entry.falloff < 0 || entry.falloff > 40) problems.push('falloff must be between 0 and 40 m');
      if (entry.kind === 'pad' && entry.y !== 'mean' && !finite(entry.y)) problems.push("a pad needs y: a height, or 'mean'");
      if (entry.kind === 'mound' && (!positive(entry.height) || entry.height > 12)) problems.push('a mound needs a height between 0 and 12 m');
      if (entry.kind === 'cut' && (!positive(entry.depth) || entry.depth > 12)) problems.push('a cut needs a depth between 0 and 12 m');
    }
  }
  if (entry.near !== undefined && (!Array.isArray(entry.near) || entry.near.some(item => typeof item !== 'string')))
    problems.push('near must be a list like ["river", "trail", "anchor:training"]');
  return problems;
}

// How far from its centre (or centre line) a landform changes the ground.
export function threeRoadsLandformReach(entry) {
  if (!entry) return 0;
  if (entry.kind === 'ramp') return (Number(entry.width) || 0) / 2 + (Number(entry.falloff) || 0);
  if (entry.kind === 'bank') return (Number(entry.radius) || 0) + (Number(entry.width) || 0) / 2;
  return (Number(entry.radius) || 0) + (Number(entry.falloff) || 0);
}

// The box outside which a landform changes nothing: test this first.
export function threeRoadsLandformBounds(entry) {
  const reach = threeRoadsLandformReach(entry);
  if (entry.kind === 'ramp') {
    return {
      minX: Math.min(entry.ax, entry.bx) - reach, maxX: Math.max(entry.ax, entry.bx) + reach,
      minZ: Math.min(entry.az, entry.bz) - reach, maxZ: Math.max(entry.az, entry.bz) + reach,
    };
  }
  return { minX: entry.x - reach, maxX: entry.x + reach, minZ: entry.z - reach, maxZ: entry.z + reach };
}

export function threeRoadsLandformsInArea(area, list = THREE_ROADS_LANDFORMS) {
  return list.filter(entry => entry.area === area);
}

// Points on the outer edge of a landform (and its centre or centre line),
// used to measure how close it comes to something.
export function threeRoadsLandformEdgePoints(entry, spacing = 6) {
  const points = [];
  const reach = threeRoadsLandformReach(entry);
  if (entry.kind === 'ramp') {
    const length = Math.hypot(entry.bx - entry.ax, entry.bz - entry.az);
    const ux = (entry.bx - entry.ax) / length;
    const uz = (entry.bz - entry.az) / length;
    const steps = Math.max(1, Math.ceil(length / spacing));
    for (let i = 0; i <= steps; i++) {
      const cx = entry.ax + (entry.bx - entry.ax) * (i / steps);
      const cz = entry.az + (entry.bz - entry.az) * (i / steps);
      points.push([cx, cz], [cx - uz * reach, cz + ux * reach], [cx + uz * reach, cz - ux * reach]);
    }
    points.push([entry.ax - ux * reach, entry.az - uz * reach], [entry.bx + ux * reach, entry.bz + uz * reach]);
    return points;
  }
  points.push([entry.x, entry.z]);
  const count = Math.max(8, Math.ceil((2 * Math.PI * reach) / spacing));
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    points.push([entry.x + Math.cos(angle) * reach, entry.z + Math.sin(angle) * reach]);
  }
  return points;
}

// The 40 m rule for one entry. `measure` supplies the real terrain's answers:
//   anchors: [[name, x, z], ...]      pinned points whose height must not move
//   distanceToRiver(x, z)             metres to the river's centre line
//   riverHalfWidth                    metres
//   trailClearance(x, z)              metres to the nearest road or trail
//   areaAt(x, z)                      which of the five areas a point is in
//   borders: { westX, eastX, northZ, southZ }
export function threeRoadsLandformClearanceProblems(entry, measure = {}) {
  const problems = [];
  const near = new Set(entry.near || []);
  const clearance = THREE_ROADS_LANDFORM_CLEARANCE;
  const points = threeRoadsLandformEdgePoints(entry);
  const closest = fn => points.reduce((least, [x, z]) => Math.min(least, fn(x, z)), Infinity);

  for (const [name, ax, az] of measure.anchors || []) {
    if (near.has('anchor:' + name)) continue;
    const distance = closest((x, z) => Math.hypot(x - ax, z - az));
    if (distance < clearance) problems.push(`reaches within ${distance.toFixed(1)} m of the pinned anchor "${name}"`);
  }
  if (typeof measure.distanceToRiver === 'function' && !near.has('river')) {
    const distance = closest((x, z) => measure.distanceToRiver(x, z)) - (Number(measure.riverHalfWidth) || 0);
    if (distance < clearance) problems.push(`reaches within ${distance.toFixed(1)} m of the river`);
  }
  if (typeof measure.trailClearance === 'function' && !near.has('trail')) {
    const distance = closest((x, z) => measure.trailClearance(x, z));
    if (distance < clearance) problems.push(`reaches within ${distance.toFixed(1)} m of a road or trail`);
  }
  if (typeof measure.areaAt === 'function') {
    const outside = points.find(([x, z]) => measure.areaAt(x, z) !== entry.area);
    if (outside) problems.push(`crosses out of the ${entry.area} area at (${outside[0].toFixed(0)}, ${outside[1].toFixed(0)})`);
  }
  if (measure.borders) {
    const { westX, eastX, northZ, southZ } = measure.borders;
    const margin = THREE_ROADS_LANDFORM_BORDER_MARGIN;
    const toBorder = closest((x, z) => Math.min(
      Math.abs(x - westX), Math.abs(x - eastX), Math.abs(z - northZ),
      // the south border only separates town from south, between the west and east borders
      x > westX && x < eastX ? Math.abs(z - southZ) : Infinity));
    if (toBorder < margin) problems.push(`reaches within ${toBorder.toFixed(1)} m of an area border`);
  }
  return problems;
}
