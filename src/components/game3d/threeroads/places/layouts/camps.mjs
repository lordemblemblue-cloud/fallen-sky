// Band 2's three army camps and its three smaller places (House Asagiri's
// Hall, Shadow Ravine, the First Furrow) as place layouts, made from the lead's plans
// (threeroads/land/campPlans.mjs; docs/game3d/three-empires/CAMPS_BAND2.md).
// Nothing is retyped here: every piece comes from a plan item. This file adds
// only what the plans leave to the places session: which pieces are the
// camp's landmark, the tints of the cloths, how a piece on a lip stands,
// painted ground and the camps' few lights.
//
// All of them are `preview: true`: they are built only with
// ?threeRoads=1&threeRoadsPreview=1 until the lead marks band 2 finished.
import { CAMP_PLANS, BAND2_PLACE_PLANS } from '../../land/campPlans.mjs';
import { TINT } from './layoutKit.mjs';

// The cloths each camp flies.
const CAMP_TINT = Object.freeze({
  curtain_run: TINT.akitsu, banner_tall_cloth: TINT.akitsu,
  pennant: TINT.tameri,
});
// Drawn from anywhere in the area: each camp's tall mark, and what hangs on it.
const LANDMARK = Object.freeze({
  western_road_camp: new Set(['watchtower']),
  the_landing: new Set(['flagstaff', 'pennant']),
  castra_lupa: new Set(['gate_tower', 'gate_span']),
  // "one staff so the place is seen from the trail"
  shadow_ravine: new Set(['flagstaff', 'pennant']),
});
// Pieces that stand on the lip of the gorge and reach out over it.
const ON_A_LIP = new Set(['landing_stage', 'hoist']);
// Outlying pieces this far from their camp's centre are a place of their own.
const OWN_PLACE_BEYOND = 80;
const OWN_PLACE = Object.freeze({ road_arch: Object.freeze({ id: 'P43', key: 'high_road_arch' }) });

// Pieces moved off their planned spot because the game's ground says so, as
// metres along the piece's own facing (+ forward). Each is reported to the lead,
// whose plan keeps the original point.
//   road_arch: at (9, 524) the High Road crosses the Inkstone Cistern's
//     cave-approach benches (installed at runtime by WolfveilCaveAccessPlan.mjs):
//     the ground across the road differs by 9 to 20 m between 45 m south and
//     10 m north of the point, so the arch's two posts would stand 11.5 m apart
//     in height. 15 m further along the road the ground is level across it at
//     127.5 m, the flat crest the plan describes.
// None now: the lead moved the High Road (and its arch) onto the Hunter's Loop after this was reported.
export const CAMP_GROUND_MOVES = Object.freeze({});
const moved = item => {
  const ahead = CAMP_GROUND_MOVES[item.piece];
  if (!ahead) return item;
  return { ...item, x: Math.round((item.x + Math.sin(item.yaw) * ahead) * 100) / 100, z: Math.round((item.z + Math.cos(item.yaw) * ahead) * 100) / 100 };
};

const reachOf = item => (item.piece === 'barge' ? 8 : item.piece === 'pavilion_life' ? 5 : 4);

function piecesOf(plan, items, centre) {
  const landmark = LANDMARK[plan.id] || new Set();
  return items.map(item => ({
    kit: item.kit, piece: item.piece,
    x: item.x - centre.x, z: item.z - centre.z, yaw: item.yaw,
    ...(item.y ? { y: item.y } : {}),
    ...(item.afloat ? { afloat: true } : {}),
    ...(CAMP_TINT[item.piece] !== undefined && item.kit === plan.kit ? { tint: CAMP_TINT[item.piece] } : {}),
    ...(landmark.has(item.piece) ? { landmark: true } : {}),
    ...(ON_A_LIP.has(item.piece) ? { ground: 'high' } : {}),
    // A mounted piece (a gate span, a pennant) hangs that high over the ground under its own centre.
    ...(item.y && !ON_A_LIP.has(item.piece) ? { ground: 'pivot' } : {}),
    ...(item.marks ? { marks: item.marks } : {}),
  }));
}

function radiusFor(items, centre) {
  let r = 10;
  for (const item of items) r = Math.max(r, Math.hypot(item.x - centre.x, item.z - centre.z) + reachOf(item));
  return Math.ceil(r);
}

// A point `s` metres along a plan's road and `t` to its right, as the plans
// write their road frames (campPlans.mjs, roadFrame).
const along = (plan, s, t) => ({
  x: plan.centre.x + s * plan.along.x + t * plan.along.z,
  z: plan.centre.z + s * plan.along.z - t * plan.along.x,
});
const rel = (centre, p) => [p.x - centre.x, p.z - centre.z];

// Painted ground and lights, per camp (relative to the camp's centre).
const DRESSING = Object.freeze({
  // The drill yard on the flat east of the trail, round the three straw posts.
  western_road_camp: centre => ({
    ground: [{ surface: 'yard', quad: [[-288, -158], [-276, -158], [-276, -140], [-288, -140]].map(([x, z]) => [x - centre.x, z - centre.z]) }],
    lights: [{ x: -298.2 - centre.x, z: -132.6 - centre.z, y: 1.1, colour: 0xff9a4a, intensity: 3, distance: 11, flicker: true }],
  }),
  // The worn path the jars are carried on, from the head of the stage's plank
  // up to the grain stacks.
  the_landing: centre => ({
    ground: [{ surface: 'packed_earth', strip: [263.5 - centre.x, -425 - centre.z, 279 - centre.x, -416 - centre.z, 2.6] }],
    lights: [{ x: 287 - centre.x, z: -437.5 - centre.z, y: 1.7, colour: 0xff8a3a, intensity: 4, distance: 12, flicker: true }],
  }),
  // The cross street, where it meets the path at the standard.
  // The hall's practice yard: worn ground between the banner, the rack and the
  // tents, south of the curtain.
  sword_hall: centre => ({
    ground: [{ surface: 'yard', quad: [[-243, -63], [-233, -63], [-233, -53.5], [-243, -53.5]].map(([x, z]) => [x - centre.x, z - centre.z]) }],
    lights: [],
  }),
  // The four fire bowls light the rite at the ravine's mouth; one real light between them.
  shadow_ravine: centre => ({
    ground: [],
    lights: [{ x: 333 - centre.x, z: -152 - centre.z, y: 1.6, colour: 0xff8a3a, intensity: 4, distance: 11, flicker: true }],
  }),
  // The furrow's marked course, from furrow_1 to furrow_end (script/band2.mjs).
  first_furrow: centre => ({
    ground: [{ surface: 'field_ploughed', strip: [-262 - centre.x, 410 - centre.z, -218 - centre.x, 426 - centre.z, 1.4] }],
    lights: [],
  }),
  castra_lupa: (centre, plan) => {
    const [lx, lz] = rel(centre, along(plan, 8, 0));
    return {
      ground: [{ surface: 'packed_earth', strip: [...rel(centre, along(plan, 10, -18)), ...rel(centre, along(plan, 10, 18)), 4] }],
      lights: [{ x: lx, z: lz, y: 1.8, colour: 0xff9a4a, intensity: 4, distance: 12, flicker: true }],
    };
  },
});

function campPlaces(plan) {
  const centre = plan.centre;
  const own = [], home = [];
  for (const planned of plan.items) {
    const item = moved(planned);
    const far = item.outlying && Math.hypot(item.x - centre.x, item.z - centre.z) > OWN_PLACE_BEYOND;
    (far ? own : home).push(item);
  }
  const dressing = DRESSING[plan.id]?.(centre, plan) || {};
  const places = [Object.freeze({
    id: plan.place, key: plan.id, area: plan.area, x: centre.x, z: centre.z,
    radius: radiusFor(home, centre), preview: true, camp: plan.id, merge: true,
    pieces: piecesOf(plan, home, centre),
    ground: dressing.ground || [], lights: dressing.lights || [],
    anchors: Object.fromEntries((plan.sentries || []).map((spot, i) => [`sentry_${i + 1}`, { x: spot.x - centre.x, z: spot.z - centre.z, facing: 0 }])),
  })];
  for (const item of own) {
    const meta = OWN_PLACE[item.piece] || { id: plan.place + '_' + item.piece, key: item.piece };
    const at = { x: item.x, z: item.z };
    places.push(Object.freeze({
      id: meta.id, key: meta.key, area: plan.area, x: at.x, z: at.z, radius: 8, preview: true, camp: plan.id,
      pieces: piecesOf(plan, [item], at), ground: [], lights: [],
      anchors: { [item.piece]: { x: 0, z: 0, facing: item.yaw } },
    }));
  }
  return places;
}

export const CAMP_PLACES = Object.freeze([...CAMP_PLANS, ...BAND2_PLACE_PLANS].flatMap(campPlaces));
