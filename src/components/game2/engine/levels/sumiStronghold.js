// Atom X Eve / Game 2 — Sumi-e military stronghold, Stage 2.
// Original sci-fi layout, NOT derived from a licensed game level.
// Physical walking collision uses the same level kit/builder as Training Grounds;
// decorative plating, paint-like soot streaks, rivets, pipe elbows and reflections
// are non-blocking visual geometry. Full texture scans / baked reflection probes
// belong to the second art pass (see docs/game2/SUMI_E_STRONGHOLD.md).
import { layoutKit } from '../level/kit.js';
import { addUpperGallery, UPPER_GALLERY } from './sumiStrongholdUpper.js';
import { addStrongholdModels } from './sumiStrongholdModels.js';
import { addStrongholdWallSystems } from './sumiStrongholdWallSystems.js';
import { SUMI_LANDING_BAY } from './sumiStrongholdLandingBay.js';
import { addSumiGLBRoomWalls, addSumiGLBUpperAndHangarWalls } from './sumiStrongholdGlbWallPlacements.js';
import { SUMI_OWNER_ROOM_IDS, sumiOwnerWallPlacements } from './sumiOwnerWallGLBs.js';

export const STRONGHOLD = Object.freeze({
  id: 'sumi_stronghold',
  label: 'Sumi-e Military Stronghold',
  stage: 2,
  zones: Object.freeze({
    hangar: Object.freeze([-29,-92,29,-62]),
    spine: Object.freeze([-6,-62,6,-29]),
    command: Object.freeze([-18,-29,18,12]),
    armory: Object.freeze([-76,-17,-52,17]),
    reactor: Object.freeze([-18,12,4,40]),
    medical: Object.freeze([9,30,30,58]),
    eastCorridor: Object.freeze([18,-4,58,4]),
    riser: Object.freeze([52,4,60,34]),
    ventWest: Object.freeze([4,18,20,21]),
    ventEast: Object.freeze([23,24,52,27]),
    turn: Object.freeze([30,34,60,42]),
    ventilation: Object.freeze([20,4,23,30]),
    upperGallery: Object.freeze([14.5,58,21.5,148]),
    medicalBridge: Object.freeze([19.75,30,23.25,58]),
    upperVent: Object.freeze([20,4,23,30]),
    serviceIncline: Object.freeze([24,4,27,17]),
    upperOverlook: Object.freeze([11.5,148,26.5,164]),
    dockingBay: Object.freeze([SUMI_LANDING_BAY.x0,SUMI_LANDING_BAY.z0,SUMI_LANDING_BAY.x1,SUMI_LANDING_BAY.z1]),
  }),
  ventHeight: 2.4,
});

// Structural room definition; portals in the wall are genuine geometric gaps.
// A gap's 'top' is a lintel height, and never a painted fake doorway.
const ROOMS = [
  {id:'hangar', box:[-29,-92,29,-62], ceiling:12, gaps:{n:[[-6,6,8]]}},
  {id:'spine', box:[-6,-62,6,-29], ceiling:8, skip:['s','n']},
  {id:'command', box:[-18,-29,18,12], ceiling:10, gaps:{
    s:[[-6,6,7]],n:[[-4,4,7]],w:[[-4,4,7]],e:[[-4,4,7]],
  }},
  {id:'armory', box:[-76,-17,-52,17], ceiling:9, gaps:{e:[[-4,4,7]]}},
  {id:'west_corridor', box:[-52,-4,-18,4], ceiling:7, skip:['w','e']},
  // The north face is a TWO-STOREY ventilation portal at x20..23, which
  // k.room's one-lintel gap format cannot model. Author it explicitly in
  // stackedEastCorridorVentWall(), never as an unbroken wall behind grilles.
  {id:'east_corridor', box:[18,-4,58,4], ceiling:8, skip:['w','e','n'],gaps:{
    n:[[20,23,2.4],[24,27,7.5],[52,58,7.5]],
  }},
  {id:'riser',box:[52,4,60,34],ceiling:8,skip:['s','n'],gaps:{w:[[24,27,2.3]]}},
  {id:'turn',box:[30,34,60,42],ceiling:8,skip:['w'],gaps:{s:[[52,60,7.5]]}},
  // Its north wall is built as a two-storey portal at y=4.2..8.25.
  {id:'medical',box:[9,30,30,58],ceiling:9,skip:['n','s'],gaps:{
    s:[[20,23,2.4]],w:[[32,40,7.5]],e:[[34,42,7.5]],
  }},
  {id:'reactor',box:[-18,12,4,40],ceiling:11,gaps:{
    s:[[-4,4,7.5]],e:[[18,21,2.3],[32,40,7.5]],
  }},
  {id:'service_link',box:[4,32,9,40],ceiling:8,skip:['w','e']},
  {id:'ventilation',box:[20,4,23,30],ceiling:STRONGHOLD.ventHeight,skip:['s','n'],gaps:{w:[[18,21,2.3]],e:[[24,27,2.3]]}},
  // Side branches are sealed, navigable crawlways with real wall openings.
  // Their 2.4 m clearance preserves Game 2's standing fighter collision.
  {id:'vent_west',box:[4,18,20,21],ceiling:STRONGHOLD.ventHeight,skip:['w','e']},
  {id:'vent_east',box:[23,24,52,27],ceiling:STRONGHOLD.ventHeight,skip:['w','e']},
];

// Architectural shells have distinct finishes. Fine nickel trim and dark
// functional hardware intentionally keep their original accents.
const panelMetal='sumiWallSilver', floorMetal='sumiFloorGunmetal',
  ceilingMetal='sumiCeilingTitanium', polished='steelGloss', ink='hullDark';
const gapFormat = obj => Object.fromEntries(
  Object.entries(obj||{}).map(([side,rows])=>[side,{gaps:rows.map(([a,b,top])=>({a,b,top}))}])
);

// North wall of the east corridor is connected to an original LOWER duct,
// a new UPPER duct above it, the service incline and a riser. An ordinary
// `k.room` gap only cuts from y=0, so it unknowingly sealed the upper vent.
// Build real stacked wall segments instead. Each section abuts actual jambs.
// The centre of each portal is clear of both collision and wall piping.
export const STRONGHOLD_VENT_PORTALS=Object.freeze({
  lower:Object.freeze({x0:20,x1:23,y0:0,y1:2.4,z:4}),
  upper:Object.freeze({x0:20,x1:23,y0:4.2,y1:7.05,z:4}),
  service:Object.freeze({x0:24,x1:27,y0:0,y1:7.5,z:4}),
  riser:Object.freeze({x0:52,x1:58,y0:0,y1:7.5,z:4}),
});
function stackedEastCorridorVentWall(k){
 const z0=4,z1=4.5,h=8;
 // Solid bulkheads between door frames, aligned to room()'s 0.5m thickness.
 for(const [a,b] of [[17.5,20],[23,24],[27,52],[58,58.5]]){
   k.solid([a,0,z0],[b,h,z1],panelMetal);
   // Preserve collision. Once the source GLB has loaded, only the GLB's
   // own metal backplate and mechanical surface are visible here.
   k.L.solids.at(-1).glbHallFallback=true;
 }
 // The two real ventilation openings stay CLEAR. Only the physically
 // present separator and upper roof steel acquire the source GLB finish.
 for(const [a,b] of [[2.4,4.2],[7.05,h]]){
   k.solid([20,a,z0],[23,b,z1],panelMetal);
   k.L.solids.at(-1).glbHallFallback=true;
 }
 for(const [a,b] of [[24,27],[52,58]]){
   k.solid([a,7.5,z0],[b,h,z1],panelMetal);
   k.L.solids.at(-1).glbHallFallback=true;
 }
 // Applied thin steel reveals sit ON the solid metal only; there is no
 // free-standing gate, vertical rod, or full-width pipe over any opening.
 for(const x of [19.87,23.02]){
   k.deco([x,.12,3.94],[x+.095,2.3,4.04],polished);
   k.deco([x,4.34,3.94],[x+.095,6.84,4.04],polished);
 }
 for(const y of [2.39,7.06])
   k.deco([20,y,3.97],[23,y+.075,4.045],polished);
}

function floorAndShell(k, room) {
  const [x0,z0,x1,z1]=room.box, h=room.ceiling;
  // Every room and corridor has an independent continuous collision floor.
  k.solid([x0,-1.1,z0],[x1,0,z1],floorMetal);
  const firstWall=k.L.solids.length;
  k.room({x0,z0,x1,z1,ceil:h,t:.5,mat:panelMetal,
    roofMat:ceilingMetal,
    roofWalk:room.ceiling>2.5,
    strips:null,sides:gapFormat(room.gaps),skip:room.skip||[]});
  // Replace the actual hallway WALL, never add a picture on top of it.
  // Mark only the long side-wall solids from this room call; roof, short
  // doorway returns, floors, and large rooms must keep their old rendering.
  // The owner's newer straight/L-corner GLBs belong to select Sumi rooms.
  // Keep these original full-height wall solids for collision, but isolate
  // their visual triangles in a room-specific fallback mesh. Lintels and
  // doors are NOT hidden, so all portal clearance remains correct.
  if(SUMI_OWNER_ROOM_IDS.includes(room.id)){
    for(const solid of k.L.solids.slice(firstWall)){
      const [a,b]=[solid.min,solid.max];
      if(a[1]<=.01 && b[1]>=h-.01 &&
          (b[0]-a[0]<.55 || b[2]-a[2]<.55))
        solid.ownerWallFallback=true;
    }
  }
  const corridor=new Set(['spine','west_corridor','east_corridor','riser','turn']);
  if(corridor.has(room.id)){
    const horizontal=x1-x0>=z1-z0;
    for(const solid of k.L.solids.slice(firstWall)){
      const [a,b]=[solid.min,solid.max];
      if(b[1]-a[1]<3)continue; // never replace ceiling slab
      const sideWall=horizontal
        ? b[0]-a[0]>2 && b[2]-a[2]<=.51 &&
          (Math.abs(b[2]-z0)<.02 || Math.abs(a[2]-z1)<.02)
        : b[2]-a[2]>2 && b[0]-a[0]<=.51 &&
          (Math.abs(b[0]-x0)<.02 || Math.abs(a[0]-x1)<.02);
      if(sideWall)solid.glbHallFallback=true;
    }
  }
  if(room.id==='east_corridor')stackedEastCorridorVentWall(k);
  k.zone(room.id,x0+.5,z0+.5,x1-.5,z1-.5);
}

function floorPlates(k,room){
  const [x0,z0,x1,z1]=room.box;
  // Thin cast-metal raised plate geometry; no steps or new floor collision.
  const spacing=3.5,edge=.18;
  for(let x=x0+edge;x<x1-edge-1;x+=spacing)
   for(let z=z0+edge;z<z1-edge-1;z+=spacing){
    const X=Math.min(x+spacing-.13,x1-edge),Z=Math.min(z+spacing-.13,z1-edge);
    // Alternate rough dark metal and polished brushed steel, deliberately
    // asymmetrical to soften the mechanical grid in a sumi-e silhouette.
    const irregular=Math.abs(Math.round(x*17+z*13))%7===0;
    k.deco([x,.013,z],[X,.033,Z],irregular?'metalDark':floorMetal);
    k.deco([x,.034,z],[X,.050,z+.065],ink);
    k.deco([x,.034,z],[x+.065,.050,Z],ink);
    // Inlaid metal ribs, pressed grooves, and tiny recessed fastener collars.
    k.deco([x+.28,.051,z+.3],[X-.28,.064,z+.325],polished);
    k.deco([x+.28,.051,Z-.325],[X-.28,.064,Z-.3],ink);
    k.deco([x+.26,.051,z+.34],[x+.3,.067,Z-.34],ink);
    for(const [px,pz] of [[x+.2,z+.2],[X-.2,z+.2],[x+.2,Z-.2],[X-.2,Z-.2]]){
      k.deco([px-.07,.052,pz-.07],[px+.07,.066,pz+.07],'metalDark');
      k.deco([px-.035,.067,pz-.035],[px+.035,.078,pz+.035],polished);
    }
   }
}


function ceilingRibs(k,room){
 const [x0,z0,x1,z1]=room.box,h=room.ceiling;
 if(h<5)return; // Short duct must retain its full standing clearance.
 const alongX=x1-x0>=z1-z0;
 // Cross-beams join the ceiling underside instead of hovering in the room.
 if(alongX){
   for(let x=x0+2.2;x<x1-1.2;x+=5.8){
     k.deco([x,h-.115,z0+.24],[x+.16,h-.015,z1-.24],polished);
     k.deco([x+.18,h-.075,z0+.40],[x+.23,h-.02,z1-.4],ink);
   }
 }else{
   for(let z=z0+2.2;z<z1-1.2;z+=5.8){
     k.deco([x0+.24,h-.115,z],[x1-.24,h-.015,z+.16],polished);
     k.deco([x0+.40,h-.075,z+.18],[x1-.40,h-.02,z+.23],ink);
   }
 }
}

function axisPipe(k,a,b,r=.10,mat=polished){k.pipe(a,b,r,mat,10);}
function drawWallCircuit(k,room) {
 const [x0,z0,x1,z1]=room.box,h=room.ceiling;
 if(h<5)return;
 const skip=new Set(room.skip||[]);
 // Old code ran BOTH overhead pipes through entire walls even where
 // a physical doorway was CUT, including the medical gallery opening.
 // This was the long pipe crossing the bridge in the user's screenshot.
 // Only attach pipes/clamps to real wall sections, ending at a metal jamb.
 const wallIntervals=(side,start,end,y)=>{
   if(skip.has(side))return [];
   const cut=(room.gaps?.[side]||[])
      .filter(g=>g[2]>=y-.16)
      .map(g=>[g[0]-.22,g[1]+.22])
      .sort((a,b)=>a[0]-b[0]);
   const pieces=[];let left=start;
   for(const [lo,hi] of cut){
     if(lo>left+.45)pieces.push([left,Math.min(lo,end)]);
     left=Math.max(left,hi);
     if(left>=end)break;
   }
   if(left<end-.45)pieces.push([left,end]);
   return pieces.filter(([v,w])=>w-v>.55);
 };
 const offset=.17;
 for(const y of [Math.min(4.6,h-.8),Math.min(5.35,h-.3)]){
   for(const [side,x] of [['w',x0+offset],['e',x1-offset]]){
     for(const [zA,zB] of wallIntervals(side,z0+.65,z1-.65,y))
       axisPipe(k,[x,y,zA],[x,y,zB],.072);
   }
   for(const [side,z] of [['s',z0+offset],['n',z1-offset]]){
     for(const [xA,xB] of wallIntervals(side,x0+.65,x1-.65,y))
       axisPipe(k,[xA,y,z],[xB,y,z],.072);
   }
 }
 // Clamp placement must observe absent/skipped walls too. A floating bracket
 // in front of a genuine entrance makes it look like broken construction.
 for(let z=z0+2;z<z1-1;z+=4){
   for(const [side,x] of [['w',x0+.16],['e',x1-.26]]){
     const attached=wallIntervals(side,z-.6,z+.8,4.25).some(([a,b])=>a<=z-.11&&b>=z+.35);
     if(!attached)continue;
     k.deco([x,4.1,z],[x+.10,5.65,z+.24],ink);
     k.deco([x-.05,4.25,z-.12],[x+.15,4.40,z+.36],polished);
   }
 }
}

function wallPanels(k,room) {
 const [x0,z0,x1,z1]=room.box,h=room.ceiling;
 if(h<=2.5)return; // Duct walls use the compact ribbed ventilation finish.
 const height=Math.min(3.9,h-1.1);
 const skipped=new Set(room.skip||[]);
 const exposed=(side,a,b)=>!(room.gaps?.[side]||[]).some(([lo,hi])=>a<hi&&b>lo);
 // Each panel is attached to an existing wall only. Previously this routine
 // drew "floating door" boards across nonexistent/skipped corridor walls.
 const panel=(a,b,side)=>{
   const cross=side==='s'||side==='n';
   const face=cross?(side==='s'?z0+.085:z1-.14):(side==='w'?x0+.085:x1-.14);
   const a0=a+.14,b0=b-.14;
   if(cross){
     k.deco([a,.74,face],[b,height,face+.052],ink);
     k.deco([a0,.94,face+.055],[b0,height-.22,face+.096],panelMetal);
     for(const y of [.98,height-.29])k.deco([a+.10,y,face+.102],[b-.1,y+.075,face+.148],polished);
     for(const x of [a+.12,b-.22]){
       k.deco([x,.94,face+.101],[x+.08,height-.20,face+.155],polished);
       for(const y of [1.22,height-.50])
         k.deco([x+.016,y,face+.158],[x+.065,y+.05,face+.185],'steelGloss');
     }
     // Stamped interior bevel and fine longitudinal pressed steel ribs.
     k.deco([a+.38,1.28,face+.101],[b-.38,1.33,face+.151],ink);
     k.deco([a+.4,height-.62,face+.101],[b-.4,height-.58,face+.151],polished);
     for(let x=a+.68;x<b-.58;x+=.69)
       k.deco([x,1.49,face+.105],[x+.025,height-.81,face+.118],'steelGloss');
   }else{
     k.deco([face,.74,a],[face+.052,height,b],ink);
     k.deco([face+.055,.94,a0],[face+.096,height-.22,b0],panelMetal);
     for(const y of [.98,height-.29])k.deco([face+.102,y,a+.10],[face+.148,y+.075,b-.10],polished);
     for(const z of [a+.12,b-.22]){
       k.deco([face+.101,.94,z],[face+.155,height-.20,z+.08],polished);
       for(const y of [1.22,height-.50])
         k.deco([face+.158,y,z+.016],[face+.185,y+.05,z+.065],'steelGloss');
     }
     k.deco([face+.101,1.28,a+.38],[face+.151,1.33,b-.38],ink);
     k.deco([face+.101,height-.62,a+.4],[face+.151,height-.58,b-.4],polished);
     for(let z=a+.68;z<b-.58;z+=.69)
       k.deco([face+.105,1.49,z],[face+.118,height-.81,z+.025],'steelGloss');
   }
 };
 for(const side of ['s','n']){
   if(skipped.has(side))continue;
   for(let x=x0+1;x+3.5<x1;x+=4.6)
     if(exposed(side,x,x+3.5))panel(x,x+3.5,side);
 }
 for(const side of ['w','e']){
   if(skipped.has(side))continue;
   for(let z=z0+1;z+3.5<z1;z+=4.6)
     if(exposed(side,z,z+3.5))panel(z,z+3.5,side);
 }
}

// Surround genuine doorway/duct wall apertures with physical-looking metal
// jambs, a header, a recessed backing reveal; all geometry is render-only.
// No full-face panel is allowed to span an open portal.
function portalFrames(k,room){
 const [x0,z0,x1,z1]=room.box,h=room.ceiling;
 for(const [side,gaps] of Object.entries(room.gaps||{})){
  if((room.skip||[]).includes(side))continue;
  for(const [a,b,requestedTop] of gaps){
   const top=Math.min(h-.28,requestedTop);
   const rail=top<3?.09:.17;
   if(side==='s'||side==='n'){
     const z=side==='s'?z0:z1;
     for(const x of [a,b-rail])
       k.deco([x,.08,z-.18],[x+rail,top+.09,z+.18],polished);
     k.deco([a-.12,top-.13,z-.21],[b+.12,top+.14,z+.21],'metalDark');
     k.deco([a,top+.14,z-.13],[b,top+.21,z+.13],polished);
   }else{
     const x=side==='w'?x0:x1;
     for(const z of [a,b-rail])
       k.deco([x-.18,.08,z],[x+.18,top+.09,z+rail],polished);
     k.deco([x-.21,top-.13,a-.12],[x+.21,top+.14,b+.12],'metalDark');
     k.deco([x-.13,top+.14,a],[x+.13,top+.21,b],polished);
   }
  }
 }
}

function sumiBrushAccents(k){
  // Interpret sumi-e as restrained dark angular brush geometry *on* metal,
  // not as a fantasy hand-drawn environment: asymmetric strokes, ash-grey
  // banding and one white blade-like diagonal along a polished face.
  for(let z=-55;z<-35;z+=3.4) {
    const y=2.0+((z+55)/4)%1.2;
    const x=-5.78;
    axisPipe(k,[x,y,z],[x,y+.6,z+1.35],.045,'hullDark');
    axisPipe(k,[x,y+.6,z+1.35],[x,y+.81,z+1.62],.025,'metalDark');
  }
  for(let z=8;z<31;z+=4){
    const x=52.20,dy=.9+((z-8)%6)/3;
    axisPipe(k,[x,1.4,z],[x,1.65+dy,z+1.4],.042,ink);
  }
}

function ventilationDetail(k){
 const [x0,z0,x1,z1]=STRONGHOLD.zones.ventilation;
 // Genuine collision floor & continuous 3-metre-wide passable passage.
 // Ceiling is at 2.4 m (above the fighter's 1.85 m collision height).
 // Because the camera is third-person, players can traverse without
 // depending on an unimplemented prone/crawl collider.
 for(let z=z0+.4;z<z1-.4;z+=1.2){
  for(const x of [x0+.20,x1-.32]){
   k.deco([x,.05,z],[x+.12,2.28,z+.12],polished);
   k.deco([x-.02,2.22,z],[x+.16,2.35,z+.20],'metalDark');
  }
  k.deco([x0+.20,.050,z],[x1-.20,.068,z+.21],'gratedSteel');
 }
 for(const x of [x0+.35,x1-.35]){
  axisPipe(k,[x,2.10,z0+.25],[x,2.10,z1-.25],.085,'steelGloss');
 }
 // Duct-mouth side reveals are wall-mounted. The former full-width
 // 10cm-high toe-kick across BOTH entrances looked like a loose pipe on
 // the floor directly in front of the vents. Replace it with two short
 // edge pieces and a flush centre-floor gasket that cannot trip players.
 for(const z of [z0+.15,z1-.38]){
  for(const x of [x0+.05,x1-.16]){
   k.deco([x,0,z],[x+.11,2.39,z+.24],polished);
   k.deco([x,.02,z],[x+.11,.12,z+.20],ink);
  }
  k.deco([x0+.38,.008,z],[x1-.38,.023,z+.20],'steelGloss');
 }
 // Duct lighting is recessed/flush because standing clearance is limited.
 for(const [x,z] of [[21.5,14],[21.5,25]]){
  k.deco([x-.47,2.29,z-.24],[x+.47,2.37,z+.24],'metalDark');
  k.deco([x-.36,2.22,z-.15],[x+.36,2.28,z+.15],polished);
  k.lamp([x,2.23,z],z<20?'blue':'white');
 }
}


function mountedCeilingLight(k,x,z,h,glow='white'){
 // Rectangular flush mount with two L-shaped suspension brackets: the
 // emissive mesh never floats in a dark void below a much higher roof.
 const y=h-.32,span=.62;
 k.deco([x-span,h-.105,z-.33],[x+span,h-.02,z+.33],'metalDark');
 for(const side of [-1,1]){
   const a=x+side*.46;
   k.deco([a-.045,y+.05,z-.23],[a+.045,h-.07,z+.23],polished);
   k.deco([a-.10,y,z-.23],[a+.10,y+.07,z+.23],polished);
 }
 k.deco([x-.48,y-.06,z-.26],[x+.48,y+.02,z+.26],polished);
 k.deco([x-.40,y-.075,z-.19],[x+.40,y-.047,z+.19],glow);
 k.lamp([x,y-.08,z],glow);
}

function stageProps(k){
 // Hangar: real support columns, inset landing pad, access gantries.
 for(const x of [-24,24])for(const z of [-84,-70]) {
  k.solid([x-.8,0,z-.8],[x+.8,10,z+.8],'metalDark');
  for(const y of [1.1,5,9.2])k.deco([x-1,y,z-1],[x+1,y+.2,z+1],polished);
  mountedCeilingLight(k,x,z,12,'orange');
 }
 k.solid([-13,0,-83],[13,.12,-71],'gratedSteel');
 for(let x=-11;x<11;x+=2.2)k.deco([x,.135,-82.5],[x+.12,.16,-71.5],ink);
 for(const z of [-81.5,-72.5])k.deco([-13,.17,z],[13,.21,z+.16],polished);
 // Command pit, terminals, holo-table and recessed blue schematic plane.
 k.solid([-4,0,-13],[4,1.3,-7],'metalDark');
 k.deco([-3.8,1.32,-12.8],[3.8,1.35,-7.2],'glass');
 k.deco([-3,1.37,-10.3],[3,1.40,-10.1],'blue');
 for(const [x,z] of [[-13,-18],[11,-18],[-13,3],[11,3]]){
  k.solid([x,0,z],[x+2,1.15,z+1.15],'console');
  k.deco([x+.15,1.17,z+.12],[x+1.85,1.21,z+1.02],'blue');
 }
 // Armory: real shelving/secure lockers separated by a wide central aisle.
 for(const x of [-73,-57])for(let z=-12;z<13;z+=5){
  k.solid([x,0,z],[x+2.1,3.1,z+2.6],ink);
  for(const y of [.65,1.65,2.65])k.deco([x-.06,y,z+.20],[x+2.17,y+.10,z+2.40],polished);
 }
 // Medical: suspended exam stations, white/cold finishes for hospital mood.
 for(const x of [12,25])for(const z of [35,46]){
  k.solid([x,0,z],[x+2.2,.78,z+4.8],panelMetal);
  k.deco([x+.09,.80,z+.12],[x+2.11,.85,z+4.68],'white');
  k.deco([x+.12,.87,z+.15],[x+.22,1.08,z+4.60],'metalDark');
 }
 // Reactor: visually articulated control drum; walkable floor remains flat.
 k.pillar(-9,24,3.2,0,8.8,'metalDark',26);
 for(const y of [1.5,3.4,5.3,7.2])k.ring(-9,24,3.1,3.4,y,.22,polished,36,false);
 for(const [x,z] of [[-12,14],[-13,34],[0,22]])mountedCeilingLight(k,x,z,11,'orange');
 // Corridor bends expose the mechanical pipe branches (including 90°).
 for(const y of [5.5,6.2]){
  const path=[[30,y,-3.82],[56.7,y,-3.82],[57.83,y,-2.6],
    [57.83,y,36.2],[56.5,y,40.0],[30.7,y,40.0]];
  for(let i=1;i<path.length;i++)axisPipe(k,path[i-1],path[i],.14,'steelGloss');
  for(const p of [path[1],path[2],path[3],path[4]])
   k.deco([p[0]-.27,p[1]-.25,p[2]-.27],[p[0]+.27,p[1]+.25,p[2]+.27],ink);
 }
 for(const [x,z,h] of [[0,-45,8],[0,-20,10],[0,4,10],[-33,0,7],[-64,0,9],[34,0,8],[55,8,8],[55,30,8],[45,38,8],[19,53,9],[-1,33,11]])
   mountedCeilingLight(k,x,z,h,'white');
 // Additional fixtures illuminate the cross-base ventilation network.
 for(const [x,z] of [[11,19.5],[35,25.5]]){
   k.deco([x-.42,2.30,z-.19],[x+.42,2.38,z+.19],'metalDark');
   k.deco([x-.34,2.24,z-.13],[x+.34,2.29,z+.13],polished);
   k.lamp([x,2.22,z],'blue');
 }
 // Inset reflective trim where the 90° corners turn left.
 for(const [x,z] of [[56,-3.8],[57.8,4.8],[57.8,32.5],[53.4,40]]){
  k.deco([x-.22,.06,z-.22],[x+.22,.10,z+.22],polished);
 }
}

export function createSumiStronghold(){
 const k=layoutKit('sumi_stronghold',20271027),L=k.L;
 L.navBounds=[-78,-94,62,234];
 L.playerSpawn=[0,0,-78];L.playerYaw=0;
 L.duelSpawns={player:[-6,0,-10],enemy:[6,0,-10]};
 // CTF bases occupy the two distant hangars shown in the owner's screenshots:
 // blue/light side: ground-floor grated maintenance hangar;
 // red/dark side: elevated ship landing pad inside the yellow taxi ring.
 // Keep these as distinct level elevations; do not use the old reactor base.
 L.teamHomes={blue:[0,.12,-78],red:[SUMI_LANDING_BAY.pad.cx,SUMI_LANDING_BAY.floorY,SUMI_LANDING_BAY.pad.cz]};
 L.teamYaw={blue:0,red:Math.PI};
 L.ffaSpawns=[[0,0,-78],[12,0,-80],[-12,0,-80],
  [0,0,-43],[-9,0,-10],[9,0,-10],[0,0,2],
  [-61,0,0],[-60,0,11],[-9,0,25],
  [16,0,52],[27,0,52],[34,0,38],[45,0,38],[55,0,22],
  [18,4.2,154],[-4,4.2,169],[40,4.2,170],[0,4.2,221],[33,4.2,221]];
 L.killY=-14;
 // Neutral industrial illumination: blue is reserved for controls, vents and
  // selected status lighting, not a whole-room cyan ambient wash.
  L.env={sunDir:[-.38,.72,.34],sunCol:[.86,.85,.82],
  ambTop:[.51,.515,.52],ambBot:[.19,.195,.20],
  fogCol:[.080,.086,.095],fogD:.005,skyDay:0};
 L.music='skybridge'; // reuse an existing licensed-in-app engine score
 for(const room of ROOMS)floorAndShell(k,room);
 // Floor tiles do not impede Force dodges or corridor navigation.
 for(const room of ROOMS)floorPlates(k,room);
 // Pipes, brushed/inked wall relief, rivets and reflective cladding.
 for(const room of ROOMS){
  // In narrow hallways, ALL prior stamped wall overlays are superseded by
  // the owner's enlarged full 3D GLB geometry. Do not leave flat squares,
  // repeated trims or former conduit sheets behind the replacement wall.
  const replacedHall=['spine','west_corridor','east_corridor','riser','turn'].includes(room.id);
  if(!replacedHall){
    const decorFrom=k.L.deco.length, pipeFrom=k.L.pipes.length;
    wallPanels(k,room);
    if(room.ceiling>4)drawWallCircuit(k,room);
    if(SUMI_OWNER_ROOM_IDS.includes(room.id)){
      // Suppress ONLY the old panels and face piping after both GLBs load.
      // In the meantime the full metal room remains visible as a fallback.
      for(const d of k.L.deco.slice(decorFrom)) d.ownerWallFallback=true;
      for(const p of k.L.pipes.slice(pipeFrom)) p.ownerWallFallback=true;
    }
  }
  portalFrames(k,room);
  ceilingRibs(k,room);
 }
 // Hallways only: the GLB now replaces the original shell's VISIBLE geometry.
 // Structural collision and door apertures remain fixed for compatibility.
 addSumiGLBRoomWalls(k,ROOMS);
 // Separate owner-uploaded GLB wall/corner set, intentionally excluding
 // already-finished halls, duct mouths, medical, reactor and docking bays.
 L.ownerWallInstances=sumiOwnerWallPlacements();
 ventilationDetail(k);sumiBrushAccents(k);stageProps(k);
 // Walkable second story: ramp, 90 m gallery, safety-railed bridge and lookout.
 addUpperGallery(k);
 addSumiGLBUpperAndHangarWalls(k); // ONLY the enclosed upper hallway
 // Different raised utility designs in each wing, not a cloned panel.
 addStrongholdWallSystems(k);
 // Decorative 3D models are added after structure to avoid disturbing it.
 addStrongholdModels(k);
 return L;
}

export const SUMI_STRONGHOLD=Object.freeze({
 id: STRONGHOLD.id,label:STRONGHOLD.label,layout:createSumiStronghold(),
});
