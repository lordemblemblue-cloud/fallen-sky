// Natural-zone graph for Wolfveil (audit 2026-11-18, sections 3 and 5).
//
// Two layers:
//   * WOLFVEIL_NATURAL_ZONE_PROPOSAL: the Phase A border/doorway PROPOSAL from
//     the 2026-11-18 doorway survey. Candidate zones and authored doorways at
//     natural occluders. Status 'proposal': not built, not validated in play,
//     subject to the owner's review and the per-doorway checks of Phase C-E.
//   * WOLFVEIL_PROTOTYPE_ZONE_GRAPH: the Phase B prototype that IS built
//     (behind the natural-zones flag): the legacy valley plus two Jade Lantern
//     Grotto zones that load and unload completely.
//
// Pure data, no Three.js. Wolfveil LOCAL metres (Game 3D world Z = local + 70).
import {GROTTO_PLAN} from './WolfveilGrottoZonePlan.mjs';

const freeze = value => Object.freeze(value);
const freezeList = list => freeze(list.map(entry => freeze(entry)));

export const WOLFVEIL_NATURAL_ZONE_PROPOSAL = freeze({
  revision: 'wolfveil_natural_zones_proposal_20261118',
  status: 'proposal',
  zones: freezeList([
    {id: 'town', label: 'Wolfveil Town & Market', anchor: [0, -70],
      bounds: 'river west bank (x 100-120) to the forest trailheads (x -150), South Wolf Gate (z -225) to the sanctuary steps (z 200)',
      notes: 'Spawn, interiors and the whole market stay in one zone; no seam through the plaza.'},
    {id: 'south_fields', label: 'Southern Gate Fields', anchor: [0, -330],
      bounds: 'beyond the South Wolf Gate road bend', notes: 'Open grass: needs a gatehouse plus a road bend, not a veil.'},
    {id: 'west_trailhead', label: 'Western Trailheads & Training Grounds', anchor: [-165, 88],
      bounds: 'training clearings and the three western residential trailheads', notes: 'Training clearings stay wholly inside.'},
    {id: 'bluewood', label: 'Deep Bluewood / Cedar Wilds', anchor: [-320, 65],
      bounds: 'inland cedar forest west of the trailheads', notes: 'Dense trunks are the occluder.'},
    {id: 'wolf_stones', label: 'Wolf Stones & Cedar Spine', anchor: [-325, 235],
      bounds: 'west ridge above the forest', notes: 'High vantage: needs a ridge shell facade from every side.'},
    {id: 'east_bank', label: 'East Bank & River Housing', anchor: [180, -40],
      bounds: 'river east bank to the quarry choke', notes: 'Bridges belong to the town side until their east landings.'},
    {id: 'quarry', label: 'Quarry & Shadow Ravines', anchor: [350, -40],
      bounds: 'quarry bowl, ravine and ruined watch', notes: 'The bowl walls are natural occluders.'},
    {id: 'highfall', label: 'Highfall & Vortex Basin', anchor: [175, 250],
      bounds: 'waterfall, upper river and vortex lake as ONE water composition', notes: 'Never split the falls or the lake.'},
    {id: 'sanctuary', label: 'Sanctuary Approach', anchor: [4, 220],
      bounds: 'shrine terraces and the first ridge switchback', notes: 'Move the handoff off the shrine sightline (current z = 240 border).'},
    {id: 'highlands', label: 'Wolf-Ear Highlands', anchor: [2, 470],
      bounds: 'twin peaks, hot springs, snow ridge', notes: 'Gliding exposes the horizon: keep a stationary highland skyline.'},
    {id: 'grotto_hall', label: 'Jade Lantern Grotto · Entry Hall', anchor: [GROTTO_PLAN.anchors.hallLanding.x, GROTTO_PLAN.anchors.hallLanding.z],
      bounds: 'buried entry hall with a Z-turn', notes: 'Phase B prototype (built).'},
    {id: 'grotto_chamber', label: 'Jade Lantern Grotto · Lantern Chamber', anchor: [GROTTO_PLAN.chamber.centre.x, GROTTO_PLAN.chamber.centre.z],
      bounds: 'buried round chamber behind the inner door', notes: 'Phase B prototype (built).'},
  ]),
  // Authored doorways. `replaces` lists today's rectangle gates (and veils)
  // the doorway would retire; `occluder` is what actually hides the swap.
  doorways: freezeList([
    {id: 'grotto_mouth', between: ['town', 'grotto_hall'], kind: 'cave-mouth', at: [-360, -400], phase: 'B',
      status: 'prototype', replaces: ['dungeon ring jade_lantern_grotto'],
      occluder: 'rock arch with a 2.8 m dark throat; the hall is buried and turns twice', commit: 'relocate'},
    {id: 'grotto_inner', between: ['grotto_hall', 'grotto_chamber'], kind: 'stone-door', at: [GROTTO_PLAN.door.x, GROTTO_PLAN.door.z], phase: 'B',
      status: 'prototype', replaces: [], occluder: 'closed stone door at the end of the Z-turn', commit: 'walk'},
    {id: 'training_forest_choke', between: ['town', 'west_trailhead'], kind: 'forest-choke', at: [-150, 70], phase: 'C',
      status: 'proposal', replaces: ['town_west_training_forest', 'veil town_west'],
      occluder: 'curving cedar corridor with dark foreground trunks and a small spirit arch, 40-60 m inside the town side'},
    {id: 'west_residential_trailhead', between: ['town', 'west_trailhead'], kind: 'trailhead-lodge', at: [-160, -100], phase: 'E',
      status: 'proposal', replaces: ['town_west_west_residential', 'town_west_west_woodland_fork'],
      occluder: 'trailhead lodge + rock cut where the residential road meets the woods'},
    {id: 'south_residential_bend', between: ['town', 'west_trailhead'], kind: 'road-bend', at: [-185, -240], phase: 'E',
      status: 'proposal', replaces: ['town_west_south_residential'], occluder: 'embanked road bend with a wooded knoll'},
    {id: 'south_wolf_gatehouse', between: ['town', 'south_fields'], kind: 'gatehouse', at: [0, -225], phase: 'E',
      status: 'proposal', replaces: ['town_south_south_fields_way', 'veil town_south'],
      occluder: 'the existing South Wolf Gate plus a short winding road with earth banks (the field view is open)'},
    {id: 'market_bridge_east_landing', between: ['town', 'east_bank'], kind: 'bridge-landing', at: [134, -98], phase: 'D',
      status: 'proposal', replaces: ['town_east_market_bridge', 'veil town_east'],
      occluder: 'bank gatehouse at the east landing; the deck and the river stay continuous'},
    {id: 'footbridge_east_landing', between: ['town', 'east_bank'], kind: 'bridge-landing', at: [146, 35], phase: 'E',
      status: 'proposal', replaces: ['town_east_residential_footbridge'], occluder: 'landing gate between bank rocks'},
    {id: 'rope_bridge_east_landing', between: ['town', 'east_bank'], kind: 'bridge-landing', at: [173, 205], phase: 'E',
      status: 'proposal', replaces: ['town_east_outer_trail_bridge'], occluder: 'landing torii in the gorge rocks below Highfall'},
    {id: 'sanctuary_procession_arch', between: ['town', 'sanctuary'], kind: 'procession-arch', at: [4, 195], phase: 'E',
      status: 'proposal', replaces: ['town_north_ridge_path (part)', 'veil town_north'],
      occluder: 'shrine wall and procession arch behind a real turn of the stair'},
    {id: 'ridge_saddle', between: ['sanctuary', 'highlands'], kind: 'saddle', at: [20, 330], phase: 'E',
      status: 'proposal', replaces: ['town_north_ridge_path'], occluder: 'rocky saddle switchback above the shrine'},
    {id: 'cedar_spine_saddle', between: ['wolf_stones', 'highlands'], kind: 'saddle', at: [-409, 240], phase: 'E',
      status: 'proposal', replaces: ['west_north_hunters_loop_west'], occluder: 'saddle cut between wooded and bare slopes'},
    {id: 'hunters_loop_east_cut', between: ['quarry', 'highlands'], kind: 'gorge-cut', at: [344, 240], phase: 'E',
      status: 'proposal', replaces: ['east_north_hunters_loop_east'], occluder: 'narrow cut in the slope with a switchback'},
    {id: 'bluewood_trunk_gate', between: ['west_trailhead', 'bluewood'], kind: 'forest-choke', at: [-250, 70], phase: 'E',
      status: 'proposal', replaces: [], occluder: 'staggered giant trunks and a mossy stone gate'},
    {id: 'wolf_stones_switchback', between: ['bluewood', 'wolf_stones'], kind: 'switchback', at: [-325, 180], phase: 'E',
      status: 'proposal', replaces: [], occluder: 'climbing switchback through a ruined stone arch'},
    {id: 'quarry_choke', between: ['east_bank', 'quarry'], kind: 'rock-choke', at: [280, -80], phase: 'E',
      status: 'proposal', replaces: [], occluder: 'quarry approach rock choke after the river housing roads'},
    {id: 'highfall_gorge_bend', between: ['east_bank', 'highfall'], kind: 'gorge-bend', at: [150, 140], phase: 'E',
      status: 'proposal', replaces: [], occluder: 'gorge bend below the falls; spray curtain at the cave behind the falls'},
  ]),
});

// ------------------------------------------------------------ Phase B graph
export const WOLFVEIL_PROTOTYPE_ZONE_GRAPH = freeze({
  revision: 'wolfveil_zone_prototype_grotto_20261118',
  initialZone: 'surface',
  zones: freezeList([
    {id: 'surface', kind: 'legacy', label: 'Wolfveil valley (five-area loader, unchanged)'},
    {id: 'grotto_hall', kind: 'runtime', label: GROTTO_PLAN.hall.label},
    {id: 'grotto_chamber', kind: 'runtime', label: GROTTO_PLAN.chamber.label},
  ]),
  // Physical doors; each has two directional doorways in WolfveilGrottoZonePlan.
  doors: freezeList([
    {id: 'grotto_mouth', between: ['surface', 'grotto_hall'], commit: 'relocate', facade: 'grotto_mouth_arch'},
    {id: 'grotto_inner', between: ['grotto_hall', 'grotto_chamber'], commit: 'walk', facade: null},
  ]),
});

/**
 * Structural checks for a zone graph with directional doorways: every
 * doorway joins known zones, every door can be used in both directions, and
 * every zone is reachable from the initial zone.
 */
export function validateZoneGraph({zones = [], doorways = [], initialZone} = {}) {
  const errors = [];
  const ids = new Set(zones.map(zone => zone.id));
  if (!ids.has(initialZone)) errors.push('unknown initial zone ' + initialZone);
  const byDoor = new Map();
  for (const doorway of doorways) {
    if (!ids.has(doorway.from)) errors.push(doorway.id + ': unknown from ' + doorway.from);
    if (!ids.has(doorway.to)) errors.push(doorway.id + ': unknown to ' + doorway.to);
    if (doorway.from === doorway.to) errors.push(doorway.id + ': joins a zone to itself');
    if (!byDoor.has(doorway.door)) byDoor.set(doorway.door, []);
    byDoor.get(doorway.door).push(doorway);
  }
  for (const [door, list] of byDoor) {
    for (const doorway of list) {
      if (!list.some(other => other.from === doorway.to && other.to === doorway.from))
        errors.push(door + ': no reciprocal doorway for ' + doorway.from + ' -> ' + doorway.to);
    }
  }
  const seen = new Set([initialZone]), queue = [initialZone];
  while (queue.length) {
    const zone = queue.shift();
    for (const doorway of doorways) if (doorway.from === zone && !seen.has(doorway.to)) {
      seen.add(doorway.to); queue.push(doorway.to);
    }
  }
  for (const id of ids) if (!seen.has(id)) errors.push('zone ' + id + ' is unreachable');
  return errors;
}
