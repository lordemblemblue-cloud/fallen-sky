// Phase B prototype: the Jade Lantern Grotto as two fully isolated natural
// zones behind authored doorways (audit section 6, Phase B).
//
//   surface (legacy valley) --[mouth arch, relocate]--> grotto_hall
//   grotto_hall --[inner stone door, walk]--> grotto_chamber
//
// The hall is a real entry hall with a Z-turn, so neither the exit door nor
// the chamber can be seen from the other end; the chamber sits behind a second
// door that closes before the hall is released. Everything is buried under
// the uncut hillside (tests pin the rock cover), so the old E-teleport rule
// still holds at the mouth: the surface heightfield cannot also be a cave
// roof, therefore the mouth commits by moving the player once.
//
// Pure data and math, no Three.js. Wolfveil LOCAL metres (Game 3D world Z =
// local Z + 70). The cave frame is (a = metres inward along the mouth
// direction, l = metres to the side).
import {WOLFVEIL_EXPLORABLE_CAVES} from '../WolfveilCaveLayout.mjs';
import {wolfveilHeight} from '../WolfveilLayout.js';

export const GROTTO_CAVE_ID = 'jade_lantern_grotto';
const cave = WOLFVEIL_EXPLORABLE_CAVES.find(entry => entry.id === GROTTO_CAVE_ID);
if (!cave) throw new Error('Jade Lantern Grotto is missing from the cave layout');

const [MX, MZ] = cave.mouth;
const [FX, FZ] = cave.dir;
const SX = -FZ, SZ = FX;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const freeze = value => Object.freeze(value);

/** Cave frame (a inward, l sideways) -> Wolfveil local {x, z}. */
export function grottoFramePoint(a, l = 0) {
  return {x: MX + FX * a + SX * l, z: MZ + FZ * a + SZ * l};
}
/** Wolfveil local (x, z) -> cave frame {a, l}. */
export function grottoFrameOf(x, z) {
  const dx = x - MX, dz = z - MZ;
  return {a: dx * FX + dz * FZ, l: dx * SX + dz * SZ};
}
/** Yaw (radians about +Y) that faces along the frame direction (da, dl). */
export function grottoFrameYaw(da, dl = 0) {
  const x = FX * da + SX * dl, z = FZ * da + SZ * dl;
  return Math.atan2(x, z);
}

const node = (a, l, y) => {
  const p = grottoFramePoint(a, l);
  return freeze({a, l, x: p.x, y, z: p.z});
};
// Hall centreline: exit door -> first straight -> bend -> second straight
// -> bend back -> inner door. Floor falls 2.4 m over ~23 m (about 6 degrees).
const HALL_NODES = freeze([
  node(4.0, 0, 6.2), node(10.5, 0, 6.2), node(15.0, 5.0, 5.4),
  node(21.5, 5.0, 4.6), node(25.5, 1.0, 3.8),
]);
const DOOR = (() => {
  const a = HALL_NODES[3], b = HALL_NODES[4];
  const da = b.a - a.a, dl = b.l - a.l, len = Math.hypot(da, dl);
  const n = {a: da / len, l: dl / len};
  return freeze({
    a: b.a, l: b.l, x: b.x, z: b.z, floorY: b.y,
    normal: freeze(n), // frame direction from the hall into the chamber
    halfWidth: 1.3, height: 3.0,
  });
})();
// The chamber is an 18-sided room; the inner door sits in the middle of one
// flat facet, behind a 0.3 m thick wall, so the hall's end wall and the
// chamber's facet never share a plane (no z-fighting while both are loaded).
const CHAMBER_RADIUS = 10;
const CHAMBER_SIDES = 18;
const DOOR_WALL = .3;
const CHAMBER_APOTHEM = CHAMBER_RADIUS * Math.cos(Math.PI / CHAMBER_SIDES);
const chamberCentre = (() => {
  const t = DOOR_WALL + CHAMBER_APOTHEM;
  return node(DOOR.a + DOOR.normal.a * t, DOOR.l + DOOR.normal.l * t, DOOR.floorY);
})();

export const GROTTO_PLAN = freeze({
  caveId: GROTTO_CAVE_ID,
  name: cave.name,
  mouth: freeze({x: MX, z: MZ, y: cave.mouthY}),
  dir: freeze([FX, FZ]), side: freeze([SX, SZ]),
  facade: freeze({
    openingHalfWidth: 1.9, openingHeight: 3.4, throatDepth: 2.8,
    // Solid rock lumps around the arch (frame a, l, radius): client collision.
    rocks: freeze([
      freeze([1.4, 3.7, 1.75]), freeze([1.4, -3.7, 1.75]),
      freeze([3.9, 2.3, 2.0]), freeze([3.9, -2.3, 2.0]),
      freeze([4.9, 0, 2.3]), freeze([-.2, 5.0, 1.35]), freeze([-.2, -5.0, 1.35]),
    ]),
  }),
  hall: freeze({
    id: 'grotto_hall', label: 'Jade Lantern Grotto · Entry Hall',
    nodes: HALL_NODES, halfWidth: 2.1, wallHeight: 2.5, ceiling: 3.6,
    exitDoorA: 4.0,
    lanterns: freeze([node(5.0, 1.75, 7.9), node(9.5, -1.85, 7.9), node(14.2, 6.6, 7.0), node(18.4, 3.2, 6.6),
      node(22.8, 6.4, 6.2), node(24.9, -.6, 5.3)]),
  }),
  door: freeze({...DOOR, wall: DOOR_WALL}),
  chamber: freeze({
    id: 'grotto_chamber', label: 'Jade Lantern Grotto · Lantern Chamber',
    centre: chamberCentre, radius: CHAMBER_RADIUS, sides: CHAMBER_SIDES, apothem: CHAMBER_APOTHEM,
    floorY: DOOR.floorY, wallHeight: 4.0, apex: 6.6,
    lanterns: freeze([0, 1, 2, 3, 4, 5].map(i => {
      const angle = i / 6 * Math.PI * 2 + .35;
      const r = CHAMBER_RADIUS - 1.4;
      return node(chamberCentre.a + Math.cos(angle) * r, chamberCentre.l + Math.sin(angle) * r, DOOR.floorY + 2.6);
    })),
  }),
  anchors: freeze({
    // Where the mouth hands the player to the hall, and back to the valley.
    hallLanding: freeze({...node(7.0, 0, 6.2), yaw: grottoFrameYaw(1, 0)}),
    outside: freeze({...node(-4.5, 0, wolfveilHeight(grottoFramePoint(-4.5, 0).x, grottoFramePoint(-4.5, 0).z)),
      yaw: grottoFrameYaw(-1, 0)}),
  }),
});

// ---------------------------------------------------------------- footprints
function segmentQuery(nodes, a, l) {
  let best = null;
  for (let i = 0; i < nodes.length - 1; i++) {
    const p = nodes[i], q = nodes[i + 1];
    const da = q.a - p.a, dl = q.l - p.l, len2 = da * da + dl * dl;
    const t = clamp(((a - p.a) * da + (l - p.l) * dl) / len2, 0, 1);
    const ca = p.a + da * t, cl = p.l + dl * t;
    const distance = Math.hypot(a - ca, l - cl);
    if (!best || distance < best.distance)
      best = {distance, floorY: p.y + (q.y - p.y) * t, index: i, t};
  }
  return best;
}
/** Signed metres past the inner door plane (+ = chamber side) and lateral offset. */
export function grottoDoorFrame(x, z) {
  const {a, l} = grottoFrameOf(x, z);
  const da = a - DOOR.a, dl = l - DOOR.l;
  return {
    signed: da * DOOR.normal.a + dl * DOOR.normal.l,
    lateral: -da * DOOR.normal.l + dl * DOOR.normal.a,
  };
}
function hallSample(x, z, margin, doorOpen) {
  const {a, l} = grottoFrameOf(x, z);
  const hit = segmentQuery(HALL_NODES, a, l);
  const clearance = GROTTO_PLAN.hall.halfWidth - margin - hit.distance;
  if (clearance < 0) return null;
  if (a < GROTTO_PLAN.hall.exitDoorA + margin) return null;   // exit door wall
  const door = grottoDoorFrame(x, z);
  if (door.signed > (doorOpen ? 0 : -margin)) return null;      // inner door
  if (door.signed > -(margin + .35) && Math.abs(door.lateral) > DOOR.halfWidth - margin) return null; // jambs
  return {zone: 'grotto_hall', floorY: hit.floorY, ceilingY: hit.floorY + GROTTO_PLAN.hall.ceiling, clearance};
}
function chamberSample(x, z, margin, doorOpen) {
  const door = grottoDoorFrame(x, z);
  if (door.signed < (doorOpen ? 0 : margin)) return null;
  if (door.signed < margin + .35 && Math.abs(door.lateral) > DOOR.halfWidth - margin) return null;
  const c = GROTTO_PLAN.chamber, {a, l} = grottoFrameOf(x, z);
  const r = Math.hypot(a - c.centre.a, l - c.centre.l);
  const inDisk = c.apothem - margin - r;
  // The door passage through the 0.3 m wall, before the room proper.
  const passage = door.signed <= DOOR_WALL + margin + .2 ? DOOR.halfWidth - margin - Math.abs(door.lateral) : -1;
  const clearance = Math.max(inDisk, passage);
  if (clearance < 0) return null;
  const ratio = clamp(r / c.radius, 0, 1);
  const height = c.wallHeight + (c.apex - c.wallHeight) * (1 - ratio * ratio);
  return {zone: 'grotto_chamber', floorY: c.floorY, ceilingY: c.floorY + (inDisk >= 0 ? height : DOOR.height), clearance};
}
/**
 * The walkable cave space at local (x, z) among the LOADED zones. Unloaded
 * zones have no floor at all. `doorOpen` lets a body cross the inner door.
 */
export function sampleGrottoSpace(x, z, {zones = [], margin = 0, doorOpen = false} = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  let best = null;
  if (zones.includes('grotto_hall')) best = hallSample(x, z, margin, doorOpen);
  if (zones.includes('grotto_chamber')) {
    const hit = chamberSample(x, z, margin, doorOpen);
    if (hit && (!best || hit.clearance > best.clearance)) best = hit;
  }
  return best;
}
/**
 * Keeps a cave walker inside the loaded cave space (LOCAL coordinates;
 * mutates `position`): slide along one axis, otherwise stay put.
 */
export function resolveGrottoMovement(position, previous, {zones = [], radius = .62, doorOpen = false} = {}) {
  if (!position || !previous) return false;
  // Swept test for the inner door: a long step (dash, low frame rate) must
  // not hop from one side of a closed door to the other.
  if (!doorOpen) {
    const from = grottoDoorFrame(previous.x, previous.z).signed, to = grottoDoorFrame(position.x, position.z).signed;
    if (from * to < 0 && Math.abs(from) < 6 && Math.abs(to) < 6) {
      position.x = previous.x; position.z = previous.z;
      return true;
    }
  }
  const inside = (x, z) => Boolean(sampleGrottoSpace(x, z, {zones, margin: radius, doorOpen}));
  if (inside(position.x, position.z)) return false;
  if (inside(position.x, previous.z)) { position.z = previous.z; return true; }
  if (inside(previous.x, position.z)) { position.x = previous.x; return true; }
  position.x = previous.x; position.z = previous.z;
  return true;
}
/** Surface collision around the mouth arch (LOCAL; mutates position). */
export function resolveGrottoFacadeCollision(position, radius = .62) {
  if (!position) return false;
  const {a, l} = grottoFrameOf(position.x, position.z);
  if (a < -9 || a > 9 || Math.abs(l) > 9) return false;
  let pushed = false;
  for (const [ra, rl, rr] of GROTTO_PLAN.facade.rocks) {
    const p = grottoFrameOf(position.x, position.z);
    const da = p.a - ra, dl = p.l - rl, d = Math.hypot(da, dl), min = rr + radius;
    if (d >= min) continue;
    const na = d > 1e-6 ? da / d : -1, nl = d > 1e-6 ? dl / d : 0;
    const q = grottoFramePoint(ra + na * (min + .002), rl + nl * (min + .002));
    position.x = q.x; position.z = q.z; pushed = true;
  }
  // The back of the throat is rock.
  const after = grottoFrameOf(position.x, position.z);
  const back = GROTTO_PLAN.facade.throatDepth - radius;
  if (Math.abs(after.l) <= GROTTO_PLAN.facade.openingHalfWidth + .4 && after.a > back && after.a < back + 2.5) {
    const q = grottoFramePoint(back, after.l);
    position.x = q.x; position.z = q.z; pushed = true;
  }
  return pushed;
}

// --------------------------------------------------------------- doorways
const nearSurface = (p, slack) => !Number.isFinite(p.y) ||
  Math.abs(p.y - wolfveilHeight(p.x, p.z)) <= slack;
const inCave = (p, zone) => Boolean(sampleGrottoSpace(p.x, p.z, {zones: [zone], margin: 0, doorOpen: true}));

/** Directional doorways of the prototype (see WolfveilZoneGraph.mjs). */
export function planGrottoDoorways() {
  const f = GROTTO_PLAN.facade;
  const mouthIn = {
    id: 'grotto_mouth:in', door: 'grotto_mouth', from: 'surface', to: 'grotto_hall', commit: 'relocate',
    anchor: GROTTO_PLAN.anchors.hallLanding, requires: freeze({onFoot: true, grounded: true}),
    approach(p) {
      const {a, l} = grottoFrameOf(p.x, p.z);
      return a >= -16 && a <= f.throatDepth && Math.abs(l) <= 9 && nearSurface(p, 6);
    },
    pocket(p) {
      const {a, l} = grottoFrameOf(p.x, p.z);
      return a >= -.2 && a <= f.throatDepth - .55 && Math.abs(l) <= f.openingHalfWidth - .2 && nearSurface(p, 2.5);
    },
  };
  const mouthOut = {
    id: 'grotto_mouth:out', door: 'grotto_mouth', from: 'grotto_hall', to: 'surface', commit: 'relocate',
    anchor: GROTTO_PLAN.anchors.outside, requires: freeze({onFoot: true, grounded: true}),
    approach(p) {
      const {a, l} = grottoFrameOf(p.x, p.z);
      return a <= 9.5 && Math.abs(l) <= 2.6 && inCave(p, 'grotto_hall');
    },
    pocket(p) {
      const {a, l} = grottoFrameOf(p.x, p.z);
      return a <= GROTTO_PLAN.hall.exitDoorA + 1.35 && Math.abs(l) <= 1.7 && inCave(p, 'grotto_hall');
    },
  };
  const side = (p, sign) => {
    const d = grottoDoorFrame(p.x, p.z);
    return {s: d.signed * sign, lateral: Math.abs(d.lateral)};
  };
  const innerDoor = (from, to, sign) => ({
    id: 'grotto_inner:' + (sign > 0 ? 'in' : 'out'), door: 'grotto_inner', from, to, commit: 'walk',
    requires: freeze({onFoot: false, grounded: true}),
    approach(p) { const q = side(p, sign); return q.s <= 0 && q.s >= -7 && inCave(p, from); },
    pocket(p) { const q = side(p, sign); return q.s <= 0 && q.s >= -1.7 && q.lateral <= DOOR.halfWidth + .4 && inCave(p, from); },
    passed(p) { return side(p, sign).s >= 2.2; },
    retreated(p) { return side(p, sign).s <= -4.5; },
  });
  return freeze([
    freeze(mouthIn), freeze(mouthOut),
    freeze(innerDoor('grotto_hall', 'grotto_chamber', 1)),
    freeze(innerDoor('grotto_chamber', 'grotto_hall', -1)),
  ]);
}

/** Samples of every cave footprint (for rock-cover tests and the map). */
export function grottoFootprintSamples(step = 1.5) {
  const samples = [];
  const push = (zone, a, l) => {
    const p = grottoFramePoint(a, l);
    const space = sampleGrottoSpace(p.x, p.z, {zones: [zone], doorOpen: true});
    if (space) samples.push({zone, x: p.x, z: p.z, a, l, floorY: space.floorY, ceilingY: space.ceilingY});
  };
  for (let a = 0; a <= 50; a += step)
    for (let l = -22; l <= 12; l += step) {
      push('grotto_hall', a, l);
      push('grotto_chamber', a, l);
    }
  return samples;
}
