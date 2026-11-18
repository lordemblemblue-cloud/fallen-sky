// Mission 1 · Kejim Post (Expanded Remaster). A reinterpretation of Jedi Outcast's opening mission built from
// original geometry and original dialogue: land in the canyon, breach the Imperial outpost, open the command
// center, pull the flight logs while the garrison counter-attacks, face a Reborn in the hangar, get back to the ship.
// Remaster liberty: Kyle carries his lightsaber and Force powers here so the mission plays on Game 2's combat.
//
// Floor plan (metres, +X east, +Z north):
//   landing pad  x -9..9   z -70..-52     canyon      x -7..7    z -52..-22
//   courtyard    x -32..32 z -20..20      guard post  x -31.5..-24 z -5..5 (west side)
//   lobby        x -20..20 z 22..32       corridor    x -2.5..2.5 z 33..44     comm center x -14..14 z 45..61
//   closets      x ±(15..21) z 49..55     hangar      x 34..58   z -14..14 (east, behind the courtyard wall)
import { layoutKit } from '../level/kit.js';
import { expandKejimWorld } from './kejimExpansion.js';
import { addKejimCloseupDetail } from './kejimCloseupArt.js';
import { addKejimOpeningStoryboard } from './kejimOpeningStoryboard.js';

const PI = Math.PI;

function layout() {
  const k = layoutKit('kejim_post', 1977);
  const L = k.L;
  L.ground = { x0: -44, z0: -86, x1: 64, z1: 76, y: 0, mat: 'ground', tile: 27 };
  L.navBounds = [-34, -72, 266, 228];
  L.playerSpawn = [0, 0.3, -61]; L.playerYaw = 0;
  // Mission 1 cinematic sunset: warm sunlight / cool sky fill; the rest of
  // Kejim's mission chapter keeps the same world coordinate and navigation.
  L.env = { sunDir: [-0.52, 0.76, 0.40], sunCol: [1.02, 0.75, 0.51],
    ambTop: [0.33, 0.44, 0.55], ambBot: [0.17, 0.17, 0.20],
    fogCol: [0.42, 0.38, 0.37], fogD: 0.0026, skyDay: 1, skyKejim: 1, skyTraining: 1 };

  // ---------- cliffs that wall in the play area (plus invisible clip above them)
  k.rocks(-16, -86, 16, -72, 13, ['n']);          // behind the landing pad
  k.rocks(-44, -86, -16, -52, 13, ['e']);
  k.rocks(16, -86, 64, -52, 13, ['w']);
  k.rocks(-44, -52, -7, -22, 14, ['e', 's']);     // canyon walls
  k.rocks(7, -52, 64, -22, 14, ['w', 's']);
  k.rocks(-44, -22, -34, 76, 15, ['e']);          // cliff west of the outpost
  k.rocks(-34, 62, 64, 76, 16, ['s']);            // backdrop north of the command center
  k.rocks(34, 16, 64, 62, 14, []); k.rocks(34, -22, 64, -16, 14, []);
  // Break the old flat eastern cliff where the new freight lock continues.
  k.rocks(60, -16, 64, -8, 14, []); k.rocks(60, 8, 64, 16, 14, []);
  for (const [x0, x1] of [[-34, -22], [22, 34]]) { k.solid([x0, 0, 22], [x1, 8, 62], 'metalDark'); k.clip([x0, 8, 22], [x1, 40, 62]); } // outpost bulk beside the command center
  k.clip([-22, 7.6, 22], [22, 40, 62]); k.clip([-32, 4.5, -5.5], [-23.5, 40, 5.5]); k.clip([32, 9.6, -16], [60, 40, 16]); // no roof walking

  // ---------- landing pad and the Raven's Claw
  k.solid([-9, 0, -70], [9, 0.3, -52], 'pad');
  for (const z of [-70.05, -52.25]) k.deco([-9, 0.3, z], [9, 0.34, z + 0.3], 'orange');
  k.solid([-8.5, 0.3, -68], [-1.5, 3.2, -58], 'hull'); k.solid([-6.5, 1.2, -58], [-3.5, 2.8, -55.6], 'hullDark');
  k.deco([-7.6, 1.0, -68.35], [-2.4, 2.5, -68], 'blue'); k.deco([-5.4, 3.2, -64], [-4.6, 4.4, -63.2], 'hullDark'); k.deco([-6.2, 4.4, -64.6], [-3.8, 4.55, -62.6], 'hull');
  for (const [x, z] of [[-9.4, -70.4], [9.4, -70.4], [9.4, -51.6], [-9.4, -51.6]]) k.lampPost(x, z, 2.2, 'orange');

  // ---------- canyon: two ledges the troopers hold, boulders for cover
  k.solid([3, 0, -41], [7, 2.6, -34], 'rockDark'); k.solid([-7, 0, -31], [-3.5, 2.6, -26], 'rockDark');
  k.solid([-3.8, 0, -47], [-1.6, 1.5, -45.2], 'rock'); k.solid([1.2, 0, -44], [3, 1.1, -42.4], 'rock'); k.solid([-1.9, 0, -33.5], [-0.1, 1.3, -32], 'rock');

  // ---------- perimeter wall with the gate (south) and the blast door (north)
  // Actual sliding gate collider fills the original south-wall opening.
  // It begins shut. Stage two sends players to a maintenance override,
  // then the existing door runtime lifts it; no visual-only fake closure.
  k.wall({ x0: -34, z0: -22, x1: 34, z1: -20, h: 7,
    mat: 'metal', gaps: [{ a: -3, b: 3, top: 5 }] });
  k.door('perimeter_gate', [-3, 0, -22.25], [3, 5, -19.85], false, 'rivetedSteel');
  k.wall({ x0: -34, z0: -20, x1: -32, z1: 20, h: 7, mat: 'metal' });
  k.wall({ x0: 32, z0: -20, x1: 34, z1: -16, h: 7, mat: 'metal' }); k.wall({ x0: 32, z0: 16, x1: 34, z1: 20, h: 7, mat: 'metal' });
  k.wall({ x0: -34, z0: 20, x1: 34, z1: 22, h: 7, mat: 'panel', gaps: [{ a: -3, b: 3, top: 4.6 }] });
  k.door('blast', [-3, 0, 20.4], [3, 4.6, 21.6], false);
  k.solid([-4.4, 0, -23.2], [-3, 8.2, -19], 'metalDark'); k.solid([3, 0, -23.2], [4.4, 8.2, -19], 'metalDark'); // gate towers
  k.lamp([-3.7, 8.4, -23.4], 'red'); k.lamp([3.7, 8.4, -23.4], 'red');
  // A shoulder-height override recessed into the western cliff, reachable
  // from the canyon's existing clear center path and not atop a sniper ledge.
  k.deco([-3.65, .45, -29.65], [-3.48, 2.0, -28.55], 'rivetedSteel');
  k.deco([-3.45, .98, -29.40], [-3.39, 1.72, -28.80], 'blue');
  k.use('perimeter_override', [-2.58, 0, -29.0], 2.35,
    'Override outpost perimeter security');
  k.lamp([-3.6, 1.9, -29.15], 'blue');
  k.deco([-3, 4.6, 20.2], [3, 4.75, 20.4], 'orange'); // blast door status strip
  // Original courtyard also gets projecting round steel conduit, support
  // brackets, raised wall plates and drainage grating instead of plain walls.
  k.pipe([-30,5.6,-19.8],[30,5.6,-19.8],.13,'steelGloss');
  k.pipe([-31,2.7,-18.8],[-31,2.7,19],.12,'steelGloss');
  k.pipe([31,3.1,-15.5],[31,3.1,15.5],.12,'steelGloss');
  for(const x of [-28,-18,-8,8,18,28]){
    k.pillar(x,-19.8,.085,4.8,5.8,'steelGloss',12);
    k.deco([x-.7,3.9,-20.22],[x+.7,4.12,-20.08],'steelGloss');
  }

  // ---------- courtyard
  k.room({ x0: -31.5, z0: -5, x1: -24, z1: 5, ceil: 4, t: 0.5, mat: 'metal', sides: { e: { gaps: [{ a: -1.5, b: 1.5, top: 3 }] } }, strips: 'white' }); // guard post
  k.solid([-31.4, 0, -1.2], [-30.2, 1.1, 1.2], 'console'); k.deco([-30.25, 1.15, -0.9], [-30.12, 1.9, 0.9], 'blue');
  k.use('guard_console', [-29.6, 0, 0], 2.1, 'Open the blast door');
  k.crates(-14, -9, 3); k.crates(12, -5, 2); k.crates(16, 12, 3); k.crates(-20, 13, 2); k.crates(22, -13, 2);
  k.solid([7.5, 0, 9.4], [10.5, 1.25, 10.2], 'metalDark'); k.solid([-9, 0, 6], [-8.2, 1.25, 9], 'metalDark'); k.solid([-4, 0, -4], [-1, 1.2, -3.3], 'metalDark');
  // watch platform + ramp. The ramp lands on a thin lip so no wall face stands across its top end.
  k.solid([23.5, 0, 7], [30, 2.4, 15], 'metal'); k.solid([20, 0, 7.6], [23.5, 2.4, 15], 'metal'); k.solid([20.5, 2.3, 6.95], [23.5, 2.4, 7.6], 'grate');
  k.ramp({ x0: 20.5, z0: 1, x1: 23.5, z1: 7, y0: 0, y1: 2.4, dir: '+z', mat: 'grate' });
  k.deco([20, 2.4, 14.85], [30, 3.4, 15], 'metalDark'); k.deco([29.85, 2.4, 7], [30, 3.4, 15], 'metalDark'); k.deco([23.5, 2.4, 7], [30, 3.4, 7.15], 'metalDark');
  k.deco([26.6, 2.4, 11.4], [27, 7.5, 11.8], 'metalDark'); k.lamp([26.8, 7.7, 11.6], 'red'); // antenna mast
  k.deco([-28, 0, -18], [28, 0.02, 18], 'grate');
  k.lampPost(-12, 0); k.lampPost(12, 2); k.lampPost(-24, -16); k.lampPost(24, -16); k.lampPost(0, 17.5); k.lampPost(-26, 16);
  for (const [x, z] of [[-5, -13], [6, -15], [-18, -3], [18, 1], [4, 14], [-6, 15]]) k.prop('barrel', x, z);
  for (const [x, z] of [[-2, 5], [9, -12]]) k.prop('crate', x, z);

  // ---------- command center
  k.room({ x0: -20, z0: 22, x1: 20, z1: 32, ceil: 5, t: 1, mat: 'panel', skip: ['s'], sides: { n: { gaps: [{ a: -2.5, b: 2.5, top: 4 }] } } }); // lobby
  k.solid([-4, 0, 26], [4, 1.1, 27], 'console'); k.deco([-3.6, 1.1, 26.1], [3.6, 1.16, 26.3], 'blue');
  k.crates(-15, 29, 2); k.crates(14, 25, 3); k.solid([-18.5, 0, 23.5], [-16.5, 1.0, 24.5], 'metalDark');
  k.room({ x0: -2.5, z0: 33, x1: 2.5, z1: 44, ceil: 4, t: 1, mat: 'panel', skip: ['s', 'n'], strips: 'orange' }); // corridor
  k.room({ x0: -14, z0: 45, x1: 14, z1: 61, ceil: 7, t: 1, mat: 'panel', sides: { s: { gaps: [{ a: -2.5, b: 2.5, top: 4 }] }, w: { gaps: [{ a: 50.5, b: 53.5, top: 3.4 }] }, e: { gaps: [{ a: 50.5, b: 53.5, top: 3.4 }] } }, strips: 'blue' }); // comm center
  k.door('west_closet', [-15, 0, 50.5], [-14, 3.4, 53.5], false); k.door('east_closet', [14, 0, 50.5], [15, 3.4, 53.5], false);
  k.room({ x0: -21, z0: 49, x1: -15, z1: 55, ceil: 3.6, t: 1, mat: 'metal', skip: ['e'], strips: 'red' });
  k.room({ x0: 15, z0: 49, x1: 21, z1: 55, ceil: 3.6, t: 1, mat: 'metal', skip: ['w'], strips: 'red' });
  k.solid([-2, 0, 59], [2, 1.3, 60.6], 'console'); k.deco([-1.8, 1.35, 58.95], [1.8, 2.7, 59.05], 'blue'); k.deco([-2.6, 2.9, 59.8], [2.6, 3.0, 60.6], 'blue');
  k.use('comm_terminal', [0, 0, 57.8], 2.4, 'Download the flight logs');
  for (const [x, z] of [[-7, 49.5], [7, 49.5], [-7, 56], [7, 56]]) k.solid([x - 0.6, 0, z - 0.6], [x + 0.6, 7, z + 0.6], 'metalDark');
  k.solid([-11, 0, 52], [-9, 1.1, 53], 'console'); k.solid([9, 0, 47], [11, 1.1, 48], 'console'); k.crates(-11, 58.5, 2); k.crates(10.5, 58.8, 3);

  // ---------- hangar
  k.room({ x0: 34, z0: -14, x1: 58, z1: 14, ceil: 9, t: 2, mat: 'metal', sides: { w: { gaps: [{ a: -4, b: 4, top: 6 }] }, e: { gaps: [{ a: -4, b: 4, top: 6 }] } }, strips: 'orange' });
  k.door('hangar_door', [32, 0, -4], [34, 6, 4], false);
  k.door('hangar_east', [58, 0, -4], [60, 6, 4], false); k.deco([32.1, 6.05, -4], [32.4, 6.2, 4], 'orange');
  k.solid([46, 1.3, -3], [55, 4.4, 5], 'hull'); k.solid([44, 1.6, -1.5], [46, 3.6, 3.5], 'hullDark'); // shuttle
  k.deco([47, 3.8, -10], [53, 4.2, -3], 'hull'); k.deco([47, 3.8, 5], [53, 4.2, 12], 'hull'); k.deco([49.5, 4.4, 0.6], [53, 8.4, 1.4], 'hull');
  for (const [x, z] of [[47.6, -1], [53.4, -1], [47.6, 3], [53.4, 3]]) k.deco([x - 0.3, 0, z - 0.3], [x + 0.3, 1.3, z + 0.3], 'metalDark');
  k.deco([55, 1.6, -2], [55.3, 3.8, 4], 'blue');
  k.pipe([35.5,8,-12],[57,8,-12],.23,'steelGloss');
  k.pipe([35.5,8,12],[57,8,12],.23,'steelGloss');
  k.pipe([57,8,-12],[57,8,12],.22,'steelGloss');
  for(const x of [39,47,55]) k.pipe([x,7.5,-12],[x,7.5,12],.14,'steelGloss');
  k.crates(37.5, -11, 3); k.crates(40, 11, 2); k.crates(55.5, -11.5, 2); k.crates(56, 11, 2);

  // ---------- trigger zones
  k.zone('canyon_top', -7, -34, 7, -24).zone('courtyard', -32, -19, 32, 20).zone('lobby', -20, 22, 20, 32).zone('comm', -14, 45, 14, 61)
    .zone('hangar_in', 37, -14, 58, 14).zone('pad', -9, -70, 9, -52);
  expandKejimWorld(k);
  addKejimCloseupDetail(k);
  // Opening 00:00..00:30: physical foundation first; authored plated, wet,
  // reflective and cliff finish second. Both passes use existing level meshes.
  addKejimOpeningStoryboard(k);
  return L;
}

const S = (who, text) => [who, text];

export const KEJIM_POST = {
  id: 'kejim', kicker: 'Single player · Mission 1', title: 'Kejim Post', subtitle: 'Jedi Outcast · Expanded Remaster',
  layout: layout(),
  companion: { archetype: 'jan', at: [2.6, 0.3, -62.5], yaw: 0 },
  groups: {
    canyon: [
      { a: 'stormtrooper', at: [5, 2.6, -38.5], yaw: PI }, { a: 'stormtrooper', at: [5.4, 2.6, -35.6], yaw: PI },
      { a: 'stormtrooper', at: [-5.2, 2.6, -28.6], yaw: PI }, { a: 'stormtrooper', at: [1.5, 0, -27], yaw: PI, patrol: [[1.5, 0, -27], [-1.5, 0, -24.5]] },
    ],
    courtyard: [
      { a: 'officer', at: [25, 2.4, 11], yaw: PI }, { a: 'stormtrooper', at: [-13, 0, -5], yaw: PI }, { a: 'stormtrooper', at: [11, 0, -2], yaw: PI },
      { a: 'stormtrooper', at: [0, 0, 8], yaw: PI, patrol: [[0, 0, 8], [-12, 0, 8], [-12, 0, -1]] }, { a: 'stormtrooper', at: [18, 0, -9], yaw: -PI / 2 },
      { a: 'stormtrooper', at: [-24, 0, 12], yaw: PI * 0.8 }, { a: 'stormtrooper', at: [-27.5, 0, 2.5], yaw: PI / 2 },
    ],
    lobby: [{ a: 'stormtrooper', at: [-7, 0, 28.5], yaw: PI }, { a: 'stormtrooper', at: [7, 0, 27.5], yaw: PI }, { a: 'officer', at: [0, 0, 30.6], yaw: PI }],
    comm: [{ a: 'stormtrooper', at: [-9, 0, 56], yaw: PI }, { a: 'stormtrooper', at: [9, 0, 51], yaw: PI }],
    wave1: [{ a: 'stormtrooper', at: [-18, 0, 51], yaw: PI / 2 }, { a: 'stormtrooper', at: [-19, 0, 53.5], yaw: PI / 2 }, { a: 'stormtrooper', at: [-17, 0, 54], yaw: PI / 2 }],
    wave2: [{ a: 'officer', at: [18, 0, 52], yaw: -PI / 2 }, { a: 'stormtrooper', at: [19, 0, 50], yaw: -PI / 2 }, { a: 'stormtrooper', at: [17, 0, 54], yaw: -PI / 2 }],
    reborn: [{ a: 'reborn', at: [41, 0, -6], yaw: -PI / 2 }],
    freight_interceptors: [
      {a:'stormtrooper',at:[70,0,-2],yaw:-PI/2},{a:'officer',at:[85,0,4],yaw:PI/2},
      {a:'stormtrooper',at:[91,0,-3],yaw:PI/2},
    ],
    forge_duel: [
      {a:'reborn_apprentice',at:[116,0,5],yaw:PI},
      {a:'reborn_apprentice',at:[123,0,-7],yaw:PI/2},
    ],
    ravine_wardens: [
      {a:'stormtrooper',at:[194,0,-5],yaw:-PI/2},
      {a:'reborn_sentinel',at:[209,0,8],yaw:PI},
    ],
    relay_sentries: [
      {a:'officer',at:[213,0,46],yaw:PI},
      {a:'stormtrooper',at:[204,0,62],yaw:PI/2},
      {a:'stormtrooper',at:[235,0,71],yaw:PI},
    ],
    relay_jedi: [
      {a:'reborn_apprentice',at:[208,0,103],yaw:PI},
      {a:'reborn_apprentice',at:[229,0,111],yaw:-PI/2},
      {a:'reborn_sentinel',at:[218,0,118],yaw:PI},
    ],
    rescue_pursuers: [
      {a:'officer',at:[209,0,137],yaw:PI},
      {a:'stormtrooper',at:[219,0,145],yaw:PI},
    ],
    sabotage_pursuers: [
      {a:'reborn_apprentice',at:[211,0,137],yaw:PI},
      {a:'reborn_apprentice',at:[218,0,150],yaw:PI},
    ],
    final_duel: [
      {a:'reborn_apprentice',at:[207,0,175],yaw:PI},
      {a:'reborn_sentinel',at:[231,0,183],yaw:PI},
    ],
    ambush: [{ a: 'officer', at: [-6, 0, -13], yaw: PI / 2 }, { a: 'stormtrooper', at: [-2, 0, -16], yaw: PI / 2 }, { a: 'stormtrooper', at: [3, 0, -11], yaw: PI / 2 }, { a: 'stormtrooper', at: [-12, 0, -15], yaw: PI / 2 }],
  },
  objectives: [
    {
      id: 'canyon', text: 'Advance up the canyon toward the Imperial outpost', marker: [0, 1.2, -30], checkpoint: { pos: [0, 0.3, -61], yaw: 0 },
      onStart: [{ spawn: 'canyon' }, { say: [S('JAN', 'Kejim was supposed to be a dead outpost. Somebody forgot to tell the landing lights.'), S('KYLE', "Then let's go ask them why. Stay behind me. Pistol first — Q if I need the saber.")] }],
      until: { zone: 'canyon_top' },
    },
    {
      id: 'gate_override',
      text: 'Find the maintenance override to open the sealed outpost gate',
      marker: [-3.4, 1.45, -29.1],
      checkpoint: { pos: [0, 0.3, -34], yaw: 0 },
      onStart: [{ say: [
        S('JAN', "The main gate is locked down. There is a service override in the western cliff face."),
        S('KYLE', "Cover me. I will get us inside without charging those doors."),
      ] }],
      until: { interact: 'perimeter_override' },
      onComplete: [{ open: 'perimeter_gate' },
        { say: [S('JAN', "Perimeter lock released. The gate is moving. Watch for a garrison response.")] }],
    },
    {
      id: 'courtyard', text: 'Breach the outpost courtyard and defeat the garrison', checkpoint: { pos: [0, 0, -31], yaw: 0 },
      onStart: [{ spawn: 'courtyard' }, { say: [
        S('JAN', "We're in. Clear the courtyard and find the command center."),
      ] }],
      until: { cleared: ['courtyard'] },
      onComplete: [{ say: [S('KYLE', "Courtyard's clear."), S('JAN', 'The command center is sealed behind a blast door. There should be a control console in the guard post on the west side.')] }],
    },
    {
      id: 'console', text: 'Use the guard post console to open the command center blast door', checkpoint: { pos: [-8, 0, -6], yaw: -PI / 2 },
      until: { interact: 'guard_console' },
      onComplete: [{ open: 'blast' }, { say: [S('JAN', "Blast door's opening. And I can hear boots on the other side.")] }],
    },
    {
      id: 'logs', text: 'Fight through to the comm center and download the flight logs', checkpoint: { pos: [0, 0, 13], yaw: 0 },
      onStart: [{ spawn: 'lobby' }, { spawn: 'comm' }],
      until: { hold: 'comm_terminal', seconds: 22, radius: 8 }, holdStart: 'Download started — hold the room', holdText: 'Downloading flight logs',
      progress: [
        { at: 0.15, do: [{ open: 'west_closet' }, { spawn: 'wave1' }, { alert: 'wave1' }, { say: [S('JAN', 'Kyle! West door — more of them!')] }] },
        { at: 0.55, do: [{ open: 'east_closet' }, { spawn: 'wave2' }, { alert: 'wave2' }, { say: [S('OFFICER', 'He is in the comm center! Cut him off!')] }] },
      ],
      onComplete: [{ say: [S('JAN', "Got it. Cargo runs to Artus Prime... and one entry for the hangar that's been scrubbed. Somebody didn't want that logged."), S('KYLE', "Then that's where I'm going.")] }],
    },
    {
      id: 'hangar', text: 'Investigate the hangar on the east side of the courtyard', marker: [41, 1.2, 0], checkpoint: { pos: [0, 0, 54], yaw: PI },
      onStart: [{ open: 'hangar_door' }],
      until: { zone: 'hangar_in' },
      onComplete: [{ close: 'hangar_door' }, { companion: 'hold', at: [28, 0, 0] }, { say: [S('JAN', 'Kyle, the door — it sealed behind you! I can\'t get through!')] }],
    },
    {
      id: 'reborn', text: 'Defeat the Reborn', checkpoint: { pos: [37.5, 0, 0], yaw: PI / 2 },
      onStart: [{ spawn: 'reborn' }, { boss: 'reborn' }, { say: [S('KYLE', "A lightsaber. The Empire doesn't hand those out."), S('REBORN', 'The Empire did not give me this. My master did. Your journey ends here, Katarn.')] }],
      until: { cleared: ['reborn'] },
      onComplete: [{ open: 'hangar_door' }, { open:'hangar_east' }, { open:'forge_lock' }, { companion:'follow' }, { say:[S('KYLE',"Someone's training dark Jedi again. And the logs say there's more beyond that freight tunnel."),S('JAN',"The Imperial relay is broadcasting prisoner transfers. We need to investigate before we leave Kejim.")] }],
    },
    {
      id:'freight',text:'Fight through the eastern freight lock',marker:[81,1.2,1],
      checkpoint:{pos:[55,0,0],yaw:PI/2},
      onStart:[{spawn:'freight_interceptors'},
        {say:[S('JAN','That corridor is pressurized. Their reinforcements will meet us at the smelter.')]}],
      until:{cleared:['freight_interceptors']},
      onComplete:[{say:[S('KYLE','Freight lock secure. But why does a deserted listening post need a working foundry?')]}],
    },
    {
      id:'forge_duel',text:'Defeat both dark Jedi guarding the smelter',marker:[118,1.5,0],
      checkpoint:{pos:[100,0,0],yaw:PI/2},
      onStart:[{spawn:'forge_duel'},
        {say:[S('REBORN','Two sabers against one. You should have stayed in the hangar.'),S('KYLE',"That's what the last guy said.")]}],
      until:{cleared:['forge_duel']},
      onComplete:[{say:[S('JAN','They were protecting a pressure release. The exterior stone bridge is just beyond it.')]}],
    },
    {
      id:'pressure',text:'Release furnace pressure before crossing the gorge',
      checkpoint:{pos:[113,0,0],yaw:PI},
      until:{interact:'forge_pressure'},
      onComplete:[{say:[S('KYLE','Pressure is down. The exhaust is venting through the canyon.'),S('JAN','That bridge is natural volcanic stone. Watch your footing.')]}],
    },
    {
      id:'ravine',text:'Cross the eroded stone bridge to the eastern mesa',marker:[192,1.2,3],
      checkpoint:{pos:[148,0,1],yaw:PI/2},
      onStart:[{say:[S('JAN','The signal relay is uphill. I can see its antenna through the dust.')]}],
      until:{zone:'ravine_crossing'},
      onComplete:[{say:[S('KYLE','Bridge is holding. Time to find out what the Empire is transmitting.')]}],
    },
    {
      id:'wardens',text:'Defeat the ridge sentry and the Reborn commander',marker:[209,1.5,8],
      checkpoint:{pos:[192,0,2],yaw:PI/2},
      onStart:[{spawn:'ravine_wardens'},
        {say:[S('REBORN','No closer, Katarn. The relay belongs to our order.')]}],
      until:{cleared:['ravine_wardens']},
    },
    {
      id:'relay_approach',text:'Reach the uplink yard below the main antenna',marker:[219,1,61],
      checkpoint:{pos:[199,0,7],yaw:0},
      onStart:[{spawn:'relay_sentries'}],
      until:{zone:'relay_approach'},
      onComplete:[{say:[S('JAN','There are prison records and an overloaded power regulator here. Two ways to disrupt this place.')]}],
    },
    {
      id:'relay_duel',text:'Face the three coordinated Reborn defending the uplink',marker:[219,1.5,109],
      checkpoint:{pos:[218,0,75],yaw:0},
      onStart:[{spawn:'relay_jedi'},
        {say:[S('REBORN','You have come too far. Protect the prisoner manifest!'),S('KYLE','Then I guess you have something worth hiding.')]}],
      until:{cleared:['relay_jedi']},
      onComplete:[{say:[S('JAN','Their commander is down. West annex frees the captives; east annex destroys the communications array. Your call.')]}],
    },
    {
      id:'decision',text:'Choose: free the prisoners OR sabotage the relay',
      marker:[219,1.2,109],checkpoint:{pos:[218,0,105],yaw:0},
      until:{interactAny:['rescue_prisoners','sabotage_relay']},
      onComplete:[
        {ifUsed:'rescue_prisoners',do:[{banner:'PRISONERS FREED'}, {say:[S('JAN','The detention cells are open. Those families can reach the transport — but the relay remains active.'),S('KYLE','Lives first. We can shut down their transmissions another day.')]}]},
        {ifUsed:'sabotage_relay',do:[{banner:'RELAY DISABLED'}, {say:[S('JAN','The network is blacked out. The Empire will lose this region for hours.'),S('KYLE','The prisoners will need someone to come back for them.')]}]},
      ],
    },
    {
      id:'ridge',text:'Escape through the exposed upland trail',
      checkpoint:{pos:[219,0,126],yaw:0},marker:[216,1.2,152],
      onStart:[
        {ifUsed:'rescue_prisoners',do:[{spawn:'rescue_pursuers'}, {say:[S('OFFICER','They opened the detention wing! Stop them before they reach extraction!')]}]},
        {ifUsed:'sabotage_relay',do:[{spawn:'sabotage_pursuers'}, {say:[S('REBORN','The array is gone! Pursue Katarn into the mountains!')]}]},
      ],
      until:{zone:'ridge_climb'},
    },
    {
      id:'high_ground',text:'Hold the mountain ridge against two elite lightsabers',
      checkpoint:{pos:[207,0,161],yaw:0},marker:[224,1.2,182],
      onStart:[{spawn:'final_duel'},
        {say:[S('JAN','Two more red sabers ahead. I am bringing the shuttle to the upper pad!')]}],
      until:{cleared:['final_duel']},
    },
    {
      id:'exfil',text:'Reach the elevated steel landing pad and signal Jan',
      marker:[217,1.7,214],checkpoint:{pos:[213,0,191],yaw:0},
      until:{interact:'evac_beacon'},
      onComplete:[
        {ifUsed:'rescue_prisoners',do:[{say:[S('JAN','The prisoners made the transport. You gave them a chance, Kyle.'),S('KYLE','Then that is enough for today.')]}]},
        {ifUsed:'sabotage_relay',do:[{say:[S('JAN','The relay is dark. We took the Empire off this world for now.'),S('KYLE','And next time we come back for everyone they left behind.')]}]},
        {complete:true},
      ],
    },

  ],
  triggers: [
    { id: 'lobby_hint', zone: 'lobby', after: 'logs', do: [{ say: [S('KYLE', 'The comm center should be straight through.')] }] },
    { id: 'comm_hint', zone: 'comm', after: 'logs', do: [{ say: [S('JAN', 'That terminal at the far end. Press E and keep them off you while it works.')] }] },
  ],
};
