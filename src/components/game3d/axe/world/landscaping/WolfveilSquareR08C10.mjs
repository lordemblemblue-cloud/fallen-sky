// LAND-WS05, issue #1282 — one 100m square of canonical Wolfveil Play.
// Game 3D-owned placement: live GroundCover mounts only with +70m market offset.
// INPUT COORDINATES ARE WOLFVEIL-LOCAL; render group applies +70m Z exactly once.
// Existing trees are authoritative: this plan NEVER creates a new tree trunk.
export const WOLFVEIL_SQUARE_R08_C10 = Object.freeze({
  id: 'WV-R08-C10',
  local: Object.freeze({minX:350,maxX:450,minZ:-250,maxZ:-150}),
  world: Object.freeze({minX:350,maxX:450,minZ:-180,maxZ:-80}),
  offsetZ:70,
  areaM2:10000,
  feature:'eastern-woodland-meadow',
});

const safeFinite = Number.isFinite;
const hypot = Math.hypot;
const TAU = Math.PI * 2;
const mix = (a,b,t) => a + (b-a)*t;
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), state | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
const inside = (x,z,pad=0) => x>=350+pad && x<450-pad &&
  z>=-250+pad && z<-150-pad;
const nearestTreeDistance = (x,z,trees) => trees.reduce((d,t) =>
  Math.min(d,hypot(t.x-x,t.z-z)),Infinity);

/**
 * Plan a bounded, collision-neutral quality layer using the ACTUAL Play mesh
 * triangle sampler, not analytic terrain height. No materials or WebGL work.
 *
 * @param {object} options
 * @param {(x:number,z:number)=>number|null} options.surfaceHeightAt
 * @param {(point:{x:number,z:number},radius:number)=>boolean} options.clearOf
 * @param {(x:number,z:number)=>number} options.distanceToRiver
 * @param {(x:number,z:number)=>number} options.routeClearance
 * @param {Array<{x:number,z:number,kind:string}>} options.existingTrees
 */
export function planWolfveilSquareR08C10({
  surfaceHeightAt,
  clearOf=()=>true,
  distanceToRiver=()=>Infinity,
  routeClearance=()=>Infinity,
  existingTrees=[],
  seed=0x0508c10,
}={}) {
  if(typeof surfaceHeightAt!=='function'||typeof clearOf!=='function'||
      typeof distanceToRiver!=='function'||typeof routeClearance!=='function'||
      !Array.isArray(existingTrees)||!safeFinite(seed))
    throw new TypeError('Square R08-C10 requires finite sampler/clearance inputs');
  const random=seededRandom(seed);
  // Only same-tile existing registered trunks may be emphasized visually.
  // Padded external trunks still block new cosmetic rocks/plant clumps.
  const trees=existingTrees.filter(t=>t && safeFinite(t.x)&&safeFinite(t.z) &&
    t.x>=342 && t.x<=458 && t.z>=-258 && t.z<=-142);
  const existingTreeAccents=Object.freeze(trees.filter(t=>inside(t.x,t.z))
    .map(t=>Object.freeze({x:t.x,z:t.z,kind:t.kind??'existing'})));
  const grass=[],stones=[],understory=[];
  const rejects={outside:0,clearance:0,steep:0,invalidHeight:0};
  function sampleAt(x,z) {
    const h=surfaceHeightAt(x,z);
    if(!safeFinite(h))return null;
    const near=surfaceHeightAt(x-.5,z),far=surfaceHeightAt(x+.5,z);
    const below=surfaceHeightAt(x,z-.5),above=surfaceHeightAt(x,z+.5);
    if(![near,far,below,above].every(safeFinite))return null;
    // Central differences are in metres per metre; retain the *direction*
    // as well as magnitude so decorative rocks can align to the actual
    // rendered triangle's tangent plane. No terrain/collider modification.
    const slopeX=far-near,slopeZ=above-below;
    const slope=hypot(slopeX,slopeZ);
    return {y:h,slope,slopeX,slopeZ};
  }
  function eligible(x,z,radius,maxSlope=.65) {
    if(!inside(x,z,1.6+radius)){rejects.outside++;return null;}
    const waterDistance=distanceToRiver(x,z),routeDistance=routeClearance(x,z);
    if(!clearOf({x,z},radius)||
       !(safeFinite(waterDistance)||waterDistance===Infinity)||
       !(safeFinite(routeDistance)||routeDistance===Infinity)||
       waterDistance<25+radius||
       routeDistance<5.5+radius||
       nearestTreeDistance(x,z,trees)<radius+1.6){
      rejects.clearance++;return null;
    }
    const ground=sampleAt(x,z);
    if(!ground){rejects.invalidHeight++;return null;}
    if(ground.slope>maxSlope){rejects.steep++;return null;}
    return ground;
  }
  // Organic tightly spaced low grass. Straight individually modeled blades are
  // the integration target, never perpendicular "X" / billboard crossings.
  // Max 1800 clumps in THIS tile, with rare intentional gaps near tree bases.
// The REAL Wolfveil triangle sampler's eastern ridge reaches ~44-degree
// walkable grass pockets. Reject >0.95 tangent slope, never float onto near-
// vertical stone; this mitigates artificial barren 10m strips on the hillside.
// This is a *rendering* slope rule, not any change to physics or terrain height.
  // Stagger alternating rows like naturally interleaved meadow blades,
  // and widen the seeded small jitter: the previous 1.8m square lattice
  // can produce long straight lanes in 3D. This reduces
  // checkerboard regularity without raising instance budget or affecting
  // any other tile, roots, roads, waterways or collision surfaces.
  for(let iz=0;iz<53;iz++)for(let ix=0;ix<53;ix++){
    const x=352.4+ix*1.8+(iz%2)*.82+(random()-.5)*1.16;
    const z=-247.6+iz*1.8+(random()-.5)*1.16;
    const localPatch=.71+.16*Math.sin(x*.083+z*.057)*Math.sin(z*.092-x*.049);
    if(random()>localPatch)continue;
    const h=eligible(x,z,.28,.95);
    if(!h)continue;
    const angle=.27*Math.sin(z*.013+x*.009)+.16*(random()-.5);
    grass.push({x,z,y:h.y,yaw:angle,width:mix(.22,.37,random()),
      height:mix(.12,.26,random()),bladeStyle:'upright-single-strands',
      shade:Math.floor(random()*5),route:WOLFVEIL_SQUARE_R08_C10.id,
      decorativeOnly:true});
  }
  // Thin over-budget clumps evenly across ALL rows rather than truncating the
  // far side of this tile and leaving a visible bare horizontal stripe.
  if(grass.length>1800){
    const allRows=grass.slice();
    grass.length=0;
    for(let i=0;i<1800;i++)
      grass.push(allRows[Math.floor((i+.5)*allRows.length/1800)]);
  }
  // 24–36 pebbles/low stones, partly buried at true mesh contact. These are
  // original simple mineral shapes, not the 18k-triangle rock-turtle sculpture.
  for(let i=0;i<190 && stones.length<36;i++){
    const x=353+random()*94,z=-247+random()*94;
    const radius=mix(.18,.55,random());
    const h=eligible(x,z,radius+1.1,.65);
    if(!h || random()>.37)continue;
    const yaw=random()*TAU,height=mix(.13,.36,random());
    stones.push({x,z,y:h.y,yaw,
      width:radius*2.0,height,
      depth:radius*mix(1.25,1.8,random()),
      // The live stone instancer can align a low irregular mineral face to
      // this exact local terrain tangent, avoiding downhill-side floating.
      slopeX:h.slopeX,slopeZ:h.slopeZ,
      // Limit immersion to a quarter of each stone's actual height; a
      // fixed 5.5cm bury almost hides the smallest 13cm pebbles on slopes.
      bury:Math.min(.055,height*.25),rockStyle:'irregular-limestone-granite',
      palette:Math.floor(random()*3),decorativeOnly:true});
  }
  // Tiny selective natural accents near *existing* trees, never substitute or
  // create new trunk colliders; do not mass-instance the ~12k-tri owner model.
  for(const tree of trees.filter(t=>inside(t.x,t.z))) {
    if(understory.length>=24)break;
    for(let j=0;j<3 && understory.length<24;j++){
      const angle=random()*TAU,d=4.0+random()*4.0;
      const x=tree.x+Math.cos(angle)*d,z=tree.z+Math.sin(angle)*d;
      const h=eligible(x,z,.8,.72);
      if(!h)continue;
      understory.push({x,z,y:h.y,kind:'low-fern-meadow-tuft',
        height:mix(.28,.55,random()),width:mix(.22,.46,random()),
        yaw:angle,decorativeOnly:true});
    }
  }
  // Source-only lawn-coverage diagnostic, NOT a visual QA certification.
  // Optimistic disjoint disks of radius half the nominal clump width
  // deliberately overestimate the true seven-blade lawn footprint.
  // Occupying a 10m cell is not equivalent to covering it with lawn.
  const areaOfNominalGrassDisks=grass.reduce((total,p)=>
    total+Math.PI*(p.width/2)**2,0);
  const cells=new Uint16Array(100);
  for(const p of grass){
    const ix=Math.max(0,Math.min(9,Math.floor((p.x-350)/10)));
    const iz=Math.max(0,Math.min(9,Math.floor((p.z+250)/10)));
    cells[iz*10+ix]++;
  }
  const macroCellCounts=Array.from(cells);
  const coverageDiagnostics=Object.freeze({
    nominalDisjointDiscAreaM2:Number(areaOfNominalGrassDisks.toFixed(2)),
    nominalDisjointDiscAreaPercent:Number(Math.min(100,
      areaOfNominalGrassDisks/10000*100).toFixed(3)),
    macroCellsContainingGrass:macroCellCounts.filter(n=>n>0).length,
    minClumpsPerTenMeterCell:Math.min(...macroCellCounts),
    maxClumpsPerTenMeterCell:Math.max(...macroCellCounts),
    // This diagnostic does not replace browser screenshots, ground-texture
    // inspection, LOD/camera QA, FPS testing or signed-in visual acceptance.
    groundTextureAndFullLawnCoverageCertified:false,
  });
  return {
    tile:WOLFVEIL_SQUARE_R08_C10,
    grass,stones,understory,existingTreeAccents,coverageDiagnostics,
    // Scene source integration is mounted in Game 3D only; signed-in GPU, physics, FPS and art QA still pending.
    visualOnly:true,createsTrunkColliders:false,changesGroundHeight:false,
    usesOwnerModelBinaries:false,rejects,
    generatedCounts:{grass:grass.length,stones:stones.length,
      understory:understory.length,treesReused:existingTreeAccents.length},
  };
}


/**
 * WS05-owned ground-color pass for the real existing Wolfveil terrain mesh.
 * Grass clumps alone provide sparse coverage; this visual-only pigment gives
 * the full meadow a subdued Sumi-e lawn base without another floor/collider.
 *
 * Local coords ONLY; the existing group applies +70 world Z one time.
 * Fade to existing terrain at all four borders to preserve neighboring tiles.
 * Keep public routes, waterbanks and actual registered tree roots untouched.
 */
export function applyWolfveilSquareR08C10GroundPigment(geometry,{
  enabled=false,paintableAt=()=>true,routeDistance=()=>Infinity,
  riverDistance=()=>Infinity,terrainGridStep=1100/310,existingTrees=[],
}={}){
  if(!enabled)return {applied:false,vertices:0,visualOnly:true};
  if([paintableAt,routeDistance,riverDistance].some(f=>typeof f!=='function')||
      !safeFinite(terrainGridStep)||terrainGridStep<=0||
      !Array.isArray(existingTrees))
    throw new TypeError('WS05 pigment requires live route/river/forest and mesh spacing');
  const pos=geometry?.getAttribute?.('position');
  const colors=geometry?.getAttribute?.('color');
  // The real Wolfveil terrain computes per-vertex normals before this pass.
  // Keep a safe fallback for test/legacy geometry without normals, but avoid
  // painting near-vertical mineral faces lawn-green on actual mesh geometry.
  const normals=geometry?.getAttribute?.('normal');
  const useSlope=normals?.count===pos?.count&&
    typeof normals.getY==='function';
  if(!pos||!colors||pos.count!==colors.count||
      typeof colors.setXYZ!=='function')
    throw new TypeError('WS05 pigment requires existing matching vertex colors');
  const clamp01=t=>Math.max(0,Math.min(1,t));
  const smooth=t=>t*t*(3-2*t);
  // clearOf() protects roads, buildings and water but not registered
  // forest tree anchors. Use the SAME authoritative placement data as
  // real vegetation and client/server trunks, filtered to this 100m tile.
  // No new trunk, collision proxy or independent tree position is created.
  const localRoots=existingTrees.filter(t=>t&&safeFinite(t.x)&&
    safeFinite(t.z)&&t.x>=343&&t.x<=457&&t.z>=-257&&t.z<=-143);
  const fadeDistance=(distance,begin,end)=>{
    if(distance===Infinity)return 1;
    if(!safeFinite(distance))return 0;
    return smooth(clamp01((distance-begin)/(end-begin)));
  };
  // Compute every proposed tint before touching the existing vertex-color
  // buffer. An unexpected real-scene route/river/root callback failure must
  // not leave a partially stained ground mesh behind.
  const edits=[];
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getZ(i);
    if(!safeFinite(x)||!safeFinite(z))continue;
    const edge=Math.min(x-350,450-x,z+250,-150-z);
    // A triangle interpolates color between vertices. Changing a vertex
    // immediately INSIDE the tile edge can therefore tint a triangle that
    // extends OUTSIDE our reservation. Leave one full source mesh grid step
    // untouched at every edge, then feather over the next 3.5m.
    if(!(edge>terrainGridStep)||!paintableAt(x,z))continue;
    const road=fadeDistance(routeDistance(x,z),4.5,10);
    const river=fadeDistance(riverDistance(x,z),21,30);
    if(road===0||river===0)continue;
    // Preserve the actual rooted soil/material around existing tree feet.
    // Feather to meadow color beyond each rooted trunk; canopy green is
    // determined by the same real forest anchors, not random paint splats.
    let rootFade=1;
    for(const root of localRoots){
      const inner=root.kind==='ancient'?3:
        root.kind==='maple'?1.8:root.kind==='bamboo'?1.1:1.5;
      const distance=Math.hypot(x-root.x,z-root.z);
      rootFade=Math.min(rootFade,smooth(clamp01((distance-inner)/1.5)));
      if(rootFade===0)break;
    }
    if(rootFade===0)continue;
    // Preserve slate/rock on steep terrain without creating a second floor:
    // normal.y=cos(slope). Faces over ~56 degrees remain mineral, moderate
    // hillsides blend organically; ordinary lawn receives full green tint.
    const upNormal=useSlope?normals.getY(i):1;
    if(!safeFinite(upNormal))continue;
    const slopeFade=smooth(clamp01((upNormal-.56)/.24));
    if(slopeFade===0)continue;
    const fade=smooth(clamp01((edge-terrainGridStep)/3.5));
    const irregular=Math.sin(x*.21+z*.13)*Math.cos(z*.17-x*.08);
    const strength=fade*road*river*rootFade*slopeFade*(.69+.065*irregular);
    if(strength<=0)continue;
    const base=[colors.getX(i),colors.getY(i),colors.getZ(i)];
    if(!base.every(safeFinite))continue;
    const green=[.235+.025*irregular,.395+.027*irregular,.278+.015*irregular];
    edits.push([i,
      base[0]*(1-strength)+green[0]*strength,
      base[1]*(1-strength)+green[1]*strength,
      base[2]*(1-strength)+green[2]*strength]);
  }
  for(const [i,x,y,z] of edits)colors.setXYZ(i,x,y,z);
  if(edits.length)colors.needsUpdate=true;
  return {applied:edits.length>0,vertices:edits.length,visualOnly:true,
    changesTerrainHeight:false,addsCollision:false,
    worldZOffsetHandledByParent:true};
}
