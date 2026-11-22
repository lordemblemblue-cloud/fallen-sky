// The town's places, P01 to P07 (03_QUEST_PLAN.md section 3, "Town").
// Centres are LOCAL Wolfveil metres; pieces and anchors are relative to them.
// Where a layout's centre differs from pledgePlaces.mjs, it is because the
// pieces of one place sit in two spots (the gate and its yard) and the
// layout's circle has to hold both; the places table keeps the plan's points.
import { TINT, p, wagon } from './layoutKit.mjs';

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

export const TOWN_PLACES = Object.freeze([P04]);
