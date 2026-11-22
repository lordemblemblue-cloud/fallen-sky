// The town's places, P01 to P07 (03_QUEST_PLAN.md section 3, "Town").
// Centres are LOCAL Wolfveil metres; pieces and anchors are relative to them.
// Where a layout's centre differs from pledgePlaces.mjs, it is because the
// pieces of one place sit in two spots (the gate and its yard) and the
// layout's circle has to hold both; the places table keeps the plan's points.
import { TINT, EMPIRE_ORDER, p, wagon, banner, lanternPost, row, wobble } from './layoutKit.mjs';

const at = (place, x, z) => ({ x: x - place.x, z: z - place.z });
const anchor = (place, x, z, facing = 0) => ({ ...at(place, x, z), facing });

// ---- P04: the Southern Wolf Gate and its wagon yard ---------------------
// The yard is the open ground at (70, -210), 25 m of room east of the gate
// road; the bell hangs on its frame beside the road at the gate (0, -225).
const P04_CENTRE = { x: 34, z: -215 };
const YARD = { x: 70, z: -210 };
const yard = (x, z) => at(P04_CENTRE, YARD.x + x, YARD.z + z);
const P04_WAGONS = [
  // Three wagons in a loose fan, long sides to the north, tongues toward the
  // gate road, 9 m apart: the way carts pull off a road and stop.
  { empire: 'akitsu', x: -2, z: 9, yaw: 0.22 },
  { empire: 'tameri', x: 1, z: 0, yaw: -0.05 },
  { empire: 'remoria', x: -2.5, z: -9, yaw: -0.24 },
];
const P04 = {
  id: 'P04', key: 'south_gate', area: 'town', ...P04_CENTRE, radius: 46,
  pieces: [
    ...P04_WAGONS.flatMap(w => wagon(yard(w.x, w.z).x, yard(w.x, w.z).z, w.yaw, TINT[w.empire])),
    // Crates between the wagons, and a stack behind each.
    ...[[-4.5, 4.6, 0.3], [-4.2, -4.4, -0.4], [4.2, 5.4, 0.1], [4.8, -3.8, 0.6], [5.6, -0.6, 1.1]]
      .map(([x, z, yaw]) => p('crate_stack', yard(x, z).x, yard(x, z).z, { yaw })),
    p('crate_stack', yard(-4.9, 6.3).x, yard(-4.9, 6.3).z, { yaw: 0.7, scale: 0.7 }),
    // The gate bell on its frame, on the town side of the gate's roof, beside
    // the road and facing it.
    p('gate_bell', at(P04_CENTRE, -6.8, -213).x, at(P04_CENTRE, -6.8, -213).z, { yaw: Math.PI / 2 }),
  ],
  ground: [
    { surface: 'yard', circle: [yard(0, 0).x, yard(0, 0).z, 13] },
  ],
  anchors: {
    wagon_akitsu: anchor(P04_CENTRE, YARD.x - 2 - 3.6, YARD.z + 9 + 0.8, -Math.PI / 2),
    wagon_tameri: anchor(P04_CENTRE, YARD.x + 1 - 3.6, YARD.z, -Math.PI / 2),
    wagon_remoria: anchor(P04_CENTRE, YARD.x - 2.5 - 3.6, YARD.z - 9 - 0.8, -Math.PI / 2),
    gate_arch: anchor(P04_CENTRE, 0, -225, Math.PI),
    bell: anchor(P04_CENTRE, -5.4, -213, -Math.PI / 2),
  },
};

// ---- The plaza (P01 to P03) -------------------------------------------------
// The live town is the round artisan plaza (wolfveil/AXETownPlaza.js): the
// twin-wolf fountain at (0, -70) on a platform about 7.6 m round, with a
// stone lantern on each of its four corners at (+-5.25, -66.65) and
// (+-5.25, -73.35); boardwalks cross it north-south and east-west (about 4.3 m
// wide); eight residences ring it, their doors toward the fountain.
// The "ancient tree" of WolfveilImportedTownLayout.mjs belongs to the
// imported town, which is not the one drawn: there is no tree on this plaza.
// Measured in the game: each lantern stands on the rim (1.2 m above the
// paving), its body 0.8 m wide, its roof 2.7 m across with the eave 2.85 m
// above the paving.
const FOUNTAIN_LANTERNS = [[5.25, -66.65], [-5.25, -66.65], [-5.25, -73.35], [5.25, -73.35]];
const RIBBON_COLOURS = ['akitsu', 'tameri', 'remoria', 'valley'].map(id => TINT[id]);

// P01: the Truce Stone on the paving just east of the fountain's north-east
// lantern, beside the Keeper's spot (Sable Vey, (7, -64)) and clear of the
// east boardwalk; the oath ribbons hang in rings of six under the roofs of the
// fountain's four lanterns, at head height above the platform, in the three
// empires' colours and the valley's (24 in all).
const P01_CENTRE = { x: 3, z: -68 };
const STONE = { x: 10.2, z: -65.4 };
const P01_RIBBONS = FOUNTAIN_LANTERNS.flatMap(([lx, lz], k) => Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2 + k * 0.4;
  const j = wobble(k * 6 + i, 0.25);
  return p('ribbon', lx + Math.cos(a) * 1.1 - P01_CENTRE.x, lz + Math.sin(a) * 1.1 - P01_CENTRE.z, {
    y: 2.85, yaw: a + j.yaw, tint: RIBBON_COLOURS[(i + k) % 4], scale: 1 + j.z * 0.4,
  });
}));
const P01 = {
  id: 'P01', key: 'oath_tree', area: 'town', ...P01_CENTRE, radius: 15,
  pieces: [
    p('truce_stone', ...xz(at(P01_CENTRE, STONE.x, STONE.z)), { yaw: Math.atan2(-STONE.x, -70 - STONE.z) }),
    ...P01_RIBBONS,
  ],
  anchors: {
    stone: anchor(P01_CENTRE, STONE.x - 1.2, STONE.z - 1.1, Math.atan2(1.2, 1.1)),
  },
};

// P02: three of the plaza's south-side residences, the ones nearest each
// envoy's spot in cast.mjs: residence 5 (west) for Akitsu (Mizuhara, -24,-92),
// residence 6 for Remoria (Aelia, 0,-100), residence 8 (east) for Tameri
// (Paneb, 24,-92). The houses are not touched: at each door a banner pole
// with the empire's cloth on one side and a pledge board on the other,
// facing the plaza.
const LODGES = {
  akitsu: { x: -39.3, z: -86.3, fx: 0.92, fz: 0.38 },
  remoria: { x: -16.3, z: -109.3, fx: 0.38, fz: 0.92 },
  tameri: { x: 39.3, z: -86.3, fx: -0.92, fz: 0.38 },
};
const P02_CENTRE = { x: 0, z: -95 };
const lodgePoint = (lodge, front, side) => ({
  // side: to the house's right as it faces the plaza (+x of its own frame).
  x: lodge.x + lodge.fx * front + lodge.fz * side,
  z: lodge.z + lodge.fz * front - lodge.fx * side,
});
const P02_PIECES = [];
const P02_ANCHORS = {};
for (const empire of EMPIRE_ORDER) {
  const lodge = LODGES[empire];
  const yaw = Math.atan2(lodge.fx, lodge.fz);
  const pole = lodgePoint(lodge, 4.6, -3.4);
  const board = lodgePoint(lodge, 4.9, 2.7);
  P02_PIECES.push(...banner(...xz(at(P02_CENTRE, pole.x, pole.z)), yaw, TINT[empire]));
  P02_PIECES.push(p('pledge_board', ...xz(at(P02_CENTRE, board.x, board.z)), { yaw }));
  const reader = lodgePoint(lodge, 6.6, 2.7);
  P02_ANCHORS['board_' + empire] = anchor(P02_CENTRE, reader.x, reader.z, yaw + Math.PI);
}
const P02 = {
  id: 'P02', key: 'three_lodges', area: 'town', ...P02_CENTRE, radius: 40,
  pieces: P02_PIECES, anchors: P02_ANCHORS,
};

// P03: the Lantern Wall, on the plaza's north side three metres south of the
// lamplighter's spot (Bram, (-4, -44), who faces south: toward it), west of
// the north boardwalk. Two rows of ten paper lanterns hang on its north face,
// one for each of the day's dead; one warm light.
const P03_CENTRE = { x: -6.5, z: -47.6 };
const P03_LANTERNS = [];
for (let rowIndex = 0; rowIndex < 2; rowIndex++)
  for (let i = 0; i < 10; i++)
    P03_LANTERNS.push(p('paper_lantern', -2.7 + i * 0.6, 0.48, { y: rowIndex ? 1.5 : 2.15, yaw: wobble(rowIndex * 10 + i, 0.2).yaw }));
const P03 = {
  id: 'P03', key: 'lantern_wall', area: 'town', ...P03_CENTRE, radius: 15,
  pieces: [p('lantern_wall', 0, 0, { yaw: 0 }), ...P03_LANTERNS],
  lights: [{ x: 0, z: 1.6, y: 1.7, colour: 0xffc070, intensity: 2.4, distance: 10 }],
  anchors: { wall: { x: 0, z: 1.8, facing: Math.PI } },
};

// ---- P05: Training Grounds ----------------------------------------------------
// Six straw posts in two rows on the gentle slope north of the training
// trail, just east of its bend at (-165, 88): moved 10 m east of the plan's
// point so they stand 30 m inside the town's west border (x = -190).
// Nothing else.
const P05 = {
  id: 'P05', key: 'training_grounds', area: 'town', x: -165, z: 88, radius: 25,
  pieces: [
    ...row('straw_post', 6, 7, 15, 7, 3, { turn: -Math.PI / 2 }),
    ...row('straw_post', 6, 11.5, 15, 11.5, 3, { turn: -Math.PI / 2 }),
  ],
  anchors: {},
};

// ---- P06: Field of Standards ----------------------------------------------------
// The hilltop at (-110, 170): three old standards 12 m apart in a triangle
// round a cairn, the first pointing toward the Training Grounds. The hill is
// convex: seen from the Training Grounds its shoulder hides the top, so the
// triangle stands 8 m toward them, at (-114, 163), still on the flat top, and
// the standards are 7.5 m tall (scale 1.5): their upper 3 m stand on the
// skyline from the straw posts. Weathered: each leans a little.
const P06_ANCHORS = {};
const P06_PIECES = [p('cairn', 0, 0)];
const P06_CENTRE = { x: -114, z: 163 };
const toTraining = Math.atan2(-165 - P06_CENTRE.x, 88 - P06_CENTRE.z);
// Beside the cairn on the Training Grounds side, facing it.
P06_ANCHORS.cairn = { x: Math.sin(toTraining) * 1.9, z: Math.cos(toTraining) * 1.9, facing: toTraining + Math.PI };
for (let i = 0; i < 3; i++) {
  const a = toTraining + i * Math.PI * 2 / 3;
  const r = 12 / Math.sqrt(3);
  const x = Math.sin(a) * r, z = Math.cos(a) * r;
  P06_PIECES.push(p('old_standard', x, z, { yaw: a, pitch: [0.05, -0.07, 0.03][i], roll: [0.04, 0.02, -0.06][i], scale: 1.5 }));
  P06_ANCHORS['standard_' + (i + 1)] = { x: x * 0.78, z: z * 0.78, facing: a + Math.PI };
}
const P06 = {
  id: 'P06', key: 'field_of_standards', area: 'town', ...P06_CENTRE, radius: 20,
  pieces: P06_PIECES, anchors: P06_ANCHORS,
};

// ---- P07: the Keepers' workroom ----------------------------------------------------
// The studio frame at (70, 190) open to the west (Master Hesper's spot is
// inside it, facing west), four paper screens standing in it, a lantern post
// at its open corner.
const P07 = {
  id: 'P07', key: 'keepers_workroom', area: 'town', x: 70, z: 190, radius: 12,
  pieces: [
    p('studio_frame', 0, 0, { yaw: -Math.PI / 2 }),
    p('paper_screen', 1.9, -1.2, { yaw: -Math.PI / 2 }),
    p('paper_screen', 1.9, 1.2, { yaw: -Math.PI / 2 }),
    p('paper_screen', 0.4, -1.75, { yaw: 0.12 }),
    p('paper_screen', 0.4, 1.75, { yaw: Math.PI - 0.12 }),
    ...lanternPost(-3, -2.6, -Math.PI / 2),
  ],
  anchors: { desk: { x: -2, z: -2, facing: -Math.PI / 2 } },
};

export const TOWN_PLACES = Object.freeze([P01, P02, P03, P04, P05, P06, P07]);

function xz(o) { return [o.x, o.z]; }

