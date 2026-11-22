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
// road; the bell hangs on its frame in the gate (0, -225), beside the road.
const P04_CENTRE = { x: 34, z: -215 };
const YARD = { x: 70, z: -210 };
const yard = (x, z) => at(P04_CENTRE, YARD.x + x, YARD.z + z);
// The script's points (script/band1.mjs BAND1_POINTS yard_wagon_*) are where
// the three travellers are found: each wagon stands just outside its point,
// long side toward it, 1.6 m clear, so the point itself stays free.
const P04_POINTS = { akitsu: [61, -212], tameri: [70, -205], remoria: [79, -212] };
const P04_WAGONS = Object.entries(P04_POINTS).map(([empire, [x, z]]) => {
  const dx = x - YARD.x, dz = z - YARD.z, len = Math.hypot(dx, dz);
  return { empire, x: x + dx / len * 2.6 - YARD.x, z: z + dz / len * 2.6 - YARD.z, yaw: Math.atan2(-dx, -dz) };
});
const P04 = {
  id: 'P04', key: 'south_gate', area: 'town', ...P04_CENTRE, radius: 50,
  pieces: [
    ...P04_WAGONS.flatMap(w => wagon(yard(w.x, w.z).x, yard(w.x, w.z).z, w.yaw, TINT[w.empire])),
    // Crates between the wagons and behind them; the yard's middle stays open.
    ...[[-5.5, 4.5, 0.3], [5.5, 4.5, -0.4], [-13, -6, 0.1], [13, -6, 0.6], [0, 11, 1.1]]
      .map(([x, z, yaw]) => p('crate_stack', yard(x, z).x, yard(x, z).z, { yaw })),
    p('crate_stack', yard(-7, 5.8).x, yard(-7, 5.8).z, { yaw: 0.7, scale: 0.7 }),
    // The gate bell on its frame inside the gate, between the road's east edge
    // (x 3) and the east pillar (about x 6.2 to 7.8 on the gate line), facing
    // the road; the script's point gate_bell (5, -223) is where the ringer
    // stands, 1.7 m clear on the town side.
    p('gate_bell', at(P04_CENTRE, 5, -225.6).x, at(P04_CENTRE, 5, -225.6).z, { yaw: -Math.PI / 2 }),
  ],
  ground: [
    { surface: 'yard', circle: [yard(0, 0).x, yard(0, 0).z, 13] },
  ],
  anchors: {
    wagon_akitsu: anchor(P04_CENTRE, ...P04_POINTS.akitsu, P04_WAGONS[0].yaw + Math.PI),
    wagon_tameri: anchor(P04_CENTRE, ...P04_POINTS.tameri, P04_WAGONS[1].yaw + Math.PI),
    wagon_remoria: anchor(P04_CENTRE, ...P04_POINTS.remoria, P04_WAGONS[2].yaw + Math.PI),
    gate_arch: anchor(P04_CENTRE, 0, -225, Math.PI),
    bell: anchor(P04_CENTRE, 5, -223, Math.PI),
  },
};

// ---- The plaza (P01 to P03) -------------------------------------------------
// The live town is the round artisan plaza (wolfveil/AXETownPlaza.js): the
// twin-wolf fountain at (0, -70) on a platform about 7.6 m round, with a
// stone lantern on each of its four corners at (+-5.25, -66.65) and
// (+-5.25, -73.35); boardwalks cross it north-south and east-west (about 4.3 m
// wide); eight residences ring it, their doors toward the fountain.
// The "ancient tree" of WolfveilImportedTownLayout.mjs belongs to the
// imported town, which is not the one drawn; the Oath Tree is the kit's.
const RIBBON_COLOURS = ['akitsu', 'tameri', 'remoria', 'valley'].map(id => TINT[id]);

// P01: the Oath Tree (the kit's oath_tree, a landmark drawn from across the
// plaza) on open paving south-west of the fountain: 2.4 m south of the west
// boardwalk, about 4.6 m to the side of the blacksmith's door line and 7 m
// from its corner, 13 m from the new player's spawn. Two dozen ribbons in the
// three empires' colours and the valley's hang from a rope ring round its
// trunk at head height. The Truce Stone stands 3 m from the trunk toward the
// fountain. (The lead's script takes its oath_tree and truce_stone points
// from here.)
const TREE = { x: -11.5, z: -74.6 };
const toFountain = (() => {
  const dx = 0 - TREE.x, dz = -70 - TREE.z, len = Math.hypot(dx, dz);
  return { x: dx / len, z: dz / len };
})();
const STONE = { x: TREE.x + toFountain.x * 3, z: TREE.z + toFountain.z * 3 };
const P01_CENTRE = { x: -10, z: -74 };
const P01_RIBBONS = Array.from({ length: 24 }, (_, i) => {
  const a = (i / 24) * Math.PI * 2;
  const j = wobble(i, 0.25);
  return p('ribbon', TREE.x + Math.cos(a) * 0.95 - P01_CENTRE.x, TREE.z + Math.sin(a) * 0.95 - P01_CENTRE.z, {
    y: 2.05 + j.x * 0.15, yaw: -a + j.yaw, tint: RIBBON_COLOURS[i % 4], scale: 1 + j.z * 0.3,
  });
});
const P01 = {
  id: 'P01', key: 'oath_tree', area: 'town', ...P01_CENTRE, radius: 15,
  pieces: [
    p('oath_tree', ...xz(at(P01_CENTRE, TREE.x, TREE.z)), { yaw: 0.6, landmark: true, ground: 'pivot' }),
    p('truce_stone', ...xz(at(P01_CENTRE, STONE.x, STONE.z)), { yaw: Math.atan2(toFountain.x, toFountain.z) }),
    ...P01_RIBBONS,
  ],
  anchors: {
    tree: anchor(P01_CENTRE, TREE.x + toFountain.x * 1.8 - toFountain.z * 1.2, TREE.z + toFountain.z * 1.8 + toFountain.x * 1.2,
      Math.atan2(-toFountain.x, -toFountain.z)),
    stone: anchor(P01_CENTRE, STONE.x + toFountain.x * 1.4, STONE.z + toFountain.z * 1.4, Math.atan2(-toFountain.x, -toFountain.z)),
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

// P03: the Lantern Wall, on the plaza's north side. The script's point
// lantern_wall (-4, -41) is where the player stands to light a lantern; the
// wall stands just north of it, its face to the south, clear of the north
// boardwalk (x within 2.2 m of 0). Bram's spot (-4, -44) is behind the point.
// Two rows of ten paper lanterns hang on its face, one for each of the day's
// dead; one warm light.
const P03_CENTRE = { x: -5.6, z: -38.6 };
const P03_LANTERNS = [];
for (let rowIndex = 0; rowIndex < 2; rowIndex++)
  for (let i = 0; i < 10; i++)
    P03_LANTERNS.push(p('paper_lantern', 2.7 - i * 0.6, -0.48, { y: rowIndex ? 1.5 : 2.15, yaw: Math.PI + wobble(rowIndex * 10 + i, 0.2).yaw }));
const P03 = {
  id: 'P03', key: 'lantern_wall', area: 'town', ...P03_CENTRE, radius: 15,
  pieces: [p('lantern_wall', 0, 0, { yaw: Math.PI }), ...P03_LANTERNS],
  lights: [{ x: 0, z: -1.6, y: 1.7, colour: 0xffc070, intensity: 2.4, distance: 10 }],
  anchors: { wall: { ...at(P03_CENTRE, -4, -41), facing: 0 } },
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

