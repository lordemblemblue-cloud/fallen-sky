// Game 3D clone: real walkable access from EXISTING Wolfveil trail junctions
// to the four existing cave mouths. The final threshold, underground ramp,
// chambers and existing exit belong to WolfveilCaveLayout.mjs.
import { wolfveilHeight, setWolfveilCaveApproachTerrainGrade, WOLFVEIL_ROUTES } from './WolfveilLayout.js';

export const WOLFVEIL_CAVE_ACCESS_TRAILS=Object.freeze({
  jade_lantern_grotto:Object.freeze({
    trailName:'South Residential Trail',
    junction:Object.freeze([-235,-280]),
    bend:Object.freeze([-300,-340]),
    style:'cedar_lantern',waymark:'JADE GROTTO',
  }),
  whispering_root_hollow:Object.freeze({
    trailName:'Western Woodland Fork',
    junction:Object.freeze([-325,235]),
    bend:Object.freeze([-410,268]),
    style:'root_steps',waymark:'ROOT HOLLOW',
  }),
  sunken_inkstone_cistern:Object.freeze({
    trailName:'Northern Ridge Path',
    junction:Object.freeze([0,470]),
    // West off the Ridge Path first, so every switchback stays >= 12.8 m from
    // it (the old bend at (-18,512) swung them to 5 m from the path, 10-36 m up).
    bend:Object.freeze([-16,470]),
    style:'hot_spring_stone',waymark:'INKSTONE CISTERN',
  }),
  echoing_crystal_vault:Object.freeze({
    trailName:'Quarry Approach',
    junction:Object.freeze([350,-40]),
    bend:Object.freeze([430,-38]),
    style:'crystal_ridge',waymark:'CRYSTAL VAULT',
  }),
});
export const WOLFVEIL_CAVE_APPROACH_WIDTH=3.4; // pedestrian path, ~2.5 body widths
export const WOLFVEIL_CAVE_APRON_HALF_WIDTH=6.8; // guard the formerly open tile edges
export const WOLFVEIL_CAVE_RIM_GUARD_METRES=7*0.3048;
// A built path, not the raw cliff. About 17 degrees. Steeper hills switch back.
export const WOLFVEIL_CAVE_APPROACH_MAX_GRADE=0.30;

function gradeLeg(from, to, endKind) {
  const maxGrade = WOLFVEIL_CAVE_APPROACH_MAX_GRADE;
  const step = 8;
  const pts = [];
  let x = from.x, z = from.z, y = from.y;
  let side = 1;
  for (let guard = 0; guard < 90; guard++) {
    const dx = to.x - x, dz = to.z - z;
    const dist = Math.hypot(dx, dz);
    const dy = to.y - y;
    if (dist < 5.5) break;
    if (Math.abs(dy) <= maxGrade * dist + 0.04) {
      const n = Math.max(1, Math.ceil(dist / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        pts.push({
          x: x + dx * t, z: z + dz * t, y: y + dy * t,
          kind: i === n ? endKind : 'path',
        });
      }
      return pts;
    }
    const fx = dx / dist, fz = dz / dist;
    const dirx = fx * 0.42 + (-fz) * side * 0.91;
    const dirz = fz * 0.42 + fx * side * 0.91;
    const len = Math.hypot(dirx, dirz) || 1;
    const climb = Math.sign(dy || 1) * maxGrade * step;
    const y2 = dy > 0 ? Math.min(to.y, y + climb) : Math.max(to.y, y + climb);
    x += dirx / len * step;
    z += dirz / len * step;
    y = y2;
    pts.push({ x, z, y, kind: 'turn' });
    if (guard % 3 === 2) side *= -1;
  }
  pts.push({ x: to.x, z: to.z, y: to.y, kind: endKind });
  return pts;
}

export const WOLFVEIL_CAVE_APPROACHES=Object.freeze(
  [].map(cave=>{
    const spec=WOLFVEIL_CAVE_ACCESS_TRAILS[cave.id];
    if(!spec)throw new Error('Missing access trail for '+cave.id);
    const [mx,mz]=cave.mouth,[dx,dz]=cave.dir;
    const front={x:mx-dx*10.5,z:mz-dz*10.5,y:wolfveilHeight(mx-dx*10.5,mz-dz*10.5)};
    const anchor={x:mx-dx*3.5,z:mz-dz*3.5,y:cave.threshold[1]};
    const junction={x:spec.junction[0],z:spec.junction[1],y:wolfveilHeight(spec.junction[0],spec.junction[1]),kind:'trail'};
    const bend={x:spec.bend[0],z:spec.bend[1],y:wolfveilHeight(spec.bend[0],spec.bend[1])};
    const surfacePoints=[
      junction,
      ...gradeLeg(junction,bend,'turn'),
      ...gradeLeg(bend,front,'staging'),
      ...gradeLeg(front,{...anchor,kind:'threshold'},'threshold'),
    ].map(p=>Object.freeze({...p,y:p.kind==='threshold'?cave.threshold[1]:p.y}));
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
const clamp01=v=>Math.max(0,Math.min(1,v));
const smooth01=v=>{const t=clamp01(v);return t*t*(3-2*t);};
const approachSegments=WOLFVEIL_CAVE_APPROACHES.flatMap(approach=>{
  const segs=[];
  for(let i=1;i<approach.points.length;i++){
    const a=approach.points[i-1],b=approach.points[i];
    const dx=b.x-a.x,dz=b.z-a.z,dy=b.y-a.y;
    const len2=dx*dx+dz*dz;
    if(len2<1e-4)continue;
    const pad=40;
    segs.push({
      ax:a.x,az:a.z,ay:a.y,dx,dz,dy,len2,
      minX:Math.min(a.x,b.x)-pad,maxX:Math.max(a.x,b.x)+pad,
      minZ:Math.min(a.z,b.z)-pad,maxZ:Math.max(a.z,b.z)+pad,
    });
  }
  return segs;
});

// Trails a cave approach runs beside but must not bury. The Inkstone Cistern
// switchbacks used to climb the hill 5 m west of the Ridge Path, 10-36 m above
// it; their fill and feather spread over the path and cut it with 8-15 m
// cliffs between benches (story mode, 2026-11-22). Inside these trails'
// corridors the ground stays natural, fading back to the grading over 3 m.
export const WOLFVEIL_CAVE_APPROACH_PROTECTED_TRAILS=Object.freeze(['ridge_path']);
// Natural to 1.5 m beyond the path's edge, full grading 3 m further out. The
// Cistern trail leaves the path at its junction, so a wider corridor would lift
// its first bench off the ground; its switchbacks now stay >= 12.8 m away.
const TRAIL_KEEP_MARGIN=1.5,TRAIL_KEEP_BAND=3;
const protectedTrailSegments=WOLFVEIL_ROUTES
  .filter(route=>WOLFVEIL_CAVE_APPROACH_PROTECTED_TRAILS.includes(route.id))
  .flatMap(route=>route.points.slice(1).map((p,i)=>({
    a:{x:route.points[i][0],z:route.points[i][1]},b:{x:p[0],z:p[1]},half:route.width/2,
  })));
/** 0 on a protected trail, 1 once clear of it: how much cave grading applies here. */
export function wolfveilCaveApproachTrailKeep(x,z){
  let keep=1;
  for(const s of protectedTrailSegments){
    const d=distanceToSegment(x,z,s.a,s.b);
    keep=Math.min(keep,smooth01((d-s.half-TRAIL_KEEP_MARGIN)/TRAIL_KEEP_BAND));
  }
  return keep;
}

// The hillside itself becomes the trail bench, then feathers back to the
// natural slope. The mouth is left alone so the arch stays where it was.
export function gradeWolfveilCaveApproachTerrain(x,z,y){
  if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(y))return y;
  for(const cave of []){
    if(Math.hypot(x-cave.mouth[0],z-cave.mouth[1])<6.5)return y;
  }
  let best=null;
  for(const s of approachSegments){
    if(x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;
    const t=Math.max(0,Math.min(1,((x-s.ax)*s.dx+(z-s.az)*s.dz)/s.len2));
    const py=s.ay+s.dy*t;
    const d=Math.hypot(x-(s.ax+s.dx*t),z-(s.az+s.dz*t));
    const feather=Math.min(34,7+Math.abs(py-y)*1.05);
    if(d>feather)continue;
    if(!best||d<best.d)best={d,py,feather};
  }
  if(!best)return y;
  const inner=2.15;
  const w=best.d<=inner?1:1-smooth01((best.d-inner)/Math.max(0.001,best.feather-inner));
  return y+(best.py-y)*w*wolfveilCaveApproachTrailKeep(x,z);
}
setWolfveilCaveApproachTerrainGrade(null);

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
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;
  const extra=Math.max(0,Number(padding)||0);
  const near=nearestWolfveilCaveApproach(x,z);
  if(near&&near.distance<=WOLFVEIL_CAVE_APPROACH_WIDTH/2+extra)return true;
  // The last 7m of the path expands to the wider cave floor. Preserve the
  // full side apron around the carved entrance and the seven-foot rim guard.
  for(const cave of []){
    const rx=x-cave.mouth[0],rz=z-cave.mouth[1];
    const f=rx*cave.dir[0]+rz*cave.dir[1],
      lateral=Math.abs(-rx*cave.dir[1]+rz*cave.dir[0]);
    if(f>=-12&&f<=12&&lateral<=WOLFVEIL_CAVE_APRON_HALF_WIDTH+extra)
      return true;
  }
  return false;
}
export function getWolfveilCaveApproach(caveId){
  return WOLFVEIL_CAVE_APPROACHES.find(a=>a.caveId===caveId)||null;
}

/**
 * Actual approach-side rail collision, local X/Z. Cosmetic posts at 5.9m
 * from the surface threshold centerline are solid to player/mount capsules.
 * The old cave-roof holes are now sealed; the designated interaction remains
 * unobstructed. Entry/exit still require E at the correct arch; this
 * rail code never sets an underground session or modifies Y.
 */
export function resolveWolfveilCaveEntranceRailCollision(now,previous,radius=.62){
  if(!now||!previous||![now.x,now.z,previous.x,previous.z].every(Number.isFinite))
    return false;
  const capsule=Math.max(0,Math.min(1.4,Number(radius)||.62));
  for(const cave of []){
    const [mx,mz]=cave.mouth,[dx,dz]=cave.dir;
    const along=p=>(p.x-mx)*dx+(p.z-mz)*dz;
    const lateral=p=>-(p.x-mx)*dz+(p.z-mz)*dx;
    const a=along(now),b=along(previous);
    if(Math.min(a,b)<-12.4||Math.max(a,b)>-3.7)continue;
    const barrier=5.9-capsule,oldSide=lateral(previous),newSide=lateral(now);
    if((oldSide<barrier&&newSide>=barrier)||
       (oldSide>-barrier&&newSide<=-barrier)){
      // Retain the old safe point: the broad 8.9m center passage still allows
      // normal movement; this only catches a direct sideways rail crossing.
      now.x=previous.x;
      now.z=previous.z;
      return true;
    }
  }
  return false;
}

