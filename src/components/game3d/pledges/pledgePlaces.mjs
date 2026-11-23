// The 49 places of the three-empire quest plan
// (docs/game3d/three-empires/03_QUEST_PLAN.md, section 3), as pure data.
// Nothing in the game reads this yet, and nothing is built from it.
//
// Coordinates are Wolfveil LOCAL metres (x east, z north); the game world adds
// 70 m to z. A surface place has an `area`; a place under the valley has a
// `region` (a separate scene) and its x/z is where its mouth is on the surface.
//
// - `id` (P01 to P49) is the plan's number and is what pledge steps use as
//   `placeId`. `key` is a plain description that does not depend on the
//   story's names. `name` is the plan's draft name: the story is not approved
//   yet, so treat names as placeholders and never show them without checking.
// - `state`: 'here' = the land or landmark is already in the game;
//   'new' = it has to be built.
// - `radius`: from the plan for P08, P24 and P35 (half the width it gives);
//   from the game's own data for places that already have one (camp hollows,
//   fighting grounds, the lake); otherwise a default of 25 m. P01 and P12 are
//   small single objects and use less.
// - Where the plan gives two coordinates or a line, the first is the centre
//   and the other is kept in `also`.
// - `approx: true` marks a coordinate the plan does not give in numbers.
const DEFAULT_RADIUS = 25;
export const PLEDGE_PLACE_Z_OFFSET = 70;

const surface = (id, key, name, area, x, z, state, extra = {}) => Object.freeze({
  id, key, name, area, region: null, mouthArea: null, x, z,
  radius: DEFAULT_RADIUS, state, approx: false, also: null, ...extra,
});
const under = (id, key, name, region, mouthArea, x, z, extra = {}) => Object.freeze({
  id, key, name, area: null, region, mouthArea, x, z,
  radius: 20, state: 'here', approx: false, also: null, ...extra,
});
const point = (x, z) => Object.freeze({ x, z });

export const PLEDGE_PLACES = Object.freeze([
  // Town (safe ground)
  surface('P01', 'oath_tree', 'Oath Tree and Truce Stone', 'town', 0, -70, 'here', { radius: 15 }),
  // The plan says "three of the plaza's houses" and names no coordinate: this
  // is the plaza itself (130 x 141 m around its centre) until the houses are chosen.
  surface('P02', 'three_lodges', 'The Three Lodges', 'town', 0, -70, 'here', { radius: 60, approx: true }),
  // "North side of the plaza": the plaza's north edge is at z = 0.5.
  surface('P03', 'lantern_wall', 'Lantern Wall', 'town', 0, -5, 'new', { radius: 15, approx: true }),
  surface('P04', 'south_gate', 'Southern Wolf Gate and wagon yard', 'town', 0, -225, 'here', { also: point(70, -210) }),
  surface('P05', 'training_grounds', 'Training Grounds', 'town', -165, 88, 'here'),
  surface('P06', 'field_of_standards', 'Field of Standards', 'town', -110, 170, 'new'),
  surface('P07', 'wolf_sanctuary', 'Wolf Sanctuary and the Keepers\' workroom', 'town', 4, 220, 'here', { radius: 20, also: point(70, 190) }),

  // South, the Gate Fields
  surface('P08', 'threshing_floor', 'Threshing Floor', 'south', 25, -390, 'here', { radius: 42.5 }),
  surface('P09', 'granary_mill', 'Granary and Mill', 'south', -130, -350, 'new'),
  surface('P10', 'three_fields', 'The Three Fields', 'south', -130, -450, 'new'),
  surface('P11', 'farmsteads', 'Farmsteads and beehives', 'south', 90, -330, 'new'),
  surface('P12', 'old_barrow', 'The Old Barrow', 'south', 20, -500, 'new', { radius: 15 }),

  // West, the Cedar Wilds
  surface('P13', 'west_forward_camp', 'Camp of the Western Road', 'west', -297, -136, 'new'),
  surface('P14', 'west_sword_hall', 'House Asagiri\'s Hall', 'west', -235, -60, 'new'),
  surface('P15', 'wintering_shrine', 'The Wintering Shrine', 'west', -320, 65, 'new'),
  surface('P16', 'railhead', 'Railhead and Cutting', 'west', -250, 130, 'new'),
  surface('P17', 'bears_den', 'The Bear\'s Den', 'west', -330, -30, 'new'),
  surface('P18', 'wolf_stones', 'Wind-Carved Wolf Stones', 'west', -325, 235, 'here', { radius: 18 }),
  surface('P19', 'star_iron_mine', 'The Singing Seam', 'west', -450, -450, 'new'),
  surface('P20', 'deserters_hearth', 'The Deserters\' Hearth', 'west', -270, -430, 'new'),
  surface('P21', 'rookery', 'The Crow-Monks\' Rookery', 'west', -505, 90, 'new'),
  surface('P22', 'burned_banner_field', 'The Burned Banner-Field', 'west', -390, -190, 'here', { radius: 24 }),
  surface('P23', 'west_home_road', 'The Cedar Road', 'west', -525, 40, 'new'),

  // East, the Riverlands
  surface('P24', 'east_forward_camp', 'The Landing', 'east', 272, -424, 'new', { radius: 40 }),
  surface('P25', 'pontoon_bridge', 'The Pontoon Bridge', 'east', 215, -390, 'new'),
  surface('P26', 'shadow_ravine', 'Shadow Ravine', 'east', 340, -165, 'here', { radius: 24 }),
  surface('P27', 'ruined_watch', 'Ruined Watch Station', 'east', 295, -205, 'here', { radius: 19 }),
  surface('P28', 'old_quarry', 'Quarry of the Ancestors', 'east', 350, -40, 'here', { radius: 30 }),
  surface('P29', 'forge_camp', 'The Hundred Hearths', 'east', 270, 170, 'new'),
  surface('P30', 'hidden_waterfall', 'Hidden Waterfall', 'east', 142, 179, 'here'),
  surface('P31', 'river_ford', 'The Reed Elder\'s Ford', 'east', 165, 35, 'new'),
  surface('P32', 'scarab_hollow', 'Scarab Hollow', 'east', 470, -380, 'new'),
  surface('P33', 'drowned_chariot', 'The Drowned Chariot', 'east', 170, -470, 'new'),
  surface('P34', 'east_home_road', 'The River Road', 'east', 238, -520, 'new'),

  // North, the Highlands
  surface('P35', 'north_fort', 'Castra Lupa', 'north', -66, 383, 'new', { radius: 35 }),
  surface('P36', 'first_furrow', 'The First Furrow', 'north', -240, 400, 'here', { radius: 52 }),
  surface('P37', 'hot_springs', 'Hot Springs and the Bellows Forge', 'north', -105, 330, 'here'),
  surface('P38', 'vortex_lake', 'Vortex Lake', 'north', 205, 320, 'here', { radius: 43 }),
  // A line of arches from the lake outflow toward the fort.
  surface('P39', 'aqueduct_works', 'The Aqueduct Works', 'north', 150, 300, 'new', { also: point(80, 320) }),
  surface('P40', 'wolf_ear_vigil', 'Wolf-Ear Vigil', 'north', 2, 470, 'here'),
  surface('P41', 'harpy_roost', 'The Harpy Roost', 'north', 410, 370, 'new'),
  surface('P42', 'bronze_sentinel', 'The Bronze Sentinel', 'north', -370, 390, 'new'),
  surface('P43', 'north_home_road', 'The High Road', 'north', 150, 428, 'new'),

  // Under the valley: separate scenes that are already in the game.
  under('P44', 'jade_grotto', 'Jade Lantern Grotto', 'wolfveil-caves', 'west', -360, -400),
  under('P45', 'root_hollow', 'Whispering Root Hollow', 'wolfveil-caves', 'north', -500, 300),
  under('P46', 'inkstone_cistern', 'Sunken Inkstone Cistern', 'wolfveil-caves', 'north', -40, 500),
  under('P47', 'crystal_vault', 'Echoing Crystal Vault', 'wolfveil-caves', 'east', 500, -36),
  // No mouth of its own ("reached through the cave tunnels"): x/z is the
  // room's centre in the cave layout (WolfveilCaveLayout.mjs), not from the plan.
  under('P48', 'wolf_rotunda', 'The Wolf Rotunda', 'wolfveil-caves', null, -6, 24, { radius: 46, approx: true }),
  // "Through the Vortex Lake": x/z is the lake's portal mouth
  // (VortexLakeLayout.mjs), not from the plan.
  under('P49', 'lunar_cave', 'The Lunar Cave', 'lunar-cave', 'north', 215, 358, { approx: true }),
]);

const BY_ID = new Map(PLEDGE_PLACES.map((place) => [place.id, place]));
const BY_KEY = new Map(PLEDGE_PLACES.map((place) => [place.key, place]));

// A place by its plan number ('P01') or by its key ('oath_tree').
export function pledgePlace(id) {
  return BY_ID.get(id) || BY_KEY.get(id) || null;
}

export function pledgePlacesInArea(area) {
  return PLEDGE_PLACES.filter((place) => place.area !== null && place.area === area);
}

export function pledgePlacesInRegion(region) {
  return PLEDGE_PLACES.filter((place) => place.region !== null && place.region === region);
}

// The surface place a local point stands in: of every place whose circle holds
// the point, the smallest, then the nearest. With `mouths: true` the mouths of
// the places under the valley count too. Null when the point is in none.
export function pledgePlaceAtLocal(x, z, { mouths = false } = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const place of PLEDGE_PLACES) {
    if (place.area === null && !(mouths && place.mouthArea !== null)) continue;
    const distance = Math.hypot(place.x - x, place.z - z);
    if (distance > place.radius) continue;
    if (!best || place.radius < best.radius ||
        (place.radius === best.radius && distance < bestDistance)) {
      best = place;
      bestDistance = distance;
    }
  }
  return best;
}

// The same for a position in the game world's frame.
export function pledgePlaceAtWorld(position, options = {}) {
  if (!position) return null;
  return pledgePlaceAtLocal(Number(position.x), Number(position.z) - PLEDGE_PLACE_Z_OFFSET, options);
}
