// LAND-WS04 / Wolfveil Play: one exact 5 m editor square, unshifted layout coordinates.
// Pure planning only. WS15 must review/mount a renderer in canonical Play.
// No new terrain, colliders, trees, water, player authority or rewards.
export const WOLFVEIL_SQUARE_X40_Z123 = Object.freeze({
  id:'X40-Z123', label:'West hillside forest-floor pocket',
  minX:-350, maxX:-345, minZ:65, maxZ:70,
  playOffsetZ:70, playMinZ:135, playMaxZ:140,
  sizeMeters:5, cellAreaSqM:25,
});

// Shared Wolfveil source-of-truth art contract; NO novel palette or aura here.
// Realism before spiritual Sumi-e: dimensional PBR silhouettes remain legible
// with postprocessing disabled. Existing source materials/light rigs own the look.
export const WOLFVEIL_X40_Z123_ART_STYLE=Object.freeze({
  id:'wolfveil-vibrant-ink-realistic-pbr-v1',
  references:Object.freeze([
    'docs/game3d/WOLFVEIL_STRUCTURAL_REALISM_STANDARD.md',
    'docs/game3d/WOLFVEIL_REFERENCE_ART_2026_11_02.md',
    'docs/game3d/VIBRANT_INK_COLOR.md',
  ]),
  // Match WolfveilGroundCover's existing PBR colors instead of inventing tints.
  grass:Object.freeze({
    geometry:'upright-individual-tapered-blades',
    palette:Object.freeze([0x465d32,0x57783d,0x70854a,0x425e38]),
    roughness:.91,metalness:0,emissive:0,
    maxHeightMeters:.205,
    wind:'tip-sway-root-fixed',
    billboardCrosses:false,
  }),
  stone:Object.freeze({
    geometry:'weathered-irregular-low-profile-stone',
    palette:Object.freeze([0x666761,0x77796d,0x8a897d]),
    roughness:.96,metalness:0,emissive:0,
    maxHeightMeters:.12,
  }),
  understory:Object.freeze({
    geometry:'layered-real-leaf-silhouette',
    palette:Object.freeze([0x3d7953,0x57783d]),
    roughness:.94,metalness:0,emissive:0,
    maxHeightMeters:.32,
    wind:'foliage-tip-only',
  }),
  tree:Object.freeze({
    policy:'preserve-authoritative-tree-anchors-no-new-trunks',
    approvedModel:'WOLFVEIL_UPLOADED_LANDSCAPE_ASSETS.tree',
    naturalBarkAndRootsRequired:true,
    leafFoliageWindOnly:true,
    existingBlueLightIntrinsicMaterial:true,
    externalGlowCloudAllowed:false,
    sourceAtlasPreserved:true,
    newTreeCount:0,
  }),
});
const styleForKind=kind=>kind==='short-grass'
  ?WOLFVEIL_X40_Z123_ART_STYLE.grass
  :kind==='moss-stone'?WOLFVEIL_X40_Z123_ART_STYLE.stone
  :kind==='understory'?WOLFVEIL_X40_Z123_ART_STYLE.understory:null;

// Static, reversible preflight only; actual aesthetic approval needs Play GPU
// screenshots at 1m, varied weather and collision / two-client acceptance.
export function auditWolfveilSquareX40Z123(plan) {
  if(!plan||!Array.isArray(plan.placements))throw new TypeError('Missing square plan');
  const defects=[],ids=new Set(),square=WOLFVEIL_SQUARE_X40_Z123;
  for(const p of plan.placements){
    const mat=styleForKind(p.kind);
    if(!mat){defects.push('disallowed-kind:'+p.kind);continue;}
    if(ids.has(p.id))defects.push('duplicate-id:'+p.id);
    ids.add(p.id);
    if(![p.x,p.y,p.z,p.radius,p.height,p.worldX,p.worldZ,p.slope].every(finite)||
        p.radius<=0||p.height<=0||p.slope<0||p.slope>1.2||
        p.x-p.radius<square.minX||p.x+p.radius>square.maxX||
        p.z-p.radius<square.minZ||p.z+p.radius>square.maxZ||
        p.worldX!==p.x||p.worldZ!==p.z+square.playOffsetZ||
        p.baseY!==p.y||p.rootFixed!==true)
      defects.push('out-of-square-or-invalid:'+p.id);
    if(p.geometryProfile!==mat.geometry||!mat.palette.includes(p.tint)||
       p.roughness!==mat.roughness||p.metalness!==0||p.emissive!==0||
       p.height>mat.maxHeightMeters+1e-8||p.collidable!==false||
       p.visualOnly!==true)
      defects.push('material-or-geometry-mismatch:'+p.id);
  }
  return Object.freeze({passed:defects.length===0,checked:plan.placements.length,
    defects:Object.freeze(defects),scope:'source-static-only-not-runtime-verified'});
}

const finite = Number.isFinite;
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
function randomFromSeed(seed) {
  let state=seed>>>0;
  return () => {
    state=(state+0x6d2b79f5)>>>0;
    let t=Math.imul(state^(state>>>15),state|1);
    t^=Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}

/**
 * Prepare visual-only forest floor dressing for the EXACT X40-Z123 square.
 * Callbacks are supplied by the canonical Wolfveil scene at integration time:
 * - heightAt: triangle-mesh surface sampler (NOT just analytical height)
 * - clearOf: existing shared building/road/river footprint guard
 * - routeClearance: distance OUTSIDE route edge in local Wolfveil coordinates
 * - riverDistance: distance to river centerline in local layout coordinates
 * - trees: existing authoritative trunk positions in local layout coordinates
 * Never interpret screen/world Z as local Z; the scene adds +70 once.
 * Only short rooted grass and small pass-through decorative pebbles/shrubs;
 * no unregistered large rigid obstacles or tree trunks.
 */
export function planWolfveilSquareX40Z123({
  heightAt, clearOf, routeClearance, riverDistance, trees=[],
  seed=0x40a123, maxSlope=.48,
}={}) {
  if(typeof heightAt!=='function'||typeof clearOf!=='function'||
      typeof routeClearance!=='function'||typeof riverDistance!=='function'||
      !Array.isArray(trees)||!Number.isInteger(seed)||!finite(maxSlope)||
      maxSlope<=0||maxSlope>1.2) throw new TypeError('Invalid Wolfveil square planning inputs');
  const square=WOLFVEIL_SQUARE_X40_Z123;
  const rng=randomFromSeed(seed);
  const placements=[];
  const rejected={surface:0,slope:0,clearance:0,tree:0,boundary:0};
  // The 3D-model footprint (not just its pivot) must stay inside this cell.
  function tryPlace(kind,x,z,radius,height,angle,variant) {
    if(!finite(x)||!finite(z)||x-radius<square.minX||x+radius>square.maxX||
        z-radius<square.minZ||z+radius>square.maxZ){rejected.boundary++;return;}
    const y=heightAt(x,z);
    const e=Math.max(.15,radius);
    const xm=heightAt(x-e,z),xp=heightAt(x+e,z);
    const zm=heightAt(x,z-e),zp=heightAt(x,z+e);
    if(![y,xm,xp,zm,zp].every(finite)){rejected.surface++;return;}
    const sx=(xp-xm)/(2*e),sz=(zp-zm)/(2*e);
    const slope=Math.hypot(sx,sz);
    const footprintRelief=Math.max(y,xm,xp,zm,zp)-Math.min(y,xm,xp,zm,zp);
    if(slope>maxSlope||footprintRelief>.05+height*.8){rejected.slope++;return;}
    // The canonical route solver returns +Infinity away from roads, which is
    // valid. NaN/undefined or negative measurements are NOT safe to plant.
    const route=routeClearance(x,z),river=riverDistance(x,z);
    const hasDistance=value=>Number.isFinite(value)||value===Infinity;
    if(clearOf({x,z},radius+.12)!==true||!hasDistance(route)||
       !hasDistance(river)||route<radius+1.1||river<17.2+radius){
      rejected.clearance++;return;
    }
    if(trees.some(t=>finite(t?.x)&&finite(t?.z)&&
        distance({x,z},t)<radius+(finite(t.radius)?t.radius:.85)+.45)){
      rejected.tree++;return;
    }
    // Bottom-of-mesh is on terrain; no floating center-pivot rocks or aura.
    const mat=styleForKind(kind);
    if(!mat||height>mat.maxHeightMeters)return;
    const paletteIndex=((variant%mat.palette.length)+mat.palette.length)%mat.palette.length;
    placements.push(Object.freeze({
      id:square.id+'-'+kind+'-'+(placements.length+1),kind,x,y,z,
      baseY:y,rootFixed:true,
      radius,height,yaw:angle,variant:paletteIndex,slope,
      geometryProfile:mat.geometry,tint:mat.palette[paletteIndex],
      roughness:mat.roughness,metalness:0,emissive:0,
      artStyleId:WOLFVEIL_X40_Z123_ART_STYLE.id,
      worldX:x,worldZ:z+square.playOffsetZ,
      visualOnly:true,collidable:false,
    }));
  }
  // Straight, short, fine blades, with staggered roots and no cruciform cards.
  // The renderer may instance the existing curved-blade geometry; do NOT
  // spawn a GLB actor per blade or exceed the already-hosted asset budgets.
  const details=[
    {kind:'moss-stone',x:-349.12,z:69.04,radius:.21,height:.12,variant:0},
    {kind:'moss-stone',x:-345.88,z:65.94,radius:.17,height:.09,variant:1},
    {kind:'understory',x:-348.72,z:68.31,radius:.23,height:.32,variant:0},
    {kind:'understory',x:-346.63,z:67.41,radius:.19,height:.26,variant:1},
  ];
  // 24x24 compact 3D root grid leaves only a few centimetres between the
  // projected blade footprints at the borders, without crossing this tile.
  // A single instanced mesh later must retain the shared draw/LOD budget.
  const rootSpacing=.205, jitter=.015;
  for(let row=0;row<24;row++)for(let col=0;col<24;col++){
    if(rng()<.06)continue; // slight organic variance, not a brown dirt grid
    const x=square.minX+.12+col*rootSpacing+(rng()-.5)*jitter;
    const z=square.minZ+.12+row*rootSpacing+(rng()-.5)*jitter;
    // No grass piercing accent rock faces or small fern crowns.
    if(details.some(d=>Math.hypot(x-d.x,z-d.z)<d.radius+.13))continue;
    const height=.09+rng()*.115;
    const yaw=.36*Math.sin(z*.31+x*.17)+(rng()-.5)*.21;
    tryPlace('short-grass',x,z,.095,height,yaw,Math.floor(rng()*4));
  }
  // A couple of grounded micro-stones/ferns add structure beneath existing
  // canopies; none become collision-bearing geometry or cross the cell edge.
  for(const d of details)tryPlace(d.kind,d.x,d.z,d.radius,d.height,
    clamp((rng()-.5)*2.2,-1.1,1.1),d.variant);
  const candidate={square,seed,placements:Object.freeze(placements),
    rejected:Object.freeze(rejected),visualOnly:true,
    artStyleId:WOLFVEIL_X40_Z123_ART_STYLE.id,
    changesTerrain:false,changesServerCollision:false,
    rendererMounted:false}; // WS15 integration alone sets actual runtime status
  return Object.freeze({...candidate,sourceArtAudit:auditWolfveilSquareX40Z123(candidate)});
}
