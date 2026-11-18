// Classic Wolfveil landscape design (2026-11-16): ONE authored plan for the
// whole valley. Unshifted local metres (+X east, +Z north); Play adds +70 m Z.
//
// The same data drives:
//   - the shared analytic terrain height (client mesh, BVH, server worker),
//   - the terrain surface palette (grass / dirt / rock / snow),
//   - the HUD minimap and world map (WolfveilMapDesign.mjs),
//   - the design image in docs/game3d/landscaping.
//
// Pure module: no THREE, no browser, and NO imports from WolfveilLayout.js
// (that module imports this one; a cycle would expose uninitialised data).
// Gameplay anchors below are copies of the authoritative spawn/site data;
// tests/game3d-clone-wolfveil-landscape-design.test.mjs pins them equal.

export const WOLFVEIL_LANDSCAPE_REVISION='wolfveil-landscape-design-v1-20261116';
export const WOLFVEIL_LANDSCAPE_PLAY_OFFSET_Z=70;
export const WOLFVEIL_LANDSCAPE_EXTENT=Object.freeze({
  minX:-550,maxX:550,minZ:-550,maxZ:550,playableHalfSpan:528,
});

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;

// ---------------------------------------------------------------------------
// Deterministic gradient noise (Perlin-style, seeded). [-1,1], C1 continuous.
// ---------------------------------------------------------------------------
function mulberry(seed){
  let s=seed>>>0;
  return ()=>{s=(s+0x6D2B79F5)>>>0;let t=Math.imul(s^(s>>>15),s|1);
    t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
const PERM=(()=>{
  const rng=mulberry(0x5f17ea),p=Array.from({length:256},(_,i)=>i);
  for(let i=255;i>0;i--){const j=Math.floor(rng()*(i+1));[p[i],p[j]]=[p[j],p[i]];}
  const out=new Uint8Array(512);for(let i=0;i<512;i++)out[i]=p[i&255];return out;
})();
const GRAD=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
const fade=t=>t*t*t*(t*(t*6-15)+10);
export function wolfveilNoise2(x,z){
  const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi;
  const X=xi&255,Z=zi&255;
  const g=(ix,iz,dx,dz)=>{const h=GRAD[PERM[ix+PERM[iz]]&7];return h[0]*dx+h[1]*dz;};
  const u=fade(xf),v=fade(zf);
  const n00=g(X,Z,xf,zf),n10=g(X+1,Z,xf-1,zf);
  const n01=g(X,Z+1,xf,zf-1),n11=g(X+1,Z+1,xf-1,zf-1);
  return clamp(1.42*lerp(lerp(n00,n10,u),lerp(n01,n11,u),v),-1,1);
}
// Ridged multifractal: sharp crest lines where the gradient noise crosses 0.
function ridged(x,z,octaves=3){
  let sum=0,amp=.5,freq=1,weight=1,norm=0;
  for(let i=0;i<octaves;i++){
    let n=1-Math.abs(wolfveilNoise2(x*freq+i*17.3,z*freq-i*9.1));
    n*=n;n*=weight;weight=clamp(n*1.6,0,1);
    sum+=n*amp;norm+=amp;amp*=.5;freq*=2.03;
  }
  return sum/norm;
}

// ---------------------------------------------------------------------------
// Mountain ranges. Spine vertices: [x, z, crest lift (m), half width (m)].
// The lift is ADDED to the valley's existing analytic height and combined
// between ranges with a smooth maximum (no doubled peaks where they meet).
// Boundary ranges run along the 1,100 m play edge; outer ranges are the
// distant snow skyline drawn by the streamed meadow beyond the edge.
// ---------------------------------------------------------------------------
export const WOLFVEIL_MOUNTAIN_RANGES=Object.freeze([
  {id:'wolf_ear_west',name:'Wolf-Ear Range',side:'north',seed:11,
    spine:[[-660,470,150,175],[-490,522,175,182],[-340,542,165,180],[-200,550,185,184],[-84,532,215,168],[-32,512,92,118]]},
  {id:'wolf_ear_east',name:'Wolf-Ear Range',side:'north',seed:12,
    spine:[[32,512,92,118],[78,538,220,168],[195,556,180,184],[325,548,170,180],[455,534,185,184],[660,480,150,175]]},
  {id:'cedar_spine',name:'Cedar Spine',side:'west',seed:21,
    spine:[[-660,470,150,175],[-580,330,172,168],[-566,190,184,164],[-580,40,172,164],[-566,-110,162,160],[-576,-260,132,150],[-596,-420,104,150],[-640,-580,84,150]]},
  {id:'highfall_range',name:'Highfall Range',side:'east',seed:31,
    spine:[[660,480,150,175],[580,360,176,168],[570,220,170,165],[580,80,160,160],[566,-60,150,158],[576,-200,122,150],[592,-340,96,150],[640,-580,84,150]]},
  {id:'southern_downs',name:'Southern Downs',side:'south',seed:41,
    spine:[[-640,-580,84,150],[-470,-604,74,158],[-310,-612,62,150],[-150,-620,50,140],[10,-626,46,140],[160,-612,56,140],[310,-610,62,140],[460,-600,76,150],[640,-580,84,150]]},
  // Distant skyline (outside the playable square; drawn by the streamed meadow).
  {id:'north_snow_ridge',name:'Snow Ridge',side:'north',seed:51,outer:true,
    spine:[[-980,760,330,300],[-560,830,410,320],[-150,812,480,330],[230,846,440,320],[640,812,390,310],[1000,730,310,300]]},
  {id:'west_snow_ridge',name:'Far Cedar Peaks',side:'west',seed:61,outer:true,
    spine:[[-900,-760,250,280],[-940,-320,310,300],[-930,100,350,300],[-910,520,340,300],[-980,760,330,300]]},
  {id:'east_snow_ridge',name:'Far Highfall Peaks',side:'east',seed:71,outer:true,
    spine:[[900,-760,250,280],[940,-300,310,300],[930,120,340,300],[910,540,350,300],[1000,730,310,300]]},
  {id:'south_far_hills',name:'Southern Far Hills',side:'south',seed:81,outer:true,
    spine:[[-900,-760,250,280],[-480,-930,170,260],[-60,-980,140,260],[360,-990,120,250],[900,-760,250,280]]},
].map(range=>Object.freeze({...range,spine:Object.freeze(range.spine.map(p=>Object.freeze(p)))})));

// Named summits for labels / the twin "wolf ear" spires.
export const WOLFVEIL_SUMMITS=Object.freeze([
  {id:'west_ear',name:'West Wolf-Ear',x:-84,z:532},
  {id:'east_ear',name:'East Wolf-Ear',x:78,z:538},
  {id:'cedar_crown',name:'Cedar Crown',x:-566,z:190},
  {id:'highfall_crown',name:'Highfall Crown',x:580,z:360},
  {id:'snow_crown',name:'Snow Ridge',x:-150,z:812},
].map(Object.freeze));

// Pre-computed per-segment data (arc length, bbox) for fast distance queries.
const RANGE_DATA=WOLFVEIL_MOUNTAIN_RANGES.map(range=>{
  const segs=[];let arc=0,maxHalf=0;
  for(let i=0;i<range.spine.length-1;i++){
    const a=range.spine[i],b=range.spine[i+1];
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1;
    const reach=Math.max(a[3],b[3])*1.36;
    maxHalf=Math.max(maxHalf,reach);
    segs.push({a,b,dx,dz,len,arc,
      minX:Math.min(a[0],b[0])-reach,maxX:Math.max(a[0],b[0])+reach,
      minZ:Math.min(a[1],b[1])-reach,maxZ:Math.max(a[1],b[1])+reach});
    arc+=len;
  }
  // A single straight axis per range gives a CONTINUOUS along-range
  // coordinate (the nearest-segment arc length jumps inside every bend).
  const first=range.spine[0],last=range.spine[range.spine.length-1];
  const axisLen=Math.hypot(last[0]-first[0],last[1]-first[1])||1;
  return {range,segs,length:arc,maxHalf,
    ox:first[0],oz:first[1],ux:(last[0]-first[0])/axisLen,uz:(last[1]-first[1])/axisLen,
    minX:Math.min(...segs.map(s=>s.minX)),maxX:Math.max(...segs.map(s=>s.maxX)),
    minZ:Math.min(...segs.map(s=>s.minZ)),maxZ:Math.max(...segs.map(s=>s.maxZ))};
});

// Distance to one range's spine plus smoothly blended crest lift / half width
// (null outside its reach). Every output is continuous in x/z: the distance
// is the true minimum, the crest values are a soft blend of the nearby
// segments, and `along` is measured on the range's own straight axis.
const segDist=[],segT=[];
function nearestSpine(rd,x,z){
  if(x<rd.minX||x>rd.maxX||z<rd.minZ||z>rd.maxZ)return null;
  let dMin=Infinity;
  for(let i=0;i<rd.segs.length;i++){
    const s=rd.segs[i];
    const t=clamp(((x-s.a[0])*s.dx+(z-s.a[1])*s.dz)/(s.len*s.len),0,1);
    const d=Math.hypot(x-s.a[0]-s.dx*t,z-s.a[1]-s.dz*t);
    segDist[i]=d;segT[i]=t;
    if(d<dMin)dMin=d;
  }
  let w=0,lift=0,half=0;
  for(let i=0;i<rd.segs.length;i++){
    const gap=segDist[i]-dMin;
    if(gap>30)continue;
    const s=rd.segs[i],k=Math.exp(-gap/6),t=segT[i];
    w+=k;lift+=k*lerp(s.a[2],s.b[2],t);half+=k*lerp(s.a[3],s.b[3],t);
  }
  return {d:dMin,along:(x-rd.ox)*rd.ux+(z-rd.oz)*rd.uz,lift:lift/w,half:half/w};
}

// Sculpted lift of ONE range: knife-edge crest, concave flanks, spurs that
// reach into the valley, couloirs/gullies running down the flanks and
// peaks/saddles along the crest. Returns metres (>= 0).
function rangeLift(rd,x,z){
  const n=nearestSpine(rd,x,z);
  if(!n)return 0;
  const seed=rd.range.seed;
  // Spurs: the flank reaches further where the along-spine noise is high.
  const spur=wolfveilNoise2(n.along*.0105+seed*3.1,seed*.53);
  const half=n.half*(1+.30*spur);
  const t=n.d/Math.max(20,half);
  if(t>=1)return 0;
  // Peaks and saddles along the crest.
  const crest=.80+.17*wolfveilNoise2(n.along*.0052+seed,seed*.37)+
    .09*wolfveilNoise2(n.along*.017-seed,seed*1.9);
  // Concave flank profile: steep near the crest, easing into foothills.
  const profile=Math.pow(1-t,1.62);
  // Couloirs: ridged noise elongated DOWN the flank (fine along the spine,
  // coarse across it) carves fluted gullies between rocky aretes.
  const gully=ridged(n.along*.031+wolfveilNoise2(n.d*.012,seed)*.9,n.d*.0105+seed*.71,3);
  const flank=smooth(.06,.32,t)*(1-smooth(.72,.98,t));
  const erosion=1-.24*(1-gully)*flank;
  // Fine rock relief scaled by height so foothills stay walkable.
  const rough=.055*wolfveilNoise2(x*.045+seed,z*.045)+.03*wolfveilNoise2(x*.11,z*.11-seed);
  let lift=Math.max(0,n.lift*crest*profile*erosion*(1+rough*(.35+.65*profile)));
  // Strata: stepped ledges only in cliff bands on the steeper upper flanks,
  // patchy along the range and broken by the couloirs, with wandering step
  // heights, so walls read as layered rock instead of contour terraces.
  const band=smooth(.30,.62,profile)*smooth(-.15,.45,wolfveilNoise2(n.along*.0085+seed*1.7,seed*.9));
  const ledges=band*smooth(.30,.70,gully)*.34;
  if(ledges>0){
    const step=7.5+2.5*wolfveilNoise2(n.along*.0055+seed,n.d*.008+seed*2.3);
    const q=lift/step,f=q-Math.floor(q);
    lift=lift*(1-ledges)+(Math.floor(q)+smooth(.42,.94,f))*step*ledges;
  }
  return lift;
}
// Smooth union of two ranges. The blend width shrinks with the smaller lift,
// so where a second range's influence begins (lift 0) there is no step.
const smoothMax=(a,b,k=18)=>{
  const kk=Math.min(k,a,b);
  if(kk<=1e-6)return Math.max(a,b);
  const h=clamp(.5+.5*(b-a)/kk,0,1);
  return lerp(a,b,h)+kk*h*(1-h);
};
// Raw (unmasked) combined lift of every range.
export function wolfveilMountainRawLift(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return 0;
  let lift=0;
  for(const rd of RANGE_DATA){
    const v=rangeLift(rd,x,z);
    if(v>0)lift=lift>0?smoothMax(lift,v):v;
  }
  return lift;
}

// ---------------------------------------------------------------------------
// Open fighting grounds: broad, level (or gently tilted) fields with clear
// sight lines, a framing berm and standing stones. No monster spawns.
// ---------------------------------------------------------------------------
export const WOLFVEIL_FIGHTING_GROUNDS=Object.freeze([
  {id:'moonlit_commons',name:'Moonlit Commons',x:-205,z:-30,radius:46,tilt:.32,
    purpose:'Open duel field beside town — first fights, sparring and duels'},
  {id:'southern_gate_fields',name:'Southern Gate Fields',x:25,z:-390,radius:85,tilt:.18,
    purpose:'Wide open battlefield south of the gate — group and faction fights'},
  {id:'howling_plateau',name:'Howling Plateau',x:-240,z:400,radius:52,tilt:.30,
    purpose:'High mountain shelf under the Wolf-Ear peaks — open fights with a view'},
].map(Object.freeze));

// ---------------------------------------------------------------------------
// Mob areas: copies of the authoritative encounter data
// (WolfveilEnemySpawns.WOLFVEIL_HOSTILE_ZONES, WolfveilZombieCamps.
// WOLFVEIL_ZOMBIE_CAMPS, the quarry dragon at WOLFVEIL_SITES.quarry).
// Each gets a level camp floor in a rocky hollow with a single open mouth
// facing the trail that leads to it.
// ---------------------------------------------------------------------------
export const WOLFVEIL_MOB_AREAS=Object.freeze([
  {id:'wolfveil_shadow_ravine',name:'Shadow Ravine',kind:'hostile',x:340,z:-165,radius:24,levels:[2,5],shape:'ravine',angle:.95},
  {id:'wolfveil_ruined_watch',name:'Ruined Watch',kind:'hostile',x:296,z:-205,radius:19,levels:[4,6],tier:'champion'},
  {id:'wolfveil_wolfstone_outskirts',name:'Wolfstone Outskirts',kind:'hostile',x:-325,z:235,radius:18,levels:[5,8]},
  {id:'scarred_south',name:'Scarred South',kind:'camp',x:310,z:-260,radius:24,levels:[3,3]},
  {id:'fallen_gate',name:'Fallen Gate',kind:'camp',x:390,z:-230,radius:24,levels:[10,10]},
  {id:'red_ravine',name:'Red Ravine',kind:'camp',x:420,z:-95,radius:24,levels:[15,15],shape:'ravine',angle:-.35},
  {id:'east_quarry',name:'East Quarry',kind:'camp',x:385,z:55,radius:24,levels:[20,20]},
  {id:'hidden_falls',name:'Hidden Falls Outskirts',kind:'camp',x:380,z:175,radius:24,levels:[25,25]},
  {id:'northern_rift',name:'Northern Rift',kind:'camp',x:300,z:285,radius:24,levels:[30,30],shape:'ravine',angle:.4},
  {id:'wolfstone_reach',name:'Wolfstone Reach',kind:'camp',x:-380,z:295,radius:24,levels:[35,35]},
  {id:'western_cedar',name:'Western Cedar',kind:'camp',x:-430,z:165,radius:24,levels:[40,40]},
  {id:'bluewood',name:'Bluewood Hollow',kind:'camp',x:-430,z:5,radius:24,levels:[45,45]},
  {id:'southwest_ruins',name:'Southwest Ruins',kind:'camp',x:-390,z:-190,radius:24,levels:[50,50]},
  {id:'quarry_dragon',name:'Abandoned Stone Quarry',kind:'boss',x:350,z:-40,radius:30,levels:[12,12],shape:'quarry'},
].map(Object.freeze));

// ---------------------------------------------------------------------------
// Frontier trails: new graded dirt trails that make the encounter loop and
// the fighting grounds reachable. The Hunter's Loop visits every camp in
// level order: south-east (Lv 3) -> east -> north highlands -> west (Lv 50).
// Existing WOLFVEIL_ROUTES are untouched; these are drawn alongside them.
// ---------------------------------------------------------------------------
export const WOLFVEIL_FRONTIER_TRAILS=Object.freeze([
  {id:'hunters_loop_east',name:"Hunter's Loop · East",kind:'frontier',width:3.4,
    points:[[205,-96],[238,-160],[272,-218],[310,-252],[352,-240],[390,-222],[414,-160],[420,-104],[392,-70],[350,-40],[372,8],[385,48],[398,110],[382,168],[352,232],[304,278]]},
  {id:'hunters_loop_north',name:"Hunter's Loop · Highlands",kind:'frontier',width:3.2,
    // Crosses the vortex lake's carved mountain mouth at its shallow north end.
    points:[[304,278],[290,345],[268,410],[214,429],[150,428],[70,430],[2,432],[-70,424],[-150,412],[-240,400],[-310,370],[-372,300]]},
  {id:'hunters_loop_west',name:"Hunter's Loop · Cedar Spine",kind:'frontier',width:3.2,
    points:[[-372,300],[-412,236],[-428,172],[-440,90],[-432,12],[-424,-80],[-392,-182],[-330,-200],[-263,-93]]},
  {id:'south_fields_way',name:'Southern Fields Way',kind:'frontier',width:4.2,
    points:[[0,-225],[8,-262],[16,-300]]},
  {id:'commons_spur',name:'Commons Spur',kind:'frontier',width:3.6,
    points:[[-205,-113],[-214,-82]]},
].map(trail=>Object.freeze({...trail,points:Object.freeze(trail.points.map(p=>Object.freeze(p)))})));

// Sites whose authored height must never move (radius full / fade in metres).
const PROTECTED_SITES=Object.freeze([
  [0,-70,190,250],      // town, market and imported town plateau
  [0,-225,40,80],       // southern gate
  [0,115,60,105],       // Luna palace pad and stairs
  [4,220,60,105],       // sanctuary
  [-216,76,36,72],[-312,148,36,72],[-82,312,36,72],[122,198,36,72], // cave mouths
  [-138,196,40,78],     // cave hub exit
  [-105,330,38,76],     // hot spring
  [142,179,44,88],[163,155,40,80], // waterfall + waterfall cave
  [171,152,32,68],[197,154,32,68], // lunar + astral gates (local)
  [205,320,62,108],     // vortex lake
  [-165,88,70,112],     // training grounds
  [-320,65,30,70],      // cedar forest landmark
]);
const RIVER_OUTLET_EXTENSION=Object.freeze([[237,-450],[268,-560],[300,-700],[330,-1100]]);

function siteWeight(x,z){
  let w=1;
  for(const p of PROTECTED_SITES){
    const dx=x-p[0],dz=z-p[1],d2=dx*dx+dz*dz;
    if(d2>=p[3]*p[3])continue;
    w*=smooth(p[2],p[3],Math.sqrt(d2));
    if(w<=0)return 0;
  }
  return w;
}
function protectionWeight(x,z,riverDistance,routeClearance,sites=siteWeight(x,z)){
  let w=sites;
  if(w<=0)return 0;
  // Keep the river corridor, its banks and the south-east outlet open.
  if(Number.isFinite(riverDistance))w*=smooth(34,95,riverDistance);
  let outlet=Infinity;
  for(let i=0;i<RIVER_OUTLET_EXTENSION.length-1;i++){
    const a=RIVER_OUTLET_EXTENSION[i],b=RIVER_OUTLET_EXTENSION[i+1];
    const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz;
    const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/l,0,1);
    outlet=Math.min(outlet,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
  }
  w*=smooth(40,150,outlet);
  // Every trail keeps a walkable notch / pass through the ranges.
  if(Number.isFinite(routeClearance))w*=smooth(6,26,routeClearance);
  return w;
}

// Mountain lift after protection masks. Fighting grounds and mob hollows
// cut level floors into it (a camp at a range foot sits in a carved bowl).
export function wolfveilMountainLift(x,z,riverDistance=Infinity,routeClearance=Infinity,sites){
  const raw=wolfveilMountainRawLift(x,z);
  if(raw<=0)return 0;
  let w=protectionWeight(x,z,riverDistance,routeClearance,sites);
  if(w<=0)return 0;
  for(const f of WOLFVEIL_FIGHTING_GROUNDS){
    const d=Math.hypot(x-f.x,z-f.z);
    if(d<f.radius+70)w*=smooth(f.radius+12,f.radius+70,d);
  }
  for(const m of WOLFVEIL_MOB_AREAS){
    const d=Math.hypot(x-m.x,z-m.z);
    if(d<m.radius+64)w*=smooth(m.radius+10,m.radius+64,d);
  }
  return raw*w;
}

// --------------------------- trails / road beds ----------------------------
function trailSegments(routes){
  const segs=[];
  for(const route of routes)for(let i=0;i<route.points.length-1;i++){
    const a=route.points[i],b=route.points[i+1];
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1,half=route.width/2,reach=half+9;
    segs.push({route,a,b,dx,dz,len,half,
      minX:Math.min(a[0],b[0])-reach,maxX:Math.max(a[0],b[0])+reach,
      minZ:Math.min(a[1],b[1])-reach,maxZ:Math.max(a[1],b[1])+reach});
  }
  return segs;
}
const FRONTIER_SEGMENTS=trailSegments(WOLFVEIL_FRONTIER_TRAILS);
export function wolfveilFrontierTrailClearance(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return Infinity;
  let best=Infinity;
  for(const s of FRONTIER_SEGMENTS){
    if(x<s.minX-30||x>s.maxX+30||z<s.minZ-30||z>s.maxZ+30)continue;
    const t=clamp(((x-s.a[0])*s.dx+(z-s.a[1])*s.dz)/(s.len*s.len),0,1);
    const c=Math.hypot(x-s.a[0]-s.dx*t,z-s.a[1]-s.dz*t)-s.half;
    if(c<best)best=c;
  }
  return best;
}
// Clearance to the WHOLE trail network (given routes + frontier trails),
// exact out to 40 m. The mountain-range trail notch fades over 6..26 m, so a
// clearance that gives up early (and jumps to Infinity) would leave a cliff.
let networkSegments=null,networkSource=null;
export function wolfveilTrailNetworkClearance(x,z,routes=[]){
  if(!Number.isFinite(x)||!Number.isFinite(z))return Infinity;
  if(networkSource!==routes){networkSource=routes;networkSegments=trailSegments([...routes,...WOLFVEIL_FRONTIER_TRAILS]);}
  let best=Infinity;
  for(const s of networkSegments){
    if(x<s.minX-31||x>s.maxX+31||z<s.minZ-31||z>s.maxZ+31)continue;
    const t=clamp(((x-s.a[0])*s.dx+(z-s.a[1])*s.dz)/(s.len*s.len),0,1);
    const c=Math.hypot(x-s.a[0]-s.dx*t,z-s.a[1]-s.dz*t)-s.half;
    if(c<best)best=c;
  }
  return best;
}
let roadSegmentCache=null,roadSegmentSource=null;
// Level the tread across its width and bench it into slopes (cut uphill,
// fill downhill) with a shallow drainage swale, so trails look built.
export function gradeWolfveilRoadBeds(x,z,height,baseHeightAt,routes,{riverDistance=Infinity,excludeAt=null}={}){
  if(!Number.isFinite(height)||typeof baseHeightAt!=='function')return height;
  if(roadSegmentSource!==routes){roadSegmentSource=routes;roadSegmentCache=trailSegments([...routes,...WOLFVEIL_FRONTIER_TRAILS]);}
  if(riverDistance<24)return height;
  let best=null,bestC=Infinity;
  for(const s of roadSegmentCache){
    if(x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;
    const t=clamp(((x-s.a[0])*s.dx+(z-s.a[1])*s.dz)/(s.len*s.len),0,1);
    const px=s.a[0]+s.dx*t,pz=s.a[1]+s.dz*t;
    const c=Math.hypot(x-px,z-pz)-s.half;
    if(c<bestC){bestC=c;best={px,pz};}
  }
  if(!best||bestC>7.5)return height;
  if(excludeAt?.(x,z)||excludeAt?.(best.px,best.pz))return height;
  const center=baseHeightAt(best.px,best.pz);
  if(!Number.isFinite(center))return height;
  // Large cuts would leave cliffs in the steepest mountain notches; limit
  // the levelling so the bed stays a gentle bench, never a trench.
  const cut=clamp(center-height,-3.2,3.2);
  const levelled=height+cut;
  const swale=-.14*Math.exp(-Math.pow((bestC-1.15)/.75,2));
  const keep=smooth(.35,7.5,bestC);
  const fade=smooth(24,40,riverDistance);
  return lerp(height,lerp(levelled+swale,height,keep),fade);
}

// ------------------------- fields & mob hollows ---------------------------
const featureCache=new Map();
function featurePlane(feature,baseAt){
  const key=feature.id;
  let p=featureCache.get(key);
  if(p&&p.baseAt===baseAt)return p;
  const r=feature.radius*.7;
  const c=baseAt(feature.x,feature.z);
  const gx=(baseAt(feature.x+r,feature.z)-baseAt(feature.x-r,feature.z))/(2*r);
  const gz=(baseAt(feature.x,feature.z+r)-baseAt(feature.x,feature.z-r))/(2*r);
  // Fields declare their own tilt; camp floors follow half the hillside slope
  // (spawn grounding allows it) so hollows never become uphill cliff walls.
  const tilt=feature.tilt??(feature.kind?(feature.shape==='quarry'?.35:.5):0);
  p={baseAt,c,gx:gx*tilt,gz:gz*tilt};
  featureCache.set(key,p);
  return p;
}
function gradeFightingGround(x,z,y,f,baseAt){
  const d=Math.hypot(x-f.x,z-f.z),outer=f.radius+30;
  if(d>=outer)return y;
  const p=featurePlane(f,baseAt);
  const floor=p.c+p.gx*(x-f.x)+p.gz*(z-f.z);
  // Framing berm just outside the field edge (broken where trails enter).
  const berm=.75*Math.exp(-Math.pow((d-f.radius-4.5)/3.2,2))*
    (.62+.38*wolfveilNoise2(Math.atan2(z-f.z,x-f.x)*2.6,f.radius));
  const blend=1-smooth(f.radius,outer,d);
  return lerp(y,floor,blend)+berm*smooth(f.radius-2,f.radius+3,d)*(1-smooth(f.radius+8,outer,d));
}
function gradeMobArea(x,z,y,m,baseAt){
  const dx=x-m.x,dz=z-m.z;
  let d=Math.hypot(dx,dz);
  if(m.shape==='ravine'){
    // Elongated gully: 1.9x longer along its axis.
    const ca=Math.cos(m.angle||0),sa=Math.sin(m.angle||0);
    const u=dx*ca+dz*sa,v=-dx*sa+dz*ca;
    d=Math.hypot(u/1.9,v);
  }
  const floorR=m.radius+3,rimR=m.radius+13,outer=m.radius+38;
  // The quarry pit blends out over a wider ring (to outer+14).
  if(d>=(m.shape==='quarry'?outer+14:outer))return y;
  const p=featurePlane(m,baseAt);
  const angle=Math.atan2(dz,dx);
  if(m.shape==='quarry'){
    // Terraced pit: floor 7 m down, three cut benches up to the rim.
    const t=clamp((d-floorR)/(rimR+16-floorR),0,1);
    const steps=Math.floor(t*3.999)/3,frac=t*3.999-Math.floor(t*3.999);
    const bench=steps+smooth(.72,1,frac)/3;
    const pit=p.c-7+7*bench;
    const blend=1-smooth(rimR+12,outer+14,d);
    return lerp(y,pit,blend);
  }
  const sunk=m.shape==='ravine'?3.6:1.2;
  const floor=p.c-sunk;
  // Rubble rim, broken by noise and open toward the camp's trail mouth.
  const rim=(m.shape==='ravine'?3.4:2.6)*Math.exp(-Math.pow((d-(floorR+rimR)*.5)/4.2,2))*
    (.55+.45*wolfveilNoise2(angle*2.2+m.x*.01,m.z*.01));
  const blend=1-smooth(floorR,outer,d);
  return lerp(y,floor,blend)+rim*smooth(floorR-1,floorR+4,d)*(1-smooth(rimR+6,outer,d));
}
export function gradeWolfveilLandscapeFeatures(x,z,height,baseAt,{riverDistance=Infinity,routeClearance=Infinity}={}){
  if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(height))return height;
  const sites=siteWeight(x,z);
  let y=height+wolfveilMountainLift(x,z,riverDistance,routeClearance,sites);
  if(typeof baseAt!=='function')return y;
  const guard=protectionWeight(x,z,riverDistance,Infinity,sites);
  if(guard<=0)return y;
  for(const f of WOLFVEIL_FIGHTING_GROUNDS){
    if(Math.abs(x-f.x)>f.radius+30||Math.abs(z-f.z)>f.radius+30)continue;
    y=lerp(y,gradeFightingGround(x,z,y,f,baseAt),guard);
  }
  for(const m of WOLFVEIL_MOB_AREAS){
    // Must cover the whole graded footprint (ravines: 1.9x along their axis).
    const reach=(m.radius+53)*(m.shape==='ravine'?1.9:1)+1;
    if(Math.abs(x-m.x)>reach||Math.abs(z-m.z)>reach)continue;
    y=lerp(y,gradeMobArea(x,z,y,m,baseAt),guard);
  }
  return y;
}

// ------------------------------ queries -----------------------------------
export function wolfveilFightingGroundAt(x,z,margin=0){
  for(const f of WOLFVEIL_FIGHTING_GROUNDS)
    if(Math.hypot(x-f.x,z-f.z)<=f.radius+margin)return f;
  return null;
}
export function wolfveilMobAreaAt(x,z,margin=0){
  let best=null,bestD=Infinity;
  for(const m of WOLFVEIL_MOB_AREAS){
    const d=Math.hypot(x-m.x,z-m.z)-m.radius*(m.shape==='ravine'?1.4:1);
    if(d<=margin&&d<bestD){best=m;bestD=d;}
  }
  return best;
}
// 0 on open meadow, 1 deep in a range (used for colour/vegetation choices).
export function wolfveilMountainness(x,z){
  return smooth(4,55,wolfveilMountainRawLift(x,z));
}

// ------------------------------ surface -----------------------------------
// Linear-space vertex colours (THREE vertex colours are linear).
const C=Object.freeze({
  meadow:[.105,.215,.055],meadowLush:[.074,.185,.043],meadowDry:[.245,.255,.085],
  forest:[.060,.120,.040],bankGrass:[.088,.205,.050],
  dirt:[.235,.150,.080],dirtDark:[.150,.095,.055],trail:[.300,.205,.115],
  turf:[.180,.250,.075],ring:[.285,.205,.120],
  scorched:[.115,.095,.060],ash:[.165,.150,.130],
  scree:[.255,.240,.215],rock:[.205,.200,.190],rockDark:[.110,.112,.115],
  rockWarm:[.270,.215,.165],snow:[.820,.850,.880],
  bankEarth:[.205,.175,.115],bankMoss:[.115,.165,.070],
});
const mix3=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
/**
 * Terrain surface for one vertex.
 * @returns {{color:number[],grass:number,rock:number,snow:number,dirt:number}}
 *   grass 0..1 = how much tall vegetation the spot should carry.
 */
export function wolfveilLandscapeSurface(x,z,y,slope,{
  riverDistance=Infinity,riverHalfWidth=9.5,routeClearance=Infinity,
  trailClearance=wolfveilFrontierTrailClearance(x,z),west=0,
}={}){
  const n1=wolfveilNoise2(x*.011,z*.011),n2=wolfveilNoise2(x*.043+7,z*.043-3);
  const n3=wolfveilNoise2(x*.13-11,z*.13+5);
  // Meadow base: large drifting patches of lush / sun-dried grass.
  let col=mix3(C.meadow,C.meadowLush,smooth(-.2,.6,n1));
  col=mix3(col,C.meadowDry,smooth(.25,.85,n2*.7+n1*.3)*.55);
  col=mix3(col,C.forest,clamp(west,0,1)*.55);
  let grass=1,dirt=0,rock=0,snow=0;
  // Riverbank: smooth grass to the water, dirt patches + rock spots at the edge.
  const edge=riverDistance-riverHalfWidth;
  if(edge<26){
    const bank=1-smooth(10,26,edge);
    col=mix3(col,C.bankGrass,bank*.85);
    const patch=smooth(.18,.55,wolfveilNoise2(x*.09+3.3,z*.09-1.7))*(1-smooth(1.5,7.5,edge));
    const rockSpot=smooth(.55,.8,wolfveilNoise2(x*.21-9,z*.21+4))*(1-smooth(.5,5,edge));
    col=mix3(col,C.dirt,patch*.9);
    col=mix3(col,C.rockDark,rockSpot*.75);
    dirt=Math.max(dirt,patch);rock=Math.max(rock,rockSpot);
    grass*=1-.85*Math.max(patch,rockSpot);
    if(edge<1.2){col=mix3(col,C.dirtDark,smooth(1.2,-1,edge)*.8);grass*=smooth(-.5,1.2,edge);}
  }
  // Trails: warm compacted dirt shoulders that fade into the grass.
  const trail=Math.min(routeClearance,trailClearance);
  if(trail<6){
    const s=1-smooth(.4,6,trail);
    col=mix3(col,C.trail,s*.75);dirt=Math.max(dirt,s);grass*=1-s;
  }
  // Open fighting grounds: trampled golden turf with a worn ring at the edge.
  for(const f of WOLFVEIL_FIGHTING_GROUNDS){
    const d=Math.hypot(x-f.x,z-f.z);
    if(d>f.radius+12)continue;
    const inside=1-smooth(f.radius-2,f.radius+10,d);
    col=mix3(col,C.turf,inside*.8);
    const ring=Math.exp(-Math.pow((d-(f.radius-3.5))/2.2,2));
    col=mix3(col,C.ring,ring*.85);
    grass*=1-inside*.92;dirt=Math.max(dirt,ring);
  }
  // Mob areas: scorched, ashen ground and bare dirt around every camp.
  for(const m of WOLFVEIL_MOB_AREAS){
    const reach=m.radius*(m.shape==='ravine'?1.9:1)+30;
    const d=Math.hypot(x-m.x,z-m.z);
    if(d>reach)continue;
    const core=1-smooth(m.radius*.6,reach,d);
    const blot=smooth(-.3,.5,n3+core*.8);
    col=mix3(col,m.shape==='quarry'?C.rockWarm:C.scorched,core*.9*blot);
    col=mix3(col,C.ash,core*.35*(1-blot));
    grass*=1-core*.95;dirt=Math.max(dirt,core);
  }
  // Mountains: scree and rock on steep ground, strata bands, snow above the line.
  const mountain=wolfveilMountainness(x,z);
  const steep=smooth(.55,1.15,slope);
  if(mountain<.3&&steep>0){
    // Valley cut banks (town plateau, trail benches): grassy earth with moss
    // and a little exposed soil, not mountain rock.
    const bank=steep*(1-mountain/.3);
    const earth=mix3(C.bankMoss,C.bankEarth,smooth(-.25,.55,n2)*.7+smooth(1,1.6,slope)*.3);
    col=mix3(col,earth,bank*.8);
    dirt=Math.max(dirt,bank*.35);grass*=1-bank*.6;
  }
  if(mountain>0){
    const strata=.5+.5*Math.sin(y*.21+n2*2.4);
    let stone=mix3(C.rock,C.rockDark,strata*.55+smooth(1.2,2.2,slope)*.25);
    stone=mix3(stone,C.rockWarm,smooth(.35,.9,n1)*.3);
    // Any steep face inside a range is bare rock (even low on the flank);
    // gentler mountain ground turns to rock with altitude/mountainness.
    const rockiness=clamp(Math.max(steep*smooth(.05,.3,mountain),
      mountain*smooth(.35,.75,slope)),0,1);
    col=mix3(col,C.scree,mountain*smooth(.25,.6,slope)*.6);
    col=mix3(col,stone,rockiness);
    rock=Math.max(rock,rockiness);grass*=1-rockiness;
    const snowLine=232+26*n1+12*n3;
    snow=smooth(snowLine-14,snowLine+18,y)*(1-smooth(.85,1.45,slope));
    col=mix3(col,C.snow,snow);grass*=1-snow;
  }
  // Fine speckle so flat colour never reads as plastic.
  const speckle=.94+.09*n3;
  return {color:[col[0]*speckle,col[1]*speckle,col[2]*speckle],
    grass:clamp(grass,0,1),rock,snow,dirt};
}

// Whether tall streamed grass belongs here (paths, rock, snow, camp floors and
// fighting-ground turf stay clear). Unshifted local coordinates.
export function wolfveilLandscapeAllowsTallGrass(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;
  if(wolfveilFrontierTrailClearance(x,z)<3.5)return false;
  if(wolfveilFightingGroundAt(x,z,6))return false;
  if(wolfveilMobAreaAt(x,z,8))return false;
  return wolfveilMountainness(x,z)<.55;
}

// Zone name for the HUD (most specific first). Unshifted local coordinates.
export function wolfveilLandscapeZoneAt(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return null;
  const field=wolfveilFightingGroundAt(x,z,4);
  if(field)return {id:field.id,name:field.name,kind:'fighting'};
  const mob=wolfveilMobAreaAt(x,z,6);
  if(mob)return {id:mob.id,name:mob.name,kind:'mob',levels:mob.levels};
  if(Math.hypot(x,z+70)<150)return {id:'town',name:'Wolfveil Town',kind:'safe'};
  if(Math.hypot(x+165,z-88)<70)return {id:'training',name:'Shadow Wolf Training Grounds',kind:'safe'};
  if(Math.hypot(x-4,z-220)<60)return {id:'sanctuary',name:'Wolf Sanctuary',kind:'safe'};
  if(wolfveilMountainness(x,z)>.5){
    let best=null,bestLift=0;
    for(const rd of RANGE_DATA){const v=rangeLift(rd,x,z);if(v>bestLift){bestLift=v;best=rd.range;}}
    if(best)return {id:best.id,name:best.name,kind:'mountain'};
  }
  return null;
}
