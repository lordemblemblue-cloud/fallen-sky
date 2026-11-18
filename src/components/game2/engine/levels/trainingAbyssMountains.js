// Game 2 / Stage 1: smooth mountainous environment around the circular
// abyss sparring platform. Render-only scenery, NEVER collision triangles.
// The existing arena, gallery towers, bridge, water and combat routes stay
// unchanged. Later stages may replace this simple vertex-color landscape
// with higher resolution rock, forest and waterfall materials.
import { TRAINING_ABYSS } from './trainingGarden.js';

export const MOUNTAIN_STAGE_ONE = Object.freeze({
  center: Object.freeze([TRAINING_ABYSS.cx, TRAINING_ABYSS.cz]),
  arenaRadius: TRAINING_ABYSS.radius,
  waterLevel: TRAINING_ABYSS.waterY,
  segments: 224,
  radialSegments: 36,
  // Starts outside the four gallery platforms (r≈75.5m), including
  // the longest connector. Mountains on the west sit further behind
  // the existing entrance bridge and courtyard.
  layers: Object.freeze([
    Object.freeze({ name: 'foothills', near: 106, far: 188, height: 55,
      westSetback: 106, palette: [.34,.32,.30], seed: .8 }),
    Object.freeze({ name: 'mountains', near: 162, far: 249, height: 89,
      westSetback: 58, palette: [.31,.34,.36], seed: 2.5 }),
    Object.freeze({ name: 'distantMountains', near: 214, far: 315, height: 125,
      westSetback: 14, palette: [.36,.39,.43], seed: 4.3 }),
    // Extra skyline ring overlaps the last range to avoid a visible horizon slot.
    // This is SCENERY ONLY: no invisible new walkable ground or multiplayer desync.
    Object.freeze({ name: 'horizonMountains', near: 282, far: 510, height: 176,
      westSetback: 10, palette: [.32,.36,.43], seed: 6.2 }),
  ]),
});

// Three waterfalls drain actual recessed channels in the near mountains.
// Their geometry is authored in trainingAbyssFalls.js using the same surface
// sampler and shoreline calculations, so the water cannot emerge from nowhere.
export const ABYSS_WATERFALLS = Object.freeze([
  Object.freeze({ angle:-.86, sourceT:.78, width:3.8, phase:.27 }),
  Object.freeze({ angle:.10, sourceT:.84, width:5.4, phase:1.75 }),
  Object.freeze({ angle:1.03, sourceT:.72, width:3.2, phase:3.41 }),
]);

function smooth01(x){ const a=Math.max(0,Math.min(1,x));return a*a*(3-2*a); }
function hashWave(a,phase){
  // Periodic Fourier ridges: no discontinuity at ±PI or random block tops.
  // Multiple broad frequencies imply a plausible connected mountain chain.
  return .48*Math.sin(a*5+phase)+.26*Math.sin(a*9-phase*.6)
    +.13*Math.cos(a*14+phase*1.8)+.08*Math.sin(a*23-phase*.9);
}
function radius(layer,angle,t) {
  // Push the near ranges farther from the original garden and entry bridge
  // on the WEST side of the arena, leaving a clear open approach.
  const west=smooth01((-.40-Math.cos(angle))/.6);
  const setback=layer.westSetback*west;
  return layer.near+(layer.far-layer.near)*t+setback;
}
function height(layer,angle,t){
  const ridge=hashWave(angle,layer.seed);
  const peaks=Math.max(.2,1+.48*ridge);
  // Broad eased slopes are intentional: this is the rough mountain blockout.
  // The gradual side slopes avoid straight walls and rectangular silhouettes.
  const envelope=Math.pow(Math.max(0,Math.sin(Math.PI*t)),1.20);
  const shoulder=.72+.28*Math.sin(Math.PI*(.78*t+.07));
  const secondary=.10*layer.height*envelope*
    Math.sin(angle*17+layer.seed+t*5.7)*Math.sin(t*Math.PI);
  // Broad strata, narrow fractured folds, and weathered ridgeline erosion.
  // Damp rock shelves keep visual changes meaningful rather than all noise.
  const strata=envelope*(1.3*Math.sin(angle*37+t*43+layer.seed)
    +.74*Math.cos(angle*71-t*26+layer.seed)
    +.34*Math.sin(angle*109+t*81));
  let channel=0;
  if(layer.name==='foothills'){
    for(const site of ABYSS_WATERFALLS){
      const center=waterfallAngle(site,t);
      const gap=Math.atan2(Math.sin(angle-center),Math.cos(angle-center));
      const bank=Math.exp(-Math.pow(gap/.038,2.0));
      const reach=smooth01((t-.025)/.055)*(1-smooth01((t-site.sourceT)/.047));
      channel+=reach*bank*(2.2+.85*Math.sin(t*21+site.phase));
    }
  }
  // Smaller but real displaced shelves prevent a smoothly rounded blockout
  // silhouette. Keep wave frequencies beneath angular/radial Nyquist limits;
  // all waterfalls use this SAME sampler for their carved bed coordinates.
  const outcrop=envelope*(.91*Math.sin(angle*29.0+t*47.0+layer.seed*1.3)
    +.52*Math.cos(angle*43.0-t*37.0-layer.seed));
  const scree=.58*envelope*Math.sin(angle*57.0+t*17.0)*
    Math.cos(angle*11.0-t*63.0);
  // Broad, winding erosion gullies cut into the slope, creating real
  // alternating cliff/rib silhouettes rather than only per-pixel shading.
  // Both terms are periodic in angle and taper to zero at the waterline;
  // the existing waterfall channels and ridge route are kept intact.
  const gully= Math.pow(Math.max(0,
    Math.sin(angle*13.0+1.15*Math.sin(t*6.0+layer.seed))),4);
  const erosion=envelope*smooth01((t-.075)/.16)*
    (1-smooth01((t-.78)/.19))*gully*(layer.name==='foothills'?5.8:8.1);
  const escarpment=envelope*
    Math.sin(t*18.0+Math.sin(angle*7.0+layer.seed)*.56)*
    (1-smooth01((t-.82)/.16))*1.25;
  // Fine mineral ledges are an additional visual pass over the existing
  // gullies and escarpment (both retained from the latest mountain update).
  const uplift=envelope*(.75*Math.sin(angle*41+5.3*t+layer.seed)*
    Math.sin(t*57-angle*19)+.43*Math.cos(angle*53+t*49-layer.seed));
  const etching=envelope*.33*Math.cos(angle*83+t*33+layer.seed)*
    Math.sin(angle*23-t*41);
  const terrain=-17+envelope*shoulder*layer.height*peaks+
    secondary+strata+outcrop+scree+uplift+etching-channel-erosion+escarpment;
  // A genuine foot route now connects the circular arena to two mountain
  // overlooks. Sculpt a smoothly feathered east/southeast gorge through
  // ONLY the nearest foothills so the walkable stone isn't buried in opaque
  // background triangles. This is not a collision substitute: the platforms
  // and bridges have authored, testable collision in trainingGarden.js.
  if(layer.name==='foothills'){
    const delta=Math.atan2(Math.sin(angle+.36),Math.cos(angle+.36));
    const lateral=smooth01((.27-Math.abs(delta))/.12);
    const along=smooth01((t-.02)/.13)*(1-smooth01((t-.76)/.20));
    const cut=lateral*along;
    return terrain-Math.max(0,terrain+8)*cut;
  }
  return terrain;
}
export function waterfallAngle(site,t){
  return site.angle+.017*Math.sin(t*11.5+site.phase)-.009*Math.sin(t*21.0+site.phase);
}
export function mountainSurfacePoint(layer,angle,t){
  const r=radius(layer,angle,t),y=height(layer,angle,t);
  return [MOUNTAIN_STAGE_ONE.center[0]+r*Math.cos(angle),y,
    MOUNTAIN_STAGE_ONE.center[1]+r*Math.sin(angle)];
}
// Waterline is computed against the SAME curved foothill profile that is
// rendered above it. This makes the surrounding rock rise out of the pond,
// rather than hiding a rectangular water plane under disconnected cliffs.
export function mountainShoreT(angle){
  const layer = MOUNTAIN_STAGE_ONE.layers[0];
  let lo=0, hi=.34;
  for(let i=0;i<22;i++){
    const t=(lo+hi)*.5;
    if(height(layer,angle,t) < TRAINING_ABYSS.waterY+.35)lo=t;
    else hi=t;
  }
  return (lo+hi)*.5;
}
export function mountainShoreRadius(angle) {
  return radius(MOUNTAIN_STAGE_ONE.layers[0],angle,mountainShoreT(angle));
}

function vertexColor(layer,angle,t,y){
  const sunlight=.88+.11*Math.max(0,Math.cos(angle-1.12));
  const strata=.96+.055*Math.sin(angle*16.0+layer.seed+t*13);
  const altitude=smooth01((y-24)/102);
  const cool=altitude*(layer.name==='distantMountains'?.15:.08);
  const c=layer.palette.map((base,k)=>
    Math.min(1,Math.max(0,base*sunlight*strata*
      (1-altitude*.12)*(k===2?1+cool:k===0?1-cool*.52:1))));
  return c;
}
export function buildMountainLayer(layer,segments=MOUNTAIN_STAGE_ONE.segments,
  rows=MOUNTAIN_STAGE_ONE.radialSegments){
  if(segments<16||rows<3)throw new RangeError('Mountain mesh tessellation too low');
  const stride=segments+1,pos=[],colors=[],idx=[];
  for(let j=0;j<=rows;j++){
    const t=j/rows;
    for(let i=0;i<=segments;i++){
      const a=(i/segments)*Math.PI*2;
      const [x,y,z]=mountainSurfacePoint(layer,a,t);
      pos.push(x,y,z);
      const color=vertexColor(layer,a,t,y);
      colors.push(...color.map(c=>Math.round(c*255)),255);
    }
  }
  for(let j=0;j<rows;j++)for(let i=0;i<segments;i++){
    const a=j*stride+i,b=a+1,c=b+stride,d=a+stride;
    // θ then radius gives upward normals for a flat XY-polar surface.
    idx.push(a,b,c,a,c,d);
  }
  // Accumulate geometric normals over *shared* vertices; the surfaces look
  // smooth in daylight and the WebGL shader can still add mineral detail.
  const normals=new Float32Array(pos.length);
  for(let n=0;n<idx.length;n+=3){
    const i0=idx[n]*3,i1=idx[n+1]*3,i2=idx[n+2]*3;
    const ux=pos[i1]-pos[i0],uy=pos[i1+1]-pos[i0+1],uz=pos[i1+2]-pos[i0+2];
    const vx=pos[i2]-pos[i0],vy=pos[i2+1]-pos[i0+1],vz=pos[i2+2]-pos[i0+2];
    const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx;
    for(const id of [i0,i1,i2]){normals[id]+=x;normals[id+1]+=y;normals[id+2]+=z;}
  }
  // Duplicate seam vertices have the same position, color AND normal.
  for(let j=0;j<=rows;j++){
    const first=j*stride*3,last=(j*stride+segments)*3;
    for(let k=0;k<3;k++){
      const n=(normals[first+k]+normals[last+k])*.5;
      normals[first+k]=n;normals[last+k]=n;
    }
  }
  for(let i=0;i<normals.length;i+=3){
    const length=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;
    normals[i]/=length;normals[i+1]/=length;normals[i+2]/=length;
  }
  // Slope-dependent terrain colors: rough vertical rock stays dark; sheltered,
  // damp, gently sloped ledges pick up moss, scattered grass and lichen.
  // This is vertex-scale growth. Fragment shader provides micro-scale grain.
  for(let i=0;i<pos.length;i+=3){
    const k=i/3,ny=Math.max(0,normals[i+1]);
    const x=pos[i],y=pos[i+1],z=pos[i+2];
    const damp=.5+.24*Math.sin(x*.19+z*.27)+.26*Math.sin(z*.41-y*.13);
    const patches=smooth01((damp-.34)/.38);
    const elevation=smooth01((y-TRAINING_ABYSS.waterY-1.8)/12)*
      (1-smooth01((y-106)/36));
    const growth=patches*elevation*(.27+.73*ny);
    const cliff=1-ny;
    colors[k*4]=Math.round(colors[k*4]*(1-growth*.56)*(1-cliff*.13));
    colors[k*4+1]=Math.min(255,Math.round(colors[k*4+1]*(1-growth*.09)+growth*19));
    colors[k*4+2]=Math.round(colors[k*4+2]*(1-growth*.73)*(1-cliff*.09));
  }
  return {pos:new Float32Array(pos),nrm:normals,col:new Uint8Array(colors),
    idx:new Uint32Array(idx)};
}
// Underwater geology is rendered before the translucent surface. It follows
// the same radial waterline and remains several metres below killY: it has
// NO collision, pathing or impact on the raised circular arena.
export function buildAbyssPondBed(segments=192,rows=32) {
  const stride=segments+1,pos=[],colors=[],idx=[];
  const {cx,cz,waterY}=TRAINING_ABYSS;
  for(let j=0;j<=rows;j++){
    const t=j/rows;
    for(let i=0;i<=segments;i++){
      const a=i/segments*Math.PI*2,shore=mountainShoreRadius(a);
      const r=t*(shore+3.0);
      const erosion=Math.sin(a*13.0+t*26.0)*Math.cos(a*21.0-t*38.0);
      const depth=1.65+5.4*Math.pow(1-t,1.28);
      const y=waterY-depth+(erosion*.44*t+.15*Math.sin(r*.21+a*7))*Math.sin(t*Math.PI*.95);
      pos.push(cx+Math.cos(a)*r,y,cz+Math.sin(a)*r);
      const c=.86+.10*Math.sin(a*17.0+t*26.0)+.04*Math.sin(a*47+t*39);
      colors.push(Math.round(77*c),Math.round(82*c),Math.round(76*c),255);
    }
  }
  for(let j=0;j<rows;j++)for(let i=0;i<segments;i++){
    const a=j*stride+i,b=a+1,c=b+stride,d=a+stride;
    idx.push(a,b,c,a,c,d);
  }
  const normals=new Float32Array(pos.length);
  for(let n=0;n<idx.length;n+=3){
    const i0=idx[n]*3,i1=idx[n+1]*3,i2=idx[n+2]*3;
    const ux=pos[i1]-pos[i0],uy=pos[i1+1]-pos[i0+1],uz=pos[i1+2]-pos[i0+2];
    const vx=pos[i2]-pos[i0],vy=pos[i2+1]-pos[i0+1],vz=pos[i2+2]-pos[i0+2];
    const cross=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];
    for(const k of [i0,i1,i2])for(let d=0;d<3;d++)normals[k+d]+=cross[d];
  }
  for(let j=0;j<=rows;j++){
    const a=j*stride*3,b=(j*stride+segments)*3;
    for(let k=0;k<3;k++){
      const n=(normals[a+k]+normals[b+k])*.5;
      normals[a+k]=n;normals[b+k]=n;
    }
  }
  for(let i=0;i<normals.length;i+=3){
    const m=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;
    normals[i]/=m;normals[i+1]/=m;normals[i+2]/=m;
  }
  return {pos:new Float32Array(pos),nrm:normals,col:new Uint8Array(colors),
    idx:new Uint32Array(idx)};
}

// Instanced-in-one-mesh fractured boulders use the exact mountain height
// sampler for every foot corner, instead of floating square boxes. This adds
// visible rock silhouettes and ledges from the arena without changing physics.
export const MOUNTAIN_TALUS_BUDGET=Object.freeze({
  very_low:0,medium:380,high:760,'4k':1280,
});
function talusRandom(seed){
  let state=seed>>>0;
  return ()=>{state=(state+0x6d2b79f5)|0;let t=Math.imul(state^(state>>>15),1|state);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
}
function triangleMeshFace(pos,nrm,col,idx,a,b,c,shade){
  const ax=b[0]-a[0],ay=b[1]-a[1],az=b[2]-a[2];
  const bx=c[0]-a[0],by=c[1]-a[1],bz=c[2]-a[2];
  let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
  const length=Math.hypot(nx,ny,nz)||1;nx/=length;ny/=length;nz/=length;
  const origin=pos.length/3;
  for(const p of [a,b,c]){pos.push(...p);nrm.push(nx,ny,nz);
    col.push(Math.round(95*shade),Math.round(102*shade),Math.round(105*shade),255);}
  idx.push(origin,origin+1,origin+2);
}
export function buildMountainTalus(quality='medium'){
  const pos=[],nrm=[],col=[],idx=[];
  const rng=talusRandom(0x4aee213);
  const count=MOUNTAIN_TALUS_BUDGET[quality]??MOUNTAIN_TALUS_BUDGET.medium;
  for(let i=0;i<count;i++){
    const layer=MOUNTAIN_STAGE_ONE.layers[rng()<.78?0:1];
    const a=rng()*Math.PI*2,t=.16+rng()*.65;
    // Keep the carved walkable pass and mountain waterfall gullies open.
    const delta=Math.atan2(Math.sin(a+.36),Math.cos(a+.36));
    if(layer.name==='foothills' && Math.abs(delta)<.38)continue;
    if(layer.name==='foothills' && ABYSS_WATERFALLS.some(site=>
      Math.abs(Math.atan2(Math.sin(a-waterfallAngle(site,t)),
        Math.cos(a-waterfallAngle(site,t))))<.068))continue;
    const footprint=1.15+rng()*3.35,cragHeight=footprint*(.42+rng()*.70);
    const r=radius(layer,a,t);
    const da=footprint/(Math.max(1,r)*2.25);
    const dt=footprint/(Math.max(1,layer.far-layer.near)*2.25);
    const wobble=rng()*.32;
    const offsets=[[-1,-1],[1,-1],[1,1],[-1,1]];
    const base=offsets.map(([u,v])=>{
      const p=mountainSurfacePoint(layer,a+u*da,t+v*dt);
      p[1]-=.35;return p;
    });
    const tip=mountainSurfacePoint(layer,a+(wobble-.16)*da,t);
    tip[1]+=cragHeight;
    const shade=.74+rng()*.42;
    for(let k=0;k<4;k++)
      triangleMeshFace(pos,nrm,col,idx,base[k],base[(k+1)%4],tip,
        shade*(k%2===0?1:.86));
  }
  return {pos:new Float32Array(pos),nrm:new Float32Array(nrm),
    col:new Uint8Array(col),idx:new Uint32Array(idx)};
}

export const MOUNTAIN_LOD = Object.freeze({
  very_low: [96, 18], medium: [192, 30],
  high: [288, 44], '4k': [384, 56],
  '8k': [416,62],
});
export const MOUNTAIN_RANGE_LOD = Object.freeze({
  very_low: Object.freeze([[96,18],[88,16],[72,12],[48,8]].map(pair=>Object.freeze(pair))),
  medium: Object.freeze([[192,30],[176,28],[144,24],[112,18]].map(pair=>Object.freeze(pair))),
  high: Object.freeze([[288,44],[256,38],[192,28],[128,20]].map(pair=>Object.freeze(pair))),
  '4k': Object.freeze([[384,56],[352,50],[256,38],[176,24]].map(pair=>Object.freeze(pair))),
});
export function mountainRangeTessellation(quality='medium',range=0){
  const table=MOUNTAIN_RANGE_LOD[quality]||MOUNTAIN_RANGE_LOD.medium;
  if(!Number.isInteger(range)||range<0||range>=MOUNTAIN_STAGE_ONE.layers.length)
    throw new RangeError('Unknown training mountain range');
  return table[range];
}
export function buildAbyssMountainBackdrop(quality = 'medium') {
  const [segments, rows] = MOUNTAIN_LOD[quality] || MOUNTAIN_LOD.medium;
  const meshes={};
  MOUNTAIN_STAGE_ONE.layers.forEach((layer,index)=>{
    const [detailSegments,detailRows]=mountainRangeTessellation(quality,index);
    meshes[layer.name]=buildMountainLayer(layer,detailSegments,detailRows);
  });
  // Preserve the recently merged talus layer while lowering distant LOD.
  meshes.talusRock=buildMountainTalus(quality);
  meshes.pondBed=buildAbyssPondBed(Math.max(96, Math.round(segments/1.6)),Math.max(16,Math.round(rows*.8)));
  return meshes;
}
