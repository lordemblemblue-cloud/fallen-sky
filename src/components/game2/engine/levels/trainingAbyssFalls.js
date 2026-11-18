// Game 2's first terrain-attached cascade pass: visible source pools, recessed
// streams, stepped limestone contact points and splashes at the actual shore.
// All coordinates derive from the very same surface function that creates
// the far arena mountains: not free-floating waterfall rectangles or decals.
// Visual-only geometry: no modifications to PvP paths, collision or killY.
import { meshBuilder } from '../level/builder.js';
import { TRAINING_ABYSS } from './trainingGarden.js';
import { MOUNTAIN_STAGE_ONE, ABYSS_WATERFALLS, waterfallAngle,
  mountainSurfacePoint } from './trainingAbyssMountains.js';
import { mulberry32 } from '../level/kit.js';
import { encodeTrainingWaterOpticalDepth, TRAINING_RIVER_OPTICAL_DEPTH_M } from './trainingWaterOptics.js';

const near=MOUNTAIN_STAGE_ONE.layers[0], PI2=Math.PI*2;
const ROCK=[.29,.32,.30],DARK_WET=[.15,.215,.20],
  MOSS=[.13,.26,.11], SUN_MOSS=[.30,.40,.13];
export const FALL_SITES=ABYSS_WATERFALLS;
// The river continues a little past the *visual* mountain shoreline, into
// submerged rock, instead of sinking through a shoreline 35cm above the sea.
export function fallShoreT(site){
  let lo=0, hi=.30;
  for(let i=0;i<22;i++){
    const t=(lo+hi)*.5;
    const p=mountainSurfacePoint(near,waterfallAngle(site,t),t);
    if(p[1]<TRAINING_ABYSS.waterY+.005)lo=t;
    else hi=t;
  }
  return (lo+hi)*.5;
}
export function abyssFallOutlets(){
  return FALL_SITES.map(site=>{
    const shore=fallShoreT(site);
    const p=fallPath(site,shore);
    return [p[0],p[2]];
  });
}

// Each quad samples the recessed gully and sits only a hand's breadth above
// the rock. The channel meanders, accelerates on steeper pieces, and empties
// below the exact computed waterline. Source pools are terrain-connected.
export function fallPath(site,t){
  const a=waterfallAngle(site,t);
  const shore=fallShoreT(site);
  const p=mountainSurfacePoint(near,a,t);
  // Relax the final 2m naturally into the clear mountain-ring water.
  const outlet= Math.max(0,Math.min(1,(t-shore)/.029));
  const rockTop=p[1];
  const streamTop=rockTop+.38+.12*Math.sin(t*19+site.phase);
  const settling=streamTop*outlet+
    (TRAINING_ABYSS.waterY+.055)*(1-outlet);
  p[1]=Math.max(rockTop+.045,settling);
  return p;
}
function riverEdge(site,t,side){
  const center=fallPath(site,t);
  const angle=waterfallAngle(site,t),r=Math.hypot(
    center[0]-TRAINING_ABYSS.cx,center[2]-TRAINING_ABYSS.cz);
  const localWidth=site.width*(.70+.24*Math.sin(t*PI2*2+site.phase));
  // Horizontal banks follow their *own* mountain sample instead of a
  // flat plane; slight crown in the middle models water depth and spill.
  const da=side*localWidth/(Math.max(6,r)*2);
  const rock=mountainSurfacePoint(near,angle+da,t);
  const lip=.43+.10*Math.cos(t*22+site.phase);
  return [rock[0],Math.max(center[1]-.12,
    rock[1]+lip-.13*Math.abs(side)),rock[2]];
}
// True geometric clearance between the flowing stream surface and its
// sampled bedrock. Render-only: no terrain, bridge, or movement changes.
export function sampleMountainStreamDepth(site,t,side){
  const top=riverEdge(site,t,side);
  const angle=waterfallAngle(site,t);
  const radialDistance=Math.hypot(
    top[0]-TRAINING_ABYSS.cx,top[2]-TRAINING_ABYSS.cz);
  const localWidth=site.width*(.70+.24*Math.sin(t*PI2*2+site.phase));
  const da=side*localWidth/(Math.max(6,radialDistance)*2);
  const bed=mountainSurfacePoint(near,angle+da,t);
  return Math.max(0,top[1]-bed[1]);
}
function ring(m,x,z,r0,r1,y,c,n=48){
  for(let i=0;i<n;i++){
    const a=PI2*i/n,b=PI2*(i+1)/n;
    const p=(r,t)=>[x+r*Math.cos(t),y,z+r*Math.sin(t)];
    m.quad(p(r0,a),p(r1,a),p(r1,b),p(r0,b),[0,1,0],c);
  }
}
function addFlow(site,water,foam,stone,spray){
  const shore=fallShoreT(site);
  const n=108,w=8,far=site.sourceT;
  for(let j=0;j<n;j++){
    const t0=far-(far-shore)*j/n,t1=far-(far-shore)*(j+1)/n;
    for(let k=0;k<w;k++){
      const s0=-1+2*k/w,s1=-1+2*(k+1)/w;
      const a=riverEdge(site,t0,s0),b=riverEdge(site,t0,s1);
      const c=riverEdge(site,t1,s1),d=riverEdge(site,t1,s0);
      // River-only RGB metadata: G = actual water-over-bedrock depth and
      // B = lateral bank proximity. The separate foam/spray batches keep
      // their original colors and geometry. No fake level-wide water plane.
      const midT=(t0+t1)*.5,midS=(s0+s1)*.5;
      const opticalDepth=sampleMountainStreamDepth(site,midT,midS);
      const encodedDepth=encodeTrainingWaterOpticalDepth(
        opticalDepth,TRAINING_RIVER_OPTICAL_DEPTH_M);
      const bank=Math.pow(Math.abs(midS),1.15);
      water.quad(a,b,c,d,[0,1,0],[.5,encodedDepth/255,bank]);
      if(k===0||k===w-1){
        // The old foam occupied an entire quarter of the water width at
        // each bank, producing conspicuous rectangular white ribbons.
        // Sample the SAME terrain-fitted edges but taper broken foam
        // to a narrow, raised strip that can reveal water between bursts.
        const flutter=Math.sin(j*.48+site.phase*3.1)+
          .35*Math.sin(j*2.32+site.phase+(k===0?0.:1.8));
        if(flutter>-.24){
          const outer=k===0?s0:s1,sgn=k===0?1:-1;
          const widthAt=t=>(.16+.13*(.5+.5*Math.sin(t*37.+site.phase)))*
            (s1-s0);
          const o0=riverEdge(site,t0,outer),o1=riverEdge(site,t1,outer);
          const i0=riverEdge(site,t0,outer+sgn*widthAt(t0));
          const i1=riverEdge(site,t1,outer+sgn*widthAt(t1));
          const lift=p=>[p[0],p[1]+.035,p[2]];
          const t=(t0+t1)*.5;
          foam.quad(lift(o0),lift(i0),lift(i1),lift(o1),[0,1,0],
            [.66+.07*Math.sin(t*44),.82,.82]);
        }
      }
    }
  }
  // A flowing source pool is a closed surface resting against the high rock.
  const start=fallPath(site,site.sourceT);
  ring(water,start[0],start[2],.22,site.width*1.12,start[1]+.035,
    [.5,.42,.08],42);
  // Stepped rock ledges in the real stream create a visible drop and
  // upward/off-axis spray: spray is anchored to those exact rock contacts.
  for(const t of [.63,.47,.30,.15]){
    if(t>=site.sourceT||t<shore+.014)continue;
    const at=fallPath(site,t),angle=waterfallAngle(site,t),r=Math.hypot(
      at[0]-TRAINING_ABYSS.cx,at[2]-TRAINING_ABYSS.cz);
    const tangent=[-Math.sin(angle),Math.cos(angle)];
    const width=site.width*.74;
    const centerY=mountainSurfacePoint(near,angle,t)[1];
    const normal=[Math.cos(angle),.45,Math.sin(angle)];
    const off=(s,y)=>[at[0]+tangent[0]*s,y,at[2]+tangent[1]*s];
    stone.quad(off(-width*.53,centerY+.10),off(width*.53,centerY+.10),
      off(width*.63,centerY+.34),off(-width*.63,centerY+.34),normal,ROCK);
    foam.quad(off(-width*.57,at[1]+.38),off(width*.57,at[1]+.38),
      off(width*.67,at[1]-.42),off(-width*.67,at[1]-.42),normal,
      [.81,.92,.89]);
    for(let q=0;q<13;q++){
      const s=(q/12-.5)*width*1.25,pr=off(s,at[1]-.22);
      const curl=Math.sin(q*2.7+site.phase);
      const tip=[pr[0]+Math.cos(angle)*(.28+.24*curl),
        pr[1]+.58+.60*(.5+.5*curl),pr[2]+Math.sin(angle)*(.32+.14*curl)];
      spray.quad(pr,[pr[0]+.13,pr[1],pr[2]],tip,
        [tip[0]-.13,tip[1]-.19,tip[2]],[0,1,0],
        [.48,.76,.80]);
    }
    void r;
  }
  // Wide translucent circular froth remains attached to the shoreline,
  // explicitly below the fatal fall threshold (killY=-8).
  const outlet=fallPath(site,shore);
  for(const [inner,outer,c] of [
    [.40,site.width*.69,[.68,.86,.84]],
    [site.width*.73,site.width*1.32,[.48,.70,.70]],
    [site.width*1.37,site.width*2.05,[.33,.57,.60]],
  ])ring(foam,outlet[0],outlet[2],inner,outer,
    TRAINING_ABYSS.waterY+.09,c,48);
}
function addMountainGrowth(moss,stone){
  // Moss + wild grass clumps actually grow on sampled rock shelves. Density
  // is deterministic across network clients, and geometry stays off paths.
  const rng=mulberry32(3180726);
  for(let i=0;i<2500;i++){
    const a=rng()*PI2,t=.11+rng()*.79;
    const p=mountainSurfacePoint(near,a,t);
    if(p[1] < TRAINING_ABYSS.waterY+2)continue;
    const bright=.72+rng()*.56,size=.4+rng()*1.45;
    const color=(rng()>.32?MOSS:SUN_MOSS).map(x=>x*bright);
    const dx=[Math.cos(a),Math.sin(a)],tan=[-dx[1],dx[0]];
    const base=[p[0],p[1]+.17,p[2]];
    const tip=[p[0]+(rng()-.5)*.27,p[1]+size*.84,p[2]+(rng()-.5)*.27];
    const side=(s)=>[base[0]+tan[0]*s,base[1],base[2]+tan[1]*s];
    // Two opposed blades: visible from either side without billboarding.
    moss.quad(side(-size*.24),side(size*.24),tip,
      [tip[0]-.12,tip[1]-.11,tip[2]-.07],[0,1,0],color);
    moss.quad([base[0]-dx[0]*size*.22,base[1],base[2]-dx[1]*size*.22],
      [base[0]+dx[0]*size*.22,base[1],base[2]+dx[1]*size*.22],
      tip,[tip[0]+.08,tip[1]-.16,tip[2]+.09],[0,1,0],color);
    if(i%11===0){
      const w=.4+rng()*.95;
      stone.box([p[0]-w,p[1]-.13,p[2]-w*.8],
        [p[0]+w,p[1]+w*.31,p[2]+w*.8],DARK_WET);
    }
  }
}
export function buildAbyssMountainFalls(){
  const river=meshBuilder(),whitewater=meshBuilder(),wetRock=meshBuilder(),
    splash=meshBuilder(),moss=meshBuilder();
  for(const site of FALL_SITES)addFlow(site,river,whitewater,wetRock,splash);
  addMountainGrowth(moss,wetRock);
  return Object.fromEntries(Object.entries({
    cascade:river,riverFoam:whitewater,waterfallRock:wetRock,
    waterfallSpray:splash,mountainMoss:moss,
  }).map(([name,m])=>[name,m.build()]));
}
