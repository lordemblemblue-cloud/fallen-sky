// Game 2 · Boss Way Rancor Pit. Enlarged stone-and-soil ruins built with
// the same authored geometry / collision kit as the new Training Garden.
// The floor, pillars and perimeter walls are physical; foliage and brick
// detailing are separate non-colliding visual batches.
import { layoutKit } from '../level/kit.js';

export const BOSS_WAY_BOUNDS = Object.freeze({
  x0: -54, x1: 54, z0: -58, z1: 68,
  innerX0: -51, innerX1: 51, innerZ0: -55, innerZ1: 65,
});
export const BOSS_WAY_ARENA = Object.freeze({
  player: [0, 0.05, -36],
  rancor: [0, 0.05, 20],
  name: 'Rancor Pit',
});
export const BOSS_WAY_COLUMNS = Object.freeze([
  {x:-35,z:-37,h:5.8,r:1.8},{x:35,z:-37,h:6.1,r:1.8},
  {x:-37,z:-12,h:7.8,r:2.0},{x:37,z:-12,h:7.5,r:2.0},
  {x:-32,z:20,h:8.2,r:2.0},{x:32,z:20,h:7.2,r:2.0},
  {x:-36,z:44,h:5.5,r:1.8},{x:36,z:44,h:6.1,r:1.8},
  {x:-17,z:55,h:3.9,r:1.4},{x:17,z:55,h:4.1,r:1.4},
  {x:-19,z:-49,h:3.7,r:1.4},{x:19,z:-49,h:3.9,r:1.4},
]);
export const BOSS_WAY_RUINS = Object.freeze([
  {x:-43,z:3,w:5.6,d:2.6,h:2.5},{x:38,z:2,w:5.1,d:2.8,h:2.1},
  {x:-43,z:33,w:4.5,d:3.0,h:3.2},{x:39,z:36,w:4.6,d:2.5,h:2.6},
  {x:-25,z:-52,w:5,d:1.8,h:2.4},{x:21,z:-53,w:5,d:1.8,h:2.1},
  {x:-26,z:59,w:5,d:2.2,h:2.9},{x:23,z:59,w:4.8,d:2.1,h:2.6},
]);

export function createBossWayArena() {
  const k = layoutKit('boss_way_rancor_pit', 2016), L = k.L;
  L.playerSpawn = [...BOSS_WAY_ARENA.player];
  L.playerYaw = 0;
  L.navBounds = [-52, -57, 52, 67];
  L.killY = -12;
  L.env = {
    skyDay: 0.54,
    sunDir: [0.36, 0.82, -0.44], sunCol: [0.94, 0.78, 0.58],
    ambTop: [0.39, 0.43, 0.43], ambBot: [0.16, 0.17, 0.12],
    fogCol: [0.26, 0.26, 0.23], fogD: 0.0032,
  };
  // Approximately 108 × 126 m, versus the previous ~42 × 47 m.
  // Below all visual dirt are real, level terrain and exterior collision.
  k.solid([-55,-1,-59],[55,0,69],'rockDark');
  k.solid([-55,0,-59],[-53.4,12,69],'rockDark');
  k.solid([53.4,0,-59],[55,12,69],'rockDark');
  k.solid([-55,0,-59],[55,11,-57.4],'rockDark');
  k.solid([-55,0,67.4],[55,12,69],'rockDark');

  // Strong buttresses and multiple broken courses read as old stone walls.
  // These have the same collider-and-overlay separation as Training Garden.
  for(const x of [-54,51.5]) for(let z=-53;z<=59;z+=13) {
    k.solid([x,0,z],[x+2.5,10.4,z+2.3],'rock');
    k.deco([x-0.2,10.2,z-0.25],[x+2.7,10.55,z+2.55],'rockDark');
    k.deco([x-0.32,0,z-0.3],[x+2.82,0.28,z+2.6],'rock');
  }
  for(const z of [-58,65.7]) for(let x=-48;x<=46;x+=15){
    k.solid([x,0,z],[x+2.4,9.5,z+2.1],'rock');
    k.deco([x-0.15,9.25,z-0.2],[x+2.55,9.65,z+2.3],'rockDark');
  }

  // A ceremonial entry behind the player's start, with an unobstructed
  // nine-metre gateway and broad clearance for the follow camera.
  for(const x of [-11.2,8.7]){
    k.solid([x,0,-55],[x+2.5,9.5,-51],'rock');
    k.deco([x-0.3,9.15,-55.3],[x+2.8,9.8,-50.7],'rockDark');
  }
  k.deco([-11.5,9.2,-55.1],[11.5,10.1,-51.0],'rock');
  // Low northern ritual terrace: large enough to walk around, not a cage.
  k.solid([-11,0,54],[11,0.20,62],'rock');
  k.solid([-7,0,52.3],[7,0.10,54],'rockDark');

  // Flanking cover, broad enough to stop the Rancor's line-of-sight attacks,
  // but kept out of the central 50 m fighting corridor.
  for(const {x,z,h,r} of BOSS_WAY_COLUMNS) {
    k.solid([x-r,0,z-r],[x+r,h,z+r],'rockDark');
    k.deco([x-r-0.28,0,z-r-0.28],[x+r+0.28,0.35,z+r+0.28],'rock');
    k.deco([x-r-0.23,h-0.32,z-r-0.23],[x+r+0.23,h+0.22,z+r+0.23],'rock');
  }
  for(const {x,z,w,d,h} of BOSS_WAY_RUINS) {
    k.solid([x,0,z],[x+w,h,z+d],'rockDark');
    k.deco([x-0.17,h-0.07,z-0.16],[x+w+0.17,h+0.16,z+d+0.16],'rock');
  }
  // Positioned light sources with warm/neutral moonlit contrast; not reused
  // from the menu's "attract" world.
  for(const [x,z] of [
    [-47,-42],[47,-42],[-48,-16],[48,-16],
    [-46,21],[46,21],[-45,50],[45,50],
  ]) k.lamp([x,4.4,z],'orange');

  k.zone('rancor_pit',-52,-56,52,67);
  return L;
}
