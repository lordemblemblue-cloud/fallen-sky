// The plans of band 2's three army camps, as numbers: where each piece of each
// camp stands. Written by the lead from a survey of the game's own ground
// (docs/game3d/three-empires/CAMPS_BAND2.md says why each thing is where it is).
// The session that builds a camp turns its plan into that area's layout and
// fits every piece to the ground in the running game; it changes a position
// only where the ground says so, and reports what it moved.
//
// Local Wolfveil metres (x east, z north). `yaw` turns a piece about the
// vertical so its front (+Z in the kit) looks along (sin yaw, cos yaw).
// Pure data: no imports.
//
// Flags on an item:
//   marks: '<point>'  the piece stands on that story point on purpose (a post to strike)
//   afloat: true      the piece floats on the river; y is the water's height
//   outlying: true    belongs to the camp's story but stands away from it
//   y                 metres above the ground the piece is mounted at

const round = value => Math.round(value * 100) / 100;
const item = (kit, piece, x, z, yaw = 0, extra = {}) =>
  Object.freeze({ kit, piece, x: round(x), z: round(z), yaw: round(yaw), ...extra });
const yawToward = (dx, dz) => Math.atan2(dx, dz);

// A frame along a road: `s` metres along it (ux, uz), `t` metres to its right.
function roadFrame(cx, cz, ux, uz) {
  const at = (s, t) => [cx + s * ux + t * uz, cz + s * uz - t * ux];
  const yaw = (ds, dt) => yawToward(ds * ux + dt * uz, ds * uz - dt * ux);
  return { at, yaw, put: (kit, piece, s, t, ds, dt, extra) => item(kit, piece, ...at(s, t), yaw(ds, dt), extra) };
}

// ── Castra Lupa (P35): Remoria's fort, across the ridge path ───────────────
// 56 m along the path by 40 m across it. The path climbs through it: in at the
// south gate, out at the north, 19 m short of the crossroads with the Hunter's Loop.
function castraLupa() {
  const f = roadFrame(-66, 383, 0.6, 0.8);
  const R = 'remoria';
  const items = [];
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      items.push(f.put(R, 'gate_tower', 28 * end, 4.5 * side, end, 0));
      // The walls' centrelines cross at (28, 20); the corner piece's own centre is 0.93 m inside that, on the diagonal.
      items.push(f.put(R, 'palisade_corner', 27.34 * end, 19.34 * side, end, side));
      items.push(f.put(R, 'stake_hedge', 34 * end, 8 * side, end, 0));
      for (const t of [8, 12, 16]) items.push(f.put(R, 'palisade_run', 28 * end, t * side, end, 0));
    }
    items.push(f.put(R, 'gate_span', 28 * end, 0, end, 0, { y: 4.2 }));
  }
  for (const side of [-1, 1]) {
    for (let s = -24; s <= 24; s += 4) items.push(f.put(R, 'palisade_run', s, 20 * side, 0, side));
    for (const s of [-21, -15, -9, -3]) items.push(f.put(R, 'tent_legion', s, 12 * side, 0, -side));
    items.push(f.put(R, 'rack_arms', -12, 6.5 * side, 0, -side));
    items.push(f.put(R, 'brazier_iron', 8, 3.2 * side, 0, -side));
    items.push(f.put(R, 'brazier_fire', 8, 3.2 * side, 0, -side));
  }
  items.push(f.put(R, 'standard_wolf', 10, -7, -1, 0));
  items.push(f.put(R, 'tribunal', 10, 7, 0, -1));
  items.push(f.put(R, 'tent_command', 19, -12, 0, 1));
  items.push(item(R, 'milestone', -44, 418.5, 0, { outlying: true })); // at the crossroads above the north gate
  // P43, the High Road: the Hunter's Loop across the highlands east of the crossroads. The ridge path
  // north of the peak is cut by the terraces of a cave's entrance, so the road home runs this way.
  items.push(item(R, 'road_arch', 150, 428, yawToward(-46, 2), { outlying: true }));
  return Object.freeze({
    id: 'castra_lupa', place: 'P35', area: 'north', kit: R,
    centre: Object.freeze({ x: -66, z: 383 }), along: Object.freeze({ x: 0.6, z: 0.8 }),
    tallMark: 'gate_tower', road: 'ridge_path',
    // Two sentries stand in the road and speak first; people with names keep the homes cast.mjs gives them.
    sentries: Object.freeze([f.at(-31, -1.6), f.at(-31, 1.6), f.at(31, 1.6)].map(([x, z]) => Object.freeze({ x: round(x), z: round(z) }))),
    items: Object.freeze(items),
  });
}

// ── The Landing (P24): Tameri's camp, on the east rim of the river gorge ───
// The river is about 30 m down. The barge moors below; a hoist lifts the grain
// to a stage on the lip. The yard climbs east from the rim to the House of Life.
function theLanding() {
  const T = 'tameri';
  const west = -Math.PI / 2, north = 0, south = Math.PI, east = Math.PI / 2;
  const items = [];
  // The rim: shields on a rail two metres back from the lip, which bends east as it runs south.
  // Open where the stage and the hoist stand.
  const rail = [[-402, 256.5], [-406, 257.5], [-410, 258.5], [-414, 259.5], [-418, 260.5],
    [-430, 263.5], [-434, 265], [-438, 266.5], [-442, 267], [-446, 267], [-450, 267.5]];
  for (const [z, x] of rail) items.push(item(T, 'shield_wall', x, z, west));
  for (let x = 258; x <= 294; x += 4) items.push(item(T, 'shield_wall', x, -400, north));
  for (let x = 270; x <= 294; x += 4) items.push(item(T, 'shield_wall', x, -452, south));
  items.push(item(T, 'landing_stage', 260, -426, west));
  items.push(item(T, 'hoist', 262.5, -422, west));
  // Below, on the water (the river's middle is near x 231 at this z).
  items.push(item(T, 'barge', 231, -428, yawToward(34, -115), { afloat: true }));
  items.push(item(T, 'reed_boat', 227, -412, yawToward(34, -115), { afloat: true }));
  items.push(item(T, 'reed_boat', 235, -442, yawToward(34, -115), { afloat: true }));
  for (const [x, z] of [[223, -404], [238, -418], [239, -434], [226, -436], [240, -446]]) items.push(item(T, 'reed_clump', x, z, 0, { afloat: true }));
  for (const [x, z] of [[271, -445], [273, -447], [269, -447.5]]) items.push(item(T, 'reed_clump', x, z));
  // The yard.
  for (const [x, z] of [[281.5, -413.5], [283, -418.5], [277.5, -412]]) items.push(item(T, 'grain_stack', x, z));
  for (const [x, z] of [[268, -431], [271.5, -433], [268.5, -417]]) items.push(item(T, 'jar_rack', x, z, west));
  for (const [x, z] of [[264.5, -424], [265.5, -428]]) items.push(item(T, 'grain_jar', x, z)); // set down at the head of the plank
  items.push(item(T, 'awning', 275.5, -407.5, south));
  items.push(item(T, 'tally_board', 277.5, -408, yawToward(-1, -0.4)));
  items.push(item(T, 'chariot', 292, -410, west));
  // The upper end: the House of Life, and the two flagstaffs that are the way in.
  items.push(item(T, 'pavilion_life', 292, -437.5, west));
  for (const z of [-434, -441]) {
    items.push(item(T, 'brazier_bowl', 287, z));
    items.push(item(T, 'brazier_flame', 287, z));
  }
  for (const z of [-419, -431]) {
    items.push(item(T, 'flagstaff', 298, z));
    items.push(item(T, 'pennant', 298, z, east, { y: 12.6 }));
  }
  return Object.freeze({
    id: 'the_landing', place: 'P24', area: 'east', kit: T,
    centre: Object.freeze({ x: 272, z: -424 }), along: Object.freeze({ x: 1, z: 0 }),
    tallMark: 'flagstaff', road: null, // no trail reaches it yet: see CAMPS_BAND2.md, "The grain road"
    sentries: Object.freeze([Object.freeze({ x: 299.5, z: -423 }), Object.freeze({ x: 299.5, z: -427 })]),
    items: Object.freeze(items),
  });
}

// ── Camp of the Western Road (P13): Akitsu's camp, astride the west trail ──
// Three levels: the drill yard on the flat east of the trail, tent rows on the
// slope west of it, the command curtain above. The watchtower stands over the
// town-side picket.
function westernRoadCamp() {
  const A = 'akitsu';
  // The trail from the end of the west road (-263, -93) down to (-330, -200).
  const f = roadFrame(-263, -93, -0.531, -0.848);
  const items = [];
  // Two pickets close 50 m of the trail: toward the town at 36 m, toward the wilds at 86 m.
  for (const [s, face] of [[36, -1], [86, 1]]) {
    items.push(f.put(A, 'gate_bar', s, 0, face, 0));
    for (const t of [-4.6, 4.6]) items.push(f.put(A, 'bale_wall', s, t, face, 0));
    for (const t of [-8.6, 8.6]) items.push(f.put(A, 'bale_wall', s, t, face, 0));
    items.push(f.put(A, 'banner_tall_pole', s + 1.5 * face, 6.6, face, 0));
    items.push(f.put(A, 'banner_tall_cloth', s + 1.5 * face, 6.6, face, 0, { y: 6.3 }));
    items.push(f.put(A, 'signal_lantern', s, -2.6, face, 0, { y: 2.3 }));
  }
  // Tent rows up the slope, to the right of the trail as it runs south-west.
  for (const s of [46, 52, 58, 64]) items.push(f.put(A, 'tent_bell', s, 9, 0, -1));
  for (const s of [49, 55, 61]) items.push(f.put(A, 'tent_bell', s, 16, 0, -1));
  items.push(f.put(A, 'tent_officer', 59, 24, 0, -1));
  // The command post: a curtain on three sides, open downhill toward the yard.
  const [cx, cz] = [-321, -139];
  for (const dz of [-2, 2]) items.push(item(A, 'curtain_run', cx - 4, cz + dz, -Math.PI / 2));
  for (const dx of [-2, 2]) {
    items.push(item(A, 'curtain_run', cx + dx, cz + 4, 0));
    items.push(item(A, 'curtain_run', cx + dx, cz - 4, Math.PI));
  }
  // Each run carries its pole at its left end, which leaves the north side's open end bare.
  items.push(item(A, 'curtain_post', cx + 4, cz + 4));
  items.push(item(A, 'map_table', cx - 1.5, cz, Math.PI / 2));
  // The watchtower stands over the town-side picket, on the slope side of the trail: up among
  // the cedars the forest hid it, and here it is what a traveller from the town sees first.
  items.push(f.put(A, 'watchtower', 40, 13, -1, 0));
  items.push(f.put(A, 'signal_lantern', 40, 13, -1, 0, { y: 7 }));
  // The yard, on the flat.
  items.push(item('valley', 'straw_post', -286, -151, 0, { marks: 'camp_post_1' }));
  items.push(item('valley', 'straw_post', -283, -153, 0, { marks: 'camp_post_2' }));
  items.push(item('valley', 'straw_post', -280, -151, 0, { marks: 'camp_post_3' }));
  for (const z of [-146, -151]) items.push(item(A, 'spear_rack', -276, z, -Math.PI / 2));
  for (const [x, z] of [[-277, -141], [-277, -157]]) {
    items.push(item(A, 'banner_tall_pole', x, z));
    items.push(item(A, 'banner_tall_cloth', x, z, -Math.PI / 2, { y: 6.3 }));
  }
  // The fire, the stores and the armoury, by the trail.
  items.push(item(A, 'rice_kettle', -298.2, -132.6));
  items.push(item(A, 'kettle_coals', -298.2, -132.6));
  for (const [x, z] of [[-301, -129.5], [-303.5, -127]]) items.push(item(A, 'supply_stack', x, z, 0.6));
  for (const [x, z, yaw] of [[-293.5, -126.5, 0.5], [-291.5, -124, 0.2], [-293.5, -130.5, 0.9]]) items.push(item(A, 'rifle_rack', x, z, yaw + Math.PI));
  // Dead telegraph poles follow the trail in from the town side.
  for (const s of [6, 18, 29]) items.push(f.put(A, 'telegraph_pole', s, -3.4, 0, 1, { outlying: s < 20 }));
  return Object.freeze({
    id: 'western_road_camp', place: 'P13', area: 'west', kit: A,
    centre: Object.freeze({ x: -297, z: -136 }), along: Object.freeze({ x: -0.531, z: -0.848 }),
    tallMark: 'watchtower', road: 'hunters_loop_west',
    sentries: Object.freeze([f.at(34, 1.7), f.at(88, -1.7)].map(([x, z]) => Object.freeze({ x: round(x), z: round(z) }))),
    items: Object.freeze(items),
  });
}

// ── Band 2's three smaller places ──────────────────────────────────────────
// Same item format as the camps. They have no sentries and no tall mark of
// their own unless the plan says so; each is dressed from kits already made.
function swordHall() {
  const A = 'akitsu';
  const items = [
    item(A, 'tent_officer', -229, -55, -Math.PI / 2), // the hall itself: its front faces the door spot
    item(A, 'tent_bell', -228, -64, -Math.PI / 2), // where the students sleep
    item(A, 'spear_rack', -239, -65, 0), // wooden practice swords
    item(A, 'banner_tall_pole', -237.5, -57.5),
    item(A, 'banner_tall_cloth', -237.5, -57.5, -Math.PI / 2, { y: 6.3 }),
    item('valley', 'grave_stone', -242, -52, Math.PI / 2, { marks: 'hall_grave' }),
  ];
  // A curtain along the north side shuts the practice ground off from the road.
  for (const x of [-236, -232, -228]) items.push(item(A, 'curtain_run', x, -49.5, 0));
  items.push(item(A, 'curtain_post', -226, -49.5));
  return Object.freeze({ id: 'sword_hall', place: 'P14', area: 'west', kit: A, centre: Object.freeze({ x: -235, z: -60 }), items: Object.freeze(items) });
}

function shadowRavine() {
  const T = 'tameri';
  const items = [];
  // Four fire bowls square the ground where the Priestess speaks the rite: at the ravine's mouth,
  // not in it. The ravine is one of the game's own monster camps, and its four spawns stand 19 m
  // and more from here; the dead the player frees are met inside.
  for (const [dx, dz] of [[-2.8, 2.8], [2.8, 2.8], [-2.8, -2.8], [2.8, -2.8]]) {
    items.push(item(T, 'brazier_bowl', 333 + dx, -152 + dz));
    items.push(item(T, 'brazier_flame', 333 + dx, -152 + dz));
  }
  // One marker for each of the five who can be named.
  for (const [x, z] of [[345, -176.5], [347, -175], [348.6, -173], [349.2, -170.6], [346.4, -178.4]]) items.push(item('valley', 'stela', x, z, -Math.PI / 4));
  // At the ravine's mouth: the rite's stores under an awning, and one staff so the place is seen from the trail.
  items.push(item(T, 'awning', 328.5, -146.5, Math.PI));
  items.push(item(T, 'jar_rack', 327.5, -149.8, Math.PI / 2));
  items.push(item(T, 'flagstaff', 335, -146.8));
  items.push(item(T, 'pennant', 335, -146.8, 0, { y: 12.6 }));
  return Object.freeze({ id: 'shadow_ravine', place: 'P26', area: 'east', kit: T, centre: Object.freeze({ x: 340, z: -165 }), items: Object.freeze(items) });
}

function firstFurrow() {
  const R = 'remoria';
  // The furrow runs from (-262, 410) to (-218, 426), 18 m north of the Hunter's Loop and beside it.
  // The plough and the cart are long along their own X (the plough pulls toward +X), so each is
  // turned a quarter less than the furrow's heading to lie along it, pointing up the line.
  const along = yawToward(44, 16) - Math.PI / 2;
  const items = [
    item(R, 'plough', -264.35, 409.15, along), // waiting at the furrow's start
    item('valley', 'wagon', -267, 404.5, along), // the plough cart, with the archer's case
    item(R, 'boundary_stone', -214.3, 430.6), // ready to be set where the furrow ends
    item(R, 'standard_wolf', -270, 409, Math.PI / 2), // the colony's first standard
    item(R, 'rack_arms', -268.5, 401.5, 0),
    item(R, 'brazier_iron', -272, 405.5),
    item(R, 'brazier_fire', -272, 405.5),
  ];
  return Object.freeze({ id: 'first_furrow', place: 'P36', area: 'north', kit: R, centre: Object.freeze({ x: -240, z: 400 }), road: 'hunters_loop_north', items: Object.freeze(items) });
}

export const CAMP_PLANS = Object.freeze([westernRoadCamp(), theLanding(), castraLupa()]);
export const BAND2_PLACE_PLANS = Object.freeze([swordHall(), shadowRavine(), firstFurrow()]);
export const campPlan = id => [...CAMP_PLANS, ...BAND2_PLACE_PLANS].find(plan => plan.id === id) || null;

/** How many of each piece a plan uses: one batch (one draw call) per entry. */
export function campPlanBatches(plan) {
  const counts = new Map();
  for (const entry of plan.items) counts.set(entry.kit + ':' + entry.piece, (counts.get(entry.kit + ':' + entry.piece) || 0) + 1);
  return counts;
}
