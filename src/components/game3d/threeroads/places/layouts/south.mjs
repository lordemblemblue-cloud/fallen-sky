// The Gate Fields' places, P08 to P12 (03_QUEST_PLAN.md section 3, "South"),
// and the hedgerows and field strips that break the open field into rooms.
// Centres are LOCAL Wolfveil metres; pieces and anchors are relative to them.
//
// How the area reads (BUILD_RULES section 8, after the reference's farm and
// village approaches): from the gate (8.6, -265) the windmill stands on the
// left as the area's compass, the Remorian wagon on the threshing floor's
// near rim ahead, the corner of the barn behind the mill; the farmsteads,
// the Three Fields and the barrow open up as the player walks past hedgerows.
import { TINT, EMPIRE_ORDER, p, wagon, banner, lanternPost, row, chain, fencedRect, wobble, facing } from './layoutKit.mjs';

const polar = (r, degrees) => [Math.cos(degrees * Math.PI / 180) * r, Math.sin(degrees * Math.PI / 180) * r];
const rel = (centre, x, z) => [x - centre.x, z - centre.z];

// ---- P08: the Threshing Floor ---------------------------------------------
// An open battlefield 85 m across: a packed-earth circle 30 m across in the
// middle, sheaves in arcs on the stubble around it, and on the rim one wagon
// per empire, 120 degrees apart, each with its banner. Nothing taller than a
// sheaf within 30 m of the centre. The wagons' points come from the script
// (BAND1_POINTS floor_wagon_*, a 40 m rim): Akitsu's to the north-west and
// Tameri's to the north-east, the two a player sees first from the gate,
// Remoria's to the south. Each wagon stands 2.6 m from its point along the
// rim's radius, on the side away from the person who waits there
// (cast.mjs), so the point and the person both stay clear.
const P08 = { x: 25, z: -390 };
const P08_POINTS = { akitsu: [-10, -370], tameri: [60, -370], remoria: [25, -430] };
const P08_WAGON_SIDE = { akitsu: -1, tameri: 1, remoria: 1 }; // +1 outward, -1 inward
const P08_BANNER_SIDE = { akitsu: 1, tameri: -1, remoria: -1 };
const P08_SHEAVES = [];
for (const [ring, perSector] of [[19, 6], [24.5, 7], [30, 7]]) {
  for (let sector = 0; sector < 3; sector++) {
    // Each sector runs between two wagon lines (bearings 30, 150 and 270
    // degrees), leaving a 40 degree lane open toward every wagon.
    const from = 30 + sector * 120 + 20, to = from + 80;
    for (let i = 0; i < perSector; i++) {
      const a = from + (to - from) * (i + 0.5) / perSector + (ring === 24.5 ? 5 : 0);
      const [x, z] = polar(ring, a);
      const j = wobble(ring * 31 + sector * 7 + i, 0.6);
      P08_SHEAVES.push(p('sheaf', x + j.x, z + j.z, { yaw: j.yaw * 3 }));
    }
  }
}
const P08_PIECES = [...P08_SHEAVES];
const P08_ANCHORS = { centre: { x: 0, z: 0, facing: 0 } };
for (const empire of EMPIRE_ORDER) {
  const [px, pz] = rel(P08, ...P08_POINTS[empire]);
  const len = Math.hypot(px, pz), ux = px / len, uz = pz / len;
  const side = P08_WAGON_SIDE[empire];
  const x = px + ux * 2.6 * side, z = pz + uz * 2.6 * side;
  // Long side to the point (the wagon is long along its own x).
  const yaw = Math.atan2(-ux * side, -uz * side);
  // The banner at the wagon's end, along the rim, on the side away from the
  // person waiting by the point.
  const tx = -uz, tz = ux;
  P08_PIECES.push(...wagon(x, z, yaw, TINT[empire]));
  P08_PIECES.push(...banner(x + tx * 3.8 * P08_BANNER_SIDE[empire], z + tz * 3.8 * P08_BANNER_SIDE[empire], yaw, TINT[empire]));
  P08_ANCHORS['wagon_' + empire] = { x: px, z: pz, facing: Math.atan2(-ux * side, -uz * side) + Math.PI };
}
const P08_PLACE = {
  id: 'P08', key: 'threshing_floor', area: 'south', ...P08, radius: 46,
  pieces: P08_PIECES,
  ground: [
    { surface: 'field_stubble', circle: [0, 0, 33] },
    { surface: 'threshing', circle: [0, 0, 15] },
  ],
  anchors: P08_ANCHORS,
};

// ---- P09: Granary and Mill -------------------------------------------------
// The windmill and the barn about 20 m apart, the well between them in a
// fenced yard of packed earth, haystacks round the barn. The mill faces the
// gate so its turning sails are the first thing seen on coming through; it
// is the area's landmark, drawn from anywhere in the Gate Fields.
const P09 = { x: -128, z: -346 };
const GATE = { x: 8.6, z: -265 };
const MILL = { x: -118, z: -336 };
// The barn's door faces the mill and opens beside the salt store (script
// point salt_store, -126, -352).
const BARN = { x: -131.5, z: -356 };
const millYaw = facing(MILL.x, MILL.z, GATE.x, GATE.z);
const barnYaw = facing(BARN.x, BARN.z, MILL.x, MILL.z);
const front = (o, yaw, d, side = 0) => ({
  x: o.x + Math.sin(yaw) * d + Math.cos(yaw) * side, z: o.z + Math.cos(yaw) * d - Math.sin(yaw) * side,
});
const yardCentre = front(BARN, barnYaw, 11);
const WELL = front(BARN, barnYaw, 11.6, -1.5);
// Taller than the kit's 10 m body: from the gate the fields rise 6 m, and
// the mill has to clear that rise as the area's compass.
const MILL_SCALE = 1.3;
const sails = front(MILL, millYaw, 3.25 * MILL_SCALE);
const P09_PLACE = {
  id: 'P09', key: 'granary_mill', area: 'south', ...P09, radius: 27,
  pieces: [
    p('windmill_body', ...rel(P09, MILL.x, MILL.z), { yaw: millYaw, landmark: true, scale: MILL_SCALE }),
    p('windmill_sails', ...rel(P09, sails.x, sails.z), { yaw: millYaw, y: 8.5 * MILL_SCALE, landmark: true, spin: 0.35, scale: MILL_SCALE }),
    p('barn', ...rel(P09, BARN.x, BARN.z), { yaw: barnYaw }),
    p('well', ...rel(P09, WELL.x, WELL.z)),
    ...fencedRect(...rel(P09, yardCentre.x, yardCentre.z), 24, 12, { yaw: barnYaw, open: ['north', 'south'], gap: 4 }),
    // Haystacks behind and beside the barn, one in the yard's corner.
    ...[[-9, -2], [-8.5, 1.5], [8.8, -1], [-3.5, -6.5]].map(([side, d], i) => {
      const at = front(BARN, barnYaw, d, side);
      return p('haystack', ...rel(P09, at.x, at.z), { yaw: i * 0.8, scale: i === 3 ? 0.85 : 1 });
    }),
    p('haystack', ...rel(P09, front(BARN, barnYaw, 15, 9.5).x, front(BARN, barnYaw, 15, 9.5).z), { scale: 0.8 }),
    // The salt store: a crate stack 2.8 m east of its point, in the yard.
    p('crate_stack', ...rel(P09, -123.3, -352.8), { yaw: barnYaw }),
  ],
  ground: [
    {
      surface: 'yard',
      quad: [[-12, 5], [12, 5], [12, 17], [-12, 17]].map(([side, d]) => {
        const at = front(BARN, barnYaw, d, side);
        return rel(P09, at.x, at.z);
      }),
    },
  ],
  anchors: {
    barn_door: { ...pt(rel(P09, ...xz(front(BARN, barnYaw, 5.2)))), facing: barnYaw + Math.PI },
    mill_door: { ...pt(rel(P09, ...xz(front(MILL, millYaw + Math.PI, 3 * MILL_SCALE + 1.2)))), facing: millYaw },
    well: { ...pt(rel(P09, ...xz(front(WELL, barnYaw, 1.6)))), facing: barnYaw + Math.PI },
  },
};
function pt([x, z]) { return { x, z }; }
function xz(o) { return [o.x, o.z]; }

// ---- P10: The Three Fields ---------------------------------------------------
// The graveyard: three plots side by side, each 14 by 10 m in a low fence
// open to the path in front: pyre stacks on ash for the west, rows of small
// stelae, rows of grave stones; the gravedigger's hut at the east end; four
// lantern posts along the path. Stones face the path, as the reference's
// tablets face the stair beside them.
const P10 = { x: -130, z: -452 };
const PLOTS = { pyres: -17, stelae: 0, graves: 17 }; // x offsets of the three plots
const P10_PIECES = [];
for (const [, dx] of Object.entries(PLOTS)) P10_PIECES.push(...fencedRect(dx, 0, 14, 10, { open: 'north', gap: 3 }));
for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++)
  P10_PIECES.push(p('pyre_stack', PLOTS.pyres - 4 + i * 4, 2.6 - k * 5.2, { yaw: wobble(i * 3 + k).yaw * 0.3 }));
// Stelae in two blocks with an aisle down the middle (the script's
// graves_centre point stays clear).
for (let r = 0; r < 3; r++) for (const [a, b] of [[-5.5, -2.5], [2.5, 5.5]])
  P10_PIECES.push(...row('stela', PLOTS.stelae + a, 3 - r * 2.6, PLOTS.stelae + b, 3 - r * 2.6, 3, { turn: -Math.PI / 2, jitter: i => wobble(r * 11 + i + a, 0.15) }));
for (let r = 0; r < 3; r++)
  P10_PIECES.push(...row('grave_stone', PLOTS.graves - 5.5, 3 - r * 2.6, PLOTS.graves + 5.5, 3 - r * 2.6, 6, { turn: -Math.PI / 2, jitter: i => wobble(r * 17 + i, 0.2) }));
P10_PIECES.push(p('hut', 31, 0.5, { yaw: -Math.PI / 2 }));
for (const x of [-25.5, -8.5, 8.5, 25.5]) P10_PIECES.push(...lanternPost(x, 7.2, 0));
const P10_PLACE = {
  id: 'P10', key: 'three_fields', area: 'south', ...P10, radius: 36,
  pieces: P10_PIECES,
  ground: [
    { surface: 'packed_earth', strip: [-27, 7.2, 34, 7.2, 3] },
    { surface: 'ash', quad: [[PLOTS.pyres - 6.6, -4.6], [PLOTS.pyres + 6.6, -4.6], [PLOTS.pyres + 6.6, 4.6], [PLOTS.pyres - 6.6, 4.6]] },
    { surface: 'grave_soil', quad: [[PLOTS.stelae - 6.6, -4.6], [PLOTS.stelae + 6.6, -4.6], [PLOTS.stelae + 6.6, 4.6], [PLOTS.stelae - 6.6, 4.6]] },
    { surface: 'grave_soil', quad: [[PLOTS.graves - 6.6, -4.6], [PLOTS.graves + 6.6, -4.6], [PLOTS.graves + 6.6, 4.6], [PLOTS.graves - 6.6, 4.6]] },
  ],
  lights: [{ x: 0, z: 7.2, y: 2.3, colour: 0xffc67a, intensity: 2.2, distance: 12 }],
  anchors: {
    plot_pyres: { x: PLOTS.pyres, z: 6, facing: Math.PI },
    plot_stelae: { x: PLOTS.stelae, z: 6, facing: Math.PI },
    plot_graves: { x: PLOTS.graves, z: 6, facing: Math.PI },
    hut_door: { x: 28.4, z: 0.5, facing: Math.PI / 2 },
  },
};

// ---- P11: Farmsteads and beehives ------------------------------------------
// Two farmhouses about 30 m apart, twelve hives in two rows in front of the
// beekeeper, four scarecrows in strips of field with hedgerows round them.
// Everything at least 30 m inside the area's east border (x = 122).
const P11 = { x: 64, z: -328 };
const HOUSE1 = { x: 60, z: -314 }, HOUSE2 = { x: 80, z: -341 };
const P11_PLACE = {
  id: 'P11', key: 'farmsteads', area: 'south', ...P11, radius: 38,
  pieces: [
    p('farmhouse', ...rel(P11, HOUSE1.x, HOUSE1.z), { yaw: Math.PI * 0.85 }),
    p('farmhouse', ...rel(P11, HOUSE2.x, HOUSE2.z), { yaw: -Math.PI * 0.62 }),
    ...[-323.5, -328].flatMap((z, r) => row('beehive', 71, z, 80, z, 6, { turn: Math.PI / 2, jitter: i => wobble(r * 9 + i, 0.12) }))
      .map(entry => ({ ...entry, x: entry.x - P11.x, z: entry.z - P11.z })),
    // Field strips west and south, with a scarecrow in each.
    ...[[47, -330, 0.4], [55, -347, -0.3], [64, -305, 0.2], [44, -318, 1.2]].map(([x, z, yaw]) => p('scarecrow', x - P11.x, z - P11.z, { yaw })),
    p('haystack', HOUSE1.x + 6 - P11.x, HOUSE1.z + 4 - P11.z, { scale: 0.8 }),
    p('crate_stack', HOUSE2.x - 5.5 - P11.x, HOUSE2.z + 3.5 - P11.z, { scale: 0.8, yaw: 0.4 }),
    // The woodpile (script point woodpile, 84, -336): a stack 2.3 m beside it.
    p('crate_stack', 85.8 - P11.x, -337.4 - P11.z, { yaw: -0.3 }),
    // Hedgerows round the strips: short runs with gaps, never a closed box.
    ...chain('hedgerow_4m', [[40 - P11.x, -300 - P11.z], [40 - P11.x, -338 - P11.z]], 4),
    ...chain('hedgerow_4m', [[44 - P11.x, -354 - P11.z], [70 - P11.x, -357 - P11.z]], 4),
    ...chain('hedgerow_4m', [[52 - P11.x, -323 - P11.z], [66 - P11.x, -322 - P11.z]], 4),
  ],
  ground: [
    { surface: 'field_ploughed', strip: [47, -306, 47, -336, 9].map((v, i) => (i < 4 ? (i % 2 ? v - P11.z : v - P11.x) : v)) },
    { surface: 'field_green', strip: [50, -348, 66, -350, 7].map((v, i) => (i < 4 ? (i % 2 ? v - P11.z : v - P11.x) : v)) },
    { surface: 'field_flax', strip: [57, -305, 72, -303, 6].map((v, i) => (i < 4 ? (i % 2 ? v - P11.z : v - P11.x) : v)) },
    { surface: 'yard', circle: [HOUSE2.x - P11.x - 3, HOUSE2.z - P11.z + 4, 7] },
  ],
  anchors: {
    hives: { x: 83 - P11.x, z: -325.8 - P11.z, facing: -Math.PI / 2 },
    house_1: { x: HOUSE1.x - P11.x + Math.sin(Math.PI * 0.85) * 4, z: HOUSE1.z - P11.z + Math.cos(Math.PI * 0.85) * 4, facing: Math.PI * 0.85 + Math.PI },
    house_2: { x: HOUSE2.x - P11.x + Math.sin(-Math.PI * 0.62) * 4, z: HOUSE2.z - P11.z + Math.cos(-Math.PI * 0.62) * 4, facing: -Math.PI * 0.62 + Math.PI },
  },
};

// ---- P12: The Old Barrow ----------------------------------------------------
// A grass mound with its sealed door in the north face, the only pair of fire
// baskets in these places flanking it ("the way in is here"), and a path of
// flat stones winding up to it from the hedge gap to the north, as the
// reference's trail climbs to its tomb's stair.
//
// Moved 10 m north of the plan's (20, -500): there the mound sat in a dip
// (centre y -0.2, the approach from the north at y 4) and its top barely
// cleared a walker's eye. At (20, -490) the ground falls away south of it, so
// it reads as a mound on a rise; from the north it stands about 3 m over the
// path, a sealed door in a grass mass, as the reference's doorway in its
// terraced mound across open grass (longplay 5:05:00). The mound stands on its
// own centre (a dome sinks into a slope; it never floats).
const P12 = { x: 20, z: -490 };
const MOUND_SCALE = 1.25;
const DOOR_R = 9.3, FRONT_R = 11.8;
const P12_PATH = [];
for (let i = 0; i < 18; i++) {
  const z = FRONT_R + 1.2 + i * 1.15;
  const x = Math.sin(i * 0.3) * 1.8 + (i % 2 ? 0.25 : -0.25);
  P12_PATH.push(p('flat_stone', x, z, { yaw: wobble(i, 0.5).yaw }));
}
const P12_PLACE = {
  id: 'P12', key: 'old_barrow', area: 'south', ...P12, radius: 36,
  pieces: [
    p('barrow_mound', 0, 0, { scale: MOUND_SCALE, ground: 'pivot', y: -0.4 }),
    p('barrow_door', 0, DOOR_R, { yaw: 0 }),
    p('fire_basket', -2.5, FRONT_R - 0.6), p('fire_basket_flame', -2.5, FRONT_R - 0.6),
    p('fire_basket', 2.5, FRONT_R - 0.6), p('fire_basket_flame', 2.5, FRONT_R - 0.6),
    ...P12_PATH,
  ],
  lights: [{ x: 0, z: FRONT_R, y: 1.9, colour: 0xff8a3a, intensity: 5, distance: 13, flicker: true }],
  anchors: { door: { x: 0, z: FRONT_R + 0.4, facing: Math.PI } },
};

// ---- Between the places: hedgerows and field strips ----------------------------
// Four rooms round the open threshing floor (never fenced in): the mill room
// to the west, the graveyard room south-west, the farmsteads east, the
// barrow south. Hedges run in short broken lines with gaps where a track
// would go, as the reference's field edges do.
const FIELDS = { x: -30, z: -410 };
const hedge = points => chain('hedgerow_4m', points.map(([x, z]) => [x - FIELDS.x, z - FIELDS.z]), 4);
const strip = (surface, x0, z0, x1, z1, w) => ({ surface, strip: [x0 - FIELDS.x, z0 - FIELDS.z, x1 - FIELDS.x, z1 - FIELDS.z, w] });
const FIELDS_PLACE = {
  id: 'S_FIELDS', key: 'gate_fields_hedgerows', area: 'south', ...FIELDS, radius: 140,
  pieces: [
    // Mill room / gate room: broken line with a gap for the track at z -322.
    ...hedge([[-72, -298], [-74, -314]]),
    ...hedge([[-75, -330], [-72, -352], [-80, -380]]),
    // Mill room / graveyard room.
    ...hedge([[-155, -404], [-128, -402]]),
    ...hedge([[-112, -403], [-88, -398], [-74, -410]]),
    // Graveyard room / barrow room, and the barrow room's north edge with a
    // gap where the stone path comes through.
    ...hedge([[-62, -452], [-40, -456], [-18, -458]]),
    ...hedge([[-2, -460], [8, -462]]),
    ...hedge([[32, -462], [52, -458], [70, -450]]),
    // East of the gate track, 34 m in from the border (no nearer is allowed):
    // with the rise it screens the nearer farmhouse's walls so
    // the mill and the floor's north wagon are what the gate shows first.
    ...hedge([[27, -299], [38, -300.5]]),
    ...hedge([[42, -301.5], [52, -306]]),
    ...hedge([[74, -372], [86, -384]]),
  ],
  ground: [
    strip('field_ploughed', -100, -306, -82, -318, 8),
    strip('field_green', -150, -378, -96, -388, 9),
    strip('field_stubble', -58, -330, -60, -372, 8),
    strip('field_flax', -40, -300, -45, -340, 7),
    strip('field_ploughed', -150, -415, -96, -418, 7),
    strip('field_green', -60, -470, -10, -478, 9),
    strip('field_flax', 45, -470, 80, -462, 8),
    strip('field_stubble', 80, -392, 88, -430, 8),
  ],
  anchors: {},
};

export const SOUTH_PLACES = Object.freeze([P08_PLACE, P09_PLACE, P10_PLACE, P11_PLACE, P12_PLACE, FIELDS_PLACE]);
