// Military ship landing bay at the former upper-gallery dead end.
// This is a dock and repair station for a future ship (NO ship or vehicle
// gameplay is implied). The bay is fully walkable, enclosed by real steel
// structure, with docking markings, loading gantries and a sealed blast door.
export const SUMI_LANDING_BAY=Object.freeze({
 id:'sumi_upper_docking_bay',
 floorY:4.2,
 z0:164,z1:230,
 x0:-12,x1:46,
 pad:Object.freeze({cx:17,cz:196,radius:15.2}),
 door:Object.freeze({x0:0,x1:34,z:230,height:12}),
 service:Object.freeze({x0:31,z0:171,x1:43,z1:221}),
});
const STEEL='steelGloss',METAL='rivetedSteel',DARK='metalDark',
  WALL='sumiWallSilver',FLOOR='sumiFloorGunmetal',CEILING='sumiCeilingTitanium',
 GRATE='gratedSteel',GLASS='glass',INK='hullDark',YELLOW='hazard';
const D=(k,a,b,m)=>k.deco(a,b,m);
const P=(k,a,b,r=.10,m=STEEL)=>k.pipe(a,b,r,m,14);

export function addSumiLandingBay(k){
 const {floorY:y,x0,x1,z0,z1,pad}=SUMI_LANDING_BAY;
 // Broad engineered deck from the old overlooking platform. The floor
 // extends directly through Z=164 with no gap or tall step. Thin structural
 // slab has real walking faces plus nonblocking vertical underside braces.
 k.solid([x0,y-.36,z0],[x1,y,z1],FLOOR);
 k.zone('upper_ship_landing',x0+1,z0+1,x1-1,z1-1);
 k.zone('ship_berth',0,176,34,220);
 // Uneven foundation with broad support columns so nothing floats in the void.
 for(const x of [-10.5,43.9])for(let z=169;z<=222;z+=13.25){
  k.solid([x-.50,0,z-.6],[x+.5,y-.33,z+.6],DARK);
  D(k,[x-.66,y-.70,z-.8],[x+.66,y-.36,z+.8],STEEL);
 }
 for(const z of [169,183,197,211,225]){
  D(k,[x0+1,y-.81,z-.33],[x1-1,y-.39,z+.33],DARK);
  P(k,[x0+1,y-.95,z+.52],[x1-1,y-.95,z+.52],.115,STEEL);
 }

 // Floor panel layout: NO coplanar steel surfaces. Each layer is strictly
 // separated from the deck by at least 15mm, and trim by another 15mm.
 for(let z=z0+.6;z<z1-1.4;z+=4.2){
  for(let x=x0+.7;x<x1-1.4;x+=4.2){
   const X=Math.min(x+3.77,x1-.6),Z=Math.min(z+3.77,z1-.6);
   D(k,[x,y+.014,z],[X,y+.035,Z],(Math.round(x+z)%9===0)?GRATE:FLOOR);
   D(k,[x,y+.052,z],[X,y+.071,z+.075],DARK);
   D(k,[x,y+.052,z],[x+.075,y+.071,Z],DARK);
   for(const [cx,cz] of [[x+.18,z+.18],[X-.18,Z-.18]]){
    D(k,[cx-.065,y+.081,cz-.065],[cx+.065,y+.091,cz+.065],INK);
    D(k,[cx-.025,y+.101,cz-.025],[cx+.025,y+.107,cz+.025],STEEL);
   }
  }
 }
 // Marked ship footprint: no hard object obstructs an actual future ship.
 // Double segmented taxi ring, offset centerline, yellow hazard chevrons.
 k.ring(pad.cx,pad.cz,pad.radius-.68,pad.radius,y+.120,.035,YELLOW,96,false);
 k.ring(pad.cx,pad.cz,pad.radius+1.17,pad.radius+1.34,y+.120,.032,DARK,96,false);
 for(const side of [-1,1]){
  const x=pad.cx+side*(pad.radius+2.4);
  for(let z=178;z<216;z+=4.8){
   D(k,[x-.28,y+.142,z],[x+.28,y+.158,z+1.1],YELLOW);
   D(k,[x-.28,y+.170,z+1.24],[x+.28,y+.185,z+1.40],DARK);
  }
 }
 for(let z=178;z<215;z+=5){
  D(k,[pad.cx-.055,y+.143,z],[pad.cx+.055,y+.160,z+2.1],STEEL);
 }
 // Ship-sized docking clamps are parked OUTSIDE the 30.4m ring, rather
 // than colliding with player movement or filling the flight berth.
 for(const [x,z] of [[-1,181],[35,181],[-1,213],[35,213]]){
  k.solid([x-1.08,y,z-1.28],[x+1.08,y+.60,z+1.28],DARK);
  D(k,[x-.90,y+.61,z-1.01],[x+.90,y+.78,z+1.01],STEEL);
  for(const dx of [-.62,.62]){
   P(k,[x+dx,y+.73,z-.82],[x+dx,y+1.40,z-.18],.075,METAL);
   D(k,[x+dx-.12,y+1.30,z-.27],[x+dx+.12,y+1.45,z+.12],GRATE);
  }
  D(k,[x-.25,y+.80,z+.35],[x+.25,y+.84,z+.68],'blue');
 }
 // Full-height engineered cladding. The entrance remains an actual x12..24
 // opening in the older overlook's north wall (removed in UpperGallery).
 for(const x of [x0,x1-.65]){
  k.solid([x,y,z0],[x+.65,18.6,z1],WALL);
  for(let z=z0+2;z<z1-2;z+=7.8){
   D(k,[x-.16,y+1.2,z],[x+.80,16.7,z+.22],METAL);
   D(k,[x-.18,y+3.0,z+.27],[x+.81,3.9+y,z+.38],STEEL);
   D(k,[x-.13,15.5,z+.30],[x+.79,16.15,z+3.35],GRATE);
  }
 }
 // Close the bay's previously OPEN south elevation around the upper-gallery
 // entrance. The old landing bay had west, east and north walls plus a roof,
 // but no south wall at z=164. The sunset/sky was visible on BOTH sides of
 // the connecting hallway in the owner's screenshots.
 //
 // Keep x=13..24 and y=4.2..10 as a genuine full-height door opening.
 // Structural solids are the source of both visuals and physical collision;
 // the trim below is render-only and cannot become an invisible barrier.
 const portal={left:13,right:24,bottom:y,top:10};
 const southBack=z0-.24,southFront=z0+.45;
 for(const [a,b] of [[x0,portal.left],[portal.right,x1]]){
   k.solid([a,y,southBack],[b,18.6,southFront],WALL,false);
   // Recessed industrial pressed plates repeat only ON the new bulkhead.
   for(let x=a+.65;x<b-.6;x+=3.6){
     const end=Math.min(x+3.05,b-.55);
     D(k,[x,y+1.05,southFront+.018],[end,17.3,southFront+.087],METAL);
     D(k,[x+.12,y+1.22,southFront+.094],[end-.12,16.95,southFront+.13],STEEL);
     for(const h of [y+1.18,y+6.45,16.95])
       D(k,[x-.08,h,southFront+.13],[end+.08,h+.10,southFront+.17],INK);
   }
 }
 // A full-width lintel closes the large open sky gap ABOVE the corridor roof.
 k.solid([portal.left,portal.top,southBack],[portal.right,18.6,southFront],WALL,false);
 for(let x=portal.left+.35;x<portal.right-.55;x+=1.75)
   D(k,[x,10.65,southFront+.03],
       [Math.min(x+1.3,portal.right-.25),17.85,southFront+.10],METAL);
 // Thick mechanical jambs and overhead gasket surround—not cross—the exit.
 for(const x of [portal.left-.30,portal.right]){
   D(k,[x,y,southFront+.12],[x+.30,10.25,southFront+.33],STEEL);
   D(k,[x+.06,y+.22,southFront+.35],[x+.21,9.65,southFront+.39],INK);
 }
 D(k,[portal.left,9.86,southFront+.12],
   [portal.right,10.26,southFront+.34],STEEL);
 D(k,[portal.left+.18,10.31,southFront+.12],
   [portal.right-.18,10.40,southFront+.30],GRATE);
 // A physical, visibly attached overhead crossbeam joins the entrance
 // steelwork to the existing hangar ceiling. No floor-level cross pipe.
 D(k,[portal.left-.2,18.18,z0+.48],
   [portal.right+.2,18.58,z0+1.04],METAL);

 // Overhead roof is TRUE solid steel, with service ribs fixed to its base.
 // Its walking-top collision is disabled; nobody should teleport upstairs.
 k.solid([x0,18.6,z0],[x1,19.05,z1],CEILING,false);
 for(let z=z0+4;z<z1-2;z+=9.6){
  D(k,[x0+.70,18.34,z-.33],[x1-.70,18.61,z+.33],METAL);
  for(const x of [-7,5,17,29,41]){
   D(k,[x-.65,18.19,z-.37],[x+.65,18.37,z+.37],STEEL);
   D(k,[x-.42,18.14,z-.19],[x+.42,18.19,z+.19],'white');
  }
  k.lamp([17,18.15,z],'white');
 }
 // Overhead launch crane travelling along ONE high sidewall, away from
 // the flight path. Cable spools terminate on the fixed housing.
 for(const x of [x0+2.6,x1-2.6]){
  P(k,[x,17.3,z0+3],[x,17.3,z1-5],.21,STEEL);
  for(let z=z0+8;z<z1-4;z+=11){
   D(k,[x-.50,17.0,z-.55],[x+.50,17.5,z+.55],METAL);
   P(k,[x,16.95,z],[x,14.65,z],.085,STEEL);
   D(k,[x-.60,14.52,z-.36],[x+.60,14.72,z+.36],DARK);
  }
 }
 // Side maintenance sub-bays: consoles, ventilated doors, pressure canisters,
 // lifter controls and visibly attached pipe elbows. All sit at the edge.
 for(const x of [-8.65,37.2])for(const z of [175,190,209,221]){
  k.solid([x,y,z],[x+3.45,y+2.45,z+1.5],METAL);
  D(k,[x+.16,y+2.47,z+.13],[x+3.27,y+2.58,z+1.33],DARK);
  for(let n=0;n<9;n++)D(k,[x+.24+n*.32,y+1.0,z+1.51],
    [x+.42+n*.32,y+1.76,z+1.565],n%3===0?STEEL:GRATE);
  D(k,[x+.25,y+1.99,z+1.50],[x+1.03,y+2.11,z+1.58],'blue');
 }
 // Service-side fuel and coolant loop follows the side wall precisely.
 // Short 90-degree joints terminate in attached metal access couplers.
 for(const x of [x0+1.15,x1-1.15]){
  for(const h of [9.4,10.2]){
   P(k,[x,h,168],[x,h,224],.12,STEEL);
   for(let z=174;z<=217;z+=13){
    P(k,[x,h,z],[x+(x<x0+10?1.6:-1.6),h,z],.09,METAL);
    D(k,[x-.35,h-.26,z-.3],[x+.35,h+.25,z+.3],DARK);
   }
  }
 }
 // Huge framed launch blast door at the far end. It is visibly SEALED
 // for now (there is no implemented spacecraft takeoff/door controller).
 // Splitting the steel halves into raised panels yields readable seams.
 k.solid([x0,y,z1-.7],[0,18.6,z1],DARK);
 k.solid([34,y,z1-.7],[x1,18.6,z1],DARK);
 for(const [a,b] of [[0,16.7],[17.3,34]]){
  k.solid([a,y,z1-.55],[b,16.8,z1],METAL);
  for(let x=a+.8;x<b-1.2;x+=3.2){
   D(k,[x,y+1.2,z1-.68],[x+2.35,14.9,z1-.58],DARK);
   D(k,[x+.13,y+1.36,z1-.77],[x+2.22,14.65,z1-.685],STEEL);
  }
 }
 D(k,[16.72,y,z1-.82],[17.28,16.8,z1-.65],INK);
 D(k,[-.1,16.8,z1-.77],[34.1,18.6,z1-.61],METAL);
 for(const x of [3.0,31.0]){
  D(k,[x-.55,8.6,z1-.84],[x+.55,10.2,z1-.75],DARK);
  D(k,[x-.25,8.9,z1-.87],[x+.25,9.7,z1-.83],'red');
 }
 k.lamp([17,17.0,229],'orange');
}
