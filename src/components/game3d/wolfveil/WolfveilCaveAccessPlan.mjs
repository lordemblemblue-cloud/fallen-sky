// Game 3D clone: real walkable access from EXISTING Wolfveil trail junctions
// to the four existing cave mouths. The final threshold, underground ramp,
// chambers and existing exit belong to WolfveilCaveLayout.mjs.
import { WOLFVEIL_EXPLORABLE_CAVES } from './WolfveilCaveLayout.mjs';
import { wolfveilHeight } from './WolfveilLayout.js';

export const WOLFVEIL_CAVE_ACCESS_TRAILS=Object.freeze({
  jade_lantern_grotto:Object.freeze({
    trailName:'Training Forest Trail',
    junction:Object.freeze([-230,65]),
    bend:Object.freeze([-193,56]),
    style:'cedar_lantern',waymark:'JADE GROTTO',
  }),
  whispering_root_hollow:Object.freeze({
    trailName:'Western Woodland Fork',
    junction:Object.freeze([-335,145]),
    bend:Object.freeze([-286,128]),
    style:'root_steps',waymark:'ROOT HOLLOW',
  }),
  sunken_inkstone_cistern:Object.freeze({
    trailName:'Northern Ridge Path',
    junction:Object.freeze([-55,265]),
    bend:Object.freeze([-65,283]),
    style:'hot_spring_stone',waymark:'INKSTONE CISTERN',
  }),
  echoing_crystal_vault:Object.freeze({
    trailName:'Outrider Bridge Approach',
    junction:Object.freeze([87,205]),
    bend:Object.freeze([100,184]),
    style:'crystal_ridge',waymark:'CRYSTAL VAULT',
  }),
});
export const WOLFVEIL_CAVE_APPROACH_WIDTH=3.4; // pedestrian path, ~2.5 body widths
export const WOLFVEIL_CAVE_APRON_HALF_WIDTH=5.5; // guard the formerly open tile edges
export const WOLFVEIL_CAVE_RIM_GUARD_METRES=7*0.3048;

// Returns a surface trail ending exactly at the existing cave ramp threshold.
// Path points carry true Wolfveil terrain heights rather than painting a fake
// ground plane. Steep authored slope is sampled every 1.5m by the renderer.
export const WOLFVEIL_CAVE_APPROACHES=Object.freeze(
  WOLFVEIL_EXPLORABLE_CAVES.map(cave=>{
    const spec=WOLFVEIL_CAVE_ACCESS_TRAILS[cave.id];
    if(!spec)throw new Error('Missing access trail for '+cave.id);
    const [mx,mz]=cave.mouth,[dx,dz]=cave.dir;
    const front=[mx-dx*10.5,mz-dz*10.5];
    const anchor=[mx-dx*3.5,mz-dz*3.5];
    const surfacePoints=[
      {x:spec.junction[0],z:spec.junction[1],kind:'trail'},
      {x:spec.bend[0],z:spec.bend[1],kind:'turn'},
      {x:front[0],z:front[1],kind:'staging'},
      {x:anchor[0],z:anchor[1],kind:'threshold'},
    ].map(p=>Object.freeze({...p,y:p.kind==='threshold'?cave.threshold[1]:wolfveilHeight(p.x,p.z)}));
    const entrance=Object.freeze({
      x:mx,y:cave.mouthY-.35,z:mz,heading:Math.atan2(dx,dz),
      outdoorX:front[0],outdoorZ:front[1],
    });
    return Object.freeze({
      id:'access_'+cave.id,caveId:cave.id,label:cave.name,
      mouth:cave.mouth,threshold:cave.threshold,trailName:spec.trailName,
      style:spec.style,waymark:spec.waymark,points:Object.freeze(surfacePoints),
      entrance,dir:cave.dir,
      mapEntry:Object.freeze({x:spec.junction[0],z:spec.junction[1]}),
    });
  })
);

const distanceToSegment=(x,z,a,b)=>{
  const dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
  const t=len2>1e-6?Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/len2)):0;
  return Math.hypot(x-(a.x+dx*t),z-(a.z+dz*t));
};
export function nearestWolfveilCaveApproach(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return null;
  let best=null;
  for(const approach of WOLFVEIL_CAVE_APPROACHES){
    for(let i=1;i<approach.points.length;i++){
      const distance=distanceToSegment(x,z,approach.points[i-1],approach.points[i]);
      if(!best||distance<best.distance)best={approach,distance};
    }
  }
  return best;
}
export function isWolfveilCaveApproachReserved(x,z,padding=0){
  const near=nearestWolfveilCaveApproach(x,z);
  return near?near.distance<=WOLFVEIL_CAVE_APPROACH_WIDTH/2+Math.max(0,padding):false;
}
export function getWolfveilCaveApproach(caveId){
  return WOLFVEIL_CAVE_APPROACHES.find(a=>a.caveId===caveId)||null;
}
