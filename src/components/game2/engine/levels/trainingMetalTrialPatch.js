// One isolated, render-only material proof in the EXISTING Training Hall.
// This is not a new room and does not alter collision, spawn, combat, or maps.
// Target from existing player spawn [0,0,-9]: eastern/right wall x=13.3,
// z=-2.2..1.55; adjacent floor x=9.1..12.75, same z interval.
import { meshBuilder } from '../level/builder.js';

export const TRAINING_METAL_TRIAL = Object.freeze({
  id:'hall-east-wall-metal-reference',
  label:'METAL MATERIAL TEST',
  wall: Object.freeze({ x:13.25, z0:-2.2, z1:1.55, y0:0.58, y1:7.05 }),
  floor: Object.freeze({ x0:9.1, x1:12.75, z0:-2.2, z1:1.55, y:0.060 }),
  marker: Object.freeze([11.35,0.12,-2.65]),
  routeFrom: Object.freeze([0,0,-9]),
});
const C=Object.freeze({
  wall:[.225,.259,.281],wall2:[.185,.218,.251],
  floor:[.38,.414,.438],floor2:[.31,.347,.377],
  metal:[.43,.46,.49],dark:[.072,.091,.104],
  lip:[.62,.64,.64],bolt:[.68,.69,.67],
  yellow:[1,.71,.20],lamp:[1,.87,.49],
});
const quadFloor=(mesh,x0,z0,x1,z1,y,color)=>
  mesh.quad([x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1],[0,1,0],color);
function routeStrip(mesh,a,b,width,color){
  const dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz),s=width/(2*d);
  const nx=-dz*s,nz=dx*s;
  const y=.070;
  mesh.quad([a[0]+nx,y,a[1]+nz],[b[0]+nx,y,b[1]+nz],
    [b[0]-nx,y,b[1]-nz],[a[0]-nx,y,a[1]-nz],[0,1,0],color);
}
export function buildTrainingMetalTrialPatch(){
  const wall=meshBuilder(), floor=meshBuilder(), frame=meshBuilder();
  const bolts=meshBuilder(), route=meshBuilder(), lights=meshBuilder();
  const B=(mesh,a,b,color)=>mesh.box(a,b,color);
  const {wall:W,floor:F}=TRAINING_METAL_TRIAL;
  // Four real, separate metal wall modules, inset in a structural perimeter.
  // All are in front of the original east training-hall wall. We do NOT
  // overwrite the existing wall or its physics material.
  for(let col=0;col<2;col++)for(let row=0;row<2;row++){
    const z0=W.z0+.10+col*1.85,z1=z0+1.72;
    const y0=W.y0+.19+row*3.07,y1=y0+2.88;
    B(wall,[W.x-.032,y0,z0],[W.x+.020,y1,z1],
      (col+row)%2?C.wall2:C.wall);
    // Multiple shallow embossed plates with black recessed cutouts.
    for(const inset of [0,.058]){
      B(frame,[W.x-.060-inset*.27,y0+.10+inset,z0+.08+inset],
        [W.x-.030-inset*.27,y1-.10-inset,z1-.08-inset],
        inset?C.dark:C.metal);
    }
    // Actual geometry seams and an embossed central inspection line.
    B(frame,[W.x-.088,y0+.20,z0+.16],
      [W.x-.069,y0+.222,z1-.16],C.lip);
    for(const y of [y0+.16,y1-.16])for(const z of [z0+.17,z1-.17])
      B(bolts,[W.x-.117,y-.032,z-.036],[W.x-.079,y+.032,z+.036],C.bolt);
  }
  // Recessed rails above and below the sample, without hiding the original
  // upper cornice or touching neighboring indigo banners and wall sconces.
  for(const y of [W.y0,W.y1]){
    B(frame,[W.x-.18,y-.045,W.z0-.08],
      [W.x+.055,y+.048,W.z1+.08],C.metal);
    B(frame,[W.x-.190,y+.054,W.z0-.04],
      [W.x-.134,y+.075,W.z1+.04],C.lip);
  }
  for(const z of [W.z0-.07,W.z1+.07])
    B(frame,[W.x-.17,W.y0-.05,z-.07],[W.x+.048,W.y1+.11,z+.07],C.dark);

  // One adjoining ~3.65m floor sample: metal, dark gaskets and beveled
  // perimeter. Elevation is a few millimetres above the shipped floor tops.
  const count=3,pitch=(F.x1-F.x0)/count;
  for(let i=0;i<count;i++){
    const x0=F.x0+i*pitch+.065,x1=F.x0+(i+1)*pitch-.065;
    for(let j=0;j<2;j++){
      const z0=F.z0+j*1.875+.060,z1=F.z0+(j+1)*1.875-.060;
      B(floor,[x0,F.y,z0],[x1,F.y+.015,z1],(i+j)%2?C.floor2:C.floor);
      for(const z of [z0+.046,z1-.046]){
        B(frame,[x0+.046,F.y+.014,z-.012],
          [x1-.046,F.y+.032,z+.012],C.metal);
      }
      for(const x of [x0+.065,x1-.065])for(const z of [z0+.068,z1-.068])
        B(bolts,[x-.027,F.y+.016,z-.027],[x+.027,F.y+.041,z+.027],C.bolt);
    }
  }
  // A low luminous guide from the original spawn toward THIS PATCH ONLY.
  // Warm yellow (not white) is visible even before viewing the test wall.
  const path=[[.45,-8.40],[2.65,-7.25],[5.20,-5.70],
    [7.70,-3.82],[9.35,-2.75],[11.35,-2.65]];
  for(let i=0;i<path.length-1;i++){
    routeStrip(route,path[i],path[i+1],.055,C.yellow);
    if(i>0){
      const [x,z]=path[i];
      quadFloor(lights,x-.072,z-.072,x+.072,z+.072,.076,C.yellow);
    }
  }
  // A beacon and warm practical LED at the sample's left frame.
  // Geometry is the actual light source indicated by the shader; no
  // unmotivated screen-space glow or map-wide reflection is applied.
  B(frame,[W.x-.18,1.1,W.z0-.31],[W.x-.04,6.75,W.z0-.17],C.dark);
  B(lights,[W.x-.210,1.28,W.z0-.275],
    [W.x-.191,6.58,W.z0-.205],C.lamp);
  B(frame,[10.84,.08,-2.90],[11.56,.145,-2.45],C.dark);
  B(lights,[10.92,.147,-2.84],[11.48,.160,-2.51],C.yellow);
  return {
    wall:wall.build(),floor:floor.build(),frame:frame.build(),
    bolts:bolts.build(),route:route.build(),lights:lights.build(),
  };
}
