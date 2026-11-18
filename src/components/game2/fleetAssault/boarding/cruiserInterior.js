// Fleet Assault · the inside of a cruiser, built with Game 2's level kit (engine/level/kit.js -> builder.js), so it walks,
// collides, blocks sight / bolts / the camera and has a navigation grid exactly like the story mission's levels.
// Original geometry. Every station sits on the point the match server checks (server/game2/fleet/rules.mjs
// INTERIOR.stations), at the same height, and everything fits inside INTERIOR.bounds (the server clamps positions to it).
//
// Floor plan (metres, +X starboard, +Z aft; the bow is -Z). Floors at y = 0 unless noted:
//   hangar            x -14..14  z  -8..9      boarding craft dock here (station 'hangar' [0, 0, 0])
//   spine corridor    x  -3..3   z -30..-8
//   engineering hall  x -32..32  z -50..-30    weapons battery [-24, 0, -40] west · hyperdrive [24, 0, -40] east
//   forward corridor  x  -3..3   z -62..-50
//   generator deck    x -30..30  z -94..-62    raised decks at y = 4 (ramps from the middle floor):
//                                              shield generator [-18, 4, -80] west · communications [18, 4, -80] east
//   bridge ramp       x  -4..4   z -115..-94   climbs from y = 0 to y = 8
//   bridge            x -14..14  z -136..-115  floor y = 8 · the commander's post [0, 8, -120]
import { layoutKit } from '../../engine/level/kit.js';
import { INTERIOR } from '../../../../../server/game2/fleet/rules.mjs';

export const STATION_LABELS = Object.freeze({
  hangar: 'Hangar', weapons: 'Weapons battery', hyperdrive: 'Hyperdrive', shields: 'Shield generator', comms: 'Communications', bridge: 'Bridge',
});
// where the trooper garrison stands guard (INTERIOR.garrison of them at full strength), and where reinforcements come in
export const GARRISON_POSTS = Object.freeze([
  { pos: [-10, 0, -5], yaw: 0.4 }, { pos: [10, 0, -5], yaw: -0.4 },
  { pos: [0, 0, -22], yaw: 0 },
  { pos: [-16, 0, -45], yaw: 0.6 }, { pos: [16, 0, -35], yaw: -0.4 },
  { pos: [0, 0, -78], yaw: 0 }, { pos: [20, 4, -88], yaw: -0.5 },
  { pos: [-8, 8, -126], yaw: 0.3 },
]);
export const REINFORCE_POINTS = Object.freeze([[0, 0, -56], [-28, 0, -32], [28, 0, -48], [-24, 0, -66], [24, 0, -66], [0, 8, -133]]);
export const COMMANDER_POST = Object.freeze({ pos: INTERIOR.stations.bridge.slice(), yaw: 0 }); // facing aft, toward the ramp
export const NAV_PROBE = 9; // the bridge deck (y = 8) is the highest floor characters walk on

const LOOKS = {
  republic: { wall: 'hull', trim: 'panel', dark: 'hullDark', glow: 'red', light: 'white' },
  separatist: { wall: 'sand', trim: 'metal', dark: 'rockDark', glow: 'orange', light: 'orange' },
};

export function cruiserLayout(side = 'republic') {
  const look = LOOKS[side] || LOOKS.republic;
  const k = layoutKit('cruiser_interior_' + side, side === 'republic' ? 7101 : 7202);
  const L = k.L;
  L.ground = { x0: -36, z0: -140, x1: 36, z1: 10, y: 0, mat: 'floor', tile: 4 };
  L.navBounds = [-35, -139, 35, 9.5];
  L.navProbe = NAV_PROBE;
  L.playerSpawn = INTERIOR.stations.hangar.slice(); L.playerYaw = Math.PI;
  L.env = { sunDir: [0.25, 0.92, 0.3], sunCol: [0.4, 0.43, 0.5], ambTop: [0.44, 0.47, 0.58], ambBot: [0.15, 0.15, 0.19], fogCol: [0.04, 0.05, 0.08], fogD: 0.011 };

  // a bulkhead between two corners (as kit.wall) whose top is not a floor: with the navigation probe up at the bridge
  // deck, a walkable wall or doorway lintel would read as floor and seal the doorway for the troopers
  const wall = ({ x0, z0, x1, z1, h, mat, gaps = [] }) => {
    const alongX = (x1 - x0) >= (z1 - z0), lo = alongX ? x0 : z0, hi = alongX ? x1 : z1;
    const piece = (a, b, ya, yb) => { if (b - a < 0.01 || yb - ya < 0.01) return; if (alongX) k.solid([a, ya, z0], [b, yb, z1], mat, false); else k.solid([x0, ya, a], [x1, yb, b], mat, false); };
    let cur = lo;
    for (const gp of gaps.slice().sort((p, q) => p.a - q.a)) { piece(cur, gp.a, 0, h); if (gp.top != null && gp.top < h) piece(gp.a, gp.b, gp.top, h); cur = gp.b; }
    piece(cur, hi, 0, h);
  };
  // a deck section by its inner rectangle: bulkheads outside it (doorways as gaps), a roof nobody can stand on, a
  // ceiling record (no jumping through it), light strips under the roof
  const deck = ({ x0, z0, x1, z1, ceil, t = 0.5, sides = {}, skip = [], strips = look.light, mat = look.wall }) => {
    const S = n => sides[n] || {};
    if (!skip.includes('s')) wall({ x0: x0 - t, z0: z0 - t, x1: x1 + t, z1: z0, h: ceil, mat, gaps: S('s').gaps });
    if (!skip.includes('n')) wall({ x0: x0 - t, z0: z1, x1: x1 + t, z1: z1 + t, h: ceil, mat, gaps: S('n').gaps });
    if (!skip.includes('w')) wall({ x0: x0 - t, z0, x1: x0, z1, h: ceil, mat, gaps: S('w').gaps });
    if (!skip.includes('e')) wall({ x0: x1, z0, x1: x1 + t, z1, h: ceil, mat, gaps: S('e').gaps });
    k.solid([x0 - t, ceil, z0 - t], [x1 + t, ceil + 0.5, z1 + t], look.dark, false);
    L.interiors.push({ x0, z0, x1, z1, ceil });
    const alongX = (x1 - x0) >= (z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (strips) for (const o of [-0.25, 0.25]) {
      if (alongX) k.deco([x0 + 1, ceil - 0.08, cz + o * (z1 - z0) - 0.12], [x1 - 1, ceil, cz + o * (z1 - z0) + 0.12], strips);
      else k.deco([cx + o * (x1 - x0) - 0.12, ceil - 0.08, z0 + 1], [cx + o * (x1 - x0) + 0.12, ceil, z1 - 1], strips);
    }
  };
  // a ramp up to a raised deck along -Z, landing on a thin lip so no wall face stands across its top (as on Kejim Post)
  const rampUp = (x0, x1, zLow, zTop, y1, mat = 'grate') => {
    k.ramp({ x0, z0: zTop, x1, z1: zLow, y0: 0, y1, dir: '-z', mat });
    k.solid([x0, y1 - 0.1, zTop - 0.65], [x1, y1, zTop + 0.05], 'grate');
  };
  // a station: the machine against the wall, a console beside the station point, a glow strip and a lamp
  const console_ = (x, y, z) => { k.solid([x - 0.5, y, z - 1.2], [x + 0.5, y + 1.1, z + 1.2], 'console'); k.deco([x - 0.55, y + 1.1, z - 1.0], [x + 0.55, y + 1.18, z + 1.0], 'blue'); };

  // ---------- hangar: the bay the boarding craft flew through (rules CRUISER.bay runs across the hull), a force field at
  // each mouth (port and starboard walls); the craft sits where it came to rest, behind the arrival point
  deck({ x0: -14, z0: -8, x1: 14, z1: 9, ceil: 9, sides: { s: { gaps: [{ a: -3, b: 3, top: 5 }] } } });
  for (const x of [-14.02, 13.9]) k.deco([x, 0.4, -6.5], [x + 0.12, 7.6, 7.5], 'blue');   // the hangar force fields
  k.solid([-5, 0, 3.8], [5, 2.4, 8.2], look.dark); k.deco([-3.6, 2.4, 4.4], [3.2, 3.1, 7.6], look.dark); // the boarding craft, nose to starboard
  k.deco([5, 0.9, 5.2], [5.08, 1.9, 6.8], 'blue'); k.deco([-1.8, 0.9, 3.72], [1.8, 1.9, 3.8], 'blue'); // canopy glow, its open hatch
  for (const x of [-13.5, 13.5]) for (const z of [-6, 0, 6]) k.lamp([x, 6, z], look.light);
  k.deco([-14, 0, -0.1], [14, 0.02, 0.1], 'hazard'); k.deco([-0.1, 0, -8], [0.1, 0.02, 3.4], 'hazard');
  k.crates(-11, 3, 3); k.crates(9.6, 2, 2); k.solid([-12.5, 0, -7.5], [-10.5, 1.4, -6], look.dark); k.solid([10.5, 0, -7.5], [12.5, 1.4, -6], look.dark);
  for (const [x, z] of [[-7, 6], [7, 6.5], [12, -2]]) k.prop('barrel', x, z);

  // ---------- spine corridor
  deck({ x0: -3, z0: -30, x1: 3, z1: -8, ceil: 5, skip: ['s', 'n'], strips: look.glow });
  for (const z of [-26, -18, -11]) { k.deco([-3.02, 1.2, z - 1], [-2.95, 3.2, z + 1], look.trim); k.deco([2.95, 1.2, z - 1], [3.02, 3.2, z + 1], look.trim); }
  k.lamp([0, 4.6, -19], look.light);

  // ---------- engineering hall: weapons battery (west) and hyperdrive (east)
  deck({ x0: -32, z0: -50, x1: 32, z1: -30, ceil: 7, sides: { n: { gaps: [{ a: -3, b: 3, top: 5 }] }, s: { gaps: [{ a: -3, b: 3, top: 5 }] } } });
  k.solid([-31.8, 0, -46], [-28.5, 5, -34], look.dark); k.deco([-28.6, 0.6, -45], [-28.45, 4.4, -35], 'red');            // weapons battery
  for (const z of [-44, -40, -36]) k.deco([-30.5, 5, z - 0.6], [-29.3, 6.4, z + 0.6], 'metalDark');                        // breeches
  console_(-26.5, 0, -40);
  k.solid([28.5, 0, -46], [31.8, 6, -34], look.dark); k.deco([28.45, 1, -44], [28.6, 5.2, -36], 'blue');                 // hyperdrive
  k.deco([29, 6, -44], [31.4, 6.6, -36], 'blue');
  console_(26.5, 0, -40);
  for (const x of [-11.25, 11.25]) k.solid([x - 0.75, 0, -40.75], [x + 0.75, 7, -39.25], look.trim);                        // pillars
  k.crates(-6, -46, 2); k.crates(5, -33.5, 3); k.crates(-19, -33, 2); k.crates(19, -47, 2);
  for (const [x, z] of [[-24, -40], [24, -40], [0, -40], [-12, -34], [12, -46]]) k.lamp([x, 6.4, z], x < 0 ? 'red' : x > 0 ? 'blue' : look.light);
  for (const [x, z] of [[-8, -36], [8, -44]]) k.prop('barrel', x, z);
  k.prop('crate', -15, -41); k.prop('crate', 15, -38);

  // ---------- forward corridor
  deck({ x0: -3, z0: -62, x1: 3, z1: -50, ceil: 5, skip: ['s', 'n'], strips: look.glow });
  k.lamp([0, 4.6, -56], look.light);

  // ---------- generator deck: raised decks (y = 4) with the shield generator (west) and the comms array (east)
  deck({ x0: -30, z0: -94, x1: 30, z1: -62, ceil: 11, sides: { n: { gaps: [{ a: -3, b: 3, top: 5 }] }, s: { gaps: [{ a: -4, b: 4, top: 10.5 }] } } });
  k.solid([-30, 0, -94], [-8, 4, -74.65], look.trim); rampUp(-12, -8, -64, -74, 4);
  k.solid([8, 0, -94], [30, 4, -74.65], look.trim); rampUp(8, 12, -64, -74, 4);
  k.solid([-29.5, 4, -86], [-24.5, 9, -77], look.dark); k.deco([-24.6, 4.6, -85], [-24.45, 8.4, -78], 'blue');            // shield generator
  k.deco([-28.5, 9, -85], [-25.5, 10.2, -78], 'blue');
  console_(-21.5, 4, -80);
  k.solid([24.5, 4, -86], [29.5, 6, -77], look.dark); k.solid([26.6, 6, -82.4], [27.4, 10.5, -80.6], 'metal');             // comms array + mast
  k.deco([24.45, 4.6, -85], [24.6, 5.6, -78], 'green'); k.lamp([27, 10.6, -81.5], 'green');
  console_(21.5, 4, -80);
  for (const x of [-8.05, 7.95]) k.deco([x, 4, -94], [x + 0.1, 4.9, -78.5], 'metalDark');                                  // deck edge rails (look only)
  k.crates(-4, -70, 2); k.crates(3, -88, 3); k.crates(-6, -90, 1); k.crates(-26, -66, 2); k.crates(22, -67, 2);
  for (const [x, z] of [[-18, -80], [18, -80], [0, -70], [0, -86]]) k.lamp([x, x ? 10 : 9.5, z], x < 0 ? 'blue' : x > 0 ? 'green' : look.light);
  for (const [x, z] of [[-14, -66], [14, -68], [2, -76]]) k.prop('barrel', x, z);

  // ---------- the climb to the bridge
  deck({ x0: -4, z0: -115.65, x1: 4, z1: -94, ceil: 13, skip: ['s', 'n'], strips: look.glow });
  rampUp(-4, 4, -95, -115, 8);
  k.lamp([0, 12.5, -104], look.light);

  // ---------- bridge (floor y = 8): viewports to the bow, crew consoles down both sides, a holotable before the post
  k.solid([-14, 0, -136], [14, 8, -115.65], look.dark);
  deck({ x0: -14, z0: -136, x1: 14, z1: -115.65, ceil: 15, sides: { n: { gaps: [{ a: -4, b: 4, top: 14.5 }] } } });
  k.deco([-11, 10, -136.02], [11, 13.4, -135.9], 'blue');
  k.solid([-13.6, 8, -132], [-12, 9.1, -121], 'console'); k.deco([-12.05, 9.1, -131], [-11.95, 9.7, -122], 'blue');
  k.solid([12, 8, -132], [13.6, 9.1, -121], 'console'); k.deco([11.95, 9.1, -131], [12.05, 9.7, -122], 'blue');
  k.solid([-1.6, 8, -130], [1.6, 9, -126.5], 'console'); k.deco([-1.4, 9, -129.8], [1.4, 9.08, -126.7], 'blue');
  for (const [x, z] of [[-8, -120], [8, -120], [0, -132]]) k.lamp([x, 14.4, z], look.light);
  k.lamp([0, 9.6, -128.2], 'blue');
  return L;
}
