// Training Grounds architectural detail — render-only masonry bonds, weathered
// mortar, peripheral storm drains, and bronze wayfinding. Original physics,
// lesson doors, PvP spawns, and multiplayer layouts stay in trainingGarden.js.
import { meshBuilder } from '../level/builder.js';
import { mulberry32 } from '../level/kit.js';

const LIMESTONE = [0.49, 0.445, 0.377];
const EDGE = [0.68, 0.613, 0.49];
const RECESS = [0.145, 0.143, 0.15];
const STEEL = [0.285, 0.345, 0.397];
const BRONZE = [0.66, 0.485, 0.28];
const GOLD = [0.83, 0.669, 0.385];
export const COURTYARD_MASONRY_LIMITS = Object.freeze({
  courseHeight: 0.60,
  brickHeight: 0.52,
  brickWidth: 1.82,
  doorwayMinZ: 31.75,
  doorwayMaxZ: 38.25,
  eastFaceX: 26.972,
  westFaceX: -26.972,
  // No material extends beyond this shallow noncollidable wall overlay.
  reliefDepth: 0.041,
});

const box = (mesh, a, b, color) => mesh.box(a, b, color);
const shaded = (base, s) => base.map(c => Math.max(0, Math.min(1, c*s)));

// Visible-only stone face, top and two exposed side returns. Bottom/back
// faces are buried in the existing collision wall, so omitting them saves
// ~one third of the mesh's triangles while retaining REAL stone depth.
function relievedBrick(mesh,plane,face,outer,a,b,bottom,top,col){
  const shadedTop=shaded(col,1.06);
  if(plane==='x'){
    const n=[Math.sign(outer-face),0,0];
    mesh.quad([outer,bottom,a],[outer,bottom,b],[outer,top,b],[outer,top,a],n,col);
    mesh.quad([face,top,a],[face,top,b],[outer,top,b],[outer,top,a],[0,1,0],shadedTop);
    mesh.quad([face,bottom,a],[outer,bottom,a],[outer,top,a],[face,top,a],[0,0,-1],col);
    mesh.quad([outer,bottom,b],[face,bottom,b],[face,top,b],[outer,top,b],[0,0,1],col);
  } else {
    const n=[0,0,Math.sign(outer-face)];
    mesh.quad([a,bottom,outer],[b,bottom,outer],[b,top,outer],[a,top,outer],n,col);
    mesh.quad([a,top,face],[b,top,face],[b,top,outer],[a,top,outer],[0,1,0],shadedTop);
    mesh.quad([a,bottom,face],[a,bottom,outer],[a,top,outer],[a,top,face],[-1,0,0],col);
    mesh.quad([b,bottom,outer],[b,bottom,face],[b,top,face],[b,top,outer],[1,0,0],col);
  }
}

function courses({ start, end, plane, face, side, wallStone, mortar, rand }) {
  const opt = COURTYARD_MASONRY_LIMITS;
  const gap = 0.026, h0 = 0.27;
  for (let row=0; row<12; row++) {
    const y=h0+row*opt.courseHeight;
    if (y+opt.brickHeight > 7.62) break;
    const shift=(row%2)*opt.brickWidth*.5;
    // Continuous mortar is BEHIND individual relief bricks, not a floating
    // strip in front of a doorway. Every opening is supplied as a disjoint
    // [start, end] interval, never crossed.
    if(plane==='x') {
      box(mortar,[face-side*.004,y-.012,start],[face+side*.004,y+.54,end],RECESS);
    } else {
      box(mortar,[start,y-.012,face-side*.004],[end,y+.54,face+side*.004],RECESS);
    }
    for (let startAt=start-shift; startAt<end-gap; startAt+=opt.brickWidth) {
      const a=Math.max(start,startAt+gap*.5);
      const b=Math.min(end,startAt+opt.brickWidth-gap*.5);
      if(b-a<.20)continue;
      const deviation=.87+rand()*.21;
      const tone=shaded(LIMESTONE,deviation);
      const outer=face+side*opt.reliefDepth;
      const bottom=y+.015+(rand()-.5)*.008;
      const top=y+opt.brickHeight-(rand()*.012);
      relievedBrick(wallStone,plane,face,outer,a,b,bottom,top,tone);
      // A lighter worn upper arris is a 2-triangle strip on the exposed
      // surface, never an extra fully enclosed cube hidden behind masonry.
      if((row+Math.round(a))%3===0){
        const highlight=shaded(EDGE,.84+rand()*.10),h=top-.02;
        if(plane==='x')
          wallStone.quad([outer+Math.sign(outer-face)*.001,h,a+.06],
            [outer+Math.sign(outer-face)*.001,h,b-.06],
            [outer+Math.sign(outer-face)*.001,top-.008,b-.06],
            [outer+Math.sign(outer-face)*.001,top-.008,a+.06],
            [Math.sign(outer-face),0,0],highlight);
        else
          wallStone.quad([a+.06,h,outer+Math.sign(outer-face)*.001],
            [b-.06,h,outer+Math.sign(outer-face)*.001],
            [b-.06,top-.008,outer+Math.sign(outer-face)*.001],
            [a+.06,top-.008,outer+Math.sign(outer-face)*.001],
            [0,0,Math.sign(outer-face)],highlight);
      }
    }
  }
}

function gardenWallMasonry(wallStone,mortar,rand) {
  const f=COURTYARD_MASONRY_LIMITS;
  // Internal faces align with the actual z=12..13 and x=±27 collision walls.
  // East face has a REAL 6m Handbook passage: leave the entire entrance free,
  // including masonry, grout, drain grilles, and trim in this layer.
  const westSegments=[[13.15,62.6]];
  const eastSegments=[[13.15,f.doorwayMinZ],[f.doorwayMaxZ,62.6]];
  for(const [a,b] of westSegments)
    courses({start:a,end:b,plane:'x',face:f.westFaceX,side:1,wallStone,mortar,rand});
  for(const [a,b] of eastSegments)
    courses({start:a,end:b,plane:'x',face:f.eastFaceX,side:-1,wallStone,mortar,rand});
  // South hall entrance (x=−3..3) remains a genuine functioning door.
  for(const [a,b] of [[-26.55,-3.22],[3.22,26.55]])
    courses({start:a,end:b,plane:'z',face:13.035,side:1,wallStone,mortar,rand});
  // Rear wall is continuous; relief is inset toward the garden.
  courses({start:-26.55,end:26.55,plane:'z',face:62.965,side:-1,wallStone,mortar,rand});
}

function gardenStormDrain(stone,metal,bronze){
  // Surface drainage only at far wall edges, NOT over the paved central route,
  // suspended canopy, west stair treads, or 6m east Handbook gate.
  for (const side of [-1,1]) {
    const x=side*25.85;
    for(const [z0,z1] of (side<0 ? [[16,20],[41,60]] : [[16,29],[41,60]])) {
      for(let z=z0;z<z1-.1;z+=1.5) {
        const length=Math.min(1.42,z1-z);
        // A dark, recessed slot inside a modest dry-stone curb.
        box(stone,[x-.38,.026,z],[x+.38,.056,z+length],shaded(LIMESTONE,.59));
        box(metal,[x-.27,.057,z+.07],[x+.27,.067,z+length-.07],RECESS);
        for(let dz=.15;dz<length-.12;dz+=.19)
          box(metal,[x-.26,.069,z+dz],[x+.26,.078,z+dz+.053],STEEL);
        // Four bronze grate bolts are actual small cylinders approximated by
        // high-contrast square rivets, small enough to avoid false elevation.
        for(const boltX of [x-.325,x+.325])for(const dz of [.13,length-.13])
          box(bronze,[boltX-.028,.077,z+dz-.028],
            [boltX+.028,.083,z+dz+.028],BRONZE);
      }
    }
  }
}

function routeInlays(bronze) {
  // Short, correctly raised navigation markers outside the narrow centerline
  // guide a player from the garden door toward the canopy and Handbook.
  for(const x of [-3.25,3.25]){
    for(const z of [16,20,24,28,50,54,58]){
      // 4cm low relief = purely visual detail, no new raycast triangles.
      box(bronze,[x-.045,.028,z-.35],[x+.045,.041,z+.35],BRONZE);
      box(bronze,[x-.16,.037,z+.25],[x+.16,.045,z+.31],GOLD);
    }
  }
}

export function buildTrainingCourtyardMasonry(){
  const rand=mulberry32(20261025);
  const reliefStone=meshBuilder(), mortar=meshBuilder(), drains=meshBuilder(), steel=meshBuilder(), bronze=meshBuilder();
  gardenWallMasonry(reliefStone,mortar,rand);
  gardenStormDrain(drains,steel,bronze);
  routeInlays(bronze);
  return {
    reliefStone:reliefStone.build(),mortar:mortar.build(),
    drains:drains.build(),drainSteel:steel.build(),inlays:bronze.build(),
  };
}
